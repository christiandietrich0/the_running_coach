import { useState } from 'preact/hooks';
import { previewPlan, putPlanWeek, resetPlanWeek, suggestPlan } from '../api';
import { PlanWeekEditForm } from '../components/PlanWeekEditForm';
import { PlanWeekRow } from '../components/PlanWeekRow';
import type { PlanWeekPatch, StateResponse, WeekState } from '../types';

// A race's taper + race + post-race recovery weeks, grouped visually so
// the whole race block reads as one unit (v1.1 UI pass). The plain Down
// week two weeks after a race is ordinary cadence again, not part of the
// group.
function groupKey(week: WeekState): number | null {
  return week.taperForRaceId ?? week.raceId ?? week.recoveryForRaceId ?? null;
}

function groupWeeks(weeks: WeekState[]): WeekState[][] {
  const groups: WeekState[][] = [];
  let current: WeekState[] = [];
  let currentKey: number | null = null;

  for (const week of weeks) {
    const key = groupKey(week);
    if (key != null && key === currentKey) {
      current.push(week);
    } else {
      if (current.length > 0) groups.push(current);
      current = [week];
      currentKey = key;
    }
  }
  if (current.length > 0) groups.push(current);
  return groups;
}

export function Plan({ state, onStateChange }: { state: StateResponse; onStateChange: (s: StateResponse) => void }) {
  const [editingWeek, setEditingWeek] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [applying, setApplying] = useState(false);
  const [diff, setDiff] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const upcoming = state.weeks.filter((w) => w.weekStart >= state.currentWeekStart);
  const groups = groupWeeks(upcoming);

  async function handleSave(weekStart: string, patch: PlanWeekPatch) {
    setSaving(true);
    setError(null);
    try {
      const next = await putPlanWeek(weekStart, patch);
      onStateChange(next);
      setEditingWeek(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  async function handleReset(weekStart: string) {
    setResetting(true);
    setError(null);
    try {
      const next = await resetPlanWeek(weekStart);
      onStateChange(next);
      setEditingWeek(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setResetting(false);
    }
  }

  async function handleRebuildPlan() {
    setPreviewing(true);
    setError(null);
    try {
      const result = await previewPlan();
      setDiff(result.changedWeeks);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setPreviewing(false);
    }
  }

  async function handleApplyRebuild() {
    setApplying(true);
    setError(null);
    try {
      const next = await suggestPlan();
      onStateChange(next);
      setDiff(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setApplying(false);
    }
  }

  return (
    <div class="screen">
      <div class="card">
        <div class="card-title-row">
          <div class="card-title">Plan</div>
          <button type="button" class="btn-primary btn-small" onClick={handleRebuildPlan} disabled={previewing || applying}>
            {previewing ? 'Checking...' : 'Rebuild plan'}
          </button>
        </div>
        <p class="muted plan-hint">Tap a week to edit it. Edited and Limited weeks are never touched by Rebuild plan.</p>
        {error && <p class="form-error">{error}</p>}

        {diff != null && (
          <div class="diff-banner">
            <span class="diff-banner-text">
              {diff.length === 0 ? 'Already up to date -- nothing to change.' : `${diff.length} week${diff.length === 1 ? '' : 's'} will change.`}
            </span>
            <div class="diff-banner-actions">
              {diff.length > 0 && (
                <button type="button" class="btn-primary btn-small" onClick={handleApplyRebuild} disabled={applying}>
                  {applying ? 'Applying...' : 'Apply'}
                </button>
              )}
              <button type="button" class="btn-secondary btn-small" onClick={() => setDiff(null)} disabled={applying}>
                {diff.length === 0 ? 'Dismiss' : 'Cancel'}
              </button>
            </div>
          </div>
        )}

        <div class="plan-list">
          {groups.map((group) => {
            const rows = group.map((week) =>
              editingWeek === week.weekStart ? (
                <div class="plan-row-editing" key={week.weekStart}>
                  <PlanWeekEditForm
                    week={week}
                    saving={saving}
                    onSave={(patch) => handleSave(week.weekStart, patch)}
                    onCancel={() => setEditingWeek(null)}
                    onReset={() => handleReset(week.weekStart)}
                    resetting={resetting}
                  />
                </div>
              ) : (
                <PlanWeekRow
                  key={week.weekStart}
                  week={week}
                  isCurrent={week.weekStart === state.currentWeekStart}
                  races={state.races}
                  peakRace={week.peakForRaceId != null ? (state.races.find((r) => r.id === week.peakForRaceId) ?? null) : null}
                  maxWeekKm={state.settings.maxWeekKm as number}
                  onClick={() => setEditingWeek(week.weekStart)}
                />
              ),
            );
            const isRaceGroup = group.length > 1 && groupKey(group[0]) != null;
            return isRaceGroup ? (
              <div class="plan-group" key={group[0].weekStart}>
                {rows}
              </div>
            ) : (
              rows
            );
          })}
        </div>
      </div>
    </div>
  );
}
