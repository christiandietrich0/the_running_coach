import { mergeRuns, mondayOf, suggestPlan, weeklyAggregates } from '../../logic';
import { loadPlanWeeks, loadRaces, loadRawActivities, upsertPlanWeek, upsertPlanWeeks } from '../db';
import { readJson } from '../http';
import type { Env } from '../index';
import { getSettings } from '../settings-store';
import { buildState } from '../state';
import { parsePlanPatch, parseWeekStart } from '../validation';

export async function handlePutPlanWeek(request: Request, env: Env, weekParam: string): Promise<Response> {
  const weekResult = parseWeekStart(weekParam);
  if (!weekResult.ok) return Response.json({ error: weekResult.error }, { status: 400 });

  const body = await readJson(request);
  if (!body.ok) return body.response;

  const patchResult = parsePlanPatch(body.value);
  if (!patchResult.ok) return Response.json({ error: patchResult.error }, { status: 400 });

  // A manual edit always sets user_edited, per the mechanics brief: "auto-fill
  // never touches weeks I have edited" (7).
  await upsertPlanWeek(env, { weekStart: weekResult.value, ...patchResult.value, userEdited: true });

  return Response.json(await buildState(env));
}

export async function handleSuggestPlan(_request: Request, env: Env): Promise<Response> {
  const [rawActivities, planWeeks, races, settings] = await Promise.all([
    loadRawActivities(env),
    loadPlanWeeks(env),
    loadRaces(env),
    getSettings(env),
  ]);

  const runs = mergeRuns(rawActivities, settings.runMergeGapMin);
  const actualAggregates = [...weeklyAggregates(runs, settings).values()];
  const currentWeekStart = mondayOf(new Date().toISOString());

  const plan = suggestPlan({ currentWeekStart, existingPlan: planWeeks, races, actualAggregates, actualRuns: runs, settings });

  // Locked weeks come back unchanged in suggestPlan's result; only persist
  // the ones it actually generated.
  await upsertPlanWeeks(
    env,
    plan.filter((w) => !w.userEdited),
  );

  return Response.json(await buildState(env));
}
