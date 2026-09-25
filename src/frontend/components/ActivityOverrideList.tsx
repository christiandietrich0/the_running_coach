import { useEffect, useState } from 'preact/hooks';
import { fetchActivities, putActivityOverride } from '../api';
import type { ActivityDTO, StateResponse } from '../types';

function fmtDate(startLocal: string): string {
  return new Date(`${startLocal.slice(0, 10)}T00:00:00Z`).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

export function ActivityOverrideList({ onStateChange }: { onStateChange: (s: StateResponse) => void }) {
  const [activities, setActivities] = useState<ActivityDTO[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);

  useEffect(() => {
    fetchActivities()
      .then(setActivities)
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, []);

  async function apply(a: ActivityDTO, isRace: boolean, exclude: boolean) {
    setPendingId(a.id);
    setError(null);
    try {
      const state = await putActivityOverride(a.id, { isRace, exclude });
      onStateChange(state);
      setActivities((list) => list?.map((x) => (x.id === a.id ? { ...x, overrideIsRace: isRace, excluded: exclude, effectiveIsRace: isRace } : x)) ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setPendingId(null);
    }
  }

  return (
    <div class="card">
      <div class="card-title">Race overrides</div>
      <p class="muted plan-hint">Fix a race intervals.icu didn't tag, or exclude a bad GPS file.</p>
      {error && <p class="form-error">{error}</p>}
      {!activities && !error && <p class="muted">Loading activities...</p>}
      {activities && (
        <div class="activity-list">
          {activities.map((a) => (
            <div class={`activity-row${a.excluded ? ' activity-row-excluded' : ''}`} key={a.id}>
              <div class="activity-row-main">
                <div class="activity-row-date">{fmtDate(a.startLocal)}</div>
                <div class="muted">
                  {a.type} · {(a.distanceM / 1000).toFixed(1)} km
                </div>
              </div>
              <div class="activity-row-actions">
                <button
                  type="button"
                  class={`chip-toggle${a.effectiveIsRace ? ' chip-toggle-active' : ''}`}
                  onClick={() => apply(a, !a.effectiveIsRace, a.excluded)}
                  disabled={pendingId === a.id}
                >
                  Race
                </button>
                <button
                  type="button"
                  class={`chip-toggle${a.excluded ? ' chip-toggle-active' : ''}`}
                  onClick={() => apply(a, a.effectiveIsRace, !a.excluded)}
                  disabled={pendingId === a.id}
                >
                  Exclude
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
