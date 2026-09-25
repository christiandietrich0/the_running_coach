import { describe, expect, it } from 'vitest';
import { addWeeks } from '../../src/logic/dates';
import { suggestPlan } from '../../src/logic/plan';
import { DEFAULTS } from '../../src/worker/defaults';
import type { PlanWeek, Race, WeeklyAggregate } from '../../src/logic/types';

function week(weekStart: string, kmWeek: number): WeeklyAggregate {
  return {
    weekStart,
    kmWeek,
    effortKmWeek: kmWeek,
    mechKmWeek: kmWeek,
    dminusWeek: kmWeek * 10,
    runsWeek: 3,
    longestKm: kmWeek * 0.4,
    longestLossM: kmWeek * 4,
    longestDate: weekStart,
    hasRace: false,
  };
}

const CURRENT = '2026-08-03'; // a Monday

function steadyHistory(weeks: number, km = 50): WeeklyAggregate[] {
  return Array.from({ length: weeks }, (_, i) => week(addWeeks(CURRENT, -(weeks - i)), km));
}

describe('suggestPlan', () => {
  it('fills Build, Build, Build, Down and repeats at the configured cadence', () => {
    const plan = suggestPlan({
      currentWeekStart: CURRENT,
      existingPlan: [],
      races: [],
      actualAggregates: steadyHistory(8),
      actualRuns: [],
      settings: DEFAULTS,
      horizonWeeks: 8,
    });
    const types = plan.slice(0, 8).map((w) => w.type);
    expect(types).toEqual(['BUILD', 'BUILD', 'BUILD', 'DOWN', 'BUILD', 'BUILD', 'BUILD', 'DOWN']);
  });

  it('never touches a user-edited week, and leaves it byte-for-byte as given', () => {
    const lockedWeek: PlanWeek = {
      weekStart: addWeeks(CURRENT, 1),
      type: 'HOLD',
      km: 999,
      longRunKm: 40,
      dplusM: 100,
      dminusM: 100,
      limitedDays: null,
      limitedKmCap: null,
      userEdited: true,
    };
    const plan = suggestPlan({
      currentWeekStart: CURRENT,
      existingPlan: [lockedWeek],
      races: [],
      actualAggregates: steadyHistory(8),
      actualRuns: [],
      settings: DEFAULTS,
      horizonWeeks: 6,
    });
    expect(plan.find((w) => w.weekStart === lockedWeek.weekStart)).toEqual(lockedWeek);
  });

  it('resets the Down counter after a Limited week', () => {
    const limited: PlanWeek = {
      weekStart: addWeeks(CURRENT, 1), // the 2nd week: would otherwise be mid-Build
      type: 'LIMITED',
      km: 20,
      longRunKm: 15,
      dplusM: 100,
      dminusM: 100,
      limitedDays: 3,
      limitedKmCap: 20,
      userEdited: true,
    };
    const plan = suggestPlan({
      currentWeekStart: CURRENT,
      existingPlan: [limited],
      races: [],
      actualAggregates: steadyHistory(8),
      actualRuns: [],
      settings: DEFAULTS,
      horizonWeeks: 6,
    });
    const types = plan.slice(0, 6).map((w) => w.type);
    expect(types).toEqual(['BUILD', 'LIMITED', 'BUILD', 'BUILD', 'BUILD', 'DOWN']);
  });

  it('anchors backward from the next A race: taper weeks before a race week at its own distance', () => {
    const race: Race = {
      id: 1,
      name: 'Test 100k',
      date: addWeeks(CURRENT, 8), // a Monday, 8 weeks out
      km: 60,
      dplusM: 3000,
      dminusM: 3000,
      targetTimeMin: null,
      priority: 'A',
    };
    const plan = suggestPlan({
      currentWeekStart: CURRENT,
      existingPlan: [],
      races: [race],
      actualAggregates: steadyHistory(8),
      actualRuns: [],
      settings: DEFAULTS,
      horizonWeeks: 10,
    });

    const raceWeek = plan.find((w) => w.weekStart === race.date)!;
    expect(raceWeek.type).toBe('RACE');
    expect(raceWeek.km).toBeCloseTo(race.km);

    const taperWeeks = plan.filter((w) => w.type === 'TAPER');
    expect(taperWeeks.length).toBeGreaterThan(0);
    for (const t of taperWeeks) {
      expect(t.weekStart < raceWeek.weekStart).toBe(true);
    }
  });

  it('never fills in a week the user tagged Limited', () => {
    const limited: PlanWeek = {
      weekStart: addWeeks(CURRENT, 2),
      type: 'LIMITED',
      km: 15,
      longRunKm: 10,
      dplusM: 50,
      dminusM: 50,
      limitedDays: 2,
      limitedKmCap: 15,
      userEdited: false, // Limited is locked on its own, even without userEdited
    };
    const plan = suggestPlan({
      currentWeekStart: CURRENT,
      existingPlan: [limited],
      races: [],
      actualAggregates: steadyHistory(8),
      actualRuns: [],
      settings: DEFAULTS,
      horizonWeeks: 6,
    });
    expect(plan.find((w) => w.weekStart === limited.weekStart)).toEqual(limited);
  });
});
