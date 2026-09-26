// Assembles the single GET /api/state payload every screen reads from
// (technical brief section 7), and is reused by POST /api/plan/suggest to
// return the state after auto-filling the plan.
import {
  applySymptomLock,
  buildDenseTimeline,
  corridor,
  feasibility,
  flags,
  mergeRuns,
  mondayOf,
  raceStructureSlots,
  raceSlotWeekType,
  raceTargets,
  references,
  verdict,
  weeklyAggregates,
} from '../logic';
import { addWeeks, diffDays } from '../logic/dates';
import type { CheckIn, Corridor, Feasibility, Flag, Race, RaceTargets, References, Run, Verdict, WeekType } from '../logic/types';
import { loadCheckins, loadPlanWeeks, loadRaces, loadRawActivities } from './db';
import type { Defaults } from './defaults';
import type { Env } from './index';
import { getSettings } from './settings-store';

const CHART_LOOKAHEAD_WEEKS = 12;

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
}

function toRunDto(run: Run): RunDTO {
  return { id: run.id, startLocal: run.startLocal, distanceM: run.distanceM, movingS: run.movingS, gainM: run.gainM, lossM: run.lossM, isRace: run.isRace };
}

export async function buildState(env: Env): Promise<StateResponse> {
  const [rawActivities, planWeeks, races, checkins, settings] = await Promise.all([
    loadRawActivities(env),
    loadPlanWeeks(env),
    loadRaces(env),
    loadCheckins(env),
    getSettings(env),
  ]);

  const runs = mergeRuns(rawActivities, settings.runMergeGapMin);
  const actualAggregates = [...weeklyAggregates(runs, settings).values()];
  const aggByWeek = new Map(actualAggregates.map((a) => [a.weekStart, a]));
  const planByWeek = new Map(planWeeks.map((w) => [w.weekStart, w]));

  const today = new Date().toISOString();
  const currentWeekStart = mondayOf(today);
  const dense = buildDenseTimeline(actualAggregates, planWeeks, currentWeekStart, addWeeks(currentWeekStart, CHART_LOOKAHEAD_WEEKS));

  const checkinsAsc = [...checkins].sort((a, b) => (a.weekStart < b.weekStart ? -1 : 1));
  const raceSlots = raceStructureSlots(races, settings);

  let prevKm: number | null = null;
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
    const c = corridor(effectiveType, refs, settings, {
      limitedKmCap: planRow?.limitedKmCap ?? null,
      symptomLocked,
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
        weekInProgress: w.weekStart === currentWeekStart,
      },
      settings,
    );
    const v = verdict(flagList);
    prevKm = w.kmWeek;

    // A race's structure only conflicts with a week the plan actually left
    // alone for the user (userEdited or Limited); suggestPlan() itself
    // always applies race structure to everything else.
    const wantedType = raceSlots.get(w.weekStart) ? raceSlotWeekType(raceSlots.get(w.weekStart)!.kind) : null;
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
      feas = feasibility(race, currentRefs.LR30, weeksAvailable, settings);
    }
    return { ...race, targets, feasibility: feas };
  });

  const checkinNeeded = !checkinsAsc.some((c) => c.weekStart === currentWeekStart);

  const currentWeekRuns = runs
    .filter((r) => mondayOf(r.startLocal) === currentWeekStart)
    .sort((a, b) => (a.startLocal < b.startLocal ? -1 : 1))
    .map(toRunDto);

  return { today, currentWeekStart, settings, weeks, races: raceDtos, currentWeekRuns, checkinNeeded };
}
