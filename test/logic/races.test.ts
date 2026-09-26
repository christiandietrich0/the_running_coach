import { describe, expect, it } from 'vitest';
import { buildDenseTimeline, mergeRuns, weeklyAggregates } from '../../src/logic/aggregate';
import { references } from '../../src/logic/references';
import { feasibility, raceTargets } from '../../src/logic/races';
import { DEFAULTS } from '../../src/worker/defaults';
import type { Race, RawActivity } from '../../src/logic/types';

function race(overrides: Partial<Race>): Race {
  return {
    id: 1,
    name: 'Test race',
    date: '2026-08-31',
    km: 100,
    dplusM: 5000,
    dminusM: 4800,
    targetTimeMin: null,
    priority: 'A',
    ...overrides,
  };
}

describe('raceTargets', () => {
  it('computes peaks, capped by the life-cap settings', () => {
    const t = raceTargets(race({}), DEFAULTS);
    // race_effort_km = 100 + 5000/100 = 150
    expect(t.raceEffortKm).toBeCloseTo(150);
    expect(t.peakLongRunKm).toBeCloseTo(DEFAULTS.maxLongRunKm); // 0.45*150=67.5, capped at 55
    expect(t.peakWeekEffortKm).toBeCloseTo(DEFAULTS.maxWeekKm); // 0.9*150=135, capped at 80
    expect(t.peakWeeklyDplusM).toBeCloseTo(3000); // 0.6 * 5000
    expect(t.peakSingleRunDminusM).toBeCloseTo(2160); // 0.45 * 4800
  });

  it('builds the 3-week A taper for races over 100km: week -2, week -1, race week', () => {
    const t = raceTargets(race({ km: 100, dplusM: 5000 }), DEFAULTS); // effort 150km > 100
    expect(t.taper.map((w) => w.label)).toEqual(['week -2', 'week -1', 'race week']);
    expect(t.taper[0].volumePct).toBeCloseTo(DEFAULTS.taperA.week2Pct);
    const weekMinus1 = t.taper.find((w) => w.label === 'week -1')!;
    expect(weekMinus1.volumePct).toBeCloseTo(DEFAULTS.taperA.week1Pct);
    expect(t.taper[t.taper.length - 1].volumePct).toBeCloseTo(DEFAULTS.taperA.raceWeekPct);
  });

  it('builds the 2-week A taper for races at or under 100km: week -1 only, then race week', () => {
    const t = raceTargets(race({ km: 50, dplusM: 0 }), DEFAULTS); // effort 50km <= 100
    expect(t.taper.map((w) => w.label)).toEqual(['week -1', 'race week']);
  });

  it('builds a 1-week B taper', () => {
    const t = raceTargets(race({ priority: 'B' }), DEFAULTS);
    expect(t.taper).toHaveLength(2);
    expect(t.taper.every((w) => w.volumePct === DEFAULTS.taperB.pct)).toBe(true);
  });

  it('has no taper for a C-priority race', () => {
    const t = raceTargets(race({ priority: 'C' }), DEFAULTS);
    expect(t.taper).toHaveLength(0);
  });
});

describe('feasibility', () => {
  // peak_long_run = 0.45 * 60 = 27km (well under the 55km cap), a B race
  // (2 taper weeks per DEFAULTS.taperB), current LR30 = 25km. currentC=50 is
  // comfortably above this race's own weekly-volume requirement (see the
  // "weekly volume" describe block below), so it never binds here -- these
  // cases are purely about the long-run dimension, as before.
  const r = race({ priority: 'B', km: 60, dplusM: 0 });

  it('needs 1 Build step (25 -> 27km at +10%/step) plus 2 taper weeks = 3 weeks', () => {
    const f = feasibility(r, 25, 50, 6, DEFAULTS);
    expect(f.weeksNeeded).toBe(3);
    expect(f.slack).toBe(3);
    expect(f.status).toBe('FEASIBLE');
  });

  it('is tight with little slack', () => {
    const f = feasibility(r, 25, 50, 4, DEFAULTS);
    expect(f.slack).toBe(1);
    expect(f.status).toBe('TIGHT');
  });

  it('is not safely reachable with too few weeks, and reports the max reachable long run', () => {
    const f = feasibility(r, 25, 50, 1, DEFAULTS);
    expect(f.status).toBe('NOT_REACHABLE');
    expect(f.maxReachableLongRunKm).toBeCloseTo(25); // no room for even one Build step
  });

  it('treats no LR30 baseline as not reachable', () => {
    const f = feasibility(r, 0, 50, 10, DEFAULTS);
    expect(f.status).toBe('NOT_REACHABLE');
  });
});

// v1.1 review round 6: suggestPlan() now clamps every generated week,
// including a race's own peak week, to green-max x C -- so a race whose
// peak week target the runner's current chronic average can't support
// within the green ceiling is a stretch on *weekly volume*, not just long
// run, even when the long-run dimension alone would read comfortably
// Feasible.
describe('feasibility: weekly volume dimension', () => {
  // peak_week_effort_km = min(0.9*60, 80) = 54km; needs C such that
  // 1.2*C >= 54, i.e. C >= 45. A B race, 2 taper weeks. currentLR30=50 is
  // comfortably above this race's tiny peak long run (27km), so it never
  // binds here -- these cases are purely about the volume dimension.
  const r = race({ priority: 'B', km: 60, dplusM: 0 });

  it('is feasible on volume alone when C is already above the required level', () => {
    const f = feasibility(r, 50, 45, 6, DEFAULTS);
    expect(f.weeksNeeded).toBe(2); // no Build step needed, just the 2 taper weeks
    expect(f.status).toBe('FEASIBLE');
    expect(f.maxReachableWeekKm).toBeCloseTo(54); // fully reachable
  });

  it('needs Build steps for C to reach the required level (40 -> 45km: 40*1.1=44 falls short, 40*1.1^2=48.4 clears it, so 2 steps)', () => {
    const f = feasibility(r, 50, 40, 6, DEFAULTS);
    expect(f.weeksNeeded).toBe(4); // 2 Build steps + 2 taper weeks (0 Down weeks: 2 steps < the 3-step cadence)
    expect(f.status).toBe('FEASIBLE');
  });

  it('is Tight or Not-reachable on volume alone even though the long-run dimension is comfortable', () => {
    const f = feasibility(r, 50, 40, 4, DEFAULTS); // exactly the 4 weeks needed, slack 0
    expect(f.status).toBe('TIGHT');
    expect(f.slack).toBe(0);
  });

  it('reports the peak week capped below the race\'s own target when volume is not reachable', () => {
    const f = feasibility(r, 50, 10, 2, DEFAULTS); // no room for any Build step (2 taper weeks alone use the budget)
    expect(f.status).toBe('NOT_REACHABLE');
    // Reachable peak week = 10 * 1.2 = 12, well under the 54km target.
    expect(f.maxReachableWeekKm).toBeCloseTo(12);
    expect(f.maxReachableWeekKm).toBeLessThan(54);
  });

  it('never reports a reachable peak week above the race\'s own target, however much slack there is', () => {
    const f = feasibility(r, 50, 200, 20, DEFAULTS); // C already far above what's needed
    expect(f.maxReachableWeekKm).toBeCloseTo(54); // capped at the target itself, not 1.2*200
  });
});

// v1.1 review A7: feasibility was too optimistic because it fed in a
// stale/about-to-expire LR30. Fixed as a consequence of A2 (LR30 is now
// evaluated as of the week's Sunday, not its Monday), not by any change to
// feasibility() itself.
describe('feasibility: consumes the A2-corrected LR30, not a stale one (A7)', () => {
  it('correctly requires more Build weeks once an aging-out long run has actually aged out', () => {
    function activity(id: string, startLocal: string, distanceM: number, lossM: number): RawActivity {
      return { id, startLocal, distanceM, movingS: 3600, gainM: 0, lossM, isRace: false };
    }
    // Same fixture as references.test.ts's A2 case: the Aug 29 48.1km run
    // must have aged out by the week of Sep 28 (Sunday Oct 4 - 30 days =
    // Sep 4), leaving the Sep 12 36km run as LR30.
    const runs = mergeRuns([
      activity('aug29', '2026-08-29T08:00:00', 48100, 1200),
      activity('sep12', '2026-09-12T08:00:00', 36000, 700),
    ]);
    const aggMap = weeklyAggregates(runs, DEFAULTS);
    const dense = buildDenseTimeline([...aggMap.values()], []);
    const refs = references({ weekStart: '2026-09-28', denseTimeline: dense, actualRuns: runs }, DEFAULTS);
    expect(refs.LR30).toBeCloseTo(36);

    const upcoming = race({ priority: 'B', km: 93, dplusM: 0 }); // peak long run 0.45*93 = 41.85km
    // currentC=100 is comfortably above this race's weekly-volume
    // requirement (peak_week_effort_km capped at maxWeekKm=80, needing
    // C>=66.67) in both calls, so it never binds -- this test is purely
    // about the long-run dimension, as before.
    const correct = feasibility(upcoming, refs.LR30, 100, 8, DEFAULTS);

    // Before A2, evaluating from this week's Monday would have kept the
    // Aug 29 run in-window (Sep 28 - 30 = Aug 29, the boundary itself) and
    // returned 48.1 here -- above the race's peak long run, so feasibility
    // would wrongly conclude zero Build weeks are still needed.
    const stale = feasibility(upcoming, 48.1, 100, 8, DEFAULTS);

    expect(correct.weeksNeeded).toBeGreaterThan(stale.weeksNeeded);
    expect(correct.slack).toBeLessThan(stale.slack);
  });
});
