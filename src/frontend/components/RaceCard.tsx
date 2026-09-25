import { daysUntil, fmtKm, fmtM } from '../format';
import { FEASIBILITY_LABEL } from '../labels';
import type { RaceState } from '../types';

function fmtDate(dateStr: string): string {
  return new Date(`${dateStr}T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
}

function fmtPct(min: number, max: number): string {
  const a = Math.round(min * 100);
  const b = Math.round(max * 100);
  return a === b ? `${a}%` : `${a} to ${b}%`;
}

export function RaceCard({
  race,
  today,
  onEdit,
  onDelete,
  deleting,
}: {
  race: RaceState;
  today: string;
  onEdit: () => void;
  onDelete: () => void;
  deleting: boolean;
}) {
  const days = daysUntil(race.date, today);
  const { targets, feasibility } = race;

  return (
    <div class="card race-card">
      <div class="card-title-row">
        <div>
          <div class="race-name">
            {race.name} <span class="pill race-priority-pill">Priority {race.priority}</span>
          </div>
          <div class="race-countdown">
            {fmtDate(race.date)} · {days >= 0 ? `${days} day${days === 1 ? '' : 's'} away` : `${Math.abs(days)} days ago`}
          </div>
        </div>
      </div>

      {feasibility && (
        <div class="race-meta">
          <span class={`pill pill-${feasibility.status.toLowerCase()}`}>{FEASIBILITY_LABEL[feasibility.status]}</span>
          <span class="muted">
            {feasibility.status === 'NOT_REACHABLE' && feasibility.maxReachableLongRunKm != null
              ? `Max reachable long run by race day: ${fmtKm(feasibility.maxReachableLongRunKm)} km`
              : `${feasibility.weeksNeeded} weeks needed, ${feasibility.weeksAvailable} available`}
          </span>
        </div>
      )}

      <div class="race-targets">
        <div class="race-target-row">
          <span class="muted">Peak long run</span>
          <span>{fmtKm(targets.peakLongRunKm)} km</span>
        </div>
        <div class="race-target-row">
          <span class="muted">Peak week</span>
          <span>{fmtKm(targets.peakWeekEffortKm)} effort-km</span>
        </div>
        <div class="race-target-row">
          <span class="muted">Peak weekly D+</span>
          <span>{fmtM(targets.peakWeeklyDplusM)} m</span>
        </div>
        <div class="race-target-row">
          <span class="muted">Peak single-run D-</span>
          <span>{fmtM(targets.peakSingleRunDminusM)} m</span>
        </div>
      </div>

      {targets.taper.length > 0 && (
        <div class="taper-list">
          <div class="stat-label">Taper</div>
          {targets.taper.map((t) => (
            <div class="race-target-row" key={t.weekStart}>
              <span class="muted">{t.label}</span>
              <span>{fmtPct(t.volumeMinPct, t.volumeMaxPct)} of peak</span>
            </div>
          ))}
        </div>
      )}

      <div class="field-actions">
        <button type="button" class="btn-secondary" onClick={onDelete} disabled={deleting}>
          {deleting ? 'Removing...' : 'Delete'}
        </button>
        <button type="button" class="btn-primary" onClick={onEdit}>
          Edit
        </button>
      </div>
    </div>
  );
}
