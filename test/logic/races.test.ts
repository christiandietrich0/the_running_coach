import { describe, expect, it } from 'vitest';
import { feasibility, raceTargets } from '../../src/logic/races';
import { DEFAULTS } from '../../src/worker/defaults';
import type { Race } from '../../src/logic/types';

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

  it('builds a 3-week A taper for races over 100km, ending in the race week', () => {
    const t = raceTargets(race({ km: 100, dplusM: 5000 }), DEFAULTS); // effort 150km > 100
    expect(t.taper).toHaveLength(4); // week -3, -2, -1, race week
    expect(t.taper[t.taper.length - 1].label).toBe('race week');
    expect(t.taper[t.taper.length - 1].volumeMinPct).toBeCloseTo(DEFAULTS.taperA.raceWeekMinPct);
    const weekMinus1 = t.taper.find((w) => w.label === 'week -1')!;
    expect(weekMinus1.volumeMinPct).toBeCloseTo(DEFAULTS.taperA.week1MinPct);
  });

  it('builds a 2-week A taper for races at or under 100km', () => {
    const t = raceTargets(race({ km: 50, dplusM: 0 }), DEFAULTS); // effort 50km <= 100
    expect(t.taper).toHaveLength(3); // week -2, -1, race week
  });

  it('builds a 1-week B taper', () => {
    const t = raceTargets(race({ priority: 'B' }), DEFAULTS);
    expect(t.taper).toHaveLength(2);
    expect(t.taper.every((w) => w.volumeMinPct === DEFAULTS.taperB.minPct)).toBe(true);
  });

  it('has no taper for a C-priority race', () => {
    const t = raceTargets(race({ priority: 'C' }), DEFAULTS);
    expect(t.taper).toHaveLength(0);
  });
});

describe('feasibility', () => {
  // peak_long_run = 0.45 * 60 = 27km (well under the 55km cap), a B race
  // (2 taper weeks per DEFAULTS.taperB), current LR30 = 25km.
  const r = race({ priority: 'B', km: 60, dplusM: 0 });

  it('needs 1 Build step (25 -> 27km at +10%/step) plus 2 taper weeks = 3 weeks', () => {
    const f = feasibility(r, 25, 6, DEFAULTS);
    expect(f.weeksNeeded).toBe(3);
    expect(f.slack).toBe(3);
    expect(f.status).toBe('FEASIBLE');
  });

  it('is tight with little slack', () => {
    const f = feasibility(r, 25, 4, DEFAULTS);
    expect(f.slack).toBe(1);
    expect(f.status).toBe('TIGHT');
  });

  it('is not safely reachable with too few weeks, and reports the max reachable long run', () => {
    const f = feasibility(r, 25, 1, DEFAULTS);
    expect(f.status).toBe('NOT_REACHABLE');
    expect(f.maxReachableLongRunKm).toBeCloseTo(25); // no room for even one Build step
  });

  it('treats no LR30 baseline as not reachable', () => {
    const f = feasibility(r, 0, 10, DEFAULTS);
    expect(f.status).toBe('NOT_REACHABLE');
  });
});
