import { useState } from 'preact/hooks';
import type { CheckinPatch } from '../types';

const REGIONS: { key: keyof Omit<CheckinPatch, 'reducedTraining'>; label: string }[] = [
  { key: 'heel', label: 'Heel / foot' },
  { key: 'achilles', label: 'Achilles / calf' },
  { key: 'knee', label: 'Knee' },
  { key: 'hipOther', label: 'Hip / other' },
];

export function CheckinSheet({
  onSave,
  onSkip,
  saving,
}: {
  onSave: (patch: CheckinPatch) => void;
  onSkip: () => void;
  saving: boolean;
}) {
  const [scores, setScores] = useState({ heel: 0, achilles: 0, knee: 0, hipOther: 0 });
  const [reducedTraining, setReducedTraining] = useState(false);

  function setScore(key: keyof typeof scores, value: number) {
    setScores((s) => ({ ...s, [key]: value }));
  }

  function handleSubmit(e: Event) {
    e.preventDefault();
    onSave({ ...scores, reducedTraining });
  }

  return (
    <div class="sheet-overlay">
      <div class="sheet">
        <div class="sheet-title">Weekly check-in</div>
        <p class="muted">How sore is each region right now, 0 (nothing) to 10 (can't run on it)?</p>

        <form onSubmit={handleSubmit}>
          {REGIONS.map((r) => (
            <label class="checkin-region" key={r.key}>
              <div class="checkin-region-top">
                <span>{r.label}</span>
                <span class="checkin-score">{scores[r.key]}</span>
              </div>
              <input
                type="range"
                min="0"
                max="10"
                step="1"
                value={scores[r.key]}
                onInput={(e) => setScore(r.key, Number(e.currentTarget.value))}
              />
            </label>
          ))}

          <label class="checkin-toggle">
            <input type="checkbox" checked={reducedTraining} onChange={(e) => setReducedTraining(e.currentTarget.checked)} />
            <span>Did pain make you reduce training last week?</span>
          </label>

          <div class="field-actions">
            <button type="button" class="btn-secondary" onClick={onSkip} disabled={saving}>
              Skip for now
            </button>
            <button type="submit" class="btn-primary" disabled={saving}>
              {saving ? 'Saving...' : 'Save check-in'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
