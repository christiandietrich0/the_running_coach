import { useEffect, useState } from 'preact/hooks';
import { fetchState } from './api';
import { ThisWeek } from './screens/ThisWeek';
import type { StateResponse } from './types';

export function App() {
  const [state, setState] = useState<StateResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchState()
      .then(setState)
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, []);

  return (
    <div>
      <h1 class="app-title">Weekly Load Planner</h1>
      {error && (
        <div class="card">
          <p class="muted">Could not load your data: {error}</p>
        </div>
      )}
      {!error && !state && (
        <div class="card">
          <p class="muted">Loading...</p>
        </div>
      )}
      {state && <ThisWeek state={state} />}
    </div>
  );
}
