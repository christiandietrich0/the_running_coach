import { describe, expect, it } from 'vitest';
import { buildDenseTimeline, mergeRuns, weeklyAggregates } from '../../src/logic/aggregate';
import { DEFAULTS } from '../../src/worker/defaults';
import type { PlanWeek, RawActivity, WeeklyAggregate } from '../../src/logic/types';

function activity(overrides: Partial<RawActivity> & Pick<RawActivity, 'id' | 'startLocal'>): RawActivity {
  return { distanceM: 10000, movingS: 3600, gainM: 100, lossM: 100, isRace: false, ...overrides };
}

describe('mergeRuns', () => {
  it('merges two activities less than the gap apart into one run', () => {
    const runs = mergeRuns([
      activity({ id: 'a', startLocal: '2026-07-20T08:00:00', movingS: 1800, distanceM: 5000 }),
      // starts 10 min after the first one's moving time ends (08:30 + 10min)
      activity({ id: 'b', startLocal: '2026-07-20T08:40:00', movingS: 1800, distanceM: 5000 }),
    ]);
    expect(runs).toHaveLength(1);
    expect(runs[0].activityIds).toEqual(['a', 'b']);
    expect(runs[0].distanceM).toBe(10000);
  });

  it('keeps activities more than the gap apart as separate runs', () => {
    const runs = mergeRuns([
      activity({ id: 'a', startLocal: '2026-07-20T08:00:00', movingS: 1800 }),
      // 08:30 end + 20 min gap > default 15 min
      activity({ id: 'b', startLocal: '2026-07-20T08:50:00', movingS: 1800 }),
    ]);
    expect(runs).toHaveLength(2);
  });

  it('respects a custom gap threshold', () => {
    const acts = [
      activity({ id: 'a', startLocal: '2026-07-20T08:00:00', movingS: 1800 }),
      activity({ id: 'b', startLocal: '2026-07-20T08:50:00', movingS: 1800 }), // 20 min gap
    ];
    expect(mergeRuns(acts, 15)).toHaveLength(2);
    expect(mergeRuns(acts, 25)).toHaveLength(1);
  });

  it('ORs the race flag across a merge and sums fields', () => {
    const runs = mergeRuns([
      activity({ id: 'a', startLocal: '2026-07-20T08:00:00', movingS: 1800, gainM: 50, lossM: 40, isRace: true }),
      activity({ id: 'b', startLocal: '2026-07-20T08:40:00', movingS: 1800, gainM: 30, lossM: 20, isRace: false }),
    ]);
    expect(runs[0].isRace).toBe(true);
    expect(runs[0].gainM).toBe(80);
    expect(runs[0].lossM).toBe(60);
  });

  it('sorts out-of-order input by start time before merging', () => {
    const runs = mergeRuns([
      activity({ id: 'b', startLocal: '2026-07-21T08:00:00', movingS: 1800 }),
      activity({ id: 'a', startLocal: '2026-07-20T08:00:00', movingS: 1800 }),
    ]);
    expect(runs.map((r) => r.id)).toEqual(['a', 'b']);
  });
});

describe('weeklyAggregates', () => {
  it('computes km, effort-km, mech-km, dminus, run count and the longest run', () => {
    const runs = mergeRuns([
      activity({ id: 'a', startLocal: '2026-07-20T08:00:00', distanceM: 10000, gainM: 200, lossM: 150 }),
      activity({ id: 'b', startLocal: '2026-07-22T08:00:00', distanceM: 20000, gainM: 500, lossM: 400 }),
    ]);
    const agg = weeklyAggregates(runs, DEFAULTS).get('2026-07-20')!;

    expect(agg.kmWeek).toBeCloseTo(30);
    // effort_km = km + D+/100 = (10 + 2) + (20 + 5) = 37
    expect(agg.effortKmWeek).toBeCloseTo(37);
    // mech_km = km + w*D-/100, w=1 = (10 + 1.5) + (20 + 4) = 35.5
    expect(agg.mechKmWeek).toBeCloseTo(35.5);
    expect(agg.dminusWeek).toBeCloseTo(550);
    expect(agg.runsWeek).toBe(2);
    expect(agg.longestKm).toBeCloseTo(20);
    expect(agg.longestLossM).toBeCloseTo(400);
    expect(agg.hasRace).toBe(false);
  });

  it('flags hasRace when any run in the week is race-tagged', () => {
    const runs = mergeRuns([activity({ id: 'a', startLocal: '2026-07-20T08:00:00', isRace: true })]);
    const agg = weeklyAggregates(runs, DEFAULTS).get('2026-07-20')!;
    expect(agg.hasRace).toBe(true);
  });
});

describe('buildDenseTimeline', () => {
  const actual: WeeklyAggregate[] = [
    { weekStart: '2026-07-06', kmWeek: 50, effortKmWeek: 55, mechKmWeek: 53, dminusWeek: 800, runsWeek: 3, longestKm: 25, longestLossM: 500, longestDate: '2026-07-11', hasRace: false },
    // 2026-07-13 deliberately missing: a real zero-training week
    { weekStart: '2026-07-20', kmWeek: 60, effortKmWeek: 66, mechKmWeek: 63, dminusWeek: 900, runsWeek: 3, longestKm: 30, longestLossM: 600, longestDate: '2026-07-19', hasRace: true },
  ];

  it('fills gaps between known weeks with explicit zero weeks', () => {
    const dense = buildDenseTimeline(actual, []);
    const weekStarts = dense.map((w) => w.weekStart);
    expect(weekStarts).toEqual(['2026-07-06', '2026-07-13', '2026-07-20']);
    expect(dense[1].kmWeek).toBe(0);
    expect(dense[1].isRaceWeek).toBe(false);
  });

  it('nulls the long-run point for a race week', () => {
    const dense = buildDenseTimeline(actual, []);
    const raceWeek = dense.find((w) => w.weekStart === '2026-07-20')!;
    expect(raceWeek.isRaceWeek).toBe(true);
    expect(raceWeek.longRunKm).toBeNull();
  });

  it('appends planned weeks after the actual ones, treating their long run as if done', () => {
    const planned: PlanWeek[] = [
      {
        weekStart: '2026-07-27',
        type: 'BUILD',
        km: 65,
        longRunKm: 33,
        dplusM: 700,
        dminusM: 650,
        limitedDays: null,
        limitedKmCap: null,
        userEdited: false,
      },
    ];
    const dense = buildDenseTimeline(actual, planned);
    const plannedPoint = dense.find((w) => w.weekStart === '2026-07-27')!;
    expect(plannedPoint.weekType).toBe('BUILD');
    expect(plannedPoint.longRunKm).toBe(33);
    expect(plannedPoint.longRunDate).toBe('2026-07-27');
  });

  it('gives a planned RACE week no long-run point', () => {
    const planned: PlanWeek[] = [
      { weekStart: '2026-07-27', type: 'RACE', km: 42, longRunKm: 42, dplusM: 1000, dminusM: 1000, limitedDays: null, limitedKmCap: null, userEdited: false },
    ];
    const dense = buildDenseTimeline(actual, planned);
    const raceWeek = dense.find((w) => w.weekStart === '2026-07-27')!;
    expect(raceWeek.isRaceWeek).toBe(true);
    expect(raceWeek.longRunKm).toBeNull();
  });

  it('keeps a week\'s real numbers when a plan row exists for it too (the in-progress current week), only recording the plan\'s type', () => {
    // 2026-07-06 already has real activity data (kmWeek 50 from `actual`).
    // A plan row for that same week (e.g. from Suggest plan, run mid-week)
    // must not blow away what already happened.
    const planned: PlanWeek[] = [
      { weekStart: '2026-07-06', type: 'DOWN', km: 74, longRunKm: 53, dplusM: 900, dminusM: 850, limitedDays: null, limitedKmCap: null, userEdited: false },
    ];
    const dense = buildDenseTimeline(actual, planned);
    const week = dense.find((w) => w.weekStart === '2026-07-06')!;
    expect(week.kmWeek).toBe(50); // the real number, not the plan's 74
    expect(week.longRunKm).toBe(25); // actual's longest run, not the plan's 53
    expect(week.weekType).toBe('DOWN'); // but the plan's type is still recorded
  });
});
