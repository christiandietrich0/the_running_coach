import { useState } from 'preact/hooks';
import { runSync } from '../api';
import type { SyncResult } from '../types';

export function SyncPanel() {
  const [syncing, setSyncing] = useState(false);
  const [result, setResult] = useState<SyncResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSync() {
    setSyncing(true);
    setError(null);
    try {
      setResult(await runSync('incremental'));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSyncing(false);
    }
  }

  return (
    <div class="card">
      <div class="card-title-row">
        <div class="card-title">intervals.icu</div>
        <button type="button" class="btn-primary btn-small" onClick={handleSync} disabled={syncing}>
          {syncing ? 'Syncing...' : 'Sync now'}
        </button>
      </div>
      <p class="muted">Also syncs automatically once a day.</p>
      {error && <p class="form-error">{error}</p>}
      {result && (
        <p class="muted">
          Synced {result.activitiesStored} of {result.activitiesFetched} activities found ({result.rangeOldest} to {result.rangeNewest}).
        </p>
      )}
    </div>
  );
}
