import { upsertCheckin } from '../db';
import { readJson } from '../http';
import type { Env } from '../index';
import { buildState } from '../state';
import { parseCheckinPatch, parseWeekStart } from '../validation';

export async function handlePutCheckin(request: Request, env: Env, weekParam: string): Promise<Response> {
  const weekResult = parseWeekStart(weekParam);
  if (!weekResult.ok) return Response.json({ error: weekResult.error }, { status: 400 });

  const body = await readJson(request);
  if (!body.ok) return body.response;

  const patchResult = parseCheckinPatch(body.value);
  if (!patchResult.ok) return Response.json({ error: patchResult.error }, { status: 400 });

  await upsertCheckin(env, { weekStart: weekResult.value, ...patchResult.value });

  return Response.json(await buildState(env));
}
