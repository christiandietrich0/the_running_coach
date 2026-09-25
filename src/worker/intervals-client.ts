// intervals.icu REST client. Basic auth: username "API_KEY", password = the key.
// See docs/training_planner_technical_brief.md section 3 and 5.

const BASE_URL = 'https://intervals.icu/api/v1';

export interface IntervalsClientConfig {
  athleteId: string;
  apiKey: string;
}

// Fields we actually use. intervals.icu returns more; the rest is ignored.
export interface IntervalsActivity {
  id: string;
  start_date_local: string;
  type: string;
  name?: string | null;
  distance?: number | null; // meters
  moving_time?: number | null; // seconds
  total_elevation_gain?: number | null;
  total_elevation_loss?: number | null;
  race?: boolean | null;
}

function authHeader(apiKey: string): string {
  return 'Basic ' + btoa(`API_KEY:${apiKey}`);
}

async function get<T>(path: string, config: IntervalsClientConfig): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { Authorization: authHeader(config.apiKey) },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`intervals.icu GET ${path} failed: ${res.status} ${body}`);
  }
  return res.json();
}

// oldest/newest are YYYY-MM-DD, both inclusive.
export async function listActivities(
  config: IntervalsClientConfig,
  oldest: string,
  newest: string,
): Promise<IntervalsActivity[]> {
  const path = `/athlete/${config.athleteId}/activities?oldest=${oldest}&newest=${newest}`;
  return get<IntervalsActivity[]>(path, config);
}

export async function getActivityDetail(
  config: IntervalsClientConfig,
  activityId: string,
): Promise<IntervalsActivity> {
  return get<IntervalsActivity>(`/activity/${activityId}`, config);
}
