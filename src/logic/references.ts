// C, LR30, D30, DW4, M12 and the current Build-block mean. See
// training_planner_mechanics_brief.md sections 3.2 to 3.6.
import { addDays } from './dates';
import type { References, Run, Settings, TimelinePoint } from './types';

// Index of the first week >= weekStart (dense.length if none), so
// dense[idx - 1] is always "the week immediately before weekStart" even
// when weekStart itself isn't on the timeline yet (a future or in-
// progress week). Every reference here is uncoupled: it never includes
// weekStart's own week (mechanics brief 3.2).
function insertionIndex(dense: TimelinePoint[], weekStart: string): number {
  let idx = 0;
  while (idx < dense.length && dense[idx].weekStart < weekStart) idx++;
  return idx;
}

// C: mean km_week of the `windowWeeks` most recent qualifying weeks before
// weekStart. Race weeks, and the week immediately after a race week, are
// skipped and the search continues further back (3.2).
function computeC(dense: TimelinePoint[], idx: number, windowWeeks: number): { C: number; weeksUsed: number } {
  const qualifying: number[] = [];
  for (let i = idx - 1; i >= 0 && qualifying.length < windowWeeks; i--) {
    if (dense[i].isRaceWeek) continue;
    if (dense[i - 1]?.isRaceWeek) continue; // the week right after a race
    qualifying.push(dense[i].kmWeek);
  }
  const weeksUsed = qualifying.length;
  const C = weeksUsed > 0 ? qualifying.reduce((s, v) => s + v, 0) / weeksUsed : 0;
  return { C, weeksUsed };
}

// DW4: the largest weekly D- of the previous `windowWeeks` weeks (3.5).
// No race-week skipping is specified for this one, unlike C.
function computeDW4(dense: TimelinePoint[], idx: number, windowWeeks: number): number {
  let max = 0;
  for (let i = idx - 1, count = 0; i >= 0 && count < windowWeeks; i--, count++) {
    if (dense[i].dminusWeek > max) max = dense[i].dminusWeek;
  }
  return max;
}

// M12: 12-week mean of km_week, used only for the detraining check (3.6).
function computeM12(dense: TimelinePoint[], idx: number, windowWeeks: number): number {
  const slice = dense.slice(Math.max(0, idx - windowWeeks), idx);
  if (slice.length === 0) return 0;
  return slice.reduce((s, w) => s + w.kmWeek, 0) / slice.length;
}

// Mean km_week of the current Build block, for Down corridors ("0.60 to
// 0.75 x mean of last Build weeks", section 4). Walks back from the week
// before weekStart while weeks are typed BUILD; for actual historical
// weeks with no assigned type (a backtest has no plan rows), just take
// the cadence's worth of weeks as-is.
function computeBuildMean(dense: TimelinePoint[], idx: number, cadenceWeeks: number): number {
  const kms: number[] = [];
  for (let i = idx - 1; i >= 0 && kms.length < cadenceWeeks; i--) {
    const w = dense[i];
    if (w.weekType && w.weekType !== 'BUILD') break;
    kms.push(w.kmWeek);
  }
  if (kms.length === 0) return 0;
  return kms.reduce((s, v) => s + v, 0) / kms.length;
}

interface LongRunPoint {
  date: string;
  km: number;
  lossM: number;
}

// Candidate points for LR30/D30: every actual (merged, non-race) run at
// its exact date, plus one point per planned/future week at its
// weekStart. Actual runs come from `actualRuns` directly (not the weekly
// timeline) so a 30-day window that only partly overlaps a week still
// gets the right day-level answer.
function longRunPoints(dense: TimelinePoint[], actualRuns: Run[]): LongRunPoint[] {
  const points: LongRunPoint[] = [];
  for (const run of actualRuns) {
    if (run.isRace) continue;
    points.push({ date: run.startLocal.slice(0, 10), km: run.distanceM / 1000, lossM: run.lossM });
  }
  for (const w of dense) {
    if (w.weekType == null) continue; // actual weeks are covered by actualRuns above
    if (w.isRaceWeek || w.longRunKm == null || w.longRunDate == null) continue;
    points.push({ date: w.longRunDate, km: w.longRunKm, lossM: w.longRunLossM ?? 0 });
  }
  return points;
}

// `asOf` is the week's Sunday, not its Monday (see references() below):
// conservative, so a long run that's about to age out of the 30-day
// window by the time this week is actually run has already dropped out.
function maxInWindow(points: LongRunPoint[], asOf: string, windowDays: number, pick: (p: LongRunPoint) => number): number {
  const windowStart = addDays(asOf, -windowDays);
  let max = 0;
  for (const p of points) {
    if (p.date >= windowStart && p.date < asOf) {
      const v = pick(p);
      if (v > max) max = v;
    }
  }
  return max;
}

export interface ReferencesInput {
  weekStart: string;
  // Ascending, gap-free: actual weeks (weekType null) plus any planned
  // weeks appended, from buildDenseTimeline().
  denseTimeline: TimelinePoint[];
  // The merged runs backing the actual portion of denseTimeline, for
  // exact-date LR30/D30 windows.
  actualRuns: Run[];
}

export function references(input: ReferencesInput, settings: Settings): References {
  const { weekStart, denseTimeline, actualRuns } = input;
  const idx = insertionIndex(denseTimeline, weekStart);

  const { C, weeksUsed } = computeC(denseTimeline, idx, settings.chronicWindowWeeks);
  const DW4 = computeDW4(denseTimeline, idx, settings.chronicWindowWeeks);
  const M12 = computeM12(denseTimeline, idx, 12);
  const buildMean = computeBuildMean(denseTimeline, idx, settings.downCadenceBuildWeeks);

  // LR30/D30 are evaluated as of this week's Sunday, not its Monday: a
  // long run must survive the whole week before it can be relied on to
  // set a cap for it (v1.1 review A2). C/DW4/M12/buildMean stay
  // Monday-referenced since those are whole-week sums, not day-level
  // windows.
  const asOf = addDays(weekStart, 6);
  const points = longRunPoints(denseTimeline, actualRuns);
  const LR30 = maxInWindow(points, asOf, settings.lr30WindowDays, (p) => p.km);
  const D30 = maxInWindow(points, asOf, settings.lr30WindowDays, (p) => p.lossM);

  return { C, LR30, D30, DW4, M12, buildMean, weeksUsedForC: weeksUsed };
}
