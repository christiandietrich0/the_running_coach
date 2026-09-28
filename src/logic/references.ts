// C, LR30, D30, DW4, M12 and the current Build-block mean. See
// training_planner_mechanics_brief.md sections 3.2 to 3.6.
import { addDays, mondayOf } from './dates';
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

// A week that doesn't belong in the C average: a race week or a Recovery
// week (v1.1 review round 3 item 4 -- Recovery is deliberately low, just
// like a race week is deliberately a spike, and neither is representative
// of chronic load).
function skipsC(w: TimelinePoint | undefined): boolean {
  return !!w && (w.isRaceWeek || w.weekType === 'RECOVERY');
}

// C: mean km_week of the `windowWeeks` most recent qualifying weeks before
// weekStart. A race or Recovery week, and the week immediately after one,
// are skipped and the search continues further back (3.2).
function computeC(dense: TimelinePoint[], idx: number, windowWeeks: number): { C: number; weeksUsed: number } {
  const qualifying: number[] = [];
  for (let i = idx - 1; i >= 0 && qualifying.length < windowWeeks; i--) {
    if (skipsC(dense[i])) continue;
    if (skipsC(dense[i - 1])) continue; // the week right after a race/Recovery week
    qualifying.push(dense[i].kmWeek);
  }
  const weeksUsed = qualifying.length;
  const C = weeksUsed > 0 ? qualifying.reduce((s, v) => s + v, 0) / weeksUsed : 0;
  return { C, weeksUsed };
}

// True when `weekStart` falls within the 3-week re-entry window right
// after a Recovery week (v1.1 review round 3 item 4): its own low volume
// (and that of the two weeks after it) shouldn't trip the low-volume or
// detraining blue flags during a deliberate, capped ramp back up.
export function isReentryWeek(dense: TimelinePoint[], weekStart: string): boolean {
  const idx = insertionIndex(dense, weekStart);
  for (let back = 1; back <= 3; back++) {
    if (dense[idx - back]?.weekType === 'RECOVERY') return true;
  }
  return false;
}

// DW4: the largest weekly D- of the previous `windowWeeks` weeks (3.5),
// but an *actual* week whose own D- so badly overshot the then-current DW4
// that it would itself be flagged red doesn't get to raise the reference
// -- it stays frozen at the level before that week until a legitimate
// (non-red) week reaches or beats it (v1.1 review round 9 item 8). A
// planned/forecast week (no actual runs of its own) is exempt: suggestPlan
// already vets its own generated trajectory (the invariant tests in
// plan.test.ts hold it to never itself read yellow/red), so a deliberate
// plan target -- e.g. a peak week's heavier descent than the Build weeks
// before it -- isn't second-guessed here. No race-week skipping is
// specified for this one, unlike C.
function computeDW4(dense: TimelinePoint[], idx: number, windowWeeks: number, redFactor: number, actualWeekStarts: Set<string>): number {
  const inWindow: { value: number; isPlanned: boolean }[] = [];
  for (let i = idx - 1, count = 0; i >= 0 && count < windowWeeks; i--, count++) {
    inWindow.push({ value: dense[i].dminusWeek, isPlanned: !actualWeekStarts.has(dense[i].weekStart) });
  }
  inWindow.reverse(); // oldest first, so escalation is judged in the order it actually happened

  let runningMax = 0;
  for (const { value, isPlanned } of inWindow) {
    if (!isPlanned && runningMax > 0 && value > redFactor * runningMax) continue; // red -- frozen, doesn't raise the reference
    if (value > runningMax) runningMax = value;
  }
  return runningMax;
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
  // False for a real, already-run point; true for a planned/forecast
  // week's own target, standing in "as if done" (mechanics brief 3.4).
  // Only real points are ever subject to the red-exclusion below (v1.1
  // review round 9 item 8) -- suggestPlan already vets its own generated
  // trajectory (plan.test.ts's invariant tests hold it to never itself
  // read yellow/red), so a deliberate plan target isn't second-guessed
  // here just because it grows faster than the weeks before it.
  isPlanned: boolean;
}

// Candidate points for LR30/D30: every actual (merged, non-race) run at
// its exact date, plus one point per planned/future week at its
// weekStart. Actual runs come from `actualRuns` directly (not the weekly
// timeline) so a 30-day window that only partly overlaps a week still
// gets the right day-level answer. A week that has real actual runs of
// its own is skipped in the second loop even if it also carries a plan
// row (buildDenseTimeline keeps that week's *type* from the plan while
// its km/longRunKm/etc. stay the real actual figures) -- actualRuns
// above already covers it, at exact per-run precision, and covering it
// twice would let its real run dodge the red-exclusion check via the
// (wrongly) unconditionally-exempt planned copy.
function longRunPoints(dense: TimelinePoint[], actualRuns: Run[]): LongRunPoint[] {
  const points: LongRunPoint[] = [];
  const actualWeekStarts = new Set(actualRuns.map((r) => mondayOf(r.startLocal)));
  for (const run of actualRuns) {
    if (run.isRace) continue;
    points.push({ date: run.startLocal.slice(0, 10), km: run.distanceM / 1000, lossM: run.lossM, isPlanned: false });
  }
  for (const w of dense) {
    if (w.weekType == null) continue; // actual weeks with no plan row are covered by actualRuns above
    if (actualWeekStarts.has(w.weekStart)) continue; // actual weeks with a plan row too -- also covered above
    if (w.isRaceWeek || w.longRunKm == null || w.longRunDate == null) continue;
    points.push({ date: w.longRunDate, km: w.longRunKm, lossM: w.longRunLossM ?? 0, isPlanned: true });
  }
  return points;
}

// `asOf` is the week's Sunday, not its Monday (see references() below):
// conservative, so a long run that's about to age out of the 30-day
// window by the time this week is actually run has already dropped out.
//
// Processed oldest-first so escalation is judged in the order it actually
// happened: an actual run that so badly overshot the *then-current*
// reference that it would itself be flagged red doesn't get to raise
// LR30/D30 -- the reference stays frozen at the level before that run
// until a legitimate (non-red) run reaches or beats it (v1.1 review round
// 9 item 8). redFactor is the same ratio-to-reference threshold
// longRunFlag/descentSingleFlag treat as red, so a run excluded here is
// exactly the one flags() would independently also flag red for that same
// week.
function maxInWindow(points: LongRunPoint[], asOf: string, windowDays: number, pick: (p: LongRunPoint) => number, redFactor: number): number {
  const windowStart = addDays(asOf, -windowDays);
  const inWindow = points.filter((p) => p.date >= windowStart && p.date < asOf).sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  let runningMax = 0;
  for (const p of inWindow) {
    const v = pick(p);
    if (!p.isPlanned && runningMax > 0 && v > redFactor * runningMax) continue; // red -- frozen, doesn't raise the reference
    if (v > runningMax) runningMax = v;
  }
  return runningMax;
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
  const actualWeekStarts = new Set(actualRuns.map((r) => mondayOf(r.startLocal)));

  const { C, weeksUsed } = computeC(denseTimeline, idx, settings.chronicWindowWeeks);
  const DW4 = computeDW4(denseTimeline, idx, settings.chronicWindowWeeks, settings.weeklyDminusRedFactor, actualWeekStarts);
  const M12 = computeM12(denseTimeline, idx, 12);
  const buildMean = computeBuildMean(denseTimeline, idx, settings.downCadenceBuildWeeks);

  // LR30/D30 are evaluated as of this week's Sunday, not its Monday: a
  // long run must survive the whole week before it can be relied on to
  // set a cap for it (v1.1 review A2). C/DW4/M12/buildMean stay
  // Monday-referenced since those are whole-week sums, not day-level
  // windows.
  const asOf = addDays(weekStart, 6);
  const points = longRunPoints(denseTimeline, actualRuns);
  const LR30 = maxInWindow(points, asOf, settings.lr30WindowDays, (p) => p.km, settings.longRunCapFactor);
  const D30 = maxInWindow(points, asOf, settings.lr30WindowDays, (p) => p.lossM, settings.singleRunDminusRedFactor);

  return { C, LR30, D30, DW4, M12, buildMean, weeksUsedForC: weeksUsed };
}
