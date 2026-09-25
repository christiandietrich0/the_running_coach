import type { ActivityDTO, ActivityOverridePatch, CheckinPatch, PlanWeekPatch, RacePatch, Settings, StateResponse, SyncResult } from './types';

async function readStateOrThrow(res: Response, what: string): Promise<StateResponse> {
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    const detail = body && typeof body === 'object' && 'error' in body ? String((body as { error: unknown }).error) : res.statusText;
    throw new Error(`${what} failed: ${detail}`);
  }
  return res.json();
}

export async function fetchState(): Promise<StateResponse> {
  const res = await fetch('/api/state');
  return readStateOrThrow(res, 'GET /api/state');
}

export async function putPlanWeek(weekStart: string, patch: PlanWeekPatch): Promise<StateResponse> {
  const res = await fetch(`/api/plan/${weekStart}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  });
  return readStateOrThrow(res, 'PUT /api/plan/:week');
}

export async function suggestPlan(): Promise<StateResponse> {
  const res = await fetch('/api/plan/suggest', { method: 'POST' });
  return readStateOrThrow(res, 'POST /api/plan/suggest');
}

export async function putRace(id: number | 'new', patch: RacePatch): Promise<StateResponse> {
  const res = await fetch(`/api/races/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  });
  return readStateOrThrow(res, 'PUT /api/races/:id');
}

export async function deleteRace(id: number): Promise<StateResponse> {
  const res = await fetch(`/api/races/${id}`, { method: 'DELETE' });
  return readStateOrThrow(res, 'DELETE /api/races/:id');
}

export async function putCheckin(weekStart: string, patch: CheckinPatch): Promise<StateResponse> {
  const res = await fetch(`/api/checkin/${weekStart}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  });
  return readStateOrThrow(res, 'PUT /api/checkin/:week');
}

export async function putSettings(patch: Partial<Settings>): Promise<StateResponse> {
  const res = await fetch('/api/settings', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  });
  return readStateOrThrow(res, 'PUT /api/settings');
}

export async function runSync(mode: 'backfill' | 'incremental'): Promise<SyncResult> {
  const res = await fetch(`/api/sync?mode=${mode}`, { method: 'POST' });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    const detail = body && typeof body === 'object' && 'error' in body ? String((body as { error: unknown }).error) : res.statusText;
    throw new Error(`POST /api/sync failed: ${detail}`);
  }
  return res.json();
}

export async function fetchActivities(): Promise<ActivityDTO[]> {
  const res = await fetch('/api/activities');
  if (!res.ok) throw new Error(`GET /api/activities failed: ${res.status}`);
  const body = (await res.json()) as { activities: ActivityDTO[] };
  return body.activities;
}

export async function putActivityOverride(id: string, patch: ActivityOverridePatch): Promise<StateResponse> {
  const res = await fetch(`/api/activities/${id}/override`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  });
  return readStateOrThrow(res, 'PUT /api/activities/:id/override');
}
