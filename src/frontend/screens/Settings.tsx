import { useState } from 'preact/hooks';
import { ActivityOverrideList } from '../components/ActivityOverrideList';
import { MethodologySheet } from '../components/MethodologySheet';
import { SettingsForm } from '../components/SettingsForm';
import { SyncPanel } from '../components/SyncPanel';
import type { StateResponse } from '../types';

export function Settings({ state, onStateChange }: { state: StateResponse; onStateChange: (s: StateResponse) => void }) {
  const [showMethodology, setShowMethodology] = useState(false);

  return (
    <div class="screen">
      <button type="button" class="card method-row" onClick={() => setShowMethodology(true)}>
        <svg class="method-row-icon" viewBox="0 0 20 20" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <circle cx="10" cy="10" r="8" />
          <path d="M10 9.2 V14.2 M10 6.3 H10.01" />
        </svg>
        <span>How Legroom works</span>
      </button>

      <SyncPanel />
      <SettingsForm state={state} onStateChange={onStateChange} />
      <ActivityOverrideList onStateChange={onStateChange} />

      {showMethodology && <MethodologySheet onClose={() => setShowMethodology(false)} />}
    </div>
  );
}
