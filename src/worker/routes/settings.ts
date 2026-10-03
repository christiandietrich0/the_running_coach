import { setLastPlanUpdateAt } from '../db';
import { readJson } from '../http';
import type { Env } from '../index';
import { regeneratePlan } from './plan';
import { setSettings } from '../settings-store';
import { buildState } from '../state';
import { parseSettingsPatch } from '../validation';

export async function handlePutSettings(request: Request, env: Env): Promise<Response> {
  const body = await readJson(request);
  if (!body.ok) return body.response;

  const patchResult = parseSettingsPatch(body.value);
  if (!patchResult.ok) return Response.json({ error: patchResult.error }, { status: 400 });

  await setSettings(env, patchResult.value);
  // A settings change (e.g. a different cap factor, or the TIGHT threshold)
  // can change what suggestPlan() would generate for non-edited future
  // weeks, so re-run it the same way a sync does -- otherwise those weeks
  // silently keep showing whatever the old settings produced (v1.1 review
  // round 10 follow-up item 2).
  await regeneratePlan(env);
  await setLastPlanUpdateAt(env, new Date().toISOString());

  return Response.json(await buildState(env));
}
