import { useState } from 'preact/hooks';
import { deleteRace, putRace } from '../api';
import { RaceCard } from '../components/RaceCard';
import { RaceForm } from '../components/RaceForm';
import type { RacePatch, RaceState, StateResponse } from '../types';

type EditTarget = 'new' | number | null;

export function Races({ state, onStateChange }: { state: StateResponse; onStateChange: (s: StateResponse) => void }) {
  const [editing, setEditing] = useState<EditTarget>(null);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const races = [...state.races].sort((a, b) => (a.date < b.date ? -1 : 1));
  const editingRace: RaceState | null = typeof editing === 'number' ? (races.find((r) => r.id === editing) ?? null) : null;

  async function handleSave(patch: RacePatch) {
    setSaving(true);
    setError(null);
    try {
      const id = typeof editing === 'number' ? editing : 'new';
      const next = await putRace(id, patch);
      onStateChange(next);
      setEditing(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: number) {
    setDeletingId(id);
    setError(null);
    try {
      const next = await deleteRace(id);
      onStateChange(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div class="screen">
      <div class="card">
        <div class="card-title-row">
          <div class="card-title">Races</div>
          {editing === null && (
            <button type="button" class="btn-primary btn-small" onClick={() => setEditing('new')}>
              Add race
            </button>
          )}
        </div>
        {error && <p class="form-error">{error}</p>}
        {editing === 'new' && <RaceForm race={null} saving={saving} onSave={handleSave} onCancel={() => setEditing(null)} />}
      </div>

      {races.length === 0 && editing === null && (
        <div class="card">
          <p class="muted">No races yet. Add one to see targets, taper and feasibility.</p>
        </div>
      )}

      {races.map((race) =>
        editing === race.id ? (
          <div class="card" key={race.id}>
            <div class="card-title">Edit race</div>
            <RaceForm race={editingRace} saving={saving} onSave={handleSave} onCancel={() => setEditing(null)} />
          </div>
        ) : (
          <RaceCard
            key={race.id}
            race={race}
            today={state.today}
            peakWeekKm={state.weeks.find((w) => w.peakForRaceId === race.id)?.kmWeek ?? null}
            onEdit={() => setEditing(race.id)}
            onDelete={() => handleDelete(race.id)}
            deleting={deletingId === race.id}
          />
        ),
      )}
    </div>
  );
}
