// Floor, not round: a cap of e.g. 35.6km showing as "36" in one place
// (feasibility's reachable projection) and "35" in another (corridor's own
// cap, a slightly different figure) for what reads as "the same number" is
// worse than consistently showing the conservative side of it everywhere
// (v1.1 review round 10 follow-up, final pre-1.0 pass item 2).
export function fmtKm(km: number): string {
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
