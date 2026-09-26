// Assembles the single GET /api/state payload every screen reads from
// (technical brief section 7), and is reused by POST /api/plan/suggest to
// return the state after auto-filling the plan.
import {
  applySymptomLock,
  buildDenseTimeline,
  corridor,
  feasibility,
  flags,
  isReentryWeek,
  mergeRuns,
  mondayOf,
  raceStructureSlots,
  raceSlotWeekType,
  raceTargets,
  references,
  remainingWeekGuidance,
  verdict,
  weeklyAggregates,
} from '../logic';
import { addDays, addWeeks, diffDays } from '../logic/dates';
import type { CheckIn, Corridor, Feasibility, Flag, Race, RaceTargets, References, Run, Verdict, WeekType } from '../logic/types';
import { getLastPlanUpdateAt, loadCheckins, loadPlanWeeks, loadRaces, loadRawActivities } from './db';
import type { Defaults } from './defaults';
import type { Env } from './index';
import { getSettings } from './settings-store';

const CHART_LOOKAHEAD_WEEKS = 12;

// The peak long run of the nearest upcoming A or B race (never C -- a
// "train through" race has no taper/peak concept), for the live "long run
// up to" cap: min(1.10 x LR30, race peak LR) in the weeks before it (v1.1
// review round 4 item 3). C races are excluded on purpose; every other
// week-type-specific rule and the max_long_run_km life cap still apply on
// top via corridor()'s own capLongRun().
function nextABRacePeakLR(races: Race[], weekStart: string, settings: Defaults): number | undefined {
  const upcoming = races
    .filter((r) => (r.priority === 'A' || r.priority === 'B') && mondayOf(r.date) >= weekStart)
    .sort((a, b) => (a.date < b.date ? -1 : 1))[0];
  return upcoming ? raceTargets(upcoming, settings).peakLongRunKm : undefined;
}

export interface WeekStateDTO {
  weekStart: string;
  isActual: boolean;
  kmWeek: number;
  effortKmWeek: number;
  mechKmWeek: number;
  dminusWeek: number;
  runsWeek: number;
  longestKm: number;
  longestLossM: number;
  type: WeekType;
  symptomLocked: boolean;
  userEdited: boolean;
  limitedDays: number | null;
  limitedKmCap: number | null;
  refs: References;
  corridor: Corridor;
  flags: Flag[];
  verdict: Verdict;
  // Set when this week is user-edited but a race's auto-structure (v1.1
  // review A3) wants a different type here -- e.g. the user changed a week
  // a newly-added race now needs as its taper. suggestPlan() never
  // overwrites a user-edited week itself, so this is surfaced instead.
  raceConflictType: WeekType | null;
  // Set only on a RACE week suggestPlan() generated for this race (v1.1
  // review A-round 2 item 4), so the row can show the race's name.
  raceId: number | null;
  raceName: string | null;
  // Set only on the race-driven PEAK week (the Build week right before
  // taper starts) for this race (v1.1 review round 6), so the row can show
  // a "capped below the race's own target" note when suggestPlan()'s
  // green-max clamp actually bit -- cross-referenced against that race's
  // targets.peakWeekEffortKm on the frontend, the same way raceName is.
  peakForRaceId: number | null;
  // Set only on a race-driven TAPER week for this race (v1.1 review UI
  // pass), so the row/chip can show "Taper week N of M" -- cross-
  // referenced against that race's targets.taper on the frontend.
  taperForRaceId: number | null;
  // Set only on a race-driven post-race Recovery week for this race (v1.1
  // review UI pass), so the Plan screen can visually group taper + race +
  // recovery rows together around the race.
  recoveryForRaceId: number | null;
  // Structured "how much is left this week" (v1.1 review round 3 item 2),
  // for the current week only, when on track: the same figures
  // remainingWeekGuidance() already computed, just exposed as data
  // instead of pre-formatted into verdict.reason (v1.1 UI pass) so the
  // frontend can lay them out as its own big headline. Null whenever the
  // old code wouldn't have appended anything (not the current week, not
  // green, or no bounded corridor yet).
  guidance: WeekGuidanceDTO | null;
}

export interface WeekGuidanceDTO {
  rebuilding: boolean; // refs.C <= 0 -- no chronic history yet
  targetMet: boolean;
  floorReachable: boolean;
  kmLeftMin: number | null;
  kmLeftMax: number | null;
}

export interface RaceStateDTO extends Race {
  targets: RaceTargets;
  feasibility: Feasibility | null;
}

export interface RunDTO {
  id: string;
  startLocal: string;
  distanceM: number;
  movingS: number;
  gainM: number;
  lossM: number;
  isRace: boolean;
}

export interface StateResponse {
  today: string;
  currentWeekStart: string;
  settings: Defaults;
  weeks: WeekStateDTO[];
  races: RaceStateDTO[];
  currentWeekRuns: RunDTO[];
  checkinNeeded: boolean;
  // When a sync (manual or cron) last auto-regenerated the plan (v1.1
  // review round 5 item 3), for the frontend's dismissible "Plan updated"
  // note. Null until the first sync-triggered regeneration ever runs.
  lastPlanUpdateAt: string | null;
}

function toRunDto(run: Run): RunDTO {
  return { id: run.id, startLocal: run.startLocal, distanceM: run.distanceM, movingS: run.movingS, gainM: run.gainM, lossM: run.lossM, isRace: run.isRace };
}

export async function buildState(env: Env): Promise<StateResponse> {
  const [rawActivities, planWeeks, races, checkins, settings, lastPlanUpdateAt] = await Promise.all([
    loadRawActivities(env),
    loadPlanWeeks(env),
    loadRaces(env),
    loadCheckins(env),
    getSettings(env),
    getLastPlanUpdateAt(env),
  ]);

  const runs = mergeRuns(rawActivities, settings.runMergeGapMin);
  const actualAggregates = [...weeklyAggregates(runs, settings).values()];
  const aggByWeek = new Map(actualAggregates.map((a) => [a.weekStart, a]));
  const planByWeek = new Map(planWeeks.map((w) => [w.weekStart, w]));

  const today = new Date().toISOString();
  const currentWeekStart = mondayOf(today);
  const dense = buildDenseTimeline(actualAggregates, planWeeks, currentWeekStart, addWeeks(currentWeekStart, CHART_LOOKAHEAD_WEEKS));

  // Days left in the current week, counting today (v1.1 review round 3
  // item 2): the last day of the week itself has exactly 1 remaining, not
  // 0, so a single day's worth of running is still a real possibility.
  const remainingDays = Math.max(0, diffDays(addDays(currentWeekStart, 6), today.slice(0, 10)) + 1);

  const checkinsAsc = [...checkins].sort((a, b) => (a.weekStart < b.weekStart ? -1 : 1));
  const raceSlots = raceStructureSlots(races, settings);

  let prevKm: number | null = null;
  let prevType: WeekType | null = null;
  const weeks: WeekStateDTO[] = dense.map((w) => {
    const planRow = planByWeek.get(w.weekStart);
    const baseType: WeekType = planRow?.type ?? (w.isRaceWeek ? 'RACE' : 'BUILD');

    const weekCheckin: CheckIn | null = checkinsAsc.find((c) => c.weekStart === w.weekStart) ?? null;
    const priorCheckinsAsc = checkinsAsc.filter((c) => c.weekStart < w.weekStart);

    // The symptom lock (5.3) only overrides the *current* week's type: past
    // weeks already happened, and future weeks get locked by their own
    // check-in once that week actually arrives.
    let effectiveType = baseType;
    let symptomLocked = false;
    if (w.weekStart === currentWeekStart) {
      const locked = applySymptomLock(baseType, weekCheckin, priorCheckinsAsc, settings);
      effectiveType = locked.type;
      symptomLocked = locked.symptomLocked;
    }

    const refs = references({ weekStart: w.weekStart, denseTimeline: dense, actualRuns: runs }, settings);
    const reentry = isReentryWeek(dense, w.weekStart);
    const c = corridor(effectiveType, refs, settings, {
      limitedKmCap: planRow?.limitedKmCap ?? null,
      symptomLocked,
      reentry,
      peakLongRunKm: nextABRacePeakLR(races, w.weekStart, settings),
    });

    const flagList = flags(
      {
        weekType: effectiveType,
        kmWeek: w.kmWeek,
        longestKm: w.longRunKm ?? 0,
        longestLossM: w.longRunLossM ?? 0,
        dminusWeek: w.dminusWeek,
        refs,
        checkin: weekCheckin,
        priorCheckinsAsc,
        prevWeekKm: prevKm,
        prevWeekType: prevType,
        weekInProgress: w.weekStart === currentWeekStart,
        reentry,
      },
      settings,
    );
    let v = verdict(flagList);
    prevKm = w.kmWeek;
    prevType = effectiveType;

    const raceId = planRow?.raceId ?? null;
    const raceName = raceId != null ? (races.find((r) => r.id === raceId)?.name ?? null) : null;
    const slot = raceSlots.get(w.weekStart);
    const peakForRaceId = slot?.kind === 'PEAK' ? slot.race.id : null;
    const taperForRaceId = slot?.kind === 'TAPER' ? slot.race.id : null;
    const recoveryForRaceId = slot?.kind === 'POST_RECOVERY' ? slot.race.id : null;

    // A Race week gets a distinct, neutral verdict, not "on track" (v1.1
    // review round 4 item 1): flags() already returned no flags for it, so
    // verdict([]) alone would default to green, which is misleading here.
    if (effectiveType === 'RACE') {
      v = { colour: 'RACE', reason: raceName ? `Race day: ${raceName}.` : 'Race day.', flags: [] };
    }

    // "How much is left this week", for the current week only, when on
    // track (v1.1 review A-round 2 item 6, redesigned per round 3 item 2,
    // restructured as data per the v1.1 UI pass): the green range (0.8-1.2x
    // C) is the acceptable floor/ceiling, the Build/Hold corridor is only
    // the "target", and both get capped by what actually fits in the days
    // left this week. The frontend lays this out as its own big headline
    // instead of a sentence appended to verdict.reason.
    let guidance: WeekGuidanceDTO | null = null;
    if (w.weekStart === currentWeekStart && v.colour === 'GREEN') {
      if (refs.C <= 0) {
        guidance = { rebuilding: true, targetMet: false, floorReachable: false, kmLeftMin: null, kmLeftMax: null };
      } else if (Number.isFinite(c.kmMax)) {
        const g = remainingWeekGuidance({
          doneKm: w.kmWeek,
          C: refs.C,
          greenMinFactor: settings.ratioZoneEdges.greenMin,
          corridorKmMax: c.kmMax,
          lrMax: c.lrMax,
          remainingDays,
        });
        guidance = { rebuilding: false, targetMet: g.targetMet, floorReachable: g.floorReachable, kmLeftMin: g.kmLeftMin, kmLeftMax: g.kmLeftMax };
      }
    }

    // A race's structure only conflicts with a week the plan actually left
    // alone for the user (userEdited or Limited); suggestPlan() itself
    // always applies race structure to everything else.
    const wantedType = slot ? raceSlotWeekType(slot.kind) : null;
    const isUserLocked = !!planRow && (planRow.userEdited || planRow.type === 'LIMITED');
    const raceConflictType = isUserLocked && wantedType != null && wantedType !== planRow!.type ? wantedType : null;

    const agg = aggByWeek.get(w.weekStart);
    const effortKmWeek = agg ? agg.effortKmWeek : w.kmWeek + (planRow?.dplusM ?? 0) / 100;
    const mechKmWeek = agg ? agg.mechKmWeek : w.kmWeek + (settings.descentWeightW * (planRow?.dminusM ?? 0)) / 100;
    const runsWeek = agg ? agg.runsWeek : 0;

    return {
      weekStart: w.weekStart,
      isActual: w.weekStart < currentWeekStart,
      kmWeek: w.kmWeek,
      effortKmWeek,
      mechKmWeek,
      dminusWeek: w.dminusWeek,
      runsWeek,
      longestKm: w.longRunKm ?? 0,
      longestLossM: w.longRunLossM ?? 0,
      type: effectiveType,
      symptomLocked,
      userEdited: planRow?.userEdited ?? false,
      limitedDays: planRow?.limitedDays ?? null,
      limitedKmCap: planRow?.limitedKmCap ?? null,
      refs,
      corridor: c,
      flags: flagList,
      verdict: v,
      raceConflictType,
      raceId,
      raceName,
      peakForRaceId,
      taperForRaceId,
      recoveryForRaceId,
      guidance,
    };
  });

  const currentRefs = weeks.find((w) => w.weekStart === currentWeekStart)?.refs ?? {
    C: 0,
    LR30: 0,
    D30: 0,
    DW4: 0,
    M12: 0,
    buildMean: 0,
    weeksUsedForC: 0,
  };

  const raceDtos: RaceStateDTO[] = races.map((race) => {
    const targets = raceTargets(race, settings);
    const raceMonday = mondayOf(race.date);
    let feas: Feasibility | null = null;
    if (raceMonday >= currentWeekStart) {
      const weeksAvailable = Math.floor(diffDays(raceMonday, currentWeekStart) / 7) + 1;
      feas = feasibility(race, currentRefs.LR30, currentRefs.C, weeksAvailable, settings);
    }
    return { ...race, targets, feasibility: feas };
  });

  const checkinNeeded = !checkinsAsc.some((c) => c.weekStart === currentWeekStart);

  const currentWeekRuns = runs
    .filter((r) => mondayOf(r.startLocal) === currentWeekStart)
    .sort((a, b) => (a.startLocal < b.startLocal ? -1 : 1))
    .map(toRunDto);

  return { today, currentWeekStart, settings, weeks, races: raceDtos, currentWeekRuns, checkinNeeded, lastPlanUpdateAt };
}
