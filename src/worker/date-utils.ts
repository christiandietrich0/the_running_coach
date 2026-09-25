// Small date helpers for sync. Pure, no I/O.

export function formatDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function monthsBefore(d: Date, months: number): Date {
  const copy = new Date(d.getTime());
  copy.setUTCMonth(copy.getUTCMonth() - months);
  return copy;
}

export function daysBefore(d: Date, days: number): Date {
  return new Date(d.getTime() - days * 24 * 60 * 60 * 1000);
}

export interface DateChunk {
  oldest: string;
  newest: string;
  monthKey: string; // YYYY-MM, of the chunk's start
}

// Splits [oldest, newest] (inclusive) into calendar-month chunks, so a
// backfill needs one list request per month instead of one giant range,
// and so per-month activity counts fall out of the sync for free.
export function monthChunks(oldest: Date, newest: Date): DateChunk[] {
  if (oldest > newest) return [];

  const chunks: DateChunk[] = [];
  let cursor = new Date(Date.UTC(oldest.getUTCFullYear(), oldest.getUTCMonth(), 1));

  while (cursor <= newest) {
    const monthStart = cursor;
    const monthEnd = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 0));

    const chunkOldest = monthStart < oldest ? oldest : monthStart;
    const chunkNewest = monthEnd > newest ? newest : monthEnd;

    chunks.push({
      oldest: formatDate(chunkOldest),
      newest: formatDate(chunkNewest),
      monthKey: `${monthStart.getUTCFullYear()}-${String(monthStart.getUTCMonth() + 1).padStart(2, '0')}`,
    });

    cursor = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 1));
  }

  return chunks;
}
