import { describe, expect, it } from 'vitest';
import { isRaceActivity } from '../../src/worker/sync';

// The live bug: Bukovina was marked as a race in intervals.icu, but manual
// sync only re-fetched the last ~3 weeks, so the edit never reached D1 --
// see sync.ts's MANUAL_DAYS for the other half of the fix. This covers the
// field-reading half: treat an activity as a race if EITHER intervals.icu's
// own race flag is set, OR its tags include "race" (case-insensitive),
// whichever way the athlete happened to mark it.
describe('isRaceActivity', () => {
  it('is true when intervals.icu\'s own race flag is set', () => {
    expect(isRaceActivity({ race: true, tags: null })).toBe(true);
  });

  it('is true when a tag reads "race", regardless of case', () => {
    expect(isRaceActivity({ race: false, tags: ['Race'] })).toBe(true);
  });

  it('is false when neither the race flag nor any tag says so', () => {
    expect(isRaceActivity({ race: false, tags: ['long run', 'trail'] })).toBe(false);
  });

  it('is false with no tags at all and the race flag unset', () => {
    expect(isRaceActivity({ race: false, tags: null })).toBe(false);
    expect(isRaceActivity({ race: null, tags: undefined })).toBe(false);
  });

  it('does not match a tag that merely contains "race" as a substring', () => {
    expect(isRaceActivity({ race: false, tags: ['race pace'] })).toBe(false);
  });

  it('tolerates surrounding whitespace in a tag', () => {
    expect(isRaceActivity({ race: false, tags: [' race '] })).toBe(true);
  });
});
