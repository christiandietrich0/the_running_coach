import { describe, expect, it } from 'vitest';
import { suppressPlannedCurrentWeek } from '../../src/worker/state';
import type { TimelinePoint } from '../../src/logic/types';

function planWeek(overrides: Partial<TimelinePoint> = {}): TimelinePoint {
  return {
    weekStart: '2026-09-21',
    kmWeek: 71,
    dminusWeek: 620,
    longRunKm: 39,
    longRunLossM: 543,
    longRunDate: '2026-09-21',
    isRaceWeek: false,
    weekType: 'BUILD',
    ...overrides,
  };
}

describe('suppressPlannedCurrentWeek', () => {
  it('zeroes a fresh current week with a plan row but no logged runs', () => {
    const dense = [planWeek()];
    suppressPlannedCurrentWeek(dense, '2026-09-21', false);

    expect(dense[0]).toMatchObject({
      kmWeek: 0,
      dminusWeek: 0,
      longRunKm: null,
      longRunLossM: null,
      longRunDate: null,
    });
    // The week's type comes from the plan row and must survive -- only the
    // done-so-far figures are what's wrong, not the week's structure.
    expect(dense[0].weekType).toBe('BUILD');
  });

  it('leaves the current week untouched once it has at least one actual run', () => {
    const dense = [planWeek()];
    suppressPlannedCurrentWeek(dense, '2026-09-21', true);

    expect(dense[0]).toMatchObject({
      kmWeek: 71,
      dminusWeek: 620,
      longRunKm: 39,
      longRunLossM: 543,
      longRunDate: '2026-09-21',
    });
  });

  it('leaves other weeks in the timeline untouched', () => {
    const dense = [planWeek({ weekStart: '2026-09-14', kmWeek: 60 }), planWeek({ weekStart: '2026-09-21' })];
    suppressPlannedCurrentWeek(dense, '2026-09-21', false);

    expect(dense[0].kmWeek).toBe(60);
    expect(dense[1].kmWeek).toBe(0);
  });

  it('is a no-op when the current week has no dense-timeline entry', () => {
    const dense = [planWeek({ weekStart: '2026-09-14' })];
    expect(() => suppressPlannedCurrentWeek(dense, '2026-09-21', false)).not.toThrow();
    expect(dense[0].kmWeek).toBe(71);
  });
});
