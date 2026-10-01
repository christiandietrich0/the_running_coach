import { describe, expect, it } from 'vitest';
import { flags, verdict } from '../../src/logic/flags';
import { longRunDescentShare } from '../../src/logic/aggregate';
import { DEFAULTS } from '../../src/worker/defaults';
import { blendCurrentWeekReference } from '../../src/worker/state';
import type { PlanWeek, References, TimelinePoint } from '../../src/logic/types';

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
