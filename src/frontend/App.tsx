import { useEffect, useState } from 'preact/hooks';
import { fetchState, putCheckin } from './api';
import { CheckinSheet } from './components/CheckinSheet';
import { TabBar, type ScreenId } from './components/TabBar';
import { Chart } from './screens/Chart';
import { Plan } from './screens/Plan';
import { Races } from './screens/Races';
import { Settings } from './screens/Settings';
import { ThisWeek } from './screens/ThisWeek';
import { dismissCheckin, isCheckinDismissed } from './storage';
import type { CheckinPatch, StateResponse } from './types';

export function App() {
  const [state, setState] = useState<StateResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [screen, setScreen] = useState<ScreenId>('week');
  const [checkinOpen, setCheckinOpen] = useState(false);
  const [checkinSaving, setCheckinSaving] = useState(false);

  useEffect(() => {
    fetchState()
      .then((s) => {
        setState(s);
        if (s.checkinNeeded && !isCheckinDismissed(s.currentWeekStart)) setCheckinOpen(true);
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, []);

  function handleSkipCheckin() {
    if (state) dismissCheckin(state.currentWeekStart);
    setCheckinOpen(false);
  }

  async function handleSaveCheckin(patch: CheckinPatch) {
    if (!state) return;
    setCheckinSaving(true);
    try {
      const next = await putCheckin(state.currentWeekStart, patch);
      setState(next);
      setCheckinOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setCheckinSaving(false);
    }
  }

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
          {screen === 'week' && <ThisWeek state={state} onOpenCheckin={() => setCheckinOpen(true)} />}
          {screen === 'chart' && <Chart state={state} />}
          {screen === 'plan' && <Plan state={state} onStateChange={setState} />}
          {screen === 'races' && <Races state={state} onStateChange={setState} />}
          {screen === 'settings' && <Settings state={state} onStateChange={setState} />}
          <TabBar active={screen} onChange={setScreen} />
          {checkinOpen && <CheckinSheet onSave={handleSaveCheckin} onSkip={handleSkipCheckin} saving={checkinSaving} />}
        </>
      )}
    </div>
  );
}
