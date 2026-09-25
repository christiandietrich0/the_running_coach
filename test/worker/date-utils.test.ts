import { describe, expect, it } from 'vitest';
import { daysBefore, formatDate, monthChunks, monthsBefore } from '../../src/worker/date-utils';

describe('formatDate', () => {
  it('formats as YYYY-MM-DD', () => {
    expect(formatDate(new Date(Date.UTC(2026, 6, 24)))).toBe('2026-07-24');
  });
});

describe('monthsBefore / daysBefore', () => {
  it('subtracts calendar months', () => {
    const d = monthsBefore(new Date(Date.UTC(2026, 8, 25)), 24);
    expect(formatDate(d)).toBe('2024-09-25');
  });

  it('subtracts days', () => {
    const d = daysBefore(new Date(Date.UTC(2026, 8, 25)), 21);
    expect(formatDate(d)).toBe('2026-09-04');
  });
});

describe('monthChunks', () => {
  it('returns one chunk when the range sits inside a single month', () => {
    const chunks = monthChunks(new Date(Date.UTC(2026, 8, 4)), new Date(Date.UTC(2026, 8, 25)));
    expect(chunks).toEqual([{ oldest: '2026-09-04', newest: '2026-09-25', monthKey: '2026-09' }]);
  });

  it('splits a range spanning a month boundary into two chunks', () => {
    const chunks = monthChunks(new Date(Date.UTC(2026, 7, 20)), new Date(Date.UTC(2026, 8, 5)));
    expect(chunks).toEqual([
      { oldest: '2026-08-20', newest: '2026-08-31', monthKey: '2026-08' },
      { oldest: '2026-09-01', newest: '2026-09-05', monthKey: '2026-09' },
    ]);
  });

  it('produces one chunk per calendar month for a 24-month backfill range', () => {
    const oldest = monthsBefore(new Date(Date.UTC(2026, 8, 25)), 24);
    const chunks = monthChunks(oldest, new Date(Date.UTC(2026, 8, 25)));
    expect(chunks.length).toBe(25);
    expect(chunks[0].oldest).toBe('2024-09-25');
    expect(chunks[chunks.length - 1].newest).toBe('2026-09-25');
  });

  it('returns nothing when oldest is after newest', () => {
    expect(monthChunks(new Date(Date.UTC(2026, 8, 25)), new Date(Date.UTC(2026, 8, 1)))).toEqual([]);
  });
});
