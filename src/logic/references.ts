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

// A run/week that so badly overshoots the then-current reference that it
// would itself be flagged doesn't get *excluded* from that reference --
// dropping it entirely was tried in v1.1 review round 9 item 8 and
// produced a runaway collapse: once anything got excluded, the reference
// stayed at whatever low level it was already at, which made the *next*
// legitimate run look like an even bigger overshoot, which also got
// excluded, forever. Excluding nothing ever raised the reference again
// (v1.1 review round 9 follow-up).
//
// Instead the run still counts, clipped to capFactor x the reference as
// it stood right before this point: strictly bounded growth per step
// (the same ceiling corridor()'s own cap formula already uses, e.g.
// 1.10x LR30 for the long run), but never a hard freeze -- a big outlier
// always pushes the reference up by exactly one legitimate step, and a
// few real weeks in a row close the gap to reality instead of the
// reference staying stuck at its own bootstrap value indefinitely. No
// baseline yet (runningMax <= 0) means there's nothing to clip against,
// so the very first point in a window sets it unclipped, same as
// ratioOrNull's null-ref case in flags.ts.
function clippedContribution(value: number, runningMax: number, capFactor: number): number {
  if (runningMax <= 0) return value;
  return Math.min(value, capFactor * runningMax);
}

// DW4: the largest weekly D- of the previous `windowWeeks` weeks (3.5),
// with an *actual* week's own D- clipped to capFactor x the reference as
// it stood before that week (see clippedContribution above). A planned/
// forecast week (no actual runs of its own) is exempt from clipping:
// suggestPlan already vets its own generated trajectory (the invariant
// tests in plan.test.ts hold it to never itself read yellow/red), so a
// deliberate plan target -- e.g. a peak week's heavier descent than the
// Build weeks before it -- isn't second-guessed here. No race-week
// skipping is specified for this one, unlike C.
//
// Each week's own clipped contribution is computed by walking the *whole*
// history from week 0 up to (not including) idx, not just the last
// `windowWeeks` weeks -- re-bootstrapping a SHARED runningMax at 0 from
// whatever happens to be the oldest week still inside a short, moving
// window made a fixed week's own clipped value silently change from one
// query to the next as that boundary slid past older weeks (a real spike
// found via the backtest script: LR30 35.0 -> 18.8 -> 28.9 across three
// consecutive weeks, though the run that set 35.0 was still only days old
// and nowhere near ageing out of its 30-day window).
//
// But the ceiling each week clips against is still only the max of
// *already-fixed* contributions from the `windowWeeks` immediately before
// *that week itself* -- not a single running max shared across all of
// history. A single shared, never-decaying runningMax (the original v1.1
// review round 10 fix) turned out to have its own, worse bug: one big
// week from over a year back permanently set the ceiling high enough that
// every real week since then -- including the account's own actual
// Sep 28 2026 live report (D30 showing the raw 1,299m run unclipped,
// because a July 2026 week had long since pushed the all-time ceiling
// past 1,758m) -- sailed through completely unclipped forever, which
// defeats the entire point of a *30-day* reference. Each week's own
// lookback below is anchored to its own date (not to whatever week the
// caller happens to be asking about), so it's exactly as stable/
// oscillation-free as the shared-runningMax version -- it just forgets a
// ceiling once the week that set it is more than `windowWeeks` in the
// past, the same way DW4 itself is only ever a trailing window, never an
// all-time max (v1.1 review round 10 follow-up, Sep 28 bug report).
function computeDW4(dense: TimelinePoint[], idx: number, windowWeeks: number, capFactor: number, actualWeekStarts: Set<string>): number {
  const contributions: number[] = [];
  for (let i = 0; i < idx; i++) {
    const isPlanned = !actualWeekStarts.has(dense[i].weekStart);
    const ceiling = Math.max(0, ...contributions.slice(Math.max(0, i - windowWeeks), i));
    const contribution = isPlanned ? dense[i].dminusWeek : clippedContribution(dense[i].dminusWeek, ceiling, capFactor);
    contributions.push(contribution);
  }

  const windowContribs = contributions.slice(Math.max(0, idx - windowWeeks), idx);
  return windowContribs.length > 0 ? Math.max(...windowContribs) : 0;
}

// Trailing mean km_week of the `windowWeeks` weeks before idx. M12 (3.6,
// detraining check) was this function's only use until injuryRisk.ts's
// 4-week-mean-vs-10-week-average trend also needed the same trailing mean
// at two different window sizes (v1.1 review round 10 follow-up, Part 2).
function computeMeanKmWindow(dense: TimelinePoint[], idx: number, windowWeeks: number): number {
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
// Every point's own clipped contribution is computed by walking the
// *entire* history up to `asOf`, not just the 30-day window: re-bootstrapping
// a SHARED runningMax at 0 from whatever happens to be the oldest point
// still inside a short, moving window made a single fixed run's own clipped
// value silently drift from one week's query to the next, as the window's
// start boundary slid past older points and changed which one got to be the
// unclipped "first" point -- confirmed via the backtest script as a real
// spike-then-crash (LR30 35.0 -> 18.8 -> 28.9 across three consecutive
// weeks, days apart, with the run that set 35.0 nowhere near ageing out of
// its own 30-day window).
//
// But the ceiling a given point clips against is still only the max of
// *already-fixed* contributions from the `windowDays` immediately before
// *that point itself* -- not a single running max shared across all of
// history. A single shared, never-decaying runningMax (the original v1.1
// review round 10 fix) turned out to have its own, worse bug: one huge
// descent from over a year back permanently set the ceiling high enough
// (confirmed against this account's real synced history) that essentially
// every real run since then -- including the live Sep 27 2026 bug report
// (D30 showing the raw 1,299m run completely unclipped, "Up to 1,559m in
// one run") -- sailed straight through, because the account's own July
// 2026 long run had long since pushed the all-time ceiling past 1,758m,
// comfortably above 1,299m x 1.2. That defeats the entire point of a
// *30-day* reference. Each point's own lookback below is anchored to its
// own date (not to whatever week the caller happens to be asking about),
// so it's exactly as stable/oscillation-free as the shared-runningMax
// version -- it just forgets a ceiling once the point that set it is more
// than `windowDays` in the past, the same way LR30/D30 themselves are only
// ever a trailing 30-day window, never an all-time max (v1.1 review round
// 10 follow-up, Sep 28 bug report). Processed oldest-first so growth is
// judged in the order it actually happened: an actual run's contribution is
// clipped to capFactor x the reference as it stood right before it (see
// clippedContribution above), never excluded outright. capFactor is the
// same cap-ratio threshold corridor()'s own formula uses (e.g.
// longRunCapFactor, 1.10x LR30) -- not the red threshold, which is
// deliberately higher and would let a single reckless run inflate the
// reference by too much in one step.
function maxInWindow(points: LongRunPoint[], asOf: string, windowDays: number, pick: (p: LongRunPoint) => number, capFactor: number): number {
  const windowStart = addDays(asOf, -windowDays);
  const sorted = points.filter((p) => p.date < asOf).sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  const contributions: { date: string; value: number }[] = [];
  for (const p of sorted) {
    const v = pick(p);
    const lookbackStart = addDays(p.date, -windowDays);
    const ceiling = Math.max(0, ...contributions.filter((c) => c.date >= lookbackStart).map((c) => c.value));
    const contribution = p.isPlanned ? v : clippedContribution(v, ceiling, capFactor);
    contributions.push({ date: p.date, value: contribution });
  }

  const windowContribs = contributions.filter((c) => c.date >= windowStart);
  return windowContribs.length > 0 ? Math.max(...windowContribs.map((c) => c.value)) : 0;
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
  const DW4 = computeDW4(denseTimeline, idx, settings.chronicWindowWeeks, settings.weeklyDminusCapFactor, actualWeekStarts);
  const M12 = computeMeanKmWindow(denseTimeline, idx, 12);
  const mean4Week = computeMeanKmWindow(denseTimeline, idx, 4);
  const mean10Week = computeMeanKmWindow(denseTimeline, idx, 10);
  const buildMean = computeBuildMean(denseTimeline, idx, settings.downCadenceBuildWeeks);

  // LR30/D30 are evaluated as of this week's Sunday, not its Monday: a
  // long run must survive the whole week before it can be relied on to
  // set a cap for it (v1.1 review A2). C/DW4/M12/buildMean stay
  // Monday-referenced since those are whole-week sums, not day-level
  // windows.
  const asOf = addDays(weekStart, 6);
  const points = longRunPoints(denseTimeline, actualRuns);
  const LR30 = maxInWindow(points, asOf, settings.lr30WindowDays, (p) => p.km, settings.longRunCapFactor);
  const D30 = maxInWindow(points, asOf, settings.lr30WindowDays, (p) => p.lossM, settings.singleRunDminusCapFactor);

  return { C, LR30, D30, DW4, M12, mean4Week, mean10Week, buildMean, weeksUsedForC: weeksUsed };
}
