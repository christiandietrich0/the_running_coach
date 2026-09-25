export type ScreenId = 'week' | 'chart' | 'plan' | 'races' | 'settings';

const TABS: { id: ScreenId; label: string }[] = [
  { id: 'week', label: 'This Week' },
  { id: 'chart', label: 'Chart' },
  { id: 'plan', label: 'Plan' },
  { id: 'races', label: 'Races' },
  { id: 'settings', label: 'Settings' },
];

export function TabBar({ active, onChange }: { active: ScreenId; onChange: (id: ScreenId) => void }) {
  return (
    <nav class="tab-bar">
      {TABS.map((tab) => (
        <button key={tab.id} class={`tab-button${tab.id === active ? ' tab-button-active' : ''}`} onClick={() => onChange(tab.id)}>
          {tab.label}
        </button>
      ))}
    </nav>
  );
}
