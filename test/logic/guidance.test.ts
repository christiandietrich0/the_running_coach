import { describe, expect, it } from 'vitest';
import { remainingWeekGuidance } from '../../src/logic/guidance';

// v1.1 review round 3 item 2: This Week's "left" guidance. The green range
// (0.8-1.2x C) is the acceptable floor; the corridor's own kmMax is the
// "target" ceiling; both get capped by what actually fits in the days left.
describe('remainingWeekGuidance', () => {
  it('is the green floor to the target ceiling, minus what is already done', () => {
    const g = remainingWeekGuidance({
      doneKm: 38,
      C: 65, // green min = 0.8*65 = 52
      greenMinFactor: 0.8,
      corridorKmMax: 75, // "target"
      lrMax: 40,
      remainingDays: 5,
    });
    expect(g.kmLeftMin).toBeCloseTo(52 - 38); // 14
    expect(g.kmLeftMax).toBeCloseTo(75 - 38); // 37, well under 5*40
    expect(g.floorReachable).toBe(true);
    expect(g.targetMet).toBe(false);
  });

  it('says the weekly target is already met once done reaches the corridor ceiling', () => {
    const g = remainingWeekGuidance({ doneKm: 80, C: 65, greenMinFactor: 0.8, corridorKmMax: 75, lrMax: 40, remainingDays: 3 });
    expect(g.targetMet).toBe(true);
  });

  // Required test: today's "left" is capped to one day.
  it('caps the upper end to remaining_days x lrMax -- one day left means at most one lrMax-sized run', () => {
    const g = remainingWeekGuidance({
      doneKm: 20,
      C: 65,
      greenMinFactor: 0.8,
      corridorKmMax: 90, // a big gap to target -- would be 70 km left uncapped
      lrMax: 25,
      remainingDays: 1, // today is Sunday: only today is left
    });
    // Uncapped kmLeftMax would be 90-20=70; capped to 1*25=25.
    expect(g.kmLeftMax).toBeCloseTo(25);
  });

  it('reports the floor as unreachable when even a full lrMax every remaining day would not cover it', () => {
    const g = remainingWeekGuidance({
      doneKm: 20,
      C: 65, // green min = 52, 32 km still needed
      greenMinFactor: 0.8,
      corridorKmMax: 90,
      lrMax: 25,
      remainingDays: 1, // capacity = 25, less than the 32 km needed
    });
    expect(g.floorReachable).toBe(false);
  });

  it('never lets kmLeftMax go negative when already past the target', () => {
    const g = remainingWeekGuidance({ doneKm: 100, C: 65, greenMinFactor: 0.8, corridorKmMax: 75, lrMax: 40, remainingDays: 4 });
    expect(g.kmLeftMax).toBe(0);
    expect(g.kmLeftMin).toBe(0);
    expect(g.targetMet).toBe(true);
  });

  it('treats an unbounded long-run cap as no day-capacity limit at all', () => {
    const g = remainingWeekGuidance({ doneKm: 10, C: 65, greenMinFactor: 0.8, corridorKmMax: 75, lrMax: Infinity, remainingDays: 1 });
    expect(g.kmLeftMax).toBeCloseTo(65);
    expect(g.floorReachable).toBe(true);
  });
});
