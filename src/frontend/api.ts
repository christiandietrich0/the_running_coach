import type { PlanWeekPatch, RacePatch, StateResponse } from './types';

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
