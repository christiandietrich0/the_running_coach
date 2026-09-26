import { describe, expect, it } from 'vitest';
import { addWeeks } from '../../src/logic/dates';
import { raceSlotWeekType, raceStructureSlots, suggestPlan } from '../../src/logic/plan';
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
      raceId: null,
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
      raceId: null,
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
    // Race km + shakeouts (v1.1 review A-round 2 item 4), long run stays
    // the race distance itself.
    expect(raceWeek.km).toBeCloseTo(race.km + DEFAULTS.raceWeekShakeouts.count * DEFAULTS.raceWeekShakeouts.kmEach);
    expect(raceWeek.longRunKm).toBeCloseTo(race.km);

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
      raceId: null,
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

  // v1.1 review A3: races drive the plan directly -- race week, its taper
  // weeks, and (pulled forward from v2) the two recovery weeks right after
  // it, Recovery then Down (Recovery is its own week type per A-round 2
  // item 2, not the user-declared Limited).
  describe('race-driven structure (A3)', () => {
    it('inserts the race week, taper weeks, and a post-race Recovery then Down week', () => {
      const race: Race = {
        id: 1,
        name: 'Test 100k',
        date: addWeeks(CURRENT, 8),
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
        horizonWeeks: 12,
      });
      const byWeek = new Map(plan.map((w) => [w.weekStart, w]));

      const raceWeek = byWeek.get(race.date)!;
      expect(raceWeek.type).toBe('RACE');
      expect(raceWeek.km).toBeCloseTo(race.km + DEFAULTS.raceWeekShakeouts.count * DEFAULTS.raceWeekShakeouts.kmEach);
      expect(raceWeek.longRunKm).toBeCloseTo(race.km);
      expect(raceWeek.dplusM).toBeCloseTo(race.dplusM);
      expect(raceWeek.dminusM).toBeCloseTo(race.dminusM);
      expect(raceWeek.raceId).toBe(race.id);

      const taperWeek = byWeek.get(addWeeks(race.date, -1))!;
      expect(taperWeek.type).toBe('TAPER');

      const weekAfter1 = byWeek.get(addWeeks(race.date, 1))!;
      const weekAfter2 = byWeek.get(addWeeks(race.date, 2))!;
      expect(weekAfter1.type).toBe('RECOVERY');
      expect(weekAfter2.type).toBe('DOWN');
      expect(weekAfter1.limitedKmCap).toBeGreaterThan(0);
      expect(weekAfter1.km).toBeCloseTo(weekAfter1.limitedKmCap!);
      expect(weekAfter1.longRunKm ?? 0).toBeLessThanOrEqual(DEFAULTS.recoveryLongRunCapKm + 1e-6);
    });

    it('raceStructureSlots/raceSlotWeekType expose the same structure for conflict detection', () => {
      const race: Race = { id: 5, name: 'B race', date: addWeeks(CURRENT, 6), km: 50, dplusM: 1000, dminusM: 1000, targetTimeMin: null, priority: 'B' };
      const slots = raceStructureSlots([race], DEFAULTS);

      expect(raceSlotWeekType(slots.get(addWeeks(race.date, -1))!.kind)).toBe('TAPER');
      expect(raceSlotWeekType(slots.get(race.date)!.kind)).toBe('RACE');
      expect(raceSlotWeekType(slots.get(addWeeks(race.date, 1))!.kind)).toBe('RECOVERY');
      expect(raceSlotWeekType(slots.get(addWeeks(race.date, 2))!.kind)).toBe('DOWN');
    });

    it('a user-edited week the race now wants differently is left alone (a conflict), not silently overwritten', () => {
      const race: Race = { id: 6, name: 'Late-added B race', date: addWeeks(CURRENT, 3), km: 40, dplusM: 500, dminusM: 500, targetTimeMin: null, priority: 'B' };
      const lockedWeek: PlanWeek = {
        weekStart: addWeeks(race.date, -1), // the race's own taper now wants this week
        type: 'HOLD',
        km: 45,
        longRunKm: 20,
        dplusM: 200,
        dminusM: 200,
        limitedDays: null,
        limitedKmCap: null,
        userEdited: true,
        raceId: null,
      };
      const plan = suggestPlan({
        currentWeekStart: CURRENT,
        existingPlan: [lockedWeek],
        races: [race],
        actualAggregates: steadyHistory(8),
        actualRuns: [],
        settings: DEFAULTS,
        horizonWeeks: 8,
      });
      // suggestPlan never overwrites a user-edited week...
      expect(plan.find((w) => w.weekStart === lockedWeek.weekStart)).toEqual(lockedWeek);

      // ...but the mismatch is still detectable so the UI can show a
      // "Conflicts with race" chip instead of silence.
      const slots = raceStructureSlots([race], DEFAULTS);
      const wanted = raceSlotWeekType(slots.get(lockedWeek.weekStart)!.kind);
      expect(wanted).toBe('TAPER');
      expect(wanted).not.toBe(lockedWeek.type);
    });
  });

  // v1.1 review A4: fixed single percentages, not a min-max range -- the
  // Races card was showing "60 to 70%" for both week -1 and race week
  // because both taper entries shared the same min/max settings fields.
  it('taper weeks use fixed single percentages of the peak block mean, not a range (A4)', () => {
    const race: Race = {
      id: 2,
      name: 'Big A race',
      date: addWeeks(CURRENT, 10),
      km: 120,
      dplusM: 6000,
      dminusM: 6000,
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
      horizonWeeks: 14,
    });
    const byWeek = new Map(plan.map((w) => [w.weekStart, w]));

    const week2 = byWeek.get(addWeeks(race.date, -2))!; // 180km effort > 100km -> 3-week taper
    const week1 = byWeek.get(addWeeks(race.date, -1))!;
    expect(week2.type).toBe('TAPER');
    expect(week1.type).toBe('TAPER');

    // The peak block: the 4 weeks generated right before the taper starts.
    const peakBlockWeeks = plan.filter((w) => w.weekStart >= addWeeks(week2.weekStart, -4) && w.weekStart < week2.weekStart);
    expect(peakBlockWeeks).toHaveLength(4);
    const peakMean = peakBlockWeeks.reduce((s, w) => s + (w.km ?? 0), 0) / peakBlockWeeks.length;

    expect(week2.km).toBeCloseTo(DEFAULTS.taperA.week2Pct * peakMean, 5);
    expect(week1.km).toBeCloseTo(DEFAULTS.taperA.week1Pct * peakMean, 5);
    // Two distinct fixed percentages (70% / 55%), not the same range shown
    // for both weeks.
    expect(week2.km).toBeGreaterThan(week1.km);
  });

  // v1.1 review A1: min(1.10 x LR30, peak LR of next race, max_long_run_km,
  // 0.55 x planned week km), with the Race-week exception ("LR = the race
  // itself" -- explicitly not run through this cap).
  it('invariant: no generated week\'s long run exceeds its own planned km or max_long_run_km', () => {
    const race: Race = {
      id: 9,
      name: 'Invariant race',
      date: addWeeks(CURRENT, 9),
      km: 100,
      dplusM: 4000,
      dminusM: 4000,
      targetTimeMin: null,
      priority: 'A',
    };
    const plan = suggestPlan({
      currentWeekStart: CURRENT,
      existingPlan: [],
      races: [race],
      actualAggregates: steadyHistory(12, 60),
      actualRuns: [],
      settings: DEFAULTS,
      horizonWeeks: 16,
    });

    expect(plan.length).toBeGreaterThan(10);
    for (const w of plan) {
      if (w.longRunKm == null || w.type === 'RACE') continue; // Race: LR = the race itself, exempt by design
      expect(w.longRunKm).toBeLessThanOrEqual(DEFAULTS.maxLongRunKm + 1e-6);
      if (w.km != null) {
        expect(w.longRunKm).toBeLessThanOrEqual(w.km + 1e-6);
      }
    }
  });

  // v1.1 review A-round 2 item 5: "suggestPlan must only produce green
  // weeks" -- a hard +30% week-on-week cap on top of the corridor, so a
  // week never jumps further than the display-side hard-cap flag itself
  // would allow. Real report: a big dip right before the current week
  // otherwise let the corridor's C-based midpoint for the very next
  // (Build) week jump straight back up regardless of that one low week.
  it('never lets a generated week\'s km exceed 1.30x the previous week\'s km, on top of the corridor', () => {
    const history: WeeklyAggregate[] = [
      ...Array.from({ length: 6 }, (_, i) => week(addWeeks(CURRENT, -(7 - i)), 60)),
      week(addWeeks(CURRENT, -1), 20), // a big dip right before currentWeekStart
    ];
    const plan = suggestPlan({
      currentWeekStart: CURRENT,
      existingPlan: [],
      races: [],
      actualAggregates: history,
      actualRuns: [],
      settings: DEFAULTS,
      horizonWeeks: 6,
    });

    // Without the cap, the corridor's C-based midpoint here would be
    // ~55 km (C averages the dip in with three 60 km weeks) -- more than
    // 2.5x the 20 km week right before it.
    const first = plan.find((w) => w.weekStart === CURRENT)!;
    expect(first.km ?? 0).toBeLessThanOrEqual(20 * (1 + DEFAULTS.hardWeekOnWeekCapPct) + 1e-6);

    // The cap keeps applying week to week, not just on the first one.
    let prevKm = 20;
    for (const w of plan) {
      if (w.km != null) {
        expect(w.km).toBeLessThanOrEqual(prevKm * (1 + DEFAULTS.hardWeekOnWeekCapPct) + 1e-6);
        prevKm = w.km;
      }
    }
  });
});
