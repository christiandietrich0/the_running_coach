import { deleteRace, upsertRace } from '../db';
import { readJson } from '../http';
import type { Env } from '../index';
import { regeneratePlan } from './plan';
import { buildState } from '../state';
import { parseId, parseRacePatch } from '../validation';

// idParam is "new" to create a race, or an existing race's id to
// create-or-replace at that id.
export async function handlePutRace(request: Request, env: Env, idParam: string): Promise<Response> {
  const body = await readJson(request);
  if (!body.ok) return body.response;

  const patchResult = parseRacePatch(body.value);
  if (!patchResult.ok) return Response.json({ error: patchResult.error }, { status: 400 });

  let id: number | null = null;
  if (idParam !== 'new') {
    const idResult = parseId(idParam);
    if (!idResult.ok) return Response.json({ error: idResult.error }, { status: 400 });
    id = idResult.value;
  }

  await upsertRace(env, id, patchResult.value);
  // Races drive the plan directly (v1.1 review A3): rerun auto-fill so the
  // new/edited race's Race/Taper/recovery weeks land immediately, not only
  // the next time "Suggest plan" is tapped.
  await regeneratePlan(env);

  return Response.json(await buildState(env));
}

export async function handleDeleteRace(_request: Request, env: Env, idParam: string): Promise<Response> {
  const idResult = parseId(idParam);
  if (!idResult.ok) return Response.json({ error: idResult.error }, { status: 400 });

  await deleteRace(env, idResult.value);
  await regeneratePlan(env);

  return Response.json(await buildState(env));
}
