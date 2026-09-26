// remainingWeekGuidance(): "how much is left this week" for the This Week
// screen's verdict reason (v1.1 review round 3 item 2). Pure arithmetic
// only; the caller decides when it even applies (a bounded corridor, a
// real C to measure against) and how to word the result.
export interface RemainingWeekGuidanceInput {
  doneKm: number;
  C: number;
  greenMinFactor: number; // settings.ratioZoneEdges.greenMin -- the acceptable range's floor, x C
  corridorKmMax: number; // the Build/Hold corridor's own ceiling ("target"); must be finite
  lrMax: number; // corridor.lrMax; may be Infinity
  remainingDays: number; // days left in the week, counting today
}

export interface RemainingWeekGuidance {
  // False when even running lrMax every remaining day wouldn't reach the
  // green floor -- there's nothing useful to tell the athlete to aim for.
  floorReachable: boolean;
  // True when `doneKm` has already reached the corridor's own ceiling.
  targetMet: boolean;
  kmLeftMin: number;
  kmLeftMax: number;
}

export function remainingWeekGuidance(input: RemainingWeekGuidanceInput): RemainingWeekGuidance {
  const { doneKm, C, greenMinFactor, corridorKmMax, lrMax, remainingDays } = input;

  const greenMin = greenMinFactor * C;
  const rawMin = Math.max(0, greenMin - doneKm);
  const rawMax = Math.max(0, corridorKmMax - doneKm);

  // At most one long run in the days left; every day is loosely bounded by
  // that same cap as a physical sanity ceiling (never more than a single
  // day's worth of "one long run" per remaining day).
  const dayCapacity = Number.isFinite(lrMax) ? Math.max(0, remainingDays) * lrMax : Infinity;

  return {
    floorReachable: rawMin <= dayCapacity + 1e-9,
    targetMet: rawMax <= 0,
    kmLeftMin: rawMin,
    kmLeftMax: Math.min(rawMax, dayCapacity),
  };
}
