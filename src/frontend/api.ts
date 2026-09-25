import type { StateResponse } from './types';

export async function fetchState(): Promise<StateResponse> {
  const res = await fetch('/api/state');
  if (!res.ok) throw new Error(`GET /api/state failed: ${res.status}`);
  return res.json();
}
