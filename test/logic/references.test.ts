import { describe, expect, it } from 'vitest';
import { buildDenseTimeline, mergeRuns, weeklyAggregates } from '../../src/logic/aggregate';
import { corridor } from '../../src/logic/corridor';
import { addWeeks } from '../../src/logic/dates';
import { flags } from '../../src/logic/flags';
import { isReentryWeek, references } from '../../src/logic/references';
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

  it('skips Recovery weeks and the week right after one, like race weeks (v1.1 review round 3 item 4)', () => {
    const dense = [
      week('2026-06-01', 40),
      week('2026-06-08', 12, { weekType: 'RECOVERY' }),
      week('2026-06-15', 20), // the week after the Recovery week
      week('2026-06-22', 55),
      week('2026-06-29', 58),
      week('2026-07-06', 60),
    ];
    const refs = references({ weekStart: '2026-07-13', denseTimeline: dense, actualRuns: [] }, DEFAULTS);
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

function activity(id: string, startLocal: string, distanceM: number, lossM: number, isRace = false): RawActivity {
  return { id, startLocal, distanceM, movingS: 3600, gainM: 0, lossM, isRace };
}

describe('references: LR30 / D30', () => {
  it('is the longest non-race run in the 30 days before weekStart', () => {
    // 'b' (the second, smaller run) coming after the bigger 'a' means it
    // never has to clear the red-escalation check (v1.1 review round 9
    // item 8 -- that check only ever gates a run trying to raise the
    // reference above what came before it).
    const runs = mergeRuns([
      activity('a', '2026-07-01T08:00:00', 30000, 500),
      activity('b', '2026-07-10T08:00:00', 20000, 300),
      activity('c', '2026-06-01T08:00:00', 50000, 900), // outside the 30-day window
    ]);
    const aggMap = weeklyAggregates(runs, DEFAULTS);
    const dense = buildDenseTimeline([...aggMap.values()], []);
    const refs = references({ weekStart: '2026-07-20', denseTimeline: dense, actualRuns: runs }, DEFAULTS);
    expect(refs.LR30).toBeCloseTo(30);
    expect(refs.D30).toBeCloseTo(500);
  });

  it('is evaluated as of the week\'s Sunday, not its Monday (v1.1 review A2)', () => {
    // Real example from the review: for the week of Sep 28 2026, the
    // 48.1km run from Aug 29 must have already aged out (Sunday Oct 4
    // minus 30 days = Sep 4, so Aug 29 is outside), leaving the Sep 12
    // run (36km) as LR30. Evaluating from Monday Sep 28 instead (the
    // pre-fix bug) would keep Aug 29 in-window (Sep 28 - 30 = Aug 29,
    // the boundary itself) and wrongly return 48.1.
    const runs = mergeRuns([
      activity('aug29', '2026-08-29T08:00:00', 48100, 1200),
      activity('sep12', '2026-09-12T08:00:00', 36000, 700),
    ]);
    const aggMap = weeklyAggregates(runs, DEFAULTS);
    const dense = buildDenseTimeline([...aggMap.values()], []);
    const refs = references({ weekStart: '2026-09-28', denseTimeline: dense, actualRuns: runs }, DEFAULTS);
    expect(refs.LR30).toBeCloseTo(36);
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
        raceId: null,
      },
    ];
    const dense = buildDenseTimeline([...aggMap.values()], planned);

    // Evaluating a week shortly after the planned one: its 30-day window
    // should see the planned long run as if it had happened.
    const refs = references({ weekStart: '2026-07-20', denseTimeline: dense, actualRuns: runs }, DEFAULTS);
    expect(refs.LR30).toBeCloseTo(33);
  });
});

// v1.1 review round 9 item 8: a run that so badly overshoots the current
// reference gets *excluded* -- v1.1 review round 9 item 8 tried that and it
// produced a runaway collapse: once anything got excluded, the reference
// stayed at whatever low level it already had, which made the next
// legitimate run look like an even bigger overshoot, which also got
// excluded, forever (confirmed against the real backtest: LR30 got stuck
// around 10km while actual long runs kept posting 15-90km, red nearly
// every week). Instead, a run's contribution is clipped to capFactor x
// the reference as it stood right before it -- never dropped, never a
// hard freeze -- so the reference always closes the gap to reality by at
// least one legitimate step per run, however extreme the outlier (v1.1
// review round 9 follow-up: "clip, don't drop").
describe('references: red runs/weeks are clipped, not dropped, in LR30/D30/DW4', () => {
  it("a reckless descent run (1,299m vs a 303m max) counts as ~363m for D30, not 303 (frozen) or 1,299 (unclipped)", () => {
    const runs = mergeRuns([
      activity('baseline', '2026-07-01T08:00:00', 15000, 303),
      activity('reckless', '2026-07-08T08:00:00', 15000, 1299), // 1299/303 = 4.3x, well past the 1.5x red factor
    ]);
    const aggMap = weeklyAggregates(runs, DEFAULTS);
    const dense = buildDenseTimeline([...aggMap.values()], []);

    // The reckless run's own week already falls inside its own 30-day
    // window (asOf is that week's Sunday, so a run earlier that same week
    // is already "in"), so D30 here is already 303 clipped up to 363.6 by
    // the reckless run's own (clipped) contribution -- not the raw 1,299m.
    // flags()'s DESCENT_SINGLE check still reads this run as red: its raw
    // longestLossM (1,299) is compared against that same clipped D30, and
    // 1299/363.6 is still well past the red factor.
    const refsAsOfRecklessWeek = references({ weekStart: '2026-07-08', denseTimeline: dense, actualRuns: runs }, DEFAULTS);
    expect(refsAsOfRecklessWeek.D30).toBeCloseTo(363.6, 0);
    const selfFlags = flags(
      {
        weekType: 'BUILD',
        kmWeek: 15,
        longestKm: 15,
        longestLossM: 1299,
        dminusWeek: 1299,
        refs: refsAsOfRecklessWeek,
        checkin: null,
        priorCheckinsAsc: [],
        prevWeekKm: null,
        prevWeekType: null,
      },
      DEFAULTS,
    );
    expect(selfFlags.some((f) => f.kind === 'DESCENT_SINGLE' && f.colour === 'RED')).toBe(true);

    // The following week sees D30 clipped to 1.2x303 = ~363.6m, not frozen
    // at 303 and not raised all the way to the reckless run's raw 1,299m.
    const refs = references({ weekStart: '2026-07-13', denseTimeline: dense, actualRuns: runs }, DEFAULTS);
    expect(refs.D30).toBeCloseTo(363.6, 0);

    const c = corridor('BUILD', refs, DEFAULTS);
    expect(c.dminusRunMax).toBeCloseTo(DEFAULTS.singleRunDminusCapFactor * refs.D30, 0);
  });

  it('a run within the cap factor raises D30 to its own value, unclipped', () => {
    const runs = mergeRuns([
      activity('baseline', '2026-07-01T08:00:00', 15000, 303),
      activity('bigger-but-within-cap', '2026-07-08T08:00:00', 15000, 350), // 350/303 = 1.155x, under the 1.2x cap factor
    ]);
    const aggMap = weeklyAggregates(runs, DEFAULTS);
    const dense = buildDenseTimeline([...aggMap.values()], []);
    const refs = references({ weekStart: '2026-07-13', denseTimeline: dense, actualRuns: runs }, DEFAULTS);
    expect(refs.D30).toBeCloseTo(350);
  });

  it('a run over the cap factor is clipped to exactly the cap, whatever the raw overshoot', () => {
    const runs = mergeRuns([
      activity('baseline', '2026-07-01T08:00:00', 15000, 303),
      activity('over-cap', '2026-07-08T08:00:00', 15000, 400), // 400/303 = 1.32x, over the 1.2x cap factor
    ]);
    const aggMap = weeklyAggregates(runs, DEFAULTS);
    const dense = buildDenseTimeline([...aggMap.values()], []);
    const refs = references({ weekStart: '2026-07-13', denseTimeline: dense, actualRuns: runs }, DEFAULTS);
    expect(refs.D30).toBeCloseTo(DEFAULTS.singleRunDminusCapFactor * 303, 0);
  });

  it('a red weekly descent total (DW4) is clipped the same way, not frozen', () => {
    const runs = mergeRuns([activity('w1', '2026-06-01T08:00:00', 15000, 0), activity('w2', '2026-06-08T08:00:00', 15000, 0)]);
    const dense: TimelinePoint[] = [
      week('2026-06-01', 50, { dminusWeek: 300, weekType: null }),
      week('2026-06-08', 50, { dminusWeek: 900, weekType: null }), // 900/300 = 3x, well past the 1.6x red factor
    ];
    const refs = references({ weekStart: '2026-06-15', denseTimeline: dense, actualRuns: runs }, DEFAULTS);
    expect(refs.DW4).toBeCloseTo(DEFAULTS.weeklyDminusCapFactor * 300); // 1.3 x 300 = 390, not frozen at 300
  });

  it('a run flagged red for descent still counts fully (up to the LR cap) toward LR30, and vice versa -- the two references are independent', () => {
    const runs = mergeRuns([
      activity('baseline', '2026-07-01T08:00:00', 10000, 100),
      // A legitimate distance progression (10km -> 10.9km, within the 1.1x LR cap) that also happens
      // to be recklessly steep (100m -> 1000m loss, 10x over the 1.2x D cap): the descent side should
      // clip hard, but the distance side must not be dragged down by it.
      activity('steep-but-reasonable-distance', '2026-07-08T08:00:00', 10900, 1000),
    ]);
    const aggMap = weeklyAggregates(runs, DEFAULTS);
    const dense = buildDenseTimeline([...aggMap.values()], []);
    const refs = references({ weekStart: '2026-07-13', denseTimeline: dense, actualRuns: runs }, DEFAULTS);
    expect(refs.LR30).toBeCloseTo(10.9); // fully counted, well under the 1.1x11=11km cap
    expect(refs.D30).toBeCloseTo(DEFAULTS.singleRunDminusCapFactor * 100, 0); // clipped to 1.2x100=120, not 1000
  });

  it("doesn't cascade: a reckless spike doesn't permanently suppress the reference, and never retroactively changes an earlier week's verdict", () => {
    // Three widening long runs after a small baseline: each one is a huge
    // jump, so each is individually clipped -- but the reference must keep
    // climbing (never get stuck at the same value run after run), and an
    // earlier week's own verdict must be unaffected by later runs it never saw.
    const runs = mergeRuns([
      activity('baseline', '2026-06-01T08:00:00', 10000, 0),
      activity('spike1', '2026-06-08T08:00:00', 50000, 0),
      activity('spike2', '2026-06-15T08:00:00', 50000, 0),
      activity('spike3', '2026-06-22T08:00:00', 50000, 0),
    ]);
    const aggMap = weeklyAggregates(runs, DEFAULTS);
    const dense = buildDenseTimeline([...aggMap.values()], []);

    const lr30AfterSpike1 = references({ weekStart: '2026-06-08', denseTimeline: dense, actualRuns: runs }, DEFAULTS).LR30;
    const lr30AfterSpike2 = references({ weekStart: '2026-06-15', denseTimeline: dense, actualRuns: runs }, DEFAULTS).LR30;
    const lr30AfterSpike3 = references({ weekStart: '2026-06-22', denseTimeline: dense, actualRuns: runs }, DEFAULTS).LR30;
    // Each spike's own week already falls inside its own 30-day window
    // (asOf is that week's Sunday), so its own clipped contribution is
    // already folded in by the time we read that week's LR30: baseline 10
    // clips spike1 to 11 (1.1x10), which clips spike2 to 12.1 (1.1x11),
    // which clips spike3 to 13.31 (1.1x12.1) -- strictly increasing, never
    // stuck at the same value run after run.
    expect(lr30AfterSpike1).toBeCloseTo(11);
    expect(lr30AfterSpike2).toBeGreaterThan(lr30AfterSpike1);
    expect(lr30AfterSpike3).toBeGreaterThan(lr30AfterSpike2);

    // The baseline week's own flags/verdict, computed before spike2/spike3
    // existed at all, must read identically once they're added to the
    // dataset -- references() only ever looks backward from a given week.
    const refsForBaselineEarly = references({ weekStart: '2026-06-01', denseTimeline: dense, actualRuns: [runs[0]] }, DEFAULTS);
    const refsForBaselineLate = references({ weekStart: '2026-06-01', denseTimeline: dense, actualRuns: runs }, DEFAULTS);
    expect(refsForBaselineLate).toEqual(refsForBaselineEarly);
  });

  it('never returns a reference below the largest clipped contribution in the window', () => {
    const runs = mergeRuns([
      activity('a', '2026-07-01T08:00:00', 20000, 0),
      activity('b', '2026-07-05T08:00:00', 15000, 0), // smaller than 'a', must not pull LR30 down
      activity('c', '2026-07-10T08:00:00', 18000, 0),
    ]);
    const aggMap = weeklyAggregates(runs, DEFAULTS);
    const dense = buildDenseTimeline([...aggMap.values()], []);
    const refs = references({ weekStart: '2026-07-13', denseTimeline: dense, actualRuns: runs }, DEFAULTS);
    // 'a' (20km) is the first point (unclipped bootstrap); 'b' and 'c' are
    // both smaller and never exceed 'a's own clip ceiling, so the max
    // clipped contribution across the window is 'a' itself, 20km.
    expect(refs.LR30).toBeCloseTo(20);
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

// v1.1 review round 3 item 4: the 3 weeks *after* a Recovery week, so a
// deliberately low chronic average during the ramp back up doesn't trip
// the low-volume/detraining blue flags. Mirrors the real report: Race,
// Recovery, Down, Build, Build ("Nov 9" is the 2nd Build week after
// Recovery -- still inside the window).
describe('references: isReentryWeek', () => {
  const dense: TimelinePoint[] = [
    week('2026-09-14', 60, { weekType: 'BUILD' }),
    week('2026-09-21', 60, { weekType: 'RACE' }),
    week('2026-09-28', 12, { weekType: 'RECOVERY' }), // "Oct 26"
    week('2026-10-05', 40, { weekType: 'DOWN' }), // +1 week: "Nov 2"
    week('2026-10-12', 45, { weekType: 'BUILD' }), // +2 weeks: "Nov 9"
    week('2026-10-19', 48, { weekType: 'BUILD' }), // +3 weeks: "Nov 16"
    week('2026-10-26', 50, { weekType: 'BUILD' }), // +4 weeks: outside the window
  ];

  it('is false for the Recovery week itself: the window is the weeks after it, not it', () => {
    expect(isReentryWeek(dense, '2026-09-28')).toBe(false);
  });

  it('is true for each of the 3 weeks after a Recovery week', () => {
    expect(isReentryWeek(dense, '2026-10-05')).toBe(true);
    expect(isReentryWeek(dense, '2026-10-12')).toBe(true); // "Nov 9"
    expect(isReentryWeek(dense, '2026-10-19')).toBe(true);
  });

  it('is false once more than 3 weeks have passed since the Recovery week', () => {
    expect(isReentryWeek(dense, '2026-10-26')).toBe(false);
  });

  it('is false before any Recovery week has happened', () => {
    expect(isReentryWeek(dense, '2026-09-21')).toBe(false);
  });
});
