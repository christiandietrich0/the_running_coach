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

// Which lastPlanUpdateAt the "Plan updated from your latest runs" note (v1.1
// review round 5 item 3) has already been shown and dismissed for -- a
// sync-triggered regeneration is a one-time event per timestamp, not a
// per-week thing like the check-in prompt above.
const PLAN_UPDATE_KEY = 'wlp-last-seen-plan-update';

export function getLastSeenPlanUpdate(): string | null {
  try {
    return localStorage.getItem(PLAN_UPDATE_KEY);
  } catch {
    return null;
  }
}

export function setLastSeenPlanUpdate(lastPlanUpdateAt: string): void {
  try {
    localStorage.setItem(PLAN_UPDATE_KEY, lastPlanUpdateAt);
  } catch {
    // ignore
  }
}
