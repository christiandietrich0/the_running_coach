import { useState } from 'preact/hooks';
import { WEEK_TYPE_LABEL, WEEK_TYPES } from '../labels';
import type { PlanWeekPatch, WeekState } from '../types';

function numOrNull(value: string): number | null {
  if (value.trim() === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export function PlanWeekEditForm({
  week,
  saving,
  onSave,
  onCancel,
}: {
  week: WeekState;
  saving: boolean;
  onSave: (patch: PlanWeekPatch) => void;
  onCancel: () => void;
}) {
  const initialDplusM = Math.round(Math.max(0, (week.effortKmWeek - week.kmWeek) * 100));

  const [type, setType] = useState(week.type);
  const [km, setKm] = useState(String(Math.round(week.kmWeek)));
  const [longRunKm, setLongRunKm] = useState(String(Math.round(week.longestKm)));
  const [dplusM, setDplusM] = useState(String(initialDplusM));
  const [dminusM, setDminusM] = useState(String(Math.round(week.dminusWeek)));
  const [limitedDays, setLimitedDays] = useState(week.limitedDays != null ? String(week.limitedDays) : '');
  const [limitedKmCap, setLimitedKmCap] = useState(week.limitedKmCap != null ? String(week.limitedKmCap) : '');

  function handleSave(e: Event) {
    e.preventDefault();
    onSave({
      type,
      km: numOrNull(km),
      longRunKm: numOrNull(longRunKm),
      dplusM: numOrNull(dplusM),
      dminusM: numOrNull(dminusM),
      limitedDays: type === 'LIMITED' ? numOrNull(limitedDays) : null,
      limitedKmCap: type === 'LIMITED' ? numOrNull(limitedKmCap) : null,
    });
  }

  return (
    <form class="edit-form" onSubmit={handleSave}>
      <label class="field">
        <span>Type</span>
        <select value={type} onChange={(e) => setType(e.currentTarget.value as typeof type)}>
          {WEEK_TYPES.map((t) => (
            <option key={t} value={t}>
              {WEEK_TYPE_LABEL[t]}
            </option>
          ))}
        </select>
      </label>

      <div class="field-row">
        <label class="field">
          <span>Km</span>
          <input type="number" inputMode="decimal" value={km} onInput={(e) => setKm(e.currentTarget.value)} />
        </label>
        <label class="field">
          <span>Long run (km)</span>
          <input type="number" inputMode="decimal" value={longRunKm} onInput={(e) => setLongRunKm(e.currentTarget.value)} />
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

      {type === 'LIMITED' && (
        <div class="field-row">
          <label class="field">
            <span>Days available</span>
            <input type="number" inputMode="numeric" value={limitedDays} onInput={(e) => setLimitedDays(e.currentTarget.value)} />
          </label>
          <label class="field">
            <span>Km cap</span>
            <input type="number" inputMode="decimal" value={limitedKmCap} onInput={(e) => setLimitedKmCap(e.currentTarget.value)} />
          </label>
        </div>
      )}

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
