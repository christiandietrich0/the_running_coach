import { describe, expect, it } from 'vitest';
import { DEFAULTS } from '../src/worker/defaults';

describe('vitest setup', () => {
  it('runs', () => {
    expect(1 + 1).toBe(2);
  });

  it('loads defaults from the mechanics brief', () => {
    expect(DEFAULTS.runMergeGapMin).toBe(15);
    expect(DEFAULTS.maxWeekKm).toBe(80);
  });
});
