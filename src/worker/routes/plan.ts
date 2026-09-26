import { mergeRuns, mondayOf, suggestPlan, weeklyAggregates } from '../../logic';
import { deletePlanWeek, loadPlanWeeks, loadRaces, loadRawActivities, upsertPlanWeek, upsertPlanWeeks } from '../db';
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

// Runs suggestPlan() against the current history/plan/races and persists
// whatever it generated. Locked (user-edited or Limited) weeks come back
// unchanged, so only the generated ones need writing. Shared by the manual
// "Suggest plan" action and by race create/edit/delete, which must rerun
// this the same way (v1.1 review A3: races drive the plan automatically).
export async function regeneratePlan(env: Env): Promise<void> {
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

  await upsertPlanWeeks(
    env,
    plan.filter((w) => !w.userEdited),
  );
}

export async function handleSuggestPlan(_request: Request, env: Env): Promise<Response> {
  await regeneratePlan(env);
  return Response.json(await buildState(env));
}

// Clears a week's user_edited override and lets suggestPlan() regenerate
// it (v1.1 review A-round 2 item 3: "Reset to suggested" on an edited
// week).
export async function handleResetPlanWeek(_request: Request, env: Env, weekParam: string): Promise<Response> {
  const weekResult = parseWeekStart(weekParam);
  if (!weekResult.ok) return Response.json({ error: weekResult.error }, { status: 400 });

  await deletePlanWeek(env, weekResult.value);
  await regeneratePlan(env);

  return Response.json(await buildState(env));
}
