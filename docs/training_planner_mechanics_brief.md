# Weekly Load Planner: Mechanics Brief (v1)

Scope: what the app does and which rules it runs. No backend or tech stack; that comes next.
Science basis: see the research report (Frandsen 2025, Bosquet 2007, Nielsen 2014, Damsted 2019, Clarsen 2013 and others).

---

## 1. Purpose and principles

A lightweight PWA I open once or twice a week. It pulls my history from intervals.icu and tells me, for this week and the next ones: how much, how long, how much descent. Not more, not less.

- **Weekly, not daily.** I plan weeks. Days are my business.
- **One verdict per week.** One colour and one reason line. The worst flag wins.
- **Three numbers on the home screen:** weekly km range, max long run, max descent.
- **Ceilings, not targets.** The app says "up to" and "at least", never "do exactly".
- **Symptoms beat numbers.** A sore Achilles overrides a green chart.
- **Every threshold is a setting.** Most of them are convention, and I want to tune them against my own data.

---

## 2. Data in

From intervals.icu, per activity:

| Field | Use |
|---|---|
| Date and start time | Week assignment, merging |
| Type | Run and TrailRun count. Hike/Walk toggle in settings (default off) |
| Distance (km) | Volume |
| Moving time | Time on feet, display only |
| Elevation gain D+ (m) | Effort-km |
| Elevation loss D− (m) | Mechanical load, descent caps |
| Race tag | Excluded from reference windows (see 3.6) |

**Preprocessing**
- Weeks run Monday to Sunday.
- Runs with less than 15 minutes between them are merged into one run. This is the Frandsen method; otherwise a café stop splits a long run in two.

---

## 3. Derived metrics

### 3.1 Weekly load streams
- `km_week` = sum of run distance.
- `effort_km_week` = km + D+/100. This is the ITRA convention (energy and fitness).
- `mech_km_week` = km + w · D−/100, with w = 1 by default (tissue, knees).
- `dminus_week` = sum of D−.
- `runs_week` = count of runs after merging.

### 3.2 Chronic reference, C
C is the mean `km_week` of the previous 4 completed weeks. It is uncoupled: the current week is not included. Race weeks and the week after a race are skipped, and the next older weeks are used instead.

### 3.3 Weekly ratio, R
R = `km_week` ÷ C. The same ratio can be computed on effort-km (toggle).

### 3.4 Long-run reference, LR30
LR30 is the longest single run in the 30 days before the run in question.
- For future weeks, planned long runs count as if done. This way the cap rolls forward through the plan.
- Race-tagged runs are excluded. Otherwise an 85 km race would unlock a 93 km training run a month later.

### 3.5 Descent references
- `D30` = the largest single-run D− in the prior 30 days (race runs excluded).
- `DW4` = the largest `dminus_week` of the previous 4 weeks.

### 3.6 Long-term reference, M12
M12 is the 12-week mean of `km_week`, used only for the detraining check.

---

## 4. Week types

Each week (past or planned) has one type. The type sets the corridor and changes which flags apply.

| Type | Weekly km corridor | Long run | Notes |
|---|---|---|---|
| **Build** | 1.05 to 1.15 × C | up to 1.10 × LR30 | Default progression week |
| **Hold** | 0.90 to 1.05 × C | up to LR30 (no progression) | Consolidate, or forced by symptoms |
| **Down** | 0.60 to 0.75 × mean of last Build weeks | ≤ 0.70 × LR30 | Every 3rd to 4th week. No blue flag |
| **Taper** | See section 6 | See section 6 | Auto-set from race. No blue flag |
| **Race** | Race plus shakeouts | n/a | Excluded from references. Ratio and LR flags off |
| **Limited** | User cap (km and/or days available) | ≤ LR30 | Holiday, busy parenting week, travel. Counts as a Down week in the rhythm. No blue flag |

Ceilings above never override the global hard caps in section 5.

---

## 5. Flags and verdict

### 5.1 Individual flags

| Flag | Green | Yellow | Red |
|---|---|---|---|
| **Symptoms** (5.3) | all regions ≤ 2 | any region 3 to 4 | any region ≥ 5, or up 2 weeks running, or "had to reduce training" |
| **Long run** (longest run ÷ LR30) | ≤ 1.10 | 1.10 to 1.30 | > 1.30 |
| **Descent, single run** (D− ÷ D30) | ≤ 1.20 | > 1.20 | > 1.50 |
| **Descent, weekly** (`dminus_week` ÷ DW4) | ≤ 1.30 | > 1.30 | > 1.60 |
| **Weekly ratio** R | 0.8 to 1.2 | 1.2 to 1.5 | > 1.5 |
| **Low volume** (blue) | | R < 0.8 on a Build or Hold week, or C < 0.7 × M12 | |

Hard caps apply regardless of week type (except Race): R > 1.5 is red, and a week-on-week jump of more than 30% is at least yellow.

### 5.2 Verdict
- The week colour is the worst flag. When flags are the same colour, the order is: **symptoms > long run > descent > weekly ratio**.
- Blue shows only when nothing is yellow or red.
- There is exactly one reason line, for example "Long run 38 km is 27% over your 30-day longest (30 km)."

### 5.3 Symptom check-in
- **When:** a prompt on the first app open each Monday (skippable).
- **What:** 0 to 10 for four regions: heel/foot, Achilles/calf, knee, hip/other. Plus one yes/no: "Did pain make you reduce training last week?"
- **Consequences for the coming week:**
  - Any region ≥ 3: the week locks to **Hold**. The long-run cap equals LR30, with no progression.
  - Any region ≥ 5, or rising 2 weeks in a row, or "yes": the week locks to **Down**, with weekly D− ≤ 0.5 × DW4.
- **Re-entry:** after a blue or locked period, the next Build week is capped at 1.15 × current C. It is not the old level.

---

## 6. Race input and back-calculation

### 6.1 Input
- Name and date
- Distance (km), D+ (m), D− (m; defaults to D+)
- Optional target time
- Priority A, B or C

Derived: `race_effort_km` = km + D+/100.

### 6.2 Targets (convention, all tunable)

| Target | Rule |
|---|---|
| Peak long run | 0.45 × race_effort_km, capped at `max_long_run_km` (setting). Time on feet is shown using the target time pace |
| Peak week | 0.90 × race_effort_km in effort-km, capped at `max_week_km` (life cap, setting) |
| Peak weekly D+ | 0.60 × race D+ |
| Peak single-run D− | 0.45 × race D− |

### 6.3 Taper by priority

| Priority | Length | Volume (% of peak 4-week mean) | Last long run |
|---|---|---|---|
| **A** | 2 weeks (3 for races over 100 km, setting) | Week −2: 70%, week −1: 50 to 60%, race week excl. race: 35 to 45% | ≥ 14 days out, ≤ 50% of peak LR in the taper |
| **B** | 1 week | 60 to 70% | ≥ 7 days out |
| **C** | none | Train through, 2 easy days before | n/a |

Frequency and short intensity are kept. Only volume drops.

### 6.4 Feasibility check
1. Steps needed: `ceil( ln(peak_LR ÷ current LR30) ÷ ln(1.10) )`. Each Build week can raise the long run by at most 10%.
2. Add one Down week per 3 Build weeks. Existing Limited weeks count as Down weeks.
3. Add the taper weeks.
4. Slack = weeks available − weeks needed.

| Slack | Status |
|---|---|
| ≥ 2 | **Feasible** |
| 0 to 1 | **Tight**: no room for a missed week |
| < 0 | **Not safely reachable**: shows the max reachable long run by race day instead |

With two or more races, each race is checked against the plan that includes the earlier races. A B-race inside an A-race block becomes a long run with a 1-week taper.

---

## 7. Plan auto-fill

"Suggest plan" fills unlocked future weeks and never touches weeks I have edited or tagged Limited.

1. **Anchor backwards** from the next A race: Race week, taper weeks, then the peak week (the week holding the peak long run, placed right before the taper).
2. **Fill forward** from the current week: Build, Build, Build, Down, and so on. Limited weeks reset the Down counter.
3. **Numbers per week:**
   - km = midpoint of the corridor
   - long run = min(1.10 × projected LR30, peak LR)
   - D+ and D− scaled from recent ratio of D+ per km, capped by the descent rules
4. **Recheck** every planned week with the flag rules. Anything above yellow gets trimmed.
5. **After the race** (v2): 1 Limited week at ≤ 30% of the pre-taper mean, then 1 Down week. Build resumes ≥ 14 days after races of 80 to 125 km, plus 1 week per extra ~100 effort-km beyond 150.

Editing any week recalculates everything after it, but only as colours and caps. It never silently rewrites my numbers.

---

## 8. Screens

### 8.1 This Week (home)
- Verdict colour with the reason line
- **Three numbers with progress bars (done vs allowed):**
  - weekly km: "42 of 48 to 55"
  - long run: "max 33 km"
  - descent: "max 1,400 m this week, 700 m in one run"
- Runs so far this week (compact list)
- Check-in prompt if not done
- Next race: countdown, feasibility status, week type

### 8.2 Chart
- 12 weeks back (solid bars) and 8 to 12 weeks ahead (hatched planned bars)
- Background bands from C: blue, green, yellow, red
- A dot per week for the long run, with the LR30 × 1.10 cap line
- Toggle: km / effort-km / D−
- Race weeks marked

### 8.3 Plan
- A list of upcoming weeks, each a row with:
  - type chip, planned km, long run, D+ and D−
  - verdict dot
- Tap a row to edit it and change its type.
- "Suggest plan" button.
- Mark Limited weeks with available days or a km cap.

### 8.4 Races
- Add or edit races.
- Each race shows its targets, taper and feasibility.

### 8.5 Settings
- All parameters from section 9
- Activity types included
- intervals.icu connection

Check-in is a sheet, not a screen.

---

## 9. Parameters (defaults)

| Parameter | Default | Confidence |
|---|---|---|
| Chronic window | 4 weeks | Medium (method) |
| Zone edges R | 0.8 / 1.2 / 1.5 | Low (convention) |
| Detraining threshold | C < 0.7 × M12 | Low |
| Long-run cap | 1.10 × LR30; red > 1.30 | Medium to high |
| LR30 window | 30 days | Medium to high |
| Run merge gap | 15 min | Method |
| Build corridor | 1.05 to 1.15 × C | Low to medium |
| Hold corridor | 0.90 to 1.05 × C | Convention |
| Down corridor | 0.60 to 0.75 × Build mean | Convention |
| Down cadence | 1 per 3 Build weeks | Convention |
| Hard week-on-week cap | +30% | Low to medium |
| Re-entry cap | 1.15 × C | Convention |
| Descent weight w | 1.0 | Low |
| Single-run D− cap | 1.20 × D30 | Low |
| Weekly D− cap | 1.30 × DW4 | Low |
| Symptom Hold threshold | ≥ 3 | Convention |
| Symptom Down threshold | ≥ 5, or rising 2 weeks, or reduced training | Convention |
| Peak LR | 0.45 × race effort-km | Convention |
| Peak week | 0.90 × race effort-km | Convention |
| Peak weekly D+ | 0.60 × race D+ | Convention |
| A taper | 2 weeks (3 over 100 km), 70 / 55 / 40% | Medium (structure) |
| B taper | 1 week, 65% | Low |
| `max_week_km` (life cap) | 80 | Personal |
| `max_long_run_km` | 55 | Personal |
| Include hikes | Off | Personal |

---

## 10. Out of scope for v1
- **v2:** a 10-week tissue EWMA with a cumulative-overload flag; a frequency flag (volume up while ≤ 3 runs); post-race auto-insertion.
- **Not planned:** monotony and strain; EWMA ACWR; HR or TRIMP load; HRV and readiness; race-time prediction; day-level planning.

---

## 11. Open questions for the build step
1. Does the intervals.icu activity payload include elevation loss? If not, derive D− from streams or approximate it as D+.
2. Where do planned weeks, races and check-ins live? intervals.icu calendar notes or my own store.
3. Should planned weeks sync to the intervals.icu calendar as notes, so they show up in Garmin too?
4. What happens with the Puglia race tag retroactively? Past races need tagging on import.
