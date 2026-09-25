import type { RunDTO } from '../types';

function fmtDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.round((seconds % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function fmtWeekday(startLocal: string): string {
  const iso = startLocal.length === 10 ? `${startLocal}T00:00:00Z` : `${startLocal}Z`;
  return new Date(iso).toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' });
}

export function RunsList({ runs }: { runs: RunDTO[] }) {
  if (runs.length === 0) {
    return <p class="muted">No runs logged yet this week.</p>;
  }

  return (
    <ul class="runs-list">
      {runs.map((r) => (
        <li key={r.id}>
          <span class="run-day">{fmtWeekday(r.startLocal)}</span>
          <span class="run-distance">{(r.distanceM / 1000).toFixed(1)} km</span>
          <span class="run-time">{fmtDuration(r.movingS)}</span>
          {r.isRace && <span class="run-race-tag">Race</span>}
        </li>
      ))}
    </ul>
  );
}
