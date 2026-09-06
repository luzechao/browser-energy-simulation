# ASHRAE Standard 140 (BESTEST) gate — provenance

Implements the builder spec in `PHASE5E_ASHRAE140_SOURCING.md` §3 (planner
sourcing decision, 2026-07-06). This file records exactly what was vendored,
from where, the license, and every transform applied plus the judgment calls
made where the spec's prose and the authoritative artifacts disagreed.

## Vendored files (verbatim, never hand-edited)

Pinned to `NatLabRockies/BESTEST-GSR` commit `80c3f2e56a501da996676086573f4c7f29fe9c5c`:

- `case_en_600.orig.idf` ←
  `integration_testing/workflow/workflow_resources/case_en_600.idf`
  (EnergyPlus v9.3, Case 600, Denver-Stapleton location)
- `725650TYCST.epw` ← `shared_resources/725650TYCST.epw`
  (Denver Intl AP 725650, TMY3, the ASHRAE 140-2017/2020 test weather)

## License

`BESTEST-GSR` is licensed under a BSD-style license (Alliance for Energy
Innovation, LLC / NREL), permitting redistribution with the copyright notice
retained:

> Building Energy Simulation Test - Generation Simulation and Reporting,
> Copyright (c) 2026, Alliance for Energy Innovation, LLC. All rights
> reserved. Redistribution and use in source and binary forms, with or
> without modification, are permitted provided that the copyright notice
> and license conditions are retained. See the full text at
> `https://github.com/NatLabRockies/BESTEST-GSR/blob/80c3f2e56a501da996676086573f4c7f29fe9c5c/LICENSE.md`.

Not vendored (consulted only, per the sourcing spec — too large / not
needed verbatim): `shared_resources/bestest_case_var_lib.rb`,
`shared_resources/bestest_resources.osm`,
`shared_resources/Bestest_Geo_EastWest_6_0_0.osm`,
`shared_resources/Bestest_Geo_South_12_1_0.osm`,
`measures/bestest_building_thermal_envelope_and_fabric_load/measure.rb`,
`measures/bestest_building_thermal_envelope_and_fabric_load_reporting/tests/{600,910}_test_output.idf`
(official OpenStudio-forward-translated E+ output for Case 600 and Case 910
— used as an independent cross-check for the 900-series heavyweight
constructions and the 610-series overhang, since 910 = 900 + south
overhang), and
`https://raw.githubusercontent.com/JasonGlazer/ashrae-140-automation/main/processed/energyplus/9.0.1/std140_tf_output.json`
(EnergyPlus 9.0.1 official results — cross-verified independently against
this builder session's own fetch: all 6 cases' `ep901` values in
`ashrae140_ranges.json` matched this JSON exactly, to the digit).
`RESULTS5-2A.xlsx` (2.8 MB) was not fetched at all in this session; the
`min`/`max` range numbers were taken verbatim from the JSON table already
supplied in the builder spec (§3.4), per instruction not to re-derive them.

## Transition (all 6 cases): v9.3 → v26.1

Exactly two edits, verified sufficient by the planner (§1.5) and reconfirmed
in this session:

1. `Version` object value `9.3` → `26.1`.
2. Insert one blank `Space Name` field
   (`,                                       !- Space Name`) immediately
   after the `!- Zone Name` field line, in each of the 6
   `BuildingSurface:Detailed` objects.

Result: `EnergyPlus Completed Successfully -- 19 Warning; 0 Severe Errors`,
matching §1.5's measurement exactly. Case 600 physics (from
`Zone Air System Sensible Heating/Cooling Energy`, see below): annual
heating 4.2201 MWh, annual cooling 6.2592 MWh (§1.5 reported 6.2590 — 4
sig-fig match, rounding in the 5th digit), peak heating 3.1525 kW, peak
cooling 6.6043 kW — reproduces §1.5's reference values to 4 significant
digits. Escalation trigger #6 checked: cleared.

## Case-specific deltas

- **610**: `Shading:Zone:Detailed` south overhang, 1.0 m deep × 8 m wide,
  z = 2.7 m. Vertices and `Base Surface Name = ZONE SURFACE ROOF` taken
  verbatim from the real OpenStudio-forward-translated
  `910_test_output.idf` (High-Mass South Shading — the only official
  test-output artifact containing this shading surface), cross-checked
  against the raw `OS:ShadingSurface` geometry in
  `Bestest_Geo_South_12_1_0.osm` — both agree exactly. Note the base
  surface is the ROOF, not the south wall, in the real official output;
  replicated as-is rather than "fixed" to something that looked more
  intuitive. `Transmittance Schedule Name` left blank (the OSM's referenced
  schedule is a constant-zero/always-opaque schedule — E+'s default
  behavior for a blank field is also fully opaque, so this is a
  zero-behavioral-difference simplification, one fewer object).
- **620**: the two 3×2 m `FenestrationSurface:Detailed` windows moved from
  `ZONE SURFACE SOUTH` to one each on `ZONE SURFACE EAST` and
  `ZONE SURFACE WEST`. Vertices taken verbatim from
  `Bestest_Geo_EastWest_6_0_0.osm`'s `OS:SubSurface` objects
  ("ZONE SUBSURFACE 1 EAST WINDOW" / "... 2 WEST WINDOW"). Construction
  (`Double Pane Window`), `Multiplier` (1) and `View Factor to Ground`
  (0.5) unchanged. Note on `bestest_case_var_lib.rb`'s `glass_area: 6.0` for
  this case: this is per-orientation area (6 m² on the E facade + 6 m² on
  the W facade = 12 m² total, matching Case 600's south-facing 12 m² total
  and the OSM's actual 3×2 m per-window geometry), not a total-glazing
  figure like the `'S'`-oriented cases use — reconciled by cross-checking
  against the OSM vertices directly rather than trusting the var_lib field
  name in isolation.
- **640**: heating setpoint schedule replaced. See "Setback schedule
  judgment call" below — the final schedule is the ramped `Schedule:Compact`
  from `bestest_resources.osm` (not the plain step function from the
  builder spec's §3.2 prose, which was tried first and rejected — it failed
  Gate B). `Timestep` bumped 4→6 for cases 640/940 only, matching the ramp's
  sub-hourly resolution. Cooling stays constant 27°C (unchanged
  `ThermostatSetpoint:DualSetpoint` cooling reference).
- **900**: exterior wall construction (`LTWALL` → `HWWALL`: WOOD SIDING-1 /
  FOAM INSULATION / CONCRETE BLOCK) and floor construction (`LTFLOOR` →
  `HWFLOOR`: R-25 INSULATION 1 / CONCRETE SLAB) on the 4 wall surfaces +
  floor surface. Roof (`LTROOF`), windows, gains, infiltration, setpoints
  unchanged. All material layer properties (thickness, conductivity,
  density, specific heat) taken verbatim from `bestest_resources.osm`'s
  `BESTEST HW` `DefaultConstructionSet`, and cross-checked byte-for-byte
  against `910_test_output.idf`'s own `Material`/`Construction` objects
  (910 = 900 + south overhang, the only official test-output artifact
  containing HWWALL/HWFLOOR) — both sources agree exactly on every number.
- **940**: 900 + 640 (heavyweight constructions + the setback schedule),
  same content as each independently.

## Setback schedule judgment call (640/940) — reasoning and reversal

`bestest_case_var_lib.rb` only tags 640/940 as
`htg_set/clg_set = 'SETBACK'`; it carries no hour-by-hour detail. Two
sources of truth were tried, in order:

1. **First attempt**: the actual profile the measure applies
   (`measures/bestest_building_thermal_envelope_and_fabric_load/measure.rb`
   clones a ScheduleRuleset named `"BESTEST htg SETBACK"` out of
   `bestest_resources.osm`) — a six-substep ramp from 10 to 20 °C across
   07:00–08:00 in 10-minute steps, constant 20 °C to 23:00, then an
   instant drop back to 10 °C. This is NOT the plain step function
   described in this spec's own §3.2 prose.
   - Implementing the ramp as-is (against our locked base file's
     `Timestep, 4;` = 15-min resolution) misaligned four of the ramp's
     10-minute boundaries (07:10/07:20/07:40/07:50) and EnergyPlus raised
     4 NEW `"ProcessScheduleInput: DecodeHHMMField, Invalid 'until' field
     value is not a multiple of the minutes for each timestep"` warnings —
     patterns absent from the Case 600 baseline, which would fail Gate D.
   - **First reversal**: reverted to the plain step function from §3.2's
     own prose ("23:00–07:00 → 10°C, 07:00–23:00 → 20°C") since it is also
     literally how ASHRAE Standard 140 itself states Case 640 (a
     straight setback, no ramp is normatively required) and 07:00/23:00
     are exact 15-minute multiples — zero new warnings.
   - **This reversal then FAILED Gate B**: case 640's `peak_heating_kW`
     measured 5.5416 kW — 19% above the published range max (4.658) AND
     22% above EnergyPlus 9.0.1 (4.559): BOTH clauses of Gate B failed
     (escalation trigger #1). Root cause: `ZoneHVAC:IdealLoadsAirSystem`
     has unlimited capacity by default, so an instantaneous 10°C setpoint
     step forces the ENTIRE 10°C gap to close within one 15-minute
     timestep, producing an unrealistic power spike. This is exactly why
     NREL's official model uses a ramp — confirmed further by EnergyPlus
     9.0.1's own official peak-heating HOUR for case 940 being hour 9 (not
     midnight, unlike every other case in the results JSON), consistent
     with the ramp period driving the peak.
2. **Final answer**: restore the real 6-substep ramp AND match its
   resolution — `measure.rb` also unconditionally sets
   `timestep.setNumberOfTimestepsPerHour(6)` (10-min resolution) for every
   BESTEST-GSR case; this is what the ramp was authored for. Cases 640/940
   alone bump `Timestep` 4 → 6 (an explicit, narrowly-scoped,
   same-authority-sourced delta — the base 600/610/620/900 cases are
   untouched). With the timestep grid matched to the schedule grid, all
   `DecodeHHMMField` misalignment warnings disappear (0 new warning
   patterns vs Case 600) and case 640's `peak_heating_kW` measures
   4.4903 kW — inside the published range [4.0385, 4.6580] and within
   1.5% of EnergyPlus 9.0.1 (4.5585).

Reused `ScheduleTypeLimits "Temperature 1"` (already defined in the base
IDF, used by the `"20.0 C"`/`"27.0 C"` `Schedule:Constant` objects) for the
new `Schedule:Compact` rather than introducing a new `ScheduleTypeLimits`
object.

## ESO metric variable — judgment call

The spec's §3.3 prose names the metric
`"Zone Ideal Loads Zone Sensible Heating/Cooling Energy"`. The vendored
`case_en_600.orig.idf`'s own `Output:Variable` requests (never touched by
any case derivation) only request
`"Zone Air System Sensible Heating/Cooling Energy"` — the
`"Zone Ideal Loads Zone ..."` variable is never present in any case's ESO
data dictionary (grep-verified). Verified empirically against §1.5's
reference numbers: summing `"Zone Air System Sensible Heating/Cooling
Energy"` for the transitioned Case 600 gives annual heating 4.2201 MWh,
annual cooling 6.2592 MWh, peak heating 3.1525 kW, peak cooling 6.6043 kW —
matching §1.5's 4.2201 / 6.2590 / 3.1525 / 6.6043 to 4 significant digits.
This is the correct variable; the spec's prose name was informal shorthand
for "the ideal-loads zone-delivered sensible energy", which in this
specific model is reported under the `"Zone Air System Sensible ..."` name.

## Gate D warning whitelist — derivation

The 23-entry whitelist in `test/ep_ashrae140_gate.mjs` was derived by
running the normalization function over the transitioned Case 600's real
`eplusout.err` (both primary `"** Warning **"` lines and their `"~~~"`
continuation detail lines, digits and quoted substrings normalized to `#`
and `"X"`) and taking the 23 distinct resulting categories. Case-to-case
count variation is expected and does not indicate a problem:
`CheckUsedConstructions` reports `"4"` instead of `"2"` for 900/940 (LTWALL/
LTFLOOR become unused once HWWALL/HWFLOOR are substituted — matches the
`#` wildcard); the overall `eplusout.end` tally is `20` instead of `19` for
640/940 (their higher Timestep, 6 vs 4/hour, calls the psychrometric
recurring-warning routines more often and crosses the same internal
recurring-warning threshold one extra time, with the identical set of
VISIBLE warning-line texts as Case 600 — confirmed by direct diff). This is
exactly why the spec instructs "whitelist by pattern, not count."

## Gate results (2026-07-07 run)

All 6 cases: Gate A (WASM==native ESO) max relΔ = 5.91e-8 (worse than E1's
2.8e-9 reference — flagged per spec, but well inside the 1e-6 threshold);
Gate B passes for all 24 metric checks (4 metrics × 6 cases); Gate D passes
for all 6 cases (0 Severe both runs, warning count matches native==wasm
per case, 0 un-whitelisted warning patterns).

## Gate C — resolved by planner ruling (2026-07-07)

**Original open escalation (per §3.6 trigger #4, not silently patched):**
case 620's `peak_cooling_kW` sensitivity delta vs Case 600 is -1.7628 kW
(model) vs -1.5541 kW (EnergyPlus 9.0.1) — |diff| = 0.2087, base tolerance
= max(0.15, 10% × 1.5541) = 0.1554. This was the only failing check across
all 4 clauses × 6 cases × (4 metrics + Gate C variants). The window
geometry was re-verified twice against `Bestest_Geo_EastWest_6_0_0.osm`'s
raw vertices (byte-identical to what is in `case620.idf`) — no
transcription error found.

**New evidence — peak-timestamp match table.** The validator and planner
matched the peak-cooling-hour timestamp in BOTH EnergyPlus 9.0.1 (official
results) and our native 26.1 run, for both Case 600 and Case 620:

| Case | Engine | Peak cooling | Timestamp |
|---|---|---|---|
| 600 | E+ 9.0.1 | 6.3516 kW | Jan 22, hour 14 |
| 600 | native 26.1 (ours) | 6.6043 kW | Jan 22, hour 14 |
| 620 | E+ 9.0.1 | 4.7974 kW | Jun 26, hour 17 |
| 620 | native 26.1 (ours) | 4.8415 kW | Jun 26, hour 17 |

Case 600 drifted +3.98% (6.3516 → 6.6043 kW); Case 620 drifted only +0.92%
(4.7974 → 4.8415 kW). Method: E+ 9.0.1 timestamps came from
`std140_tf_output.json`'s `conditioned_zone_loads_non_free_float` fields;
ours were parsed from the ESO's day-stamp records preceding the max hourly
`Zone Air System Sensible Cooling Energy` value.

Since the argmax hour never moved across 17 EnergyPlus releases for either
case, this proves the drift is a real, event-specific magnitude change —
not a geometry/derivation error, which would have moved the peak event
and/or broken the annual-cooling delta check. The annual-cooling delta for
Case 620 corroborates: Δmodel = -2.0900, Δep901 = -1.9675, |diff| = 0.1225
≤ tolerance 0.1968 — passes comfortably, further evidence the geometry and
derivation are correct.

**Planner ruling:** grant ONE narrowly-scoped, documented tolerance
override for this exact cell (case 620 / `peak_cooling_kW`, Gate C only) —
the base Gate C formula is untouched for every other case/metric, so it
keeps catching real derivation errors elsewhere. `tolAbs = 0.32` kW, chosen
as 5% of `ep901_600`'s peak_cooling_kW (6.3516 × 0.05 = 0.3176, rounded up
to 0.32) — mirroring Gate B's own 5%-of-ep901 drift-tolerance clause, since
a real derivation error (e.g. wrong window orientation/area) would produce
|diff| ≈ 1.5–1.55 kW, still failing this override by a 5× margin. The
override can only WIDEN the applicable tolerance
(`tol = max(baseTol, override.tolAbs)`), never narrow it. See
`gateC_overrides` in `ashrae140_ranges.json` and the `OVERRIDE` log line in
`test/ep_ashrae140_gate.mjs`.
