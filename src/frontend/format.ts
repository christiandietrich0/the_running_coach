export function fmtKm(km: number): string {
  return Math.round(km).toString();
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
