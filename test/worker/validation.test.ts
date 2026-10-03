import { describe, expect, it } from 'vitest';
import { parseSettingsPatch } from '../../src/worker/validation';
import { DEFAULTS } from '../../src/worker/defaults';

// injuryRisk.weekWeights is the app's first array-shaped setting --
// sameShape() previously only handled primitives and plain objects, so any
// patch touching it (even one that matched DEFAULTS exactly) was always
// rejected as "wrong shape" (v1.1 review round 10 Part 2).
describe('parseSettingsPatch: array-shaped settings (injuryRisk.weekWeights)', () => {
  it('accepts a full injuryRisk object with weekWeights matching the template length', () => {
    const result = parseSettingsPatch({ injuryRisk: DEFAULTS.injuryRisk });
    expect(result.ok).toBe(true);
  });

  it('rejects a weekWeights array of the wrong length', () => {
    const result = parseSettingsPatch({ injuryRisk: { ...DEFAULTS.injuryRisk, weekWeights: [1, 0.5, 0.25] } });
    expect(result.ok).toBe(false);
  });

  it('rejects a weekWeights element of the wrong type', () => {
    const result = parseSettingsPatch({ injuryRisk: { ...DEFAULTS.injuryRisk, weekWeights: [1, 0.6, 0.4, 'x'] } });
    expect(result.ok).toBe(false);
  });

  it('accepts custom weekWeights values, still four finite numbers', () => {
    const result = parseSettingsPatch({ injuryRisk: { ...DEFAULTS.injuryRisk, weekWeights: [1, 0.7, 0.5, 0.3] } });
    expect(result.ok).toBe(true);
  });
});
