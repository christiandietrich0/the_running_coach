import { useState } from 'preact/hooks';
import { putPlanWeek, resetPlanWeek, suggestPlan } from '../api';
import { PlanWeekEditForm } from '../components/PlanWeekEditForm';
import { PlanWeekRow } from '../components/PlanWeekRow';
import type { PlanWeekPatch, StateResponse } from '../types';

export function Plan({ state, onStateChange }: { state: StateResponse; onStateChange: (s: StateResponse) => void }) {
  const [editingWeek, setEditingWeek] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [suggesting, setSuggesting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const upcoming = state.weeks.filter((w) => w.weekStart >= state.currentWeekStart);

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

  async function handleSuggest() {
    setSuggesting(true);
    setError(null);
    try {
      const next = await suggestPlan();
      onStateChange(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSuggesting(false);
    }
  }

  return (
    <div class="screen">
      <div class="card">
        <div class="card-title-row">
          <div class="card-title">Plan</div>
          <button type="button" class="btn-primary btn-small" onClick={handleSuggest} disabled={suggesting}>
            {suggesting ? 'Suggesting...' : 'Suggest plan'}
          </button>
        </div>
        <p class="muted plan-hint">Tap a week to edit it. Edited and Limited weeks are never touched by Suggest plan.</p>
        {error && <p class="form-error">{error}</p>}

        <div class="plan-list">
          {upcoming.map((week) =>
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
                peakRace={week.peakForRaceId != null ? (state.races.find((r) => r.id === week.peakForRaceId) ?? null) : null}
                onClick={() => setEditingWeek(week.weekStart)}
              />
            ),
          )}
        </div>
      </div>
    </div>
  );
}
