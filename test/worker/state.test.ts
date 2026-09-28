import { describe, expect, it } from 'vitest';
import { blendCurrentWeekReference } from '../../src/worker/state';
import type { PlanWeek, TimelinePoint } from '../../src/logic/types';

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
      longRunLossM: 620,
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
