import { describe, expect, it } from 'vitest';
import { flags, verdict } from '../../src/logic/flags';
import { longRunDescentShare } from '../../src/logic/aggregate';
import { DEFAULTS } from '../../src/worker/defaults';
import { blendCurrentWeekReference, lastResetBoundary, peakLongRunDone, raceFeasibilityExtra, type WeekStateDTO } from '../../src/worker/state';
import type { PlanWeek, Race, References, Run, TimelinePoint } from '../../src/logic/types';

function denseEntry(overrides: Partial<TimelinePoint> = {}): TimelinePoint {
  return {
    weekStart: '2026-09-21',
    kmWeek: 8,
    dminusWeek: 120,
    longRunKm: 8,
    longRunLossM: 120,
    longRunDate: '2026-09-21',
    isRaceWeek: false,
    weekType: 'BUILD',
    ...overrides,
  };
}

function planWeek(overrides: Partial<PlanWeek> = {}): PlanWeek {
  return {
    weekStart: '2026-09-21',
    type: 'BUILD',
    km: 71,
    longRunKm: 39,
    dplusM: 900,
    dminusM: 620,
    limitedDays: null,
    limitedKmCap: null,
    userEdited: false,
    raceId: null,
    ...overrides,
  };
}

describe('blendCurrentWeekReference', () => {
  it('raises a slow-starting current week up to its planned target', () => {
    const dense = [denseEntry()];
    blendCurrentWeekReference(dense, '2026-09-21', planWeek());

    expect(dense[0]).toMatchObject({
      kmWeek: 71,
      dminusWeek: 620,
      longRunKm: 39,
      // The long run's own share of the planned weekly D- (620 x 39/71),
      // not the whole week's total (v1.1 review round 10 follow-up item 1).
      longRunLossM: 620 * (39 / 71),
      longRunDate: '2026-09-21',
    });
    // The week's own structure survives untouched.
    expect(dense[0].weekType).toBe('BUILD');
  });

  it('leaves the current week alone once actual already exceeds the plan', () => {
    const dense = [denseEntry({ kmWeek: 90, dminusWeek: 700, longRunKm: 45, longRunLossM: 800, longRunDate: '2026-09-20' })];
    blendCurrentWeekReference(dense, '2026-09-21', planWeek());

    expect(dense[0]).toMatchObject({
      kmWeek: 90,
      dminusWeek: 700,
      longRunKm: 45,
      longRunLossM: 800,
      longRunDate: '2026-09-20',
    });
  });

  it('blends km/dminus up while keeping the actual long run when it already beats the plan', () => {
    // A partially-done week: only 8km/120m logged so far, but the one run
    // already covers more distance than the week's planned long run --
    // the actual long run must win, not get overwritten by the plan's.
    const dense = [denseEntry({ longRunKm: 42, longRunLossM: 500, longRunDate: '2026-09-21' })];
    blendCurrentWeekReference(dense, '2026-09-21', planWeek());

    expect(dense[0].kmWeek).toBe(71); // plan wins, actual (8) was lower
    expect(dense[0].dminusWeek).toBe(620); // plan wins, actual (120) was lower
    expect(dense[0]).toMatchObject({ longRunKm: 42, longRunLossM: 500, longRunDate: '2026-09-21' }); // actual wins
  });

  it('is a no-op when there is no plan row for the current week', () => {
    const dense = [denseEntry()];
    blendCurrentWeekReference(dense, '2026-09-21', undefined);

    expect(dense[0]).toMatchObject({ kmWeek: 8, dminusWeek: 120, longRunKm: 8, longRunLossM: 120, longRunDate: '2026-09-21' });
  });

  it('is a no-op when the current week has no dense-timeline entry', () => {
    const dense = [denseEntry({ weekStart: '2026-09-14' })];
    expect(() => blendCurrentWeekReference(dense, '2026-09-21', planWeek())).not.toThrow();
    expect(dense[0].kmWeek).toBe(8);
  });

  it('leaves other weeks in the timeline untouched', () => {
    const dense = [denseEntry({ weekStart: '2026-09-14', kmWeek: 60 }), denseEntry({ weekStart: '2026-09-21' })];
    blendCurrentWeekReference(dense, '2026-09-21', planWeek());

    expect(dense[0].kmWeek).toBe(60);
    expect(dense[1].kmWeek).toBe(71);
  });
});

// v1.1 review round 10 follow-up item 1: the live bug report, reproduced
// directly -- a Peak week with 15km/15km-long-run/83m done so far this
// week, planned to reach 64-71km with a 35km long run and 703m of D-, and a
// real D30 of 363m. buildState() must read this week's own verdict off
// only what's actually been run (15km/15km/83m), not the plan's target, and
// even the plan's own single-run figure must be the long run's share of
// the week (not its whole 703m total) once something does compare against
// it (e.g. a future week's own reference).
describe("the current week's own flags use only what's actually been run, never the blended-up-to-planned figures", () => {
  const D30 = 363;
  const refs: References = { C: 60, LR30: 40, D30, DW4: 875, M12: 60, mean4Week: 60, mean10Week: 60, buildMean: 60, weeksUsedForC: 4 };

  it('the blended (planned) figures alone would read red -- this is the bug, not the fix', () => {
    const plannedKmWeek = 67.5; // midpoint of the reported 64-71km
    const plannedLongRunKm = 35;
    const plannedDminusWeek = 703;
    const flagList = flags(
      {
        weekType: 'BUILD',
        kmWeek: plannedKmWeek,
        longestKm: plannedLongRunKm,
        longestLossM: plannedDminusWeek, // the bug: the whole week's D- read as if it were the long run's own
        dminusWeek: plannedDminusWeek,
        refs,
        checkin: null,
        priorCheckinsAsc: [],
        prevWeekKm: 55,
        prevWeekType: 'BUILD',
        weekInProgress: true,
      },
      DEFAULTS,
    );
    expect(verdict(flagList).colour).toBe('RED');
  });

  it("this week's own verdict, computed the way buildState() now does it, reads green", () => {
    const doneKmWeek = 15;
    const doneLongestKm = 15;
    const doneLongestLossM = 83;
    const doneDminusWeek = 83;
    const flagList = flags(
      {
        weekType: 'BUILD',
        kmWeek: doneKmWeek,
        longestKm: doneLongestKm,
        longestLossM: doneLongestLossM,
        dminusWeek: doneDminusWeek,
        refs,
        checkin: null,
        priorCheckinsAsc: [],
        prevWeekKm: 55,
        prevWeekType: 'BUILD',
        weekInProgress: true,
      },
      DEFAULTS,
    );
    expect(verdict(flagList).colour).toBe('GREEN');
  });

  it("the plan's own single-run figure (once something does compare against it) is the long run's share, not the week's whole D-, and clears the real single-run cap", () => {
    const share = longRunDescentShare(703, 35, 67.5);
    const singleRunCap = DEFAULTS.singleRunDminusCapFactor * D30;
    expect(share).toBeLessThan(singleRunCap);

    const flagList = flags(
      {
        weekType: 'BUILD',
        kmWeek: 67.5,
        longestKm: 35,
        longestLossM: share,
        dminusWeek: 703, // the weekly total still compares against DW4, correctly, as a weekly total
        refs,
        checkin: null,
        priorCheckinsAsc: [],
        prevWeekKm: 55,
        prevWeekType: 'BUILD',
        weekInProgress: false,
      },
      DEFAULTS,
    );
    expect(verdict(flagList).colour).not.toBe('RED');
  });
});

function race(overrides: Partial<Race> = {}): Race {
  return { id: 1, name: 'Puglia UTMB', date: '2026-10-24', km: 100, dplusM: 5000, dminusM: 4800, targetTimeMin: null, priority: 'A', ...overrides };
}

function weekDto(overrides: Partial<WeekStateDTO> = {}): WeekStateDTO {
  return {
    weekStart: '2026-09-28',
    isActual: false,
    kmWeek: 67.5,
    effortKmWeek: 67.5,
    mechKmWeek: 67.5,
    dminusWeek: 703,
    runsWeek: 3,
    longestKm: 35,
    longestLossM: 364.7,
    doneKmWeek: 15,
    doneDminusWeek: 83,
    doneLongestKm: 15,
    doneLongestLossM: 83,
    doneDplusM: 0,
    doneEffortKmWeek: 15,
    plannedKm: 67.5,
    plannedLongRunKm: 35,
    plannedDplusM: 1040,
    plannedDminusM: 703,
    type: 'BUILD',
    symptomLocked: false,
    userEdited: false,
    limitedDays: null,
    limitedKmCap: null,
    refs: { C: 60, LR30: 35, D30: 363, DW4: 875, M12: 60, mean4Week: 60, mean10Week: 60, buildMean: 60, weeksUsedForC: 4 },
    corridor: { kmMin: 60, kmMax: 70, lrMax: 35, dminusWeekMax: 1137, dminusRunMax: 436 },
    flags: [],
    verdict: { colour: 'RED', reason: 'test', flags: [] },
    raceConflictType: null,
    raceId: null,
    raceName: null,
    peakForRaceId: null,
    taperForRaceId: null,
    recoveryForRaceId: null,
    guidance: null,
    ...overrides,
  };
}

// v1.1 review round 10 follow-up item 4, refined: the live Puglia UTMB
// report -- the card stayed "Not safely reachable" on the week it actually
// became the race's own Peak week (Sep 28, 23 days out), because the old
// rule only locked in inside settings.feasibilityLockedInWeeks of the race
// itself. raceFeasibilityExtra() is the exact function buildState() calls
// per race to decide this; tested directly here (not through the full D1-
// backed buildState()) against a hand-built `weeks` array shaped like the
// real Plan screen: Peak Sep 28 (today), Taper Oct 5/12, Race Oct 19.
describe('raceFeasibilityExtra', () => {
  const r = race();

  it('locks in on the current week being this race\'s own Peak week, and surfaces the Peak week\'s own real cap', () => {
    const weeks = [
      // The last genuine Build week, one week before Peak.
      weekDto({ weekStart: '2026-09-21', refs: { ...weekDto().refs, LR30: 35, C: 60 } }),
      // Today: the Peak week itself, tagged for this race. Its corridor.lrMax
      // (36) is the real, already-generated cap -- the same number This
      // Week's own "Long run: up to Xkm" reads once this week becomes
      // current, and deliberately different from what an independent growth
      // projection off Sep 21's LR30 would compute, to prove the value comes
      // from here and not from a second, divergent calculation (v1.1 final
      // pre-1.0 pass item 2: the two figures must be the same value).
      weekDto({ weekStart: '2026-09-28', peakForRaceId: r.id, corridor: { ...weekDto().corridor, lrMax: 36 } }),
      weekDto({ weekStart: '2026-10-05', taperForRaceId: r.id, type: 'TAPER' }),
      weekDto({ weekStart: '2026-10-12', taperForRaceId: r.id, type: 'TAPER' }),
      weekDto({ weekStart: '2026-10-19', type: 'RACE', raceId: r.id }),
    ];

    const extra = raceFeasibilityExtra(weeks, '2026-09-28', r, DEFAULTS);
    expect(extra.lockedInByWeekType).toBe(true);
    expect(extra.lastBuild).toBeDefined();
    expect(extra.lastBuild!.maxReachableLongRunKm).toBe(36);
    expect(extra.lastBuild!.status).not.toBe('LOCKED_IN');
  });

  it('does not lock in on an ordinary Build week, even one close to the race', () => {
    const weeks = [
      weekDto({ weekStart: '2026-09-21', type: 'BUILD' }), // no peak/taper/race tag at all yet
      weekDto({ weekStart: '2026-09-28', peakForRaceId: r.id }),
    ];
    const extra = raceFeasibilityExtra(weeks, '2026-09-21', r, DEFAULTS);
    expect(extra.lockedInByWeekType).toBe(false);
  });

  it('locks in on the Taper and Race weeks too, not just Peak', () => {
    const weeks = [
      weekDto({ weekStart: '2026-09-28', peakForRaceId: r.id }),
      weekDto({ weekStart: '2026-10-05', taperForRaceId: r.id, type: 'TAPER' }),
      weekDto({ weekStart: '2026-10-19', type: 'RACE', raceId: r.id }),
    ];
    expect(raceFeasibilityExtra(weeks, '2026-10-05', r, DEFAULTS).lockedInByWeekType).toBe(true);
    expect(raceFeasibilityExtra(weeks, '2026-10-19', r, DEFAULTS).lockedInByWeekType).toBe(true);
  });

  it('leaves lastBuild undefined when there is no Peak week for this race yet (or at all)', () => {
    const weeks = [weekDto({ weekStart: '2026-09-28', type: 'BUILD' })];
    const extra = raceFeasibilityExtra(weeks, '2026-09-28', r, DEFAULTS);
    expect(extra.lastBuild).toBeUndefined();
  });

  it('leaves lastBuild undefined when the Peak week exists but the week before it is not in the timeline', () => {
    const weeks = [weekDto({ weekStart: '2026-09-28', peakForRaceId: r.id })]; // 2026-09-21 missing
    const extra = raceFeasibilityExtra(weeks, '2026-09-28', r, DEFAULTS);
    expect(extra.lastBuild).toBeUndefined();
  });
});

function run(overrides: Partial<Run> & Pick<Run, 'id' | 'startLocal' | 'distanceM'>): Run {
  return { activityIds: [overrides.id], endLocal: overrides.startLocal, movingS: 3600, gainM: 0, lossM: 0, isRace: false, ...overrides };
}

// v1.1 final pre-1.0 pass item 1: simplified the window down to a single
// rule -- since the last race (intervals.icu-flagged, or a date in the
// races table), excluding that race itself, capped to a 16-week max
// lookback. The earlier version additionally floored at "the first week
// any plan exists for," meant as a safety fallback -- but on the live
// account plan_weeks coverage didn't reach back as far as the real Aug 29
// run, so that floor landed after it and wrongly excluded it. Dropped
// entirely, along with the Recovery/Limited-week conditions, per the
// user's own instruction.
describe('peakLongRunDone', () => {
  it('picks the longest non-race run since the last race', () => {
    const runs = [
      run({ id: 'a', startLocal: '2026-08-04T08:00:00', distanceM: 20000 }),
      run({ id: 'b', startLocal: '2026-08-29T08:00:00', distanceM: 48000 }), // the real Aug 29 run
      run({ id: 'c', startLocal: '2026-09-12T08:00:00', distanceM: 36000 }),
    ];
    const result = peakLongRunDone(runs, [], '2026-09-28');
    expect(result).toEqual({ km: 48, date: '2026-08-29' });
  });

  it('updates to a new, longer run as training continues', () => {
    const runs = [
      run({ id: 'a', startLocal: '2026-08-29T08:00:00', distanceM: 48000 }),
      run({ id: 'b', startLocal: '2026-09-20T08:00:00', distanceM: 50000 }), // a new best
    ];
    expect(peakLongRunDone(runs, [], '2026-09-28')).toEqual({ km: 50, date: '2026-09-20' });
  });

  it('never picks a race, however long, over a shorter training run', () => {
    const runs = [
      run({ id: 'a', startLocal: '2026-08-10T08:00:00', distanceM: 80000, isRace: true }),
      run({ id: 'b', startLocal: '2026-08-29T08:00:00', distanceM: 48000 }),
    ];
    expect(peakLongRunDone(runs, [], '2026-09-28')).toEqual({ km: 48, date: '2026-08-29' });
  });

  it('is null before any non-race run exists since the last race', () => {
    const runs = [run({ id: 'a', startLocal: '2026-08-10T08:00:00', distanceM: 42000, isRace: true })];
    expect(peakLongRunDone(runs, [], '2026-09-28')).toBeNull();
  });

  // The exact live bug: Bukovina (84km, Jul 24) was never flagged as a
  // race by intervals.icu (run.isRace stays false), but is recorded as a
  // past race in the races table -- it must still be excluded, both from
  // the candidate pool directly and as a reset boundary of its own.
  it("excludes a long run on the date of a past race in the races table, even when intervals.icu never flagged it", () => {
    const runs = [
      run({ id: 'bukovina', startLocal: '2026-07-24T08:00:00', distanceM: 84000, isRace: false }),
      run({ id: 'a', startLocal: '2026-08-29T08:00:00', distanceM: 48000 }),
      run({ id: 'b', startLocal: '2026-09-12T08:00:00', distanceM: 36000 }),
    ];
    const races = [race({ id: 9, name: 'Bukovina', date: '2026-07-24' })];
    expect(peakLongRunDone(runs, races, '2026-09-28')).toEqual({ km: 48, date: '2026-08-29' });
  });

  // The exact test the live report called for: Bukovina flagged directly by
  // intervals.icu (isRace: true, no races-table entry needed) must still
  // reset the window, with the real Aug 29 run surviving inside it.
  it('excludes a run intervals.icu itself flags as a race, and keeps the window open for a later run', () => {
    const runs = [
      run({ id: 'bukovina', startLocal: '2026-07-24T08:00:00', distanceM: 84000, isRace: true }),
      run({ id: 'a', startLocal: '2026-08-29T08:00:00', distanceM: 48000 }),
    ];
    expect(peakLongRunDone(runs, [], '2026-09-28')).toEqual({ km: 48, date: '2026-08-29' });
  });
});

describe('lastResetBoundary', () => {
  it('floors at 16 weeks back with no race in history', () => {
    const runs: Run[] = [];
    expect(lastResetBoundary(runs, [], '2026-09-28')).toBe('2026-06-08'); // 16 * 7 days before 2026-09-28
  });

  it("is the last race's own date, when within the 16-week lookback", () => {
    const races = [race({ date: '2026-08-24' })];
    expect(lastResetBoundary([], races, '2026-09-28')).toBe('2026-08-24');
  });

  it('takes an intervals.icu-flagged race run just as a races-table entry', () => {
    const runs = [run({ id: 'bukovina', startLocal: '2026-08-24T08:00:00', distanceM: 84000, isRace: true })];
    expect(lastResetBoundary(runs, [], '2026-09-28')).toBe('2026-08-24');
  });

  it('takes the later of two race sources', () => {
    const runs = [run({ id: 'a', startLocal: '2026-07-20T08:00:00', distanceM: 42000, isRace: true })];
    const races = [race({ date: '2026-08-24' })];
    expect(lastResetBoundary(runs, races, '2026-09-28')).toBe('2026-08-24');
  });

  it('ignores a race on or after the current week itself', () => {
    const races = [race({ date: '2026-09-28' })];
    expect(lastResetBoundary([], races, '2026-09-28')).toBe('2026-06-08'); // falls back to the 16-week floor
  });

  it('falls back to the 16-week floor when the last race is further back than that', () => {
    const races = [race({ date: '2026-01-01' })];
    expect(lastResetBoundary([], races, '2026-09-28')).toBe('2026-06-08');
  });
});
