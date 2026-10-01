import { daysUntil, fmtKm, fmtKmCap, fmtM, fmtShortDate } from '../format';
import { FEASIBILITY_LABEL } from '../labels';
import type { RaceState, WeekState } from '../types';

function fmtDate(dateStr: string): string {
  return new Date(`${dateStr}T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
}

export function RaceCard({
  race,
  today,
  peakWeekKm,
  weeksByStart,
  onEdit,
  onDelete,
  deleting,
}: {
  race: RaceState;
  today: string;
  // The plan's own generated peak week's km for this race, looked up by
  // the caller from state.weeks via peakForRaceId (v1.1 review round 6) --
  // the real, already-clamped target, not feasibility's own growth-rate
  // estimate (which projects C forward at a fixed rate and can read more
  // optimistic than what suggestPlan() actually generates, since C is a
  // rolling mean, not a value that jumps straight to a new level). The
  // caller reads the week's *planned* figure specifically, never a
  // reference blend or a not-yet-run actual, so a peak week that hasn't
  // started yet never reads as "capped at 0" (v1.1 review round 9 item
  // 1). Falls back to feasibility.maxReachableWeekKm only when no such
  // week exists yet (e.g. the plan hasn't been regenerated since the race
  // was added).
  peakWeekKm: number | null;
  // state.weeks keyed by weekStart, so the taper block can show each
  // taper week's actual generated km and date (v1.1 UI pass) instead of
  // just its volume fraction.
  weeksByStart: Map<string, WeekState>;
  onEdit: () => void;
  onDelete: () => void;
  deleting: boolean;
}) {
  const days = daysUntil(race.date, today);
  const { targets, feasibility } = race;
  const cappedAtKm = peakWeekKm ?? feasibility?.maxReachableWeekKm;

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

      {feasibility &&
        (feasibility.status === 'LOCKED_IN' ? (
          // No more building left to project inside the race's own final
          // weeks (v1.1 review round 10 follow-up item 4) -- a Tight/Not-
          // reachable verdict here would just restate a shortfall nothing
          // can still close, so show what's actually been banked instead.
          <div class="race-meta">
            <span class="pill">
              Peak long run done:{' '}
              {race.peakLongRunDoneKm != null ? `${fmtKm(race.peakLongRunDoneKm)} km (${fmtShortDate(race.peakLongRunDoneDate!)})` : '--'}
            </span>
            {feasibility.lastBuildStatus != null && (
              <span class="muted">
                Build ended: {FEASIBILITY_LABEL[feasibility.lastBuildStatus].toLowerCase()} (
                {fmtKmCap(feasibility.lastBuildMaxReachableLongRunKm ?? 0)} of {fmtKmCap(targets.peakLongRunKm)} km)
              </span>
            )}
          </div>
        ) : (
          <div class="race-meta">
            <span class={`pill pill-${feasibility.status.toLowerCase()}`}>{FEASIBILITY_LABEL[feasibility.status]}</span>
            <span class="muted">
              Long run reachable: {fmtKmCap(feasibility.maxReachableLongRunKm)} km (target {fmtKmCap(targets.peakLongRunKm)} km)
            </span>
            {cappedAtKm != null && cappedAtKm < targets.peakWeekEffortKm - 0.5 && (
              <span class="muted">
                Peak week capped at {fmtKmCap(cappedAtKm)} km (race target {fmtKmCap(targets.peakWeekEffortKm)} km)
              </span>
            )}
          </div>
        ))}

      <div class="race-targets">
        {feasibility?.status === 'LOCKED_IN' && <div class="stat-label">Targets</div>}
        <div class="race-target-row">
          <span class="muted">Peak long run</span>
          <span>{fmtKmCap(targets.peakLongRunKm)} km</span>
        </div>
        <div class="race-target-row">
          <span class="muted">Peak week</span>
          <span>{fmtKmCap(targets.peakWeekEffortKm)} effort-km</span>
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
          {targets.taper.map((t) => {
            const week = weeksByStart.get(t.weekStart);
            // The race week's own kmWeek is the race distance plus any
            // shakeout runs added on top of it (raceWeekShakeouts,
            // defaults.ts), so showing it as one summed number reads as a
            // much bigger training week than it is -- "10 km + race" splits
            // the shakeouts back out from the race itself (v1.1 review
            // round 10 follow-up, final pre-1.0 pass item 4).
            const isRaceWeek = t.label === 'race week';
            const trainingKm = isRaceWeek && week ? Math.max(0, week.kmWeek - race.km) : null;
            return (
              <div class="taper-row" key={t.weekStart}>
                <span class="taper-row-label">
                  {t.label}
                  <span class="taper-row-date">{fmtShortDate(t.weekStart)}</span>
                </span>
                <span>{trainingKm != null ? `${fmtKmCap(trainingKm)} km + race` : week ? `${fmtKmCap(week.kmWeek)} km` : '--'}</span>
              </div>
            );
          })}
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
