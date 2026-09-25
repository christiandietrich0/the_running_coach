import { useState } from 'preact/hooks';
import { putSettings } from '../api';
import { getPath, setPath, SETTINGS_GROUPS } from '../settingsFields';
import type { Settings, StateResponse } from '../types';

export function SettingsForm({ state, onStateChange }: { state: StateResponse; onStateChange: (s: StateResponse) => void }) {
  const [draft, setDraft] = useState<Record<string, unknown>>(() => structuredClone(state.settings));
  const [includeHikes, setIncludeHikes] = useState(Boolean(state.settings.includeHikes));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  function updateField(path: string[], value: number) {
    setDraft((d) => setPath(d, path, value));
  }

  async function handleSave(e: Event) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const original = state.settings as Record<string, unknown>;
      const patch: Record<string, unknown> = {};
      for (const key of Object.keys(draft)) {
        if (JSON.stringify(draft[key]) !== JSON.stringify(original[key])) patch[key] = draft[key];
      }
      if (includeHikes !== Boolean(original.includeHikes)) patch.includeHikes = includeHikes;

      if (Object.keys(patch).length === 0) {
        setSavedAt(Date.now());
        return;
      }

      const next = await putSettings(patch as Partial<Settings>);
      onStateChange(next);
      setDraft(structuredClone(next.settings));
      setSavedAt(Date.now());
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSave}>
      <div class="card">
        <div class="card-title">Activity types</div>
        <label class="checkin-toggle">
          <input type="checkbox" checked={includeHikes} onChange={(e) => setIncludeHikes(e.currentTarget.checked)} />
          <span>Include Walk and Hike activities</span>
        </label>
      </div>

      {SETTINGS_GROUPS.map((group) => (
        <div class="card" key={group.title}>
          <div class="card-title">{group.title}</div>
          <div class="settings-grid">
            {group.fields.map((field) => (
              <label class="field" key={field.path.join('.')}>
                <span>{field.label}</span>
                <input
                  type="number"
                  step={field.step}
                  value={getPath(draft, field.path)}
                  onInput={(e) => updateField(field.path, Number(e.currentTarget.value))}
                />
              </label>
            ))}
          </div>
        </div>
      ))}

      <div class="card">
        {error && <p class="form-error">{error}</p>}
        {savedAt && !error && <p class="muted">Saved.</p>}
        <button type="submit" class="btn-primary" disabled={saving}>
          {saving ? 'Saving...' : 'Save settings'}
        </button>
      </div>
    </form>
  );
}
