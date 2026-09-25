import { describe, expect, it } from 'vitest';
import { addDays, addWeeks, diffDays, mondayOf } from '../../src/logic/dates';

describe('mondayOf', () => {
  it('returns the same date when it is already a Monday', () => {
    expect(mondayOf('2026-07-20')).toBe('2026-07-20');
  });

  it('rolls a Sunday back to the Monday that started its week', () => {
    expect(mondayOf('2026-07-26')).toBe('2026-07-20');
  });

  it('handles a full ISO datetime, not just a date', () => {
    expect(mondayOf('2026-07-24T22:59:29')).toBe('2026-07-20');
  });

  it('rolls back across a month boundary', () => {
    expect(mondayOf('2026-08-01')).toBe('2026-07-27'); // Saturday -> preceding Monday
  });
});

describe('addDays / addWeeks / diffDays', () => {
  it('adds and subtracts days across month/year boundaries', () => {
    expect(addDays('2026-12-30', 5)).toBe('2027-01-04');
    expect(addDays('2026-01-03', -5)).toBe('2025-12-29');
  });

  it('adds whole weeks', () => {
    expect(addWeeks('2026-07-20', 2)).toBe('2026-08-03');
    expect(addWeeks('2026-07-20', -1)).toBe('2026-07-13');
  });

  it('computes the day difference between two dates', () => {
    expect(diffDays('2026-08-01', '2026-07-27')).toBe(5);
    expect(diffDays('2026-07-27', '2026-08-01')).toBe(-5);
  });
});
