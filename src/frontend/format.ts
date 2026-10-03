// Actual/done distances round to the nearest whole km, same as ever (a
// 28.6km run reads as "29km", the true nearest value).
export function fmtKm(km: number): string {
  return Math.round(km).toString();
}

// Caps, limits and targets floor instead: the conservative side of the
// true figure, never claiming more room than there safely is -- and,
// applied consistently everywhere a cap is shown, the fix for two
// slightly different cap figures (e.g. feasibility's reachable projection
// vs corridor's own cap) reading as two different whole numbers (v1.1
// review round 10 follow-up, final pre-1.0 pass items 2-3).
export function fmtKmCap(km: number): string {
  return Math.floor(km).toString();
}

export function fmtM(m: number): string {
  return Math.round(m).toLocaleString('en-US');
}

export function fmtShortDate(dateStr: string): string {
  return new Date(`${dateStr}T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

export function daysUntil(dateStr: string, todayIso: string): number {
  const today = new Date(todayIso);
  const todayUtc = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  const raceUtc = new Date(`${dateStr}T00:00:00Z`).getTime();
  return Math.round((raceUtc - todayUtc) / (24 * 60 * 60 * 1000));
}
