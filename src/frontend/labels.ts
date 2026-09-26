import type { FeasibilityStatus, WeekType } from './types';

export const WEEK_TYPE_LABEL: Record<WeekType, string> = {
  BUILD: 'Build',
  HOLD: 'Hold',
  DOWN: 'Down',
  TAPER: 'Taper',
  RACE: 'Race',
  LIMITED: 'Limited',
  RECOVERY: 'Recovery',
};

export const FEASIBILITY_LABEL: Record<FeasibilityStatus, string> = {
  FEASIBLE: 'Feasible',
  TIGHT: 'Tight',
  NOT_REACHABLE: 'Not safely reachable',
};

export const WEEK_TYPES: WeekType[] = ['BUILD', 'HOLD', 'DOWN', 'TAPER', 'RACE', 'LIMITED', 'RECOVERY'];
