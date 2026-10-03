import { describe, expect, it } from 'vitest';
import { computeInjuryRisk, type InjuryRiskWeekInput } from '../../src/logic/injuryRisk';
import { DEFAULTS } from '../../src/worker/defaults';
import type { CheckIn, Flag } from '../../src/logic/types';

function flag(kind: Flag['kind'], colour: Flag['colour'], reason = 'test'): Flag {
  return { kind, colour, reason };
}

function week(weekStart: string, flags: Flag[] = []): InjuryRiskWeekInput {
  return { weekStart, flags };
}

function checkin(weekStart: string, overrides: Partial<CheckIn> = {}): CheckIn {
  return { weekStart, heel: 0, achilles: 0, knee: 0, hipOther: 0, reducedTraining: false, ...overrides };
}

const NO_TREND = { mean4Week: 40, mean10Week: 40 }; // ratio 1.0, never contributes

describe('computeInjuryRisk: required scenarios', () => {
  it('reads Low with no flags anywhere and no check-in', () => {
    const risk = computeInjuryRisk(
      {
        weeks: [week('2026-09-28'), week('2026-09-21'), week('2026-09-14'), week('2026-09-07')],
        ...NO_TREND,
        latestCheckin: null,
      },
      DEFAULTS,
    );
    expect(risk.level).toBe('LOW');
    expect(risk.weightedSum).toBe(0);
    expect(risk.contributors).toHaveLength(0);
  });

  it('reads Medium with a single red flag last week and nothing else', () => {
    const risk = computeInjuryRisk(
      {
        weeks: [week('2026-09-28'), week('2026-09-21', [flag('LONG_RUN', 'RED')]), week('2026-09-14'), week('2026-09-07')],
        ...NO_TREND,
        latestCheckin: null,
      },
      DEFAULTS,
    );
    // 0.6 (last week's weight) x 3 (red points) = 1.8, inside [1.5, 3.5].
    expect(risk.weightedSum).toBeCloseTo(1.8);
    expect(risk.level).toBe('MEDIUM');
  });

  it('reads High with a red flag this week plus a symptom score of 3 on the latest check-in', () => {
    const risk = computeInjuryRisk(
      {
        weeks: [week('2026-09-28', [flag('LONG_RUN', 'RED')]), week('2026-09-21'), week('2026-09-14'), week('2026-09-07')],
        ...NO_TREND,
        latestCheckin: checkin('2026-09-28', { knee: 3 }),
      },
      DEFAULTS,
    );
    // 1.0 (this week's weight) x 3 (red points) = 3.0, plus 2 for the
    // moderate (3-4) symptom region = 5.0, above the 3.5 High floor --
    // reached through the ordinary weighted sum, not the >=5 override.
    expect(risk.overrideHigh).toBe(false);
    expect(risk.weightedSum).toBeCloseTo(5.0);
    expect(risk.level).toBe('HIGH');
  });
});

describe('computeInjuryRisk: symptom override', () => {
  it('forces High regardless of weighted sum when a symptom region scores 5 or above', () => {
    const risk = computeInjuryRisk(
      {
        weeks: [week('2026-09-28'), week('2026-09-21'), week('2026-09-14'), week('2026-09-07')],
        ...NO_TREND,
        latestCheckin: checkin('2026-09-28', { achilles: 5 }),
      },
      DEFAULTS,
    );
    expect(risk.overrideHigh).toBe(true);
    expect(risk.level).toBe('HIGH');
  });

  it('forces High regardless of weighted sum when reduced training is checked, even with low symptom scores', () => {
    const risk = computeInjuryRisk(
      {
        weeks: [week('2026-09-28'), week('2026-09-21'), week('2026-09-14'), week('2026-09-07')],
        ...NO_TREND,
        latestCheckin: checkin('2026-09-28', { heel: 1, reducedTraining: true }),
      },
      DEFAULTS,
    );
    expect(risk.overrideHigh).toBe(true);
    expect(risk.level).toBe('HIGH');
  });

  it('the override contributor sorts first among contributors', () => {
    const risk = computeInjuryRisk(
      {
        weeks: [week('2026-09-28', [flag('LONG_RUN', 'RED')]), week('2026-09-21'), week('2026-09-14'), week('2026-09-07')],
        ...NO_TREND,
        latestCheckin: checkin('2026-09-28', { knee: 5 }),
      },
      DEFAULTS,
    );
    expect(risk.contributors[0].source).toBe('SYMPTOMS');
  });
});

describe('computeInjuryRisk: descent flag is one combined source, not two', () => {
  it('takes the worse of single-run and weekly descent flags, not both stacked', () => {
    const risk = computeInjuryRisk(
      {
        weeks: [week('2026-09-28', [flag('DESCENT_SINGLE', 'YELLOW'), flag('DESCENT_WEEKLY', 'RED')]), week('2026-09-21'), week('2026-09-14'), week('2026-09-07')],
        ...NO_TREND,
        latestCheckin: null,
      },
      DEFAULTS,
    );
    const descentContributors = risk.contributors.filter((c) => c.source === 'DESCENT');
    expect(descentContributors).toHaveLength(1);
    // The worse (red) of the two: 1.0 x 3 = 3.0, not 1.0 x (1+3) = 4.0.
    expect(descentContributors[0].weightedPoints).toBeCloseTo(3.0);
  });
});

describe('computeInjuryRisk: rising 4-week-vs-10-week load trend', () => {
  it('adds points when the trend ratio exceeds the moderate/high thresholds, independent of any weekly flag', () => {
    const moderate = computeInjuryRisk(
      { weeks: [week('2026-09-28'), week('2026-09-21'), week('2026-09-14'), week('2026-09-07')], mean4Week: 45, mean10Week: 33, latestCheckin: null }, // 45/33 = 1.36, over 1.3
      DEFAULTS,
    );
    expect(moderate.contributors.find((c) => c.source === 'TREND')?.rawPoints).toBe(DEFAULTS.injuryRisk.trendRatio.moderatePoints);

    const high = computeInjuryRisk(
      { weeks: [week('2026-09-28'), week('2026-09-21'), week('2026-09-14'), week('2026-09-07')], mean4Week: 55, mean10Week: 33, latestCheckin: null }, // 55/33 = 1.67, over 1.5
      DEFAULTS,
    );
    expect(high.contributors.find((c) => c.source === 'TREND')?.rawPoints).toBe(DEFAULTS.injuryRisk.trendRatio.highPoints);
  });

  it('never contributes when the 10-week average is 0 (no history yet)', () => {
    const risk = computeInjuryRisk(
      { weeks: [week('2026-09-28')], mean4Week: 20, mean10Week: 0, latestCheckin: null },
      DEFAULTS,
    );
    expect(risk.contributors.find((c) => c.source === 'TREND')).toBeUndefined();
  });
});

describe('computeInjuryRisk: recency weighting', () => {
  it('weighs an identical red flag less the further back it is', () => {
    const thisWeek = computeInjuryRisk(
      { weeks: [week('2026-09-28', [flag('RATIO', 'RED')]), week('2026-09-21'), week('2026-09-14'), week('2026-09-07')], ...NO_TREND, latestCheckin: null },
      DEFAULTS,
    );
    const threeWeeksAgo = computeInjuryRisk(
      { weeks: [week('2026-09-28'), week('2026-09-21'), week('2026-09-14'), week('2026-09-07', [flag('RATIO', 'RED')])], ...NO_TREND, latestCheckin: null },
      DEFAULTS,
    );
    expect(thisWeek.weightedSum).toBeGreaterThan(threeWeeksAgo.weightedSum);
    expect(threeWeeksAgo.weightedSum).toBeCloseTo(DEFAULTS.injuryRisk.weekWeights[3] * DEFAULTS.injuryRisk.flagPoints.red);
  });
});
