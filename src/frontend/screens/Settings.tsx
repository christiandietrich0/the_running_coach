import { ActivityOverrideList } from '../components/ActivityOverrideList';
import { SettingsForm } from '../components/SettingsForm';
import { SyncPanel } from '../components/SyncPanel';
import type { StateResponse } from '../types';

export function Settings({ state, onStateChange }: { state: StateResponse; onStateChange: (s: StateResponse) => void }) {
  return (
    <div class="screen">
      <SyncPanel />
      <SettingsForm state={state} onStateChange={onStateChange} />
      <ActivityOverrideList onStateChange={onStateChange} />
    </div>
  );
}
