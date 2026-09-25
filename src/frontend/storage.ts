// Per-viewer convenience only (which week's check-in prompt was already
// skipped this session) -- never state the app depends on being correct.
// Wrapped in try/catch: private browsing, blocked storage, etc. should
// degrade to "always show the prompt," not break the app.

const PREFIX = 'wlp-checkin-dismissed-';

export function isCheckinDismissed(weekStart: string): boolean {
  try {
    return localStorage.getItem(PREFIX + weekStart) === '1';
  } catch {
    return false;
  }
}

export function dismissCheckin(weekStart: string): void {
  try {
    localStorage.setItem(PREFIX + weekStart, '1');
  } catch {
    // ignore
  }
}
