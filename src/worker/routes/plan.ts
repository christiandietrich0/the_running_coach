import { mergeRuns, mondayOf, suggestPlan, weeklyAggregates } from '../../logic';
import type { PlanWeek } from '../../logic/types';
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

// Runs suggestPlan() against the current history/plan/races -- the exact
// same computation regeneratePlan() below persists, and handlePreviewPlan
// merely inspects without saving (v1.1 UI pass "Rebuild plan" diff
// preview). suggestPlan() itself is untouched either way.
async function computeSuggestedPlan(env: Env): Promise<{ plan: PlanWeek[]; existingPlanWeeks: PlanWeek[] }> {
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
  return { plan, existingPlanWeeks: planWeeks };
}

// Whether a freshly generated (non-user-edited) week actually differs from
// what's currently persisted for it -- small floating-point drift doesn't
// count as a change.
function weekChanged(existing: PlanWeek | undefined, generated: PlanWeek): boolean {
  if (!existing) return generated.km != null && generated.km > 0;
  const closeEnough = (a: number | null, b: number | null) => Math.abs((a ?? 0) - (b ?? 0)) < 0.5;
  return existing.type !== generated.type || !closeEnough(existing.km, generated.km) || !closeEnough(existing.longRunKm, generated.longRunKm);
}

// Runs suggestPlan() against the current history/plan/races and persists
// whatever it generated. Locked (user-edited or Limited) weeks come back
// unchanged, so only the generated ones need writing. Shared by the manual
// "Rebuild plan" action and by race create/edit/delete, which must rerun
// this the same way (v1.1 review A3: races drive the plan automatically).
export async function regeneratePlan(env: Env): Promise<void> {
  const { plan } = await computeSuggestedPlan(env);
  await upsertPlanWeeks(
    env,
    plan.filter((w) => !w.userEdited),
  );
}

export async function handleSuggestPlan(_request: Request, env: Env): Promise<Response> {
  await regeneratePlan(env);
  return Response.json(await buildState(env));
}

// A dry run of "Rebuild plan": which weeks would actually change if it ran
// right now, without saving anything (v1.1 UI pass). Locked (user-edited or
// Limited) weeks never show up here, same as regeneratePlan() never
// touches them.
export async function handlePreviewPlan(_request: Request, env: Env): Promise<Response> {
  const { plan, existingPlanWeeks } = await computeSuggestedPlan(env);
  const existingByWeek = new Map(existingPlanWeeks.map((w) => [w.weekStart, w]));

  const changedWeeks = plan
    .filter((w) => !w.userEdited)
    .filter((w) => weekChanged(existingByWeek.get(w.weekStart), w))
    .map((w) => w.weekStart);

  return Response.json({ changedWeeks });
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
