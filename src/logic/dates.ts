// Pure calendar-date helpers for the logic module. Dates are treated as
// naive calendar days (YYYY-MM-DD), anchored to UTC internally purely so
// the host machine's local timezone can't shift day-of-week math.

const DAY_MS = 24 * 60 * 60 * 1000;

export function toDateOnly(isoOrDate: string): string {
  return isoOrDate.slice(0, 10);
}

function utcDate(dateOnly: string): Date {
  const [y, m, d] = dateOnly.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

// The Monday (YYYY-MM-DD) of the calendar week containing this date.
export function mondayOf(isoOrDate: string): string {
  const date = utcDate(toDateOnly(isoOrDate));
  const day = date.getUTCDay(); // 0 = Sunday
  const diff = day === 0 ? 6 : day - 1;
  return new Date(date.getTime() - diff * DAY_MS).toISOString().slice(0, 10);
}

export function addDays(dateOnly: string, days: number): string {
  return new Date(utcDate(dateOnly).getTime() + days * DAY_MS).toISOString().slice(0, 10);
}

export function addWeeks(dateOnly: string, weeks: number): string {
  return addDays(dateOnly, weeks * 7);
}

export function diffDays(a: string, b: string): number {
  return Math.round((utcDate(a).getTime() - utcDate(b).getTime()) / DAY_MS);
}
