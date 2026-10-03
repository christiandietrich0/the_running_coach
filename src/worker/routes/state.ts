import { getLastRegeneratedVersion, setLastPlanUpdateAt, setLastRegeneratedVersion } from '../db';
import type { Env } from '../index';
import { buildState } from '../state';
import { regeneratePlan } from './plan';

// refs/corridor/flags are always computed live from raw activities/settings
// (references.ts etc.), so a deploy that changes that logic takes effect
// immediately. The *plan*'s own generated km/longRunKm/dminusM for
// non-edited future weeks are different: suggestPlan() only actually runs
// (and persists its output) on an explicit trigger -- a sync, a settings
// change, a race edit, or "Rebuild plan" -- so a deploy that changes
// suggestPlan() or the references it feeds into leaves already-persisted
// weeks showing whatever the *old* code generated until one of those fires
// (v1.1 review round 10 follow-up item 2 -- "LR 12 km" staying stale on
// the current week's plan row after a logic-changing deploy). Comparing
// against CF_VERSION_METADATA.id (a UUID Cloudflare assigns fresh to every
// deployed Worker version) catches that automatically on the very first
// state read after a deploy, with no deploy hook or build-time version
// stamp needed.
async function regenerateIfNewVersion(env: Env): Promise<void> {
  const currentVersion = env.CF_VERSION_METADATA?.id;
  if (!currentVersion) return; // not bound (e.g. an older local dev setup) -- nothing to compare against
  const lastVersion = await getLastRegeneratedVersion(env);
  if (lastVersion === currentVersion) return;

  await regeneratePlan(env);
  await setLastRegeneratedVersion(env, currentVersion);
  await setLastPlanUpdateAt(env, new Date().toISOString());
}

export async function handleState(_request: Request, env: Env): Promise<Response> {
  await regenerateIfNewVersion(env);
  const state = await buildState(env);
  // Explicit no-store: refs/corridor/flags are computed fresh on every call
  // and must never be served from a browser or edge cache left over from a
  // previous deploy -- the service worker's own networkFirst strategy
  // already prefers the network, but without this header a browser (or an
  // intermediate cache) is still free to short-circuit that fetch on its
  // own heuristics (v1.1 review round 10 follow-up item 1).
  return Response.json(state, { headers: { 'Cache-Control': 'no-store' } });
}
