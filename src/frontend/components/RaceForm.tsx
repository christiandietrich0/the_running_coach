import { useState } from 'preact/hooks';
import type { RacePatch, RaceState } from '../types';

function numOrNull(value: string): number | null {
  if (value.trim() === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export function RaceForm({
  race,
  saving,
  onSave,
  onCancel,
}: {
  race: RaceState | null;
  saving: boolean;
  onSave: (patch: RacePatch) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(race?.name ?? '');
  const [date, setDate] = useState(race?.date ?? '');
  const [km, setKm] = useState(race ? String(race.km) : '');
  const [dplusM, setDplusM] = useState(race ? String(race.dplusM) : '');
  const [dminusM, setDminusM] = useState(race ? String(race.dminusM) : '');
  const [targetTimeMin, setTargetTimeMin] = useState(race?.targetTimeMin != null ? String(race.targetTimeMin) : '');
  const [priority, setPriority] = useState<RacePatch['priority']>(race?.priority ?? 'A');
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(e: Event) {
    e.preventDefault();
    setError(null);

    if (name.trim().length === 0) return setError('Name is required.');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return setError('Pick a date.');
    const kmNum = numOrNull(km);
    const dplusNum = numOrNull(dplusM);
    const dminusNum = numOrNull(dminusM);
    if (kmNum == null || kmNum <= 0) return setError('Distance must be a positive number.');
    if (dplusNum == null || dplusNum < 0) return setError('D+ must be 0 or more.');
    if (dminusNum == null || dminusNum < 0) return setError('D- must be 0 or more.');

    onSave({
      name: name.trim(),
      date,
      km: kmNum,
      dplusM: dplusNum,
      dminusM: dminusNum,
      targetTimeMin: numOrNull(targetTimeMin),
      priority,
    });
  }

  return (
    <form class="edit-form" onSubmit={handleSubmit}>
      <label class="field">
        <span>Name</span>
        <input type="text" value={name} onInput={(e) => setName(e.currentTarget.value)} placeholder="Race name" />
      </label>

      <div class="field-row">
        <label class="field">
          <span>Date</span>
          <input type="date" value={date} onInput={(e) => setDate(e.currentTarget.value)} />
        </label>
        <label class="field">
          <span>Priority</span>
          <select value={priority} onChange={(e) => setPriority(e.currentTarget.value as RacePatch['priority'])}>
            <option value="A">A</option>
            <option value="B">B</option>
            <option value="C">C</option>
          </select>
        </label>
      </div>

      <div class="field-row">
        <label class="field">
          <span>Distance (km)</span>
          <input type="number" inputMode="decimal" value={km} onInput={(e) => setKm(e.currentTarget.value)} />
        </label>
        <label class="field">
          <span>Target time (min)</span>
          <input type="number" inputMode="numeric" value={targetTimeMin} onInput={(e) => setTargetTimeMin(e.currentTarget.value)} />
        </label>
      </div>

      <div class="field-row">
        <label class="field">
          <span>D+ (m)</span>
          <input type="number" inputMode="decimal" value={dplusM} onInput={(e) => setDplusM(e.currentTarget.value)} />
        </label>
        <label class="field">
          <span>D- (m)</span>
          <input type="number" inputMode="decimal" value={dminusM} onInput={(e) => setDminusM(e.currentTarget.value)} />
        </label>
      </div>

      {error && <p class="form-error">{error}</p>}

      <div class="field-actions">
        <button type="button" class="btn-secondary" onClick={onCancel} disabled={saving}>
          Cancel
        </button>
        <button type="submit" class="btn-primary" disabled={saving}>
          {saving ? 'Saving...' : 'Save'}
        </button>
      </div>
    </form>
  );
}
