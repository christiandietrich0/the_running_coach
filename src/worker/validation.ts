// Request-body and route-param validation for the write endpoints. Every
// write goes through here first (kickoff prompt section 5: "validate
// inputs"); nothing downstream should have to defend against malformed
// JSON.
import { mondayOf } from '../logic/dates';
import type { CheckIn, PlanWeek, Race, WeekType } from '../logic/types';
import { DEFAULTS, type Defaults } from './defaults';

export type ValidationResult<T> = { ok: true; value: T } | { ok: false; error: string };

function ok<T>(value: T): ValidationResult<T> {
  return { ok: true, value };
}

function fail<T>(error: string): ValidationResult<T> {
  return { ok: false, error };
}

const WEEK_TYPES: WeekType[] = ['BUILD', 'HOLD', 'DOWN', 'TAPER', 'RACE', 'LIMITED'];
const WEEK_START_RE = /^\d{4}-\d{2}-\d{2}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// A week_start must be a real calendar date, and specifically a Monday
// (mechanics brief: "Weeks run Monday to Sunday").
export function parseWeekStart(value: string): ValidationResult<string> {
  if (!WEEK_START_RE.test(value)) return fail('week must be a YYYY-MM-DD date');
  if (mondayOf(value) !== value) return fail('week must be a Monday');
  return ok(value);
}

export function parseId(value: string): ValidationResult<number> {
  if (!/^\d+$/.test(value)) return fail('id must be a positive integer');
  return ok(Number(value));
}

function isNullableFiniteNumber(v: unknown): v is number | null {
  return v === null || (typeof v === 'number' && Number.isFinite(v));
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

export function parsePlanPatch(body: unknown): ValidationResult<Omit<PlanWeek, 'weekStart' | 'userEdited'>> {
  if (typeof body !== 'object' || body === null) return fail('body must be a JSON object');
  const b = body as Record<string, unknown>;

  if (typeof b.type !== 'string' || !WEEK_TYPES.includes(b.type as WeekType)) {
    return fail(`type must be one of ${WEEK_TYPES.join(', ')}`);
  }
  for (const field of ['km', 'longRunKm', 'dplusM', 'dminusM'] as const) {
    if (field in b && !isNullableFiniteNumber(b[field])) return fail(`${field} must be a number or null`);
  }
  for (const field of ['limitedDays', 'limitedKmCap'] as const) {
    if (field in b && !isNullableFiniteNumber(b[field])) return fail(`${field} must be a number or null`);
  }

  return ok({
    type: b.type as WeekType,
    km: (b.km as number | null) ?? null,
    longRunKm: (b.longRunKm as number | null) ?? null,
    dplusM: (b.dplusM as number | null) ?? null,
    dminusM: (b.dminusM as number | null) ?? null,
    limitedDays: (b.limitedDays as number | null) ?? null,
    limitedKmCap: (b.limitedKmCap as number | null) ?? null,
  });
}

export function parseCheckinPatch(body: unknown): ValidationResult<Omit<CheckIn, 'weekStart'>> {
  if (typeof body !== 'object' || body === null) return fail('body must be a JSON object');
  const b = body as Record<string, unknown>;

  for (const field of ['heel', 'achilles', 'knee', 'hipOther'] as const) {
    const v = b[field];
    if (!isFiniteNumber(v) || v < 0 || v > 10) return fail(`${field} must be a number from 0 to 10`);
  }
  if (typeof b.reducedTraining !== 'boolean') return fail('reducedTraining must be a boolean');

  return ok({
    heel: b.heel as number,
    achilles: b.achilles as number,
    knee: b.knee as number,
    hipOther: b.hipOther as number,
    reducedTraining: b.reducedTraining,
  });
}

export function parseRacePatch(body: unknown): ValidationResult<Omit<Race, 'id'>> {
  if (typeof body !== 'object' || body === null) return fail('body must be a JSON object');
  const b = body as Record<string, unknown>;

  if (typeof b.name !== 'string' || b.name.trim().length === 0) return fail('name must be a non-empty string');
  if (typeof b.date !== 'string' || !DATE_RE.test(b.date)) return fail('date must be a YYYY-MM-DD date');
  if (!isFiniteNumber(b.km) || b.km <= 0) return fail('km must be a positive number');
  if (!isFiniteNumber(b.dplusM) || b.dplusM < 0) return fail('dplusM must be a non-negative number');
  if (!isFiniteNumber(b.dminusM) || b.dminusM < 0) return fail('dminusM must be a non-negative number');
  if (b.targetTimeMin != null && !isFiniteNumber(b.targetTimeMin)) return fail('targetTimeMin must be a number or null');
  if (b.priority !== 'A' && b.priority !== 'B' && b.priority !== 'C') return fail('priority must be A, B or C');

  return ok({
    name: b.name.trim(),
    date: b.date,
    km: b.km,
    dplusM: b.dplusM,
    dminusM: b.dminusM,
    targetTimeMin: (b.targetTimeMin as number | null) ?? null,
    priority: b.priority,
  });
}

export function parseActivityOverridePatch(body: unknown): ValidationResult<{ isRace: boolean | null; exclude: boolean }> {
  if (typeof body !== 'object' || body === null) return fail('body must be a JSON object');
  const b = body as Record<string, unknown>;

  if ('isRace' in b && b.isRace !== null && typeof b.isRace !== 'boolean') return fail('isRace must be a boolean or null');
  if ('exclude' in b && typeof b.exclude !== 'boolean') return fail('exclude must be a boolean');

  return ok({
    isRace: (b.isRace as boolean | null) ?? null,
    exclude: (b.exclude as boolean) ?? false,
  });
}

// A provided value must have the same shape as its Defaults counterpart:
// same primitive type, or (for the nested corridor/taper objects) the
// same set of keys, each recursively matching. Keeps a malformed settings
// write from corrupting a value the logic module reads unchecked.
function sameShape(value: unknown, template: unknown): boolean {
  if (typeof template === 'number') return typeof value === 'number' && Number.isFinite(value);
  if (typeof template === 'boolean') return typeof value === 'boolean';
  if (typeof template === 'string') return typeof value === 'string';
  if (typeof template === 'object' && template !== null && !Array.isArray(template)) {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
    const templateKeys = Object.keys(template as object);
    const valueKeys = Object.keys(value as object);
    if (valueKeys.length !== templateKeys.length) return false;
    return templateKeys.every((k) => sameShape((value as Record<string, unknown>)[k], (template as Record<string, unknown>)[k]));
  }
  return false;
}

export function parseSettingsPatch(body: unknown): ValidationResult<Partial<Defaults>> {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) return fail('settings patch must be a JSON object');

  const patch: Partial<Defaults> = {};
  for (const [key, value] of Object.entries(body as Record<string, unknown>)) {
    if (!(key in DEFAULTS)) return fail(`unknown setting: ${key}`);
    const template = (DEFAULTS as unknown as Record<string, unknown>)[key];
    if (!sameShape(value, template)) return fail(`setting "${key}" has the wrong shape`);
    (patch as Record<string, unknown>)[key] = value;
  }
  return ok(patch);
}
