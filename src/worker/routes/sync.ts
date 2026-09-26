import { setLastPlanUpdateAt } from '../db';
import type { Env } from '../index';
import { regeneratePlan } from './plan';
import { runSync, type SyncMode, type SyncResult } from '../sync';

// A sync (manual or the daily cron) always brings in new runs, so the plan
// is stale the moment it finishes -- future, non-user-edited weeks are
// re-run through suggestPlan() right after, same as the manual "Suggest
// plan" action, and the moment is recorded so the frontend can surface a
// one-time "Plan updated from your latest runs" note (v1.1 review round 5
// item 3). Shared by both callers (handleSync below and index.ts's cron
// handler) so neither can forget to do this.
export async function syncAndUpdatePlan(env: Env, mode: SyncMode): Promise<SyncResult> {
  const result = await runSync(env, mode);
  await regeneratePlan(env);
  await setLastPlanUpdateAt(env, new Date().toISOString());
  return result;
}

export async function handleSync(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const modeParam = url.searchParams.get('mode');
  const mode: SyncMode = modeParam === 'backfill' ? 'backfill' : 'incremental';

  try {
    const result = await syncAndUpdatePlan(env, mode);
    return Response.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return Response.json({ error: message }, { status: 502 });
  }
}
