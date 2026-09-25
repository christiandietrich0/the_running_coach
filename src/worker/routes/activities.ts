import { activityExists, setActivityOverride } from '../db';
import { readJson } from '../http';
import type { Env } from '../index';
import { buildState } from '../state';
import { parseActivityOverridePatch } from '../validation';

export async function handlePutActivityOverride(request: Request, env: Env, activityId: string): Promise<Response> {
  const exists = await activityExists(env, activityId);
  if (!exists) return Response.json({ error: `unknown activity id: ${activityId}` }, { status: 404 });

  const body = await readJson(request);
  if (!body.ok) return body.response;

  const patchResult = parseActivityOverridePatch(body.value);
  if (!patchResult.ok) return Response.json({ error: patchResult.error }, { status: 400 });

  await setActivityOverride(env, activityId, patchResult.value.isRace, patchResult.value.exclude);

  return Response.json(await buildState(env));
}
