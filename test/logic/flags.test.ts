import { describe, expect, it } from 'vitest';
import { applySymptomLock, assessSymptoms, flags, isRisingTwoWeeks, verdict } from '../../src/logic/flags';
import { DEFAULTS } from '../../src/worker/defaults';
import type { CheckIn, FlagsInput, References } from '../../src/logic/types';

function checkin(weekStart: string, overrides: Partial<CheckIn> = {}): CheckIn {
  return { weekStart, heel: 0, achilles: 0, knee: 0, hipOther: 0, reducedTraining: false, ...overrides };
}

const NEUTRAL_REFS: References = { C: 50, LR30: 30, D30: 500, DW4: 800, M12: 50, buildMean: 50, weeksUsedForC: 4 };

function baseInput(overrides: Partial<FlagsInput> = {}): FlagsInput {
  return {
    weekType: 'BUILD',
    kmWeek: 50,
    longestKm: 28,
    longestLossM: 450,
    dminusWeek: 750,
    refs: NEUTRAL_REFS,
    checkin: null,
    priorCheckinsAsc: [],
    prevWeekKm: 48,
    ...overrides,
  };
}

describe('symptom check-in (5.1, 5.3)', () => {
  it('is green with no check-in', () => {
    expect(assessSymptoms(null, [], DEFAULTS).colour).toBe('GREEN');
  });

  it('is green when all regions are 2 or below', () => {
    const a = assessSymptoms(checkin('w', { heel: 2, achilles: 1 }), [], DEFAULTS);
    expect(a.colour).toBe('GREEN');
    expect(a.locksTo).toBeNull();
  });

  it('is yellow and locks to Hold when a region scores 3 or 4', () => {
    const a = assessSymptoms(checkin('w', { achilles: 3 }), [], DEFAULTS);
    expect(a.colour).toBe('YELLOW');
    expect(a.locksTo).toBe('HOLD');
  });

  it('is red and locks to Down when a region scores 5 or more', () => {
    const a = assessSymptoms(checkin('w', { knee: 5 }), [], DEFAULTS);
    expect(a.colour).toBe('RED');
    expect(a.locksTo).toBe('DOWN');
  });

  it('is red and locks to Down when training was reduced, even with low scores', () => {
    const a = assessSymptoms(checkin('w', { heel: 1, reducedTraining: true }), [], DEFAULTS);
    expect(a.colour).toBe('RED');
    expect(a.locksTo).toBe('DOWN');
  });

  it('detects a max symptom score rising two weeks running', () => {
    const w1 = checkin('2026-07-06', { heel: 1 });
    const w2 = checkin('2026-07-13', { heel: 2 });
    const w3 = checkin('2026-07-20', { heel: 3 });
    expect(isRisingTwoWeeks(w3, [w1, w2])).toBe(true);
    expect(isRisingTwoWeeks(w2, [w1])).toBe(false); // not enough history
  });

  it('locks to Down when symptoms have risen two weeks running, even if the current score is low', () => {
    const w1 = checkin('2026-07-06', { heel: 1 });
    const w2 = checkin('2026-07-13', { heel: 2 });
    const current = checkin('2026-07-20', { heel: 2.5 }); // still rising, still under 5
    const a = assessSymptoms(current, [w1, w2], DEFAULTS);
    expect(a.locksTo).toBe('DOWN');
  });

  it('never overrides a Race or Taper week\'s type', () => {
    const down = applySymptomLock('RACE', checkin('w', { knee: 8 }), [], DEFAULTS);
    expect(down.type).toBe('RACE');
    expect(down.symptomLocked).toBe(false);

    const taper = applySymptomLock('TAPER', checkin('w', { knee: 8 }), [], DEFAULTS);
    expect(taper.type).toBe('TAPER');
  });

  it('locks a Build week to Hold or Down as appropriate', () => {
    const hold = applySymptomLock('BUILD', checkin('w', { knee: 3 }), [], DEFAULTS);
    expect(hold.type).toBe('HOLD');
    expect(hold.symptomLocked).toBe(true);

    const down = applySymptomLock('BUILD', checkin('w', { knee: 6 }), [], DEFAULTS);
    expect(down.type).toBe('DOWN');
    expect(down.symptomLocked).toBe(true);
  });
});

describe('long run flag', () => {
  it('is green within the 1.10x growth cap, red at and beyond it (v1.1 A-round 2 item 1: no yellow tier any more)', () => {
    const green = flags(baseInput({ longestKm: 32, refs: { ...NEUTRAL_REFS, LR30: 30 } }), DEFAULTS);
    expect(green.find((f) => f.kind === 'LONG_RUN')!.colour).toBe('GREEN');

    const red = flags(baseInput({ longestKm: 36, refs: { ...NEUTRAL_REFS, LR30: 30 } }), DEFAULTS);
    expect(red.find((f) => f.kind === 'LONG_RUN')!.colour).toBe('RED');

    const wayRed = flags(baseInput({ longestKm: 40, refs: { ...NEUTRAL_REFS, LR30: 30 } }), DEFAULTS);
    expect(wayRed.find((f) => f.kind === 'LONG_RUN')!.colour).toBe('RED');
  });

  it('matches the spec\'s example reason line', () => {
    // "Long run 38 km is 27% over your 30-day longest (30 km)."
    const result = flags(baseInput({ longestKm: 38.1, refs: { ...NEUTRAL_REFS, LR30: 30 } }), DEFAULTS);
    const lr = result.find((f) => f.kind === 'LONG_RUN')!;
    expect(lr.reason).toContain('27%');
    expect(lr.reason).toContain('30.0 km');
  });

  it('is skipped entirely on a Race week', () => {
    const result = flags(baseInput({ weekType: 'RACE', longestKm: 85, refs: { ...NEUTRAL_REFS, LR30: 30 } }), DEFAULTS);
    expect(result.find((f) => f.kind === 'LONG_RUN')).toBeUndefined();
  });

  // v1.1 review A-round 2 item 1: these three are the A1 cap invariants,
  // applied as hard flags on every week including user-edited ones -- the
  // reported bug was a stale/locked week (Oct 26: LR 70 km in a 56 km
  // week) showing green because its own LR30 reference had also drifted
  // up, so the plain ratio check alone missed it.
  it('is red when the long run exceeds this week\'s own km, regardless of the LR30 ratio', () => {
    // ratio to LR30 (70/65 = 1.08) would read green on its own.
    const result = flags(baseInput({ kmWeek: 56, longestKm: 70, refs: { ...NEUTRAL_REFS, LR30: 65 } }), DEFAULTS);
    const lr = result.find((f) => f.kind === 'LONG_RUN')!;
    expect(lr.colour).toBe('RED');
    expect(lr.reason).toContain('56.0 km');
  });

  it('is red when the long run exceeds the max_long_run_km life cap, regardless of the LR30 ratio', () => {
    const result = flags(baseInput({ kmWeek: 90, longestKm: 60, refs: { ...NEUTRAL_REFS, LR30: 58 } }), DEFAULTS);
    const lr = result.find((f) => f.kind === 'LONG_RUN')!;
    expect(lr.colour).toBe('RED');
    expect(lr.reason).toContain(`${DEFAULTS.maxLongRunKm} km life cap`);
  });

  it('has no flag when there is no LR30 baseline at all, even with a long run', () => {
    const result = flags(baseInput({ kmWeek: 90, longestKm: 20, refs: { ...NEUTRAL_REFS, LR30: 0 } }), DEFAULTS);
    expect(result.find((f) => f.kind === 'LONG_RUN')).toBeUndefined();
  });
});

describe('descent flags', () => {
  it('single-run descent: green <=1.20x D30, yellow beyond, red beyond 1.50x', () => {
    const refs = { ...NEUTRAL_REFS, D30: 500 };
    expect(flags(baseInput({ longestLossM: 550, refs }), DEFAULTS).find((f) => f.kind === 'DESCENT_SINGLE')!.colour).toBe('GREEN');
    expect(flags(baseInput({ longestLossM: 700, refs }), DEFAULTS).find((f) => f.kind === 'DESCENT_SINGLE')!.colour).toBe('YELLOW');
    expect(flags(baseInput({ longestLossM: 800, refs }), DEFAULTS).find((f) => f.kind === 'DESCENT_SINGLE')!.colour).toBe('RED');
  });

  it('weekly descent: green <=1.30x DW4, yellow beyond, red beyond 1.60x', () => {
    const refs = { ...NEUTRAL_REFS, DW4: 800 };
    expect(flags(baseInput({ dminusWeek: 1000, refs }), DEFAULTS).find((f) => f.kind === 'DESCENT_WEEKLY')!.colour).toBe('GREEN');
    expect(flags(baseInput({ dminusWeek: 1150, refs }), DEFAULTS).find((f) => f.kind === 'DESCENT_WEEKLY')!.colour).toBe('YELLOW');
    expect(flags(baseInput({ dminusWeek: 1400, refs }), DEFAULTS).find((f) => f.kind === 'DESCENT_WEEKLY')!.colour).toBe('RED');
  });

  // v1.1 review round 4 item 1: a Race week used to still get descent
  // flags (races routinely exceed training references, which isn't a
  // problem) -- now it gets no flags at all, full stop.
  it('is empty entirely on a Race week, not just skipping ratio/long-run', () => {
    const result = flags(baseInput({ weekType: 'RACE', longestLossM: 4800, dminusWeek: 4800, refs: { ...NEUTRAL_REFS, D30: 500, DW4: 800 } }), DEFAULTS);
    expect(result).toEqual([]);
  });
});

describe('weekly ratio flag and hard caps', () => {
  it('green 0.8-1.2x C, yellow 1.2-1.5x, red beyond 1.5x', () => {
    const refs = { ...NEUTRAL_REFS, C: 50 };
    expect(flags(baseInput({ kmWeek: 55, prevWeekKm: 54, refs }), DEFAULTS).find((f) => f.kind === 'RATIO')!.colour).toBe('GREEN');
    expect(flags(baseInput({ kmWeek: 65, prevWeekKm: 60, refs }), DEFAULTS).find((f) => f.kind === 'RATIO')!.colour).toBe('YELLOW');
    expect(flags(baseInput({ kmWeek: 80, prevWeekKm: 62, refs }), DEFAULTS).find((f) => f.kind === 'RATIO')!.colour).toBe('RED');
  });

  it('is off entirely on a Race week', () => {
    const result = flags(baseInput({ weekType: 'RACE', kmWeek: 90, refs: { ...NEUTRAL_REFS, C: 50 } }), DEFAULTS);
    expect(result.find((f) => f.kind === 'RATIO')).toBeUndefined();
  });

  it('flags a hard +30% week-on-week jump even inside the normal ratio corridor', () => {
    // kmWeek/C = 55/50 = 1.1 (green on ratio), but 55/40 = +37.5% week-on-week.
    const result = flags(baseInput({ kmWeek: 55, prevWeekKm: 40, refs: { ...NEUTRAL_REFS, C: 50 } }), DEFAULTS);
    const wow = result.filter((f) => f.kind === 'RATIO');
    expect(wow.some((f) => f.colour === 'YELLOW' && f.reason.includes('hard cap'))).toBe(true);
  });

  // v1.1 review round 3 item 5: a percentage jump between two small,
  // deliberately-capped numbers is noise, not a real overload signal.
  it('does not apply the hard week-on-week cap to Recovery or Limited weeks', () => {
    const refs = { ...NEUTRAL_REFS, C: 50 };
    const recovery = flags(baseInput({ weekType: 'RECOVERY', kmWeek: 8, prevWeekKm: 5, refs }), DEFAULTS);
    expect(recovery.some((f) => f.kind === 'RATIO' && f.reason.includes('hard cap'))).toBe(false);

    const limited = flags(baseInput({ weekType: 'LIMITED', kmWeek: 8, prevWeekKm: 5, refs }), DEFAULTS);
    expect(limited.some((f) => f.kind === 'RATIO' && f.reason.includes('hard cap'))).toBe(false);
  });
});

describe('low-volume (blue) flag', () => {
  it('appears on Build/Hold weeks when R < 0.8, not on other week types', () => {
    const refs = { ...NEUTRAL_REFS, C: 50 };
    const build = flags(baseInput({ weekType: 'BUILD', kmWeek: 35, prevWeekKm: 35, refs }), DEFAULTS);
    expect(build.some((f) => f.kind === 'LOW_VOLUME')).toBe(true);

    const down = flags(baseInput({ weekType: 'DOWN', kmWeek: 35, prevWeekKm: 35, refs }), DEFAULTS);
    expect(down.some((f) => f.kind === 'LOW_VOLUME')).toBe(false);
  });

  it('flags detraining when C drops below 0.7x M12', () => {
    const refs = { ...NEUTRAL_REFS, C: 30, M12: 50 };
    const result = flags(baseInput({ kmWeek: 30, prevWeekKm: 30, refs }), DEFAULTS);
    expect(result.some((f) => f.kind === 'LOW_VOLUME' && f.reason.includes('12-week'))).toBe(true);
  });

  it('never appears for the in-progress current week, however far under the floor (v1.1 review A5)', () => {
    const refs = { ...NEUTRAL_REFS, C: 50, M12: 50 };
    const midWeek = flags(baseInput({ weekType: 'BUILD', kmWeek: 10, longestKm: 4, prevWeekKm: null, refs, weekInProgress: true }), DEFAULTS);
    expect(midWeek.some((f) => f.kind === 'LOW_VOLUME')).toBe(false);
    expect(verdict(midWeek).colour).toBe('GREEN');

    // Same numbers, but the week has actually finished: the floor is a
    // real signal again.
    const completedWeek = flags(baseInput({ weekType: 'BUILD', kmWeek: 10, longestKm: 4, prevWeekKm: null, refs, weekInProgress: false }), DEFAULTS);
    expect(completedWeek.some((f) => f.kind === 'LOW_VOLUME')).toBe(true);
    expect(verdict(completedWeek).colour).toBe('BLUE');
  });

  it('still flags real upside overages mid-week: long run and ratio ceiling are not affected by weekInProgress', () => {
    const refs = { ...NEUTRAL_REFS, C: 50, LR30: 20, M12: 50 };
    const midWeek = flags(
      baseInput({ weekType: 'BUILD', kmWeek: 70, longestKm: 30, prevWeekKm: null, refs, weekInProgress: true }),
      DEFAULTS,
    );
    expect(midWeek.some((f) => f.kind === 'LONG_RUN' && f.colour !== 'GREEN')).toBe(true);
    expect(midWeek.some((f) => f.kind === 'RATIO' && f.colour !== 'GREEN')).toBe(true);
  });

  // v1.1 review round 3 item 4: neither the low-volume floor nor
  // detraining should fire during the 3-week re-entry window after a
  // Recovery week -- a temporarily low C is expected there, not a problem.
  it('never appears during re-entry, even when both the floor and detraining conditions are met', () => {
    const refs = { ...NEUTRAL_REFS, C: 30, M12: 50 }; // C well under both the floor and 0.7xM12
    const reentryWeek = flags(baseInput({ weekType: 'BUILD', kmWeek: 20, prevWeekKm: 20, refs, reentry: true }), DEFAULTS);
    expect(reentryWeek.some((f) => f.kind === 'LOW_VOLUME')).toBe(false);

    const sameWeekNotReentry = flags(baseInput({ weekType: 'BUILD', kmWeek: 20, prevWeekKm: 20, refs, reentry: false }), DEFAULTS);
    expect(sameWeekNotReentry.some((f) => f.kind === 'LOW_VOLUME')).toBe(true);
  });
});

describe('verdict', () => {
  it('is green with an "on track" reason when there are no flags', () => {
    expect(verdict([]).colour).toBe('GREEN');
  });

  it('picks the worst colour present', () => {
    const v = verdict([
      { kind: 'SYMPTOMS', colour: 'GREEN', reason: 'ok' },
      { kind: 'RATIO', colour: 'YELLOW', reason: 'ratio up' },
      { kind: 'LONG_RUN', colour: 'RED', reason: 'long run way up' },
    ]);
    expect(v.colour).toBe('RED');
    expect(v.reason).toBe('long run way up');
  });

  it('breaks ties by symptoms > long run > descent > ratio', () => {
    const v = verdict([
      { kind: 'RATIO', colour: 'RED', reason: 'ratio reason' },
      { kind: 'LONG_RUN', colour: 'RED', reason: 'long run reason' },
      { kind: 'DESCENT_WEEKLY', colour: 'RED', reason: 'descent reason' },
    ]);
    expect(v.reason).toBe('long run reason');
  });

  it('shows blue only when nothing is yellow or red', () => {
    const blueOnly = verdict([{ kind: 'LOW_VOLUME', colour: 'BLUE', reason: 'low volume' }]);
    expect(blueOnly.colour).toBe('BLUE');

    const blueMasked = verdict([
      { kind: 'LOW_VOLUME', colour: 'BLUE', reason: 'low volume' },
      { kind: 'RATIO', colour: 'YELLOW', reason: 'ratio up' },
    ]);
    expect(blueMasked.colour).toBe('YELLOW');
  });
});
