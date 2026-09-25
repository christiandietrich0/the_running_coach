import { describe, expect, it } from 'vitest';
import { corridor } from '../../src/logic/corridor';
import { DEFAULTS } from '../../src/worker/defaults';
import type { References } from '../../src/logic/types';

const REFS: References = { C: 50, LR30: 30, D30: 500, DW4: 800, M12: 50, buildMean: 48, weeksUsedForC: 4 };

describe('corridor', () => {
  it('Build: 1.05-1.15x C, long run up to 1.10x LR30', () => {
    const c = corridor('BUILD', REFS, DEFAULTS);
    expect(c.kmMin).toBeCloseTo(52.5);
    expect(c.kmMax).toBeCloseTo(57.5);
    expect(c.lrMax).toBeCloseTo(33);
  });

  it('Hold: 0.90-1.05x C, long run capped at LR30 with no progression', () => {
    const c = corridor('HOLD', REFS, DEFAULTS);
    expect(c.kmMin).toBeCloseTo(45);
    expect(c.kmMax).toBeCloseTo(52.5);
    expect(c.lrMax).toBeCloseTo(30);
  });

  it('Down: 0.60-0.75x the Build-block mean, long run <= 0.70x LR30', () => {
    const c = corridor('DOWN', REFS, DEFAULTS);
    expect(c.kmMin).toBeCloseTo(0.6 * 48);
    expect(c.kmMax).toBeCloseTo(0.75 * 48);
    expect(c.lrMax).toBeCloseTo(0.7 * 30);
  });

  it('Down: a symptom-locked week gets a stricter weekly D- cap than a routine one', () => {
    const routine = corridor('DOWN', REFS, DEFAULTS);
    const locked = corridor('DOWN', REFS, DEFAULTS, { symptomLocked: true });
    expect(routine.dminusWeekMax).toBeCloseTo(DEFAULTS.weeklyDminusCapFactor * REFS.DW4);
    expect(locked.dminusWeekMax).toBeCloseTo(DEFAULTS.symptomDownDminusWeekCapFactor * REFS.DW4);
    expect(locked.dminusWeekMax).toBeLessThan(routine.dminusWeekMax);
  });

  it('Limited: km capped by the user-set cap, long run up to LR30', () => {
    const c = corridor('LIMITED', REFS, DEFAULTS, { limitedKmCap: 25 });
    expect(c.kmMax).toBe(25);
    expect(c.lrMax).toBeCloseTo(30);
  });

  it('Race and Taper leave km/long-run open (their numbers come from raceTargets)', () => {
    expect(corridor('RACE', REFS, DEFAULTS).kmMax).toBe(Infinity);
    expect(corridor('TAPER', REFS, DEFAULTS).kmMax).toBe(Infinity);
  });

  it('is open (not zero) when there is no chronic reference yet', () => {
    const noHistory: References = { C: 0, LR30: 0, D30: 0, DW4: 0, M12: 0, buildMean: 0, weeksUsedForC: 0 };
    const c = corridor('BUILD', noHistory, DEFAULTS);
    expect(c.kmMax).toBe(Infinity);
  });

  it('re-entry: caps a Build week at settings.reentryCapFactor x C, not the normal Build max', () => {
    const settings = { ...DEFAULTS, buildCorridor: { min: 1.05, max: 1.3 }, reentryCapFactor: 1.15 };
    const normal = corridor('BUILD', REFS, settings);
    const reentry = corridor('BUILD', REFS, settings, { reentry: true });
    expect(normal.kmMax).toBeCloseTo(1.3 * 50);
    expect(reentry.kmMax).toBeCloseTo(1.15 * 50);
    expect(reentry.kmMax).toBeLessThan(normal.kmMax);
  });
});
