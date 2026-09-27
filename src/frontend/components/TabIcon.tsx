import type { ScreenId } from './TabBar';

// Simple stroke-based glyphs, 22x22, currentColor so they inherit the tab
// button's own colour (muted or active accent) without any extra prop
// (v1.1 mobile polish).
const PATHS: Record<ScreenId, string> = {
  week: 'M4 11 L11 4 L18 11 M6 9.5 V19 H16 V9.5 M9.5 19 V13.5 H12.5 V19',
  chart: 'M4 19 V4 M4 19 H19 M7.5 16 V11 M11.5 16 V7 M15.5 16 V13',
  plan: 'M5 5 H17 V18 H5 Z M5 9 H17 M8 3 V6.5 M14 3 V6.5 M8 13 H8.01 M11 13 H11.01 M14 13 H14.01',
  races: 'M6 3 V19 M6 4.5 H16 L13.5 7.5 L16 10.5 H6',
  settings:
    'M11 3.5 H12.7 L13.2 5.9 A6.9 6.9 0 0 1 14.9 6.8 L17.1 5.9 L18.2 7.9 L16.4 9.4 A6.9 6.9 0 0 1 16.4 11.1 L18.2 12.6 L17.1 14.6 L14.9 13.7 A6.9 6.9 0 0 1 13.2 14.6 L12.7 17 H11 L10.5 14.6 A6.9 6.9 0 0 1 8.8 13.7 L6.6 14.6 L5.5 12.6 L7.3 11.1 A6.9 6.9 0 0 1 7.3 9.4 L5.5 7.9 L6.6 5.9 L8.8 6.8 A6.9 6.9 0 0 1 10.5 5.9 Z M9.5 10.75 A2.25 2.25 0 1 0 13.5 10.75 A2.25 2.25 0 1 0 9.5 10.75',
};

export function TabIcon({ id }: { id: ScreenId }) {
  return (
    <svg class="tab-icon" viewBox="0 0 22 22" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d={PATHS[id]} />
    </svg>
  );
}
