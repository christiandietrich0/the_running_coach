import { describe, expect, it } from 'vitest';
import { buildDenseTimeline, mergeRuns, weeklyAggregates } from '../../src/logic/aggregate';
import { references } from '../../src/logic/references';
import { feasibility, raceTargets } from '../../src/logic/races';
import { DEFAULTS } from '../../src/worker/defaults';
import type { Race, RawActivity } from '../../src/logic/types';

function race(overrides: Partial<Race>): Race {
  return {
    id: 1,
    name: 'Test race',
    date: '2026-08-31',
    km: 100,
    dplusM: 5000,
    dminusM: 4800,
    targetTimeMin: null,
    priority: 'A',
    ...overrides,
  };
}

describe('raceTargets', () => {
  it('computes peaks, capped by the life-cap settings', () => {
    const t = raceTargets(race({}), DEFAULTS);
    // race_effort_km = 100 + 5000/100 = 150
    expect(t.raceEffortKm).toBeCloseTo(150);
    expect(t.peakLongRunKm).toBeCloseTo(DEFAULTS.maxLongRunKm); // 0.45*150=67.5, capped at 55
    expect(t.peakWeekEffortKm).toBeCloseTo(DEFAULTS.maxWeekKm); // 0.9*150=135, capped at 80
    expect(t.peakWeeklyDplusM).toBeCloseTo(3000); // 0.6 * 5000
    expect(t.peakSingleRunDminusM).toBeCloseTo(2160); // 0.45 * 4800
  });

  it('builds the 3-week A taper for races over 100km: week -2, week -1, race week', () => {
    const t = raceTargets(race({ km: 100, dplusM: 5000 }), DEFAULTS); // effort 150km > 100
    expect(t.taper.map((w) => w.label)).toEqual(['week -2', 'week -1', 'race week']);
    expect(t.taper[0].volumePct).toBeCloseTo(DEFAULTS.taperA.week2Pct);
    const weekMinus1 = t.taper.find((w) => w.label === 'week -1')!;
    expect(weekMinus1.volumePct).toBeCloseTo(DEFAULTS.taperA.week1Pct);
    expect(t.taper[t.taper.length - 1].volumePct).toBeCloseTo(DEFAULTS.taperA.raceWeekPct);
  });

  it('builds the 2-week A taper for races at or under 100km: week -1 only, then race week', () => {
    const t = raceTargets(race({ km: 50, dplusM: 0 }), DEFAULTS); // effort 50km <= 100
    expect(t.taper.map((w) => w.label)).toEqual(['week -1', 'race week']);
  });

  it('builds a 1-week B taper', () => {
    const t = raceTargets(race({ priority: 'B' }), DEFAULTS);
    expect(t.taper).toHaveLength(2);
    expect(t.taper.every((w) => w.volumePct === DEFAULTS.taperB.pct)).toBe(true);
  });

  it('has no taper for a C-priority race', () => {
    const t = raceTargets(race({ priority: 'C' }), DEFAULTS);
    expect(t.taper).toHaveLength(0);
  });
});

describe('feasibility', () => {
  // peak_long_run = 0.45 * 60 = 27km (well under the 55km cap), a B race
  // (2 taper weeks per DEFAULTS.taperB), current LR30 = 25km. currentC=50 is
  // comfortably above this race's own weekly-volume requirement (see the
  // "weekly volume" describe block below), so it never binds here -- these
  // cases are purely about the long-run dimension, as before.
  const r = race({ priority: 'B', km: 60, dplusM: 0 });

  it('needs 1 Build step (25 -> 27km at +10%/step) plus 2 taper weeks = 3 weeks', () => {
    const f = feasibility(r, 25, 50, 6, DEFAULTS);
    expect(f.weeksNeeded).toBe(3);
    expect(f.slack).toBe(3);
    expect(f.status).toBe('FEASIBLE');
  });

  it('is tight with little slack', () => {
    const f = feasibility(r, 25, 50, 4, DEFAULTS);
    expect(f.slack).toBe(1);
    expect(f.status).toBe('TIGHT');
  });

  it('reports the max reachable long run even when it falls short', () => {
    const f = feasibility(r, 25, 50, 1, DEFAULTS);
    expect(f.maxReachableLongRunKm).toBeCloseTo(25); // no room for even one Build step
  });

  it('treats no LR30 baseline as not reachable', () => {
    const f = feasibility(r, 0, 50, 10, DEFAULTS);
    expect(f.status).toBe('NOT_REACHABLE');
    expect(f.maxReachableLongRunKm).toBeCloseTo(0);
  });
});

// v1.1 review round 8 item 2, made unconditional in round 9 item 3: a race
// whose long-run growth projection comes up just short of the peak target
// used to read as flatly Not-reachable, the same as one that comes up
// wildly short. Landing within 15% of the target (compared unrounded, so
// exactly 85% counts) is close enough to call Tight instead -- whichever
// dimension (long run or weekly volume) actually drove the Not-reachable
// verdict in the first place.
describe('feasibility: Tight-vs-Not-reachable long-run rescue at settings.feasibilityTightReachableFactor (80%)', () => {
  // Same 60km B race as above: peak_long_run = 27km, 2 taper weeks.
  const r = race({ priority: 'B', km: 60, dplusM: 0 });
  // These tests deliberately use a budget-0 (weeksAvailable == taper weeks)
  // scenario so the reachable long run stays at the raw baseline, the
  // simplest case to hand-verify the rescue threshold against. Since no
  // race's taper ever exceeds 3 weeks, budget-0 always falls inside the
  // new LOCKED_IN window (v1.1 review round 10 follow-up item 4) -- these
  // pass feasibilityLockedInWeeks: 0 to test the rescue math itself in
  // isolation from that (separately tested below) override.
  const NOT_LOCKED_IN = { ...DEFAULTS, feasibilityLockedInWeeks: 0 };

  it('reads Tight, not Not-reachable, when the reachable long run is within the threshold of the target', () => {
    // budget = weeksAvailable(1) - taper(2) -> clamped to 0, so the
    // reachable long run stays at the baseline: 25 / 27 = 92.6%, well
    // above the 80% floor.
    const f = feasibility(r, 25, 50, 1, NOT_LOCKED_IN);
    expect(f.maxReachableLongRunKm).toBeCloseTo(25);
    expect(f.status).toBe('TIGHT');
  });

  it('stays Not-reachable when the reachable long run falls below the threshold of the target', () => {
    // 20 / 27 = 74%, below the 80% floor.
    const f = feasibility(r, 20, 50, 1, NOT_LOCKED_IN);
    expect(f.maxReachableLongRunKm).toBeCloseTo(20);
    expect(f.status).toBe('NOT_REACHABLE');
  });

  it('rescues to Tight even when weekly volume is what actually drives the shortfall (round 9 item 3)', () => {
    // currentLR30=50 is already far above this race's 27km peak long run
    // (reachable stays at 50, comfortably over target) -- currentC=10
    // makes the *volume* dimension the real, unreachable blocker, but the
    // rescue is now unconditional: the long run alone clears the 80% bar,
    // so the race still reads Tight, not Not-reachable (round 8 gated
    // this on the long run being the binding dimension; round 9 dropped
    // that qualifier).
    const f = feasibility(r, 50, 10, 2, NOT_LOCKED_IN);
    expect(f.maxReachableLongRunKm).toBeGreaterThan(raceTargets(r, DEFAULTS).peakLongRunKm);
    expect(f.status).toBe('TIGHT');
  });

  it('reads Tight at exactly the settings threshold, inclusive', () => {
    // A budget of 0 (weeksAvailable == taperWeeksNeeded) leaves the
    // reachable long run at the baseline, so a baseline of exactly
    // feasibilityTightReachableFactor of the 27km target must round-trip
    // to Tight, not Not-reachable -- ">=" is inclusive of the boundary
    // itself. Derived from the setting, not a hardcoded 85%, so this stays
    // correct if the default ever changes again.
    const target = raceTargets(r, DEFAULTS).peakLongRunKm;
    const f = feasibility(r, target * DEFAULTS.feasibilityTightReachableFactor, 50, 2, NOT_LOCKED_IN);
    expect(f.status).toBe('TIGHT');
  });

  it('a lower feasibilityTightReachableFactor setting rescues a shortfall the old fixed 85% would have missed (round 10 follow-up item 3: 39.6 vs 47km)', () => {
    // effortKm = 47 / 0.45 = 104.44km -> peakLongRunKm = 47km, under the
    // 55km life cap. 2 taper weeks (B race); budget 0 (weeksAvailable ==
    // taperWeeksNeeded) keeps the reachable long run at the 39.6 baseline.
    // 39.6 / 47 = 84.3%: below the old fixed 85% (would stay
    // Not-reachable) but above the new default 80% setting (reads Tight).
    const bigB = race({ priority: 'B', km: 104.444, dplusM: 0 });
    const target = raceTargets(bigB, DEFAULTS).peakLongRunKm;
    expect(target).toBeCloseTo(47, 0);

    const f = feasibility(bigB, 39.6, 100, 2, NOT_LOCKED_IN);
    expect(f.maxReachableLongRunKm).toBeCloseTo(39.6);
    expect(f.status).toBe('TIGHT');

    // Confirms this really is the 80%-vs-85% boundary, not a fluke of the
    // fixture: a stricter 85% setting puts the exact same case back to
    // Not-reachable.
    const strict = feasibility(bigB, 39.6, 100, 2, { ...NOT_LOCKED_IN, feasibilityTightReachableFactor: 0.85 });
    expect(strict.status).toBe('NOT_REACHABLE');
  });
});

// v1.1 review round 6: suggestPlan() now clamps every generated week,
// including a race's own peak week, to green-max x C -- so a race whose
// peak week target the runner's current chronic average can't support
// within the green ceiling is a stretch on *weekly volume*, not just long
// run, even when the long-run dimension alone would read comfortably
// Feasible.
describe('feasibility: weekly volume dimension', () => {
  // peak_week_effort_km = min(0.9*60, 80) = 54km; needs C such that
  // 1.2*C >= 54, i.e. C >= 45. A B race, 2 taper weeks. currentLR30=50 is
  // comfortably above this race's tiny peak long run (27km), so it never
  // binds here -- these cases are purely about the volume dimension.
  const r = race({ priority: 'B', km: 60, dplusM: 0 });

  it('is feasible on volume alone when C is already above the required level', () => {
    const f = feasibility(r, 50, 45, 6, DEFAULTS);
    expect(f.weeksNeeded).toBe(2); // no Build step needed, just the 2 taper weeks
    expect(f.status).toBe('FEASIBLE');
    expect(f.maxReachableWeekKm).toBeCloseTo(54); // fully reachable
  });

  it('needs Build steps for C to reach the required level (40 -> 45km: 40*1.1=44 falls short, 40*1.1^2=48.4 clears it, so 2 steps)', () => {
    const f = feasibility(r, 50, 40, 6, DEFAULTS);
    expect(f.weeksNeeded).toBe(4); // 2 Build steps + 2 taper weeks (0 Down weeks: 2 steps < the 3-step cadence)
    expect(f.status).toBe('FEASIBLE');
  });

  it('is Tight or Not-reachable on volume alone even though the long-run dimension is comfortable', () => {
    const f = feasibility(r, 50, 40, 4, DEFAULTS); // exactly the 4 weeks needed, slack 0
    expect(f.status).toBe('TIGHT');
    expect(f.slack).toBe(0);
  });

  it('reports the peak week capped below the race\'s own target when volume is not reachable', () => {
    // budget 0 (2 taper weeks alone use the 2-week budget) falls inside
    // the LOCKED_IN window (no race taper exceeds 3 weeks), so this tests
    // the rescue math itself with that override disabled -- see the
    // Tight-vs-Not-reachable describe block above for the same pattern.
    const f = feasibility(r, 50, 10, 2, { ...DEFAULTS, feasibilityLockedInWeeks: 0 });
    // currentLR30=50 is trivially reachable/comfortable for this race's
    // small 27km peak long run, so the unconditional rescue (round 9
    // item 3) lifts this from Not-reachable to Tight even though volume
    // is the real blocker -- the reachable *peak week* figure below still
    // correctly reports how short volume actually falls.
    expect(f.status).toBe('TIGHT');
    // Reachable peak week = 10 * 1.2 = 12, well under the 54km target.
    expect(f.maxReachableWeekKm).toBeCloseTo(12);
    expect(f.maxReachableWeekKm).toBeLessThan(54);
  });

  it('never reports a reachable peak week above the race\'s own target, however much slack there is', () => {
    const f = feasibility(r, 50, 200, 20, DEFAULTS); // C already far above what's needed
    expect(f.maxReachableWeekKm).toBeCloseTo(54); // capped at the target itself, not 1.2*200
  });
});

// v1.1 review round 10 follow-up item 4: inside a race's own final weeks
// there's no more building left to project -- every remaining week is
// taper or the race itself -- so a Tight/Not-reachable verdict there just
// restates a shortfall nothing can still close. A live report: a race 23
// days (and so, with its own 3-week A-priority taper, 1 week of real build
// time) out read "Not safely reachable", which is honest about the math
// but misleading once nothing can be done about it any more.
describe('feasibility: LOCKED_IN inside the race\'s own final weeks', () => {
  const r = race({ priority: 'A', km: 100, dplusM: 5000, dminusM: 4800 }); // 3-week taper (over 100km)

  it('reports LOCKED_IN, not Not-reachable, once weeksAvailable reaches the taper window', () => {
    // currentLR30=35 is nowhere near this race's big peak long run -- would
    // read Not-reachable on the ordinary slack math (confirmed below with
    // the override disabled) -- but once there's no build budget left, the
    // honest answer is "this is what you've got", not a verdict.
    const notLockedIn = feasibility(r, 35, 60, 3, { ...DEFAULTS, feasibilityLockedInWeeks: 0 });
    expect(notLockedIn.status).toBe('NOT_REACHABLE');

    const f = feasibility(r, 35, 60, 3, DEFAULTS);
    expect(f.status).toBe('LOCKED_IN');
    // The real, already-banked LR30 -- not a growth projection (budget
    // would be 0 here anyway, 3 weeks available - 3 taper weeks needed).
    expect(f.maxReachableLongRunKm).toBe(35);
  });

  it('overrides an otherwise-Feasible verdict too -- LOCKED_IN is about timing, not the underlying math', () => {
    const f = feasibility(r, 200, 200, 2, DEFAULTS); // comfortably over every target
    expect(f.status).toBe('LOCKED_IN');
    expect(f.maxReachableLongRunKm).toBe(200);
  });

  it('does not fire outside the taper window', () => {
    const f = feasibility(r, 35, 60, DEFAULTS.feasibilityLockedInWeeks + 1, DEFAULTS);
    expect(f.status).not.toBe('LOCKED_IN');
  });

  it('is configurable via settings.feasibilityLockedInWeeks', () => {
    const f = feasibility(r, 35, 60, 3, { ...DEFAULTS, feasibilityLockedInWeeks: 1 });
    expect(f.status).not.toBe('LOCKED_IN'); // 3 weeks available > the lowered 1-week threshold
  });
});

// v1.1 review round 10 follow-up item 4, refined: a live report that the
// Puglia UTMB card stayed "Not safely reachable" on the week it actually
// became the race's own Peak week (23 days out, 1 real Build week left per
// the weeksAvailable-based rule, which only locks in inside the taper
// itself) -- the real signal is the current week's own race-slot tag
// (Peak/Taper/Race for *this* race), passed in by the caller, not a raw
// weeksAvailable count.
describe('feasibility: lockedInByWeekType (the caller\'s own week-type signal)', () => {
  const r = race({ priority: 'A', km: 100, dplusM: 5000, dminusM: 4800 });

  it('locks in on the caller\'s say-so even with plenty of weeksAvailable left', () => {
    const f = feasibility(r, 35, 60, 10, DEFAULTS, { lockedInByWeekType: true });
    expect(f.status).toBe('LOCKED_IN');
    expect(f.maxReachableLongRunKm).toBe(35); // the real banked LR30, not a 10-week growth projection
  });

  it('overrides the weeksAvailable-based fallback when the caller says this is still a Build week', () => {
    // Without the override, 2 weeks available would fall inside the
    // fallback's own default 3-week window and lock in anyway -- the
    // caller's explicit "false" must win, since it means Peak/Taper/Race
    // hasn't started yet for this race (e.g. an unusually long taper).
    const f = feasibility(r, 35, 60, 2, DEFAULTS, { lockedInByWeekType: false });
    expect(f.status).not.toBe('LOCKED_IN');
  });

  it('surfaces the last-Build-week reading alongside the locked-in status', () => {
    const f = feasibility(r, 35, 60, 3, DEFAULTS, {
      lockedInByWeekType: true,
      lastBuild: { status: 'TIGHT', maxReachableLongRunKm: 35 },
    });
    expect(f.status).toBe('LOCKED_IN');
    expect(f.lastBuildStatus).toBe('TIGHT');
    expect(f.lastBuildMaxReachableLongRunKm).toBe(35);
  });

  it('leaves the last-Build-week fields null when not locked in, and when locked in with no reading supplied', () => {
    const notLockedIn = feasibility(r, 35, 60, 10, DEFAULTS, { lockedInByWeekType: false });
    expect(notLockedIn.lastBuildStatus).toBeNull();
    expect(notLockedIn.lastBuildMaxReachableLongRunKm).toBeNull();

    const lockedInNoReading = feasibility(r, 35, 60, 3, DEFAULTS, { lockedInByWeekType: true });
    expect(lockedInNoReading.lastBuildStatus).toBeNull();
    expect(lockedInNoReading.lastBuildMaxReachableLongRunKm).toBeNull();
  });
});

// v1.1 review A7: feasibility was too optimistic because it fed in a
// stale/about-to-expire LR30. Fixed as a consequence of A2 (LR30 is now
// evaluated as of the week's Sunday, not its Monday), not by any change to
// feasibility() itself.
describe('feasibility: consumes the A2-corrected LR30, not a stale one (A7)', () => {
  it('correctly requires more Build weeks once an aging-out long run has actually aged out', () => {
    function activity(id: string, startLocal: string, distanceM: number, lossM: number): RawActivity {
      return { id, startLocal, distanceM, movingS: 3600, gainM: 0, lossM, isRace: false };
    }
    // Same fixture as references.test.ts's A2 case: the Aug 29 48.1km run
    // must have aged out by the week of Sep 28 (Sunday Oct 4 - 30 days =
    // Sep 4), leaving the Sep 12 36km run as LR30.
    const runs = mergeRuns([
      activity('aug29', '2026-08-29T08:00:00', 48100, 1200),
      activity('sep12', '2026-09-12T08:00:00', 36000, 700),
    ]);
    const aggMap = weeklyAggregates(runs, DEFAULTS);
    const dense = buildDenseTimeline([...aggMap.values()], []);
    const refs = references({ weekStart: '2026-09-28', denseTimeline: dense, actualRuns: runs }, DEFAULTS);
    expect(refs.LR30).toBeCloseTo(36);

    const upcoming = race({ priority: 'B', km: 93, dplusM: 0 }); // peak long run 0.45*93 = 41.85km
    // currentC=100 is comfortably above this race's weekly-volume
    // requirement (peak_week_effort_km capped at maxWeekKm=80, needing
    // C>=66.67) in both calls, so it never binds -- this test is purely
    // about the long-run dimension, as before.
    const correct = feasibility(upcoming, refs.LR30, 100, 8, DEFAULTS);

    // Before A2, evaluating from this week's Monday would have kept the
    // Aug 29 run in-window (Sep 28 - 30 = Aug 29, the boundary itself) and
    // returned 48.1 here -- above the race's peak long run, so feasibility
    // would wrongly conclude zero Build weeks are still needed.
    const stale = feasibility(upcoming, 48.1, 100, 8, DEFAULTS);

    expect(correct.weeksNeeded).toBeGreaterThan(stale.weeksNeeded);
    expect(correct.slack).toBeLessThan(stale.slack);
  });
});
