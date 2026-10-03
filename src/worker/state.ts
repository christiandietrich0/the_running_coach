// Assembles the single GET /api/state payload every screen reads from
// (technical brief section 7), and is reused by POST /api/plan/suggest to
// return the state after auto-filling the plan.
import {
  applySymptomLock,
  buildDenseTimeline,
  computeInjuryRisk,
  corridor,
  feasibility,
  flags,
  isReentryWeek,
  longRunDescentShare,
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
import type { InjuryRiskWeekInput } from '../logic/injuryRisk';
import type { FeasibilityExtra } from '../logic/races';
import type { CheckIn, Corridor, Feasibility, Flag, InjuryRisk, PlanWeek, Race, RaceTargets, References, Run, TimelinePoint, Verdict, WeekType } from '../logic/types';
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

// buildDenseTimeline() (src/logic/aggregate.ts) gives the current (in-
// progress) week's entry EITHER pure actual data (once any run is logged
// this week) OR the plan row's own figures verbatim (nothing logged yet)
// -- never a blend of the two. Every consumer that treats this timeline
// as "the week's reference value" -- references(), corridor(), flags(),
// and the next week's own week-on-week comparison via prevKm in
// buildState() below -- needs the week to count as at least its planned
// target even while it's still accruing actuals: otherwise a
// legitimately-planned next week reads as a huge jump over an
// artificially low, still-in-progress current week and gets wrongly
// flagged yellow/red (v1.1 review round 9 item 4 -- Oct 5's taper and
// the following weeks were reading non-green off exactly this). Mutates
// the current week's entry up to max(actual so far, planned target) per
// field, in place, before references()/flags()/corridor() ever see it.
//
// This is deliberately a *reference* value, not a "done" one: buildState()
// below captures the pure actual-so-far figures separately (from the same
// weekly aggregate, before this runs) for anything that displays real
// progress -- This Week's headline, the Plan row's "done" figures, the
// remaining-this-week guidance math -- so the plan's target is never shown
// as if it already happened (v1.1 review round 9 item 1; round 8's
// suppressPlannedCurrentWeek zeroed the one shared field instead, which
// fixed This Week but broke the Plan row and race card, which need the
// planned figure, not zero).
export function blendCurrentWeekReference(dense: TimelinePoint[], currentWeekStart: string, planned: PlanWeek | undefined): void {
  if (!planned) return;
  const current = dense.find((w) => w.weekStart === currentWeekStart);
  if (!current) return;

  current.kmWeek = Math.max(current.kmWeek, planned.km ?? 0);
  current.dminusWeek = Math.max(current.dminusWeek, planned.dminusM ?? 0);

  const plannedLongRunKm = planned.longRunKm ?? 0;
  if (plannedLongRunKm > (current.longRunKm ?? 0)) {
    current.longRunKm = plannedLongRunKm;
    // The long run's own share of the planned weekly D- total, not the
    // whole week (buildDenseTimeline's own longRunDescentShare() above for
    // a planned week's longRunLossM); matched here so the pairing stays
    // consistent when the planned long run is what wins.
    current.longRunLossM = longRunDescentShare(planned.dminusM ?? 0, plannedLongRunKm, planned.km ?? 0);
    current.longRunDate = currentWeekStart;
  }
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
  // Actual progress logged so far this week, distinct from kmWeek/
  // dminusWeek/longestKm/longestLossM above once those are blended up to
  // the plan's target for reference purposes (blendCurrentWeekReference
  // above, v1.1 review round 9 items 1 and 4). Only ever different from
  // the fields above on the current (in-progress) week -- every other
  // week's kmWeek etc. already *is* what actually happened (or, for a
  // future week, the plan's own forecast, already labelled as such via
  // isActual). Zero/0 when nothing's been logged yet, never the plan's
  // number -- this is what This Week's headline and the Plan row's
  // "done" figure must read instead of kmWeek etc.
  doneKmWeek: number;
  doneDminusWeek: number;
  doneLongestKm: number;
  doneLongestLossM: number;
  doneDplusM: number;
  doneEffortKmWeek: number;
  // The plan's own raw target figures for this week, straight from its
  // plan_weeks row -- null when no plan row exists yet for this week.
  // Exposed so the Plan row can show "planned vs done" and the race card
  // / peak-week-capped note always reads the plan's figure, never a
  // zeroed or blended actual (v1.1 review round 9 item 1).
  plannedKm: number | null;
  plannedLongRunKm: number | null;
  plannedDplusM: number | null;
  plannedDminusM: number | null;
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
  // Display only, never fed into any reference/cap/flag computation (the
  // clipped LR30 stays the sole safety reference for those, unchanged): the
  // raw, unclipped distance of the longest non-race run since the last
  // race or Recovery week, and its date -- "what's actually the biggest
  // effort banked this block", for the locked-in race card (v1.1 review
  // round 10 follow-up item 4, refined again). Null before any such run
  // exists.
  peakLongRunDoneKm: number | null;
  peakLongRunDoneDate: string | null;
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
  // This week's load-based injury risk read (v1.1 review round 10 Part
  // 2) -- see injuryRisk.ts's own header for what it is and isn't.
  injuryRisk: InjuryRisk;
  // The deployed Worker script's own git short hash (health.ts's own
  // comment explains why this is separate from the frontend's
  // __BUILD_VERSION__), null if WORKER_BUILD wasn't passed at deploy time.
  workerBuild: string | null;
}

function toRunDto(run: Run): RunDTO {
  return { id: run.id, startLocal: run.startLocal, distanceM: run.distanceM, movingS: run.movingS, gainM: run.gainM, lossM: run.lossM, isRace: run.isRace };
}

// feasibility()'s own LOCKED_IN signal, derived from each week's already-
// computed race-slot tags (peakForRaceId/taperForRaceId/raceId, set by the
// main weeks.map() loop above from raceStructureSlots) rather than a raw
// weeksAvailable count: the current week is this race's own Peak, Taper,
// or Race week -- no Build weeks remain before it -- regardless of how
// many calendar weeks that happens to be (v1.1 review round 10 follow-up
// item 4, refined). Exported standalone (taking the already-built `weeks`
// array, not buildState()'s own closure) so it's testable without a D1
// mock.
export function raceFeasibilityExtra(weeks: WeekStateDTO[], currentWeekStart: string, race: Race, settings: Defaults): FeasibilityExtra {
  const currentWeekDto = weeks.find((w) => w.weekStart === currentWeekStart);
  const lockedInByWeekType =
    !!currentWeekDto &&
    (currentWeekDto.peakForRaceId === race.id ||
      currentWeekDto.taperForRaceId === race.id ||
      (currentWeekDto.type === 'RACE' && currentWeekDto.raceId === race.id));

  // The last genuine Build week for this race (the week right before
  // Peak) and what feasibility() said then, so the UI can still show
  // "Build ended Tight (35 of 47km)" once locked in, instead of just
  // losing that information. The reachable-long-run figure is the Peak
  // week's own corridor.lrMax -- the real, already-generated cap
  // suggestPlan() used for it -- not a second, independent feasibility()
  // growth projection: the two are close but not always identical, and
  // showing two slightly different numbers for "the long-run cap" in two
  // places (here vs the Peak week's own This Week screen, once it
  // becomes current) was exactly the round 10 follow-up item 2 report
  // (v1.1 review round 10 follow-up, final pre-1.0 pass item 2). The
  // status label alone still comes from feasibility() at that week, since
  // corridor.lrMax carries no Tight/Not-reachable/Feasible read of its
  // own. No Peak week (e.g. a C-priority race, which never tapers) means
  // no such reading.
  const peakWeek = weeks.find((w) => w.peakForRaceId === race.id);
  let lastBuild: FeasibilityExtra['lastBuild'];
  if (peakWeek) {
    const lastBuildWeekStart = addDays(peakWeek.weekStart, -7);
    const lastBuildWeek = weeks.find((w) => w.weekStart === lastBuildWeekStart);
    if (lastBuildWeek) {
      const raceMonday = mondayOf(race.date);
      const lastBuildWeeksAvailable = Math.floor(diffDays(raceMonday, lastBuildWeekStart) / 7) + 1;
      const lastBuildFeas = feasibility(race, lastBuildWeek.refs.LR30, lastBuildWeek.refs.C, lastBuildWeeksAvailable, settings);
      const maxReachableLongRunKm = Number.isFinite(peakWeek.corridor.lrMax) ? peakWeek.corridor.lrMax : lastBuildFeas.maxReachableLongRunKm;
      lastBuild = { status: lastBuildFeas.status, maxReachableLongRunKm };
    }
  }

  return { lockedInByWeekType, lastBuild };
}

// How far back peakLongRunDone() will ever look when there's no more
// recent race to anchor to -- an account with no races yet, or whose last
// one was a long time ago, shouldn't surface its all-time longest run as
// if it were part of the current build.
const PEAK_LONG_RUN_LOOKBACK_WEEKS = 16;

// The window peakLongRunDone() searches: since the account's last race --
// flagged by intervals.icu on the activity itself, or recorded as a race
// in the races table (even when intervals.icu never flagged it, e.g. an
// old trail race entered purely as a historical record, like Bukovina, an
// 84km run from Jul 24) -- excluding the race day itself, capped to
// PEAK_LONG_RUN_LOOKBACK_WEEKS weeks back. Simplified from an earlier
// 3-way version (also stopping at the last Recovery/Limited week, or the
// first week any plan exists for) after that last condition wrongly
// excluded a real Aug 29 long run on a live account whose plan_weeks
// history didn't happen to reach back that far -- "since the last race"
// is the one rule that actually matches what the label promises (v1.1
// review round 10 follow-up, final pre-1.0 pass, simplified).
export function lastResetBoundary(runs: Run[], races: Race[], currentWeekStart: string): string {
  const lookbackFloor = addDays(currentWeekStart, -7 * PEAK_LONG_RUN_LOOKBACK_WEEKS);
  const raceDates = [...runs.filter((r) => r.isRace).map((r) => r.startLocal.slice(0, 10)), ...races.map((r) => r.date)].filter(
    (d) => d < currentWeekStart,
  );
  const lastRaceDate = raceDates.length > 0 ? raceDates.reduce((a, b) => (a > b ? a : b)) : null;
  return lastRaceDate != null && lastRaceDate > lookbackFloor ? lastRaceDate : lookbackFloor;
}

// Display only, never fed into any cap/flag/reference computation (see
// RaceStateDTO's own comment) -- the raw, unclipped distance of the
// longest non-race run since the last reset (lastResetBoundary above),
// and its date. A genuinely new best effort is still a new best effort
// even when it's one clippedContribution() would have capped for
// reference purposes elsewhere; this is deliberately not that number
// (v1.1 review round 10 follow-up item 4). Excludes a race twice over,
// belt and braces: the run's own isRace flag (intervals.icu, or a manual
// override), and separately any run whose date matches a race recorded
// in the races table -- a race can clear the first without the second,
// as Bukovina did.
export function peakLongRunDone(runs: Run[], races: Race[], currentWeekStart: string): { km: number; date: string } | null {
  const boundary = lastResetBoundary(runs, races, currentWeekStart);
  const raceDates = new Set(races.map((r) => r.date));
  const candidates = runs.filter((r) => !r.isRace && !raceDates.has(r.startLocal.slice(0, 10)) && r.startLocal.slice(0, 10) > boundary);
  if (candidates.length === 0) return null;
  const longest = candidates.reduce((max, r) => (r.distanceM > max.distanceM ? r : max));
  return { km: longest.distanceM / 1000, date: longest.startLocal.slice(0, 10) };
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

  blendCurrentWeekReference(dense, currentWeekStart, planByWeek.get(currentWeekStart));

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

    // Pure actual-so-far figures, straight from this week's real
    // aggregate (undefined when nothing's been logged this week at all)
    // -- captured before any reference blending is read below, so guidance
    // and the DTO's done* fields never see the plan's target as if it were
    // done (v1.1 review round 9 items 1 and 4).
    const agg = aggByWeek.get(w.weekStart);
    const doneKmWeek = agg ? agg.kmWeek : 0;
    const doneDminusWeek = agg ? agg.dminusWeek : 0;
    const doneLongestKm = agg && agg.longestKm > 0 ? agg.longestKm : 0;
    const doneLongestLossM = agg && agg.longestKm > 0 ? agg.longestLossM : 0;
    const doneDplusM = agg ? (agg.effortKmWeek - agg.kmWeek) * 100 : 0;
    const doneEffortKmWeek = agg ? agg.effortKmWeek : 0;
    const effortKmWeek = agg ? agg.effortKmWeek : w.kmWeek + (planRow?.dplusM ?? 0) / 100;
    const mechKmWeek = agg ? agg.mechKmWeek : w.kmWeek + (settings.descentWeightW * (planRow?.dminusM ?? 0)) / 100;
    const runsWeek = agg ? agg.runsWeek : 0;

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

    // The current week's own flags/verdict read only what's actually been
    // run so far, never the blended-up-to-planned dense entry: that blend
    // exists solely so *later* weeks' week-on-week/reference math doesn't
    // read an artificially low still-in-progress week as a huge jump (see
    // blendCurrentWeekReference's own comment above) -- it was never meant
    // to make this week's own verdict judge the plan's target as if it had
    // already happened (a Peak week's planned long run reading as today's
    // own single-run descent, overloaded before a single km of it has been
    // run, v1.1 review round 10 follow-up item 1). Every other week's w.*
    // fields already *are* pure actual (past) or pure planned (future), so
    // only the current week needs this split.
    const isCurrentWeek = w.weekStart === currentWeekStart;
    const flagList = flags(
      {
        weekType: effectiveType,
        kmWeek: isCurrentWeek ? doneKmWeek : w.kmWeek,
        longestKm: isCurrentWeek ? doneLongestKm : (w.longRunKm ?? 0),
        longestLossM: isCurrentWeek ? doneLongestLossM : (w.longRunLossM ?? 0),
        dminusWeek: isCurrentWeek ? doneDminusWeek : w.dminusWeek,
        refs,
        checkin: weekCheckin,
        priorCheckinsAsc,
        prevWeekKm: prevKm,
        prevWeekType: prevType,
        weekInProgress: isCurrentWeek,
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
          doneKm: doneKmWeek,
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
      doneKmWeek,
      doneDminusWeek,
      doneLongestKm,
      doneLongestLossM,
      doneDplusM,
      doneEffortKmWeek,
      plannedKm: planRow?.km ?? null,
      plannedLongRunKm: planRow?.longRunKm ?? null,
      plannedDplusM: planRow?.dplusM ?? null,
      plannedDminusM: planRow?.dminusM ?? null,
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

  const currentRefs: References = weeks.find((w) => w.weekStart === currentWeekStart)?.refs ?? {
    C: 0,
    LR30: 0,
    D30: 0,
    DW4: 0,
    M12: 0,
    mean4Week: 0,
    mean10Week: 0,
    buildMean: 0,
    weeksUsedForC: 0,
  };

  // Athlete-wide, not per-race: the same "since the last race or Recovery
  // week" boundary applies whichever upcoming race's card happens to show
  // it (RaceStateDTO's own comment).
  const peakLongRunDoneReading = peakLongRunDone(runs, races, currentWeekStart);

  const raceDtos: RaceStateDTO[] = races.map((race) => {
    const targets = raceTargets(race, settings);
    const raceMonday = mondayOf(race.date);
    let feas: Feasibility | null = null;
    if (raceMonday >= currentWeekStart) {
      const weeksAvailable = Math.floor(diffDays(raceMonday, currentWeekStart) / 7) + 1;
      const extra = raceFeasibilityExtra(weeks, currentWeekStart, race, settings);
      feas = feasibility(race, currentRefs.LR30, currentRefs.C, weeksAvailable, settings, extra);
    }
    return {
      ...race,
      targets,
      feasibility: feas,
      peakLongRunDoneKm: peakLongRunDoneReading?.km ?? null,
      peakLongRunDoneDate: peakLongRunDoneReading?.date ?? null,
    };
  });

  const checkinNeeded = !checkinsAsc.some((c) => c.weekStart === currentWeekStart);

  const currentWeekRuns = runs
    .filter((r) => mondayOf(r.startLocal) === currentWeekStart)
    .sort((a, b) => (a.startLocal < b.startLocal ? -1 : 1))
    .map(toRunDto);

  // This week plus the 3 completed weeks before it, most-recent-first, for
  // injuryRisk.ts's own per-week recency weighting (v1.1 review round 10
  // Part 2) -- reuses each week's flags exactly as flags() already
  // computed them above, no separate computation.
  const currentWeekIdx = weeks.findIndex((w) => w.weekStart === currentWeekStart);
  const injuryRiskWeeks: InjuryRiskWeekInput[] =
    currentWeekIdx === -1
      ? []
      : weeks
          .slice(Math.max(0, currentWeekIdx - 3), currentWeekIdx + 1)
          .reverse()
          .map((w) => ({ weekStart: w.weekStart, flags: w.flags }));
  const latestCheckin = checkinsAsc.length > 0 ? checkinsAsc[checkinsAsc.length - 1] : null;
  const injuryRisk: InjuryRisk = computeInjuryRisk(
    { weeks: injuryRiskWeeks, mean4Week: currentRefs.mean4Week, mean10Week: currentRefs.mean10Week, latestCheckin },
    settings,
  );

  return {
    today,
    currentWeekStart,
    settings,
    weeks,
    races: raceDtos,
    currentWeekRuns,
    checkinNeeded,
    lastPlanUpdateAt,
    injuryRisk,
    workerBuild: env.WORKER_BUILD ?? null,
  };
}
