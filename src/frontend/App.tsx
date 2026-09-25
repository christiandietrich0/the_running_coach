import { useEffect, useState } from 'preact/hooks';
import { fetchState } from './api';
import { TabBar, type ScreenId } from './components/TabBar';
import { Chart } from './screens/Chart';
import { Plan } from './screens/Plan';
import { Races } from './screens/Races';
import { ThisWeek } from './screens/ThisWeek';
import type { StateResponse } from './types';

export function App() {
  const [state, setState] = useState<StateResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [screen, setScreen] = useState<ScreenId>('week');

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
      {state && (
        <>
          {screen === 'week' && <ThisWeek state={state} />}
          {screen === 'chart' && <Chart state={state} />}
          {screen === 'plan' && <Plan state={state} onStateChange={setState} />}
          {screen === 'races' && <Races state={state} onStateChange={setState} />}
          <TabBar active={screen} onChange={setScreen} />
        </>
      )}
    </div>
  );
}
