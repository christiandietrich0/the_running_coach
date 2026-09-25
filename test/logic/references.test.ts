import { describe, expect, it } from 'vitest';
import { buildDenseTimeline, mergeRuns, weeklyAggregates } from '../../src/logic/aggregate';
import { addWeeks } from '../../src/logic/dates';
import { references } from '../../src/logic/references';
import { DEFAULTS } from '../../src/worker/defaults';
import type { PlanWeek, RawActivity, TimelinePoint } from '../../src/logic/types';

function week(weekStart: string, kmWeek: number, opts: Partial<TimelinePoint> = {}): TimelinePoint {
  return {
    weekStart,
    kmWeek,
    dminusWeek: 0,
    longRunKm: null,
    longRunLossM: null,
    longRunDate: null,
    isRaceWeek: false,
    weekType: null,
    ...opts,
  };
}

describe('references: C (chronic reference)', () => {
  it('averages the previous 4 weeks, excluding the current week', () => {
    const dense = [week('2026-06-22', 50), week('2026-06-29', 55), week('2026-07-06', 60), week('2026-07-13', 45)];
    const refs = references({ weekStart: '2026-07-20', denseTimeline: dense, actualRuns: [] }, DEFAULTS);
    expect(refs.C).toBeCloseTo((50 + 55 + 60 + 45) / 4);
    expect(refs.weeksUsedForC).toBe(4);
  });

  it('skips race weeks and the week right after a race, looking further back to fill the window', () => {
    const dense = [
      week('2026-06-01', 40),
      week('2026-06-08', 80, { isRaceWeek: true }),
      week('2026-06-15', 20), // the week after the race
      week('2026-06-22', 55),
      week('2026-06-29', 58),
      week('2026-07-06', 60),
    ];
    const refs = references({ weekStart: '2026-07-13', denseTimeline: dense, actualRuns: [] }, DEFAULTS);
    // Qualifying, most-recent-first: 60, 58, 55, then back past the race
    // block to 40 -- the race week (80) and the week after it (20) are
    // both skipped.
    expect(refs.C).toBeCloseTo((60 + 58 + 55 + 40) / 4);
    expect(refs.weeksUsedForC).toBe(4);
  });

  it('averages whatever history exists when there are fewer than 4 weeks', () => {
    const dense = [week('2026-07-06', 40), week('2026-07-13', 50)];
    const refs = references({ weekStart: '2026-07-20', denseTimeline: dense, actualRuns: [] }, DEFAULTS);
    expect(refs.C).toBeCloseTo(45);
    expect(refs.weeksUsedForC).toBe(2);
  });

  it('is 0 with no history at all, rather than throwing', () => {
    const refs = references({ weekStart: '2026-07-20', denseTimeline: [], actualRuns: [] }, DEFAULTS);
    expect(refs.C).toBe(0);
    expect(refs.weeksUsedForC).toBe(0);
  });
});

describe('references: DW4 and M12', () => {
  it('DW4 is the largest weekly D- of the previous 4 weeks', () => {
    const dense = [
      week('2026-06-22', 50, { dminusWeek: 400 }),
      week('2026-06-29', 55, { dminusWeek: 900 }),
      week('2026-07-06', 60, { dminusWeek: 300 }),
      week('2026-07-13', 45, { dminusWeek: 500 }),
    ];
    const refs = references({ weekStart: '2026-07-20', denseTimeline: dense, actualRuns: [] }, DEFAULTS);
    expect(refs.DW4).toBe(900);
  });

  it('M12 is the 12-week mean of km_week', () => {
    const start = '2026-04-06';
    const dense = Array.from({ length: 12 }, (_, i) => week(addWeeks(start, i), 50));
    const refs = references({ weekStart: addWeeks(start, 12), denseTimeline: dense, actualRuns: [] }, DEFAULTS);
    expect(refs.M12).toBeCloseTo(50);
  });
});

describe('references: LR30 / D30', () => {
  function activity(id: string, startLocal: string, distanceM: number, lossM: number, isRace = false): RawActivity {
    return { id, startLocal, distanceM, movingS: 3600, gainM: 0, lossM, isRace };
  }

  it('is the longest non-race run in the 30 days before weekStart', () => {
    const runs = mergeRuns([
      activity('a', '2026-07-01T08:00:00', 20000, 300),
      activity('b', '2026-07-10T08:00:00', 30000, 500),
      activity('c', '2026-06-01T08:00:00', 50000, 900), // outside the 30-day window
    ]);
    const aggMap = weeklyAggregates(runs, DEFAULTS);
    const dense = buildDenseTimeline([...aggMap.values()], []);
    const refs = references({ weekStart: '2026-07-20', denseTimeline: dense, actualRuns: runs }, DEFAULTS);
    expect(refs.LR30).toBeCloseTo(30);
    expect(refs.D30).toBeCloseTo(500);
  });

  it('excludes race-tagged runs, even if they are the longest', () => {
    const runs = mergeRuns([
      activity('race', '2026-07-05T08:00:00', 85000, 4800, true),
      activity('train', '2026-07-10T08:00:00', 25000, 400),
    ]);
    const aggMap = weeklyAggregates(runs, DEFAULTS);
    const dense = buildDenseTimeline([...aggMap.values()], []);
    const refs = references({ weekStart: '2026-07-20', denseTimeline: dense, actualRuns: runs }, DEFAULTS);
    expect(refs.LR30).toBeCloseTo(25);
  });

  it('counts a planned week\'s long run as if done, rolling LR30 forward through the plan', () => {
    const runs = mergeRuns([activity('a', '2026-07-01T08:00:00', 20000, 300)]);
    const aggMap = weeklyAggregates(runs, DEFAULTS);

    const planned: PlanWeek[] = [
      {
        weekStart: '2026-07-13',
        type: 'BUILD',
        km: 40,
        longRunKm: 33, // a planned long run bigger than anything actually run
        dplusM: 400,
        dminusM: 380,
        limitedDays: null,
        limitedKmCap: null,
        userEdited: false,
      },
    ];
    const dense = buildDenseTimeline([...aggMap.values()], planned);

    // Evaluating a week shortly after the planned one: its 30-day window
    // should see the planned long run as if it had happened.
    const refs = references({ weekStart: '2026-07-20', denseTimeline: dense, actualRuns: runs }, DEFAULTS);
    expect(refs.LR30).toBeCloseTo(33);
  });
});

describe('references: buildMean', () => {
  it('averages the current Build block for the Down corridor', () => {
    const dense: TimelinePoint[] = [
      week('2026-06-22', 50, { weekType: 'BUILD' }),
      week('2026-06-29', 55, { weekType: 'BUILD' }),
      week('2026-07-06', 58, { weekType: 'BUILD' }),
    ];
    const refs = references({ weekStart: '2026-07-13', denseTimeline: dense, actualRuns: [] }, DEFAULTS);
    expect(refs.buildMean).toBeCloseTo((50 + 55 + 58) / 3);
  });
});
