// Deterministic text-transform generator: case_en_600.orig.idf (v9.3, pristine,
// vendored verbatim from BESTEST-GSR @ 80c3f2e56a501da996676086573f4c7f29fe9c5c)
// -> six v26.1 IDFs (case600/610/620/640/900/940). Pure text transforms only —
// running this script twice must produce byte-identical output files.
//
// Provenance for every transform is recorded in PROVENANCE.md. Run:
//   node test/ep-reference/ashrae140/derive_cases.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const ORIG = fs.readFileSync(path.join(DIR, 'case_en_600.orig.idf'), 'utf8');

// --- Transition 9.3 -> 26.1 (verified sufficient, PHASE5E_ASHRAE140_SOURCING.md §1.5) ---
// Insert a blank "Space Name" field after "!- Zone Name" in each of the 6
// BuildingSurface:Detailed objects; bump Version 9.3 -> 26.1. No other edits.
function transition(text) {
  let out = text.replace(
    /BuildingSurface:Detailed,[\s\S]*?!- Zone Name\n/g,
    (m) => m + '  ,                                       !- Space Name\n',
  );
  const versionRe = /^Version,\n  9\.3;\s*!- Version Identifier$/m;
  if (!versionRe.test(out)) {
    throw new Error('transition(): Version 9.3 object not found — base IDF changed?');
  }
  out = out.replace(versionRe, 'Version,\n  26.1;                                   !- Version Identifier');
  return out;
}

// --- Case 610: south overhang -------------------------------------------------
// Shading:Zone:Detailed, 1.0 m deep, full 8 m south facade, z = 2.7 m.
// Vertices + "Base Surface Name = ZONE SURFACE ROOF" taken verbatim from the
// real OpenStudio-forward-translated 910_test_output.idf (High-Mass South
// Shading, the only official test-output artifact that contains this
// overhang) and cross-checked against the raw geometry in
// shared_resources/Bestest_Geo_South_12_1_0.osm's OS:ShadingSurface. Both
// agree exactly. Transmittance Schedule Name left blank: the referenced
// "Sch 2" schedule in the OSM is a constant-zero (always opaque) schedule,
// which is exactly the E+ default when the field is blank — no behavioral
// difference, one fewer object to carry.
const OVERHANG_BLOCK = `
Shading:Zone:Detailed,
  SOUTH WALL OVERHANG,                    !- Name
  ZONE SURFACE ROOF,                      !- Base Surface Name
  ,                                       !- Transmittance Schedule Name
  ,                                       !- Number of Vertices
  8, 0, 2.7,                              !- X,Y,Z Vertex 1 {m}
  8, -1, 2.7,                             !- X,Y,Z Vertex 2 {m}
  0, -1, 2.7,                             !- X,Y,Z Vertex 3 {m}
  0, 0, 2.7;                              !- X,Y,Z Vertex 4 {m}
`;
function addOverhang(text) {
  return text.trimEnd() + '\n' + OVERHANG_BLOCK;
}

// --- Case 620: relocate the two 3x2 m windows from south to east + west -----
// Vertices taken verbatim from shared_resources/Bestest_Geo_EastWest_6_0_0.osm
// (OS:SubSurface "ZONE SUBSURFACE 1 EAST WINDOW" / "... 2 WEST WINDOW").
// Construction ("Double Pane Window"), Multiplier (1) and View Factor to
// Ground (0.5) unchanged, per spec.
const SUBSURFACE_1_SOUTH = `FenestrationSurface:Detailed,
  ZONE SUBSURFACE 1,                      !- Name
  Window,                                 !- Surface Type
  Double Pane Window,                     !- Construction Name
  ZONE SURFACE SOUTH,                     !- Building Surface Name
  ,                                       !- Outside Boundary Condition Object
  0.5,                                    !- View Factor to Ground
  ,                                       !- Frame and Divider Name
  1,                                      !- Multiplier
  ,                                       !- Number of Vertices
  0.5, 0, 2.2,                            !- X,Y,Z Vertex 1 {m}
  0.5, 0, 0.2,                            !- X,Y,Z Vertex 2 {m}
  3.5, 0, 0.2,                            !- X,Y,Z Vertex 3 {m}
  3.5, 0, 2.2;                            !- X,Y,Z Vertex 4 {m}`;

const SUBSURFACE_1_EAST = `FenestrationSurface:Detailed,
  ZONE SUBSURFACE 1,                      !- Name
  Window,                                 !- Surface Type
  Double Pane Window,                     !- Construction Name
  ZONE SURFACE EAST,                      !- Building Surface Name
  ,                                       !- Outside Boundary Condition Object
  0.5,                                    !- View Factor to Ground
  ,                                       !- Frame and Divider Name
  1,                                      !- Multiplier
  ,                                       !- Number of Vertices
  8, 1.5, 2.2,                            !- X,Y,Z Vertex 1 {m}
  8, 1.5, 0.2,                            !- X,Y,Z Vertex 2 {m}
  8, 4.5, 0.2,                            !- X,Y,Z Vertex 3 {m}
  8, 4.5, 2.2;                            !- X,Y,Z Vertex 4 {m}`;

const SUBSURFACE_2_SOUTH = `FenestrationSurface:Detailed,
  ZONE SUBSURFACE 2,                      !- Name
  Window,                                 !- Surface Type
  Double Pane Window,                     !- Construction Name
  ZONE SURFACE SOUTH,                     !- Building Surface Name
  ,                                       !- Outside Boundary Condition Object
  0.5,                                    !- View Factor to Ground
  ,                                       !- Frame and Divider Name
  1,                                      !- Multiplier
  ,                                       !- Number of Vertices
  4.5, 0, 2.2,                            !- X,Y,Z Vertex 1 {m}
  4.5, 0, 0.2,                            !- X,Y,Z Vertex 2 {m}
  7.5, 0, 0.2,                            !- X,Y,Z Vertex 3 {m}
  7.5, 0, 2.2;                            !- X,Y,Z Vertex 4 {m}`;

const SUBSURFACE_2_WEST = `FenestrationSurface:Detailed,
  ZONE SUBSURFACE 2,                      !- Name
  Window,                                 !- Surface Type
  Double Pane Window,                     !- Construction Name
  ZONE SURFACE WEST,                      !- Building Surface Name
  ,                                       !- Outside Boundary Condition Object
  0.5,                                    !- View Factor to Ground
  ,                                       !- Frame and Divider Name
  1,                                      !- Multiplier
  ,                                       !- Number of Vertices
  0, 4.5, 2.2,                            !- X,Y,Z Vertex 1 {m}
  0, 4.5, 0.2,                            !- X,Y,Z Vertex 2 {m}
  0, 1.5, 0.2,                            !- X,Y,Z Vertex 3 {m}
  0, 1.5, 2.2;                            !- X,Y,Z Vertex 4 {m}`;

function relocateWindowsEastWest(text) {
  if (!text.includes(SUBSURFACE_1_SOUTH)) throw new Error('relocateWindowsEastWest(): SUBSURFACE 1 south block not found verbatim');
  if (!text.includes(SUBSURFACE_2_SOUTH)) throw new Error('relocateWindowsEastWest(): SUBSURFACE 2 south block not found verbatim');
  let out = text.replace(SUBSURFACE_1_SOUTH, SUBSURFACE_1_EAST);
  out = out.replace(SUBSURFACE_2_SOUTH, SUBSURFACE_2_WEST);
  return out;
}

// --- Case 640/940: thermostat setback ----------------------------------------
// bestest_case_var_lib.rb only tags 640/940 as htg_set/clg_set = 'SETBACK' —
// it carries no hour-by-hour schedule detail. The measure that applies it
// (measures/bestest_building_thermal_envelope_and_fabric_load/measure.rb)
// clones a ScheduleRuleset named "BESTEST htg SETBACK" out of
// shared_resources/bestest_resources.osm: a six-substep RAMP from 10 to
// 20 C across 07:00-08:00 in 10-minute steps (07:00->10, 07:10->11.67,
// 07:20->13.33, 07:30->15, 07:40->16.67, 07:50->18.33, 08:00->20), constant
// 20 C through 23:00, then an instantaneous drop back to 10 C.
//
// JUDGMENT CALL (revised after empirical check against gate B — see below):
// first attempt used the plain step function from this spec's own §3.2
// prose ("23:00-07:00 -> 10C, 07:00-23:00 -> 20C", no ramp) since the ramp's
// 10-minute boundaries don't land on our locked base file's `Timestep, 4;`
// (15-min) grid and raised 4 new "DecodeHHMMField ... not a multiple of the
// minutes for each timestep" warnings. That attempt PASSED gate D cleanly
// but FAILED gate B for case 640's peak_heating_kW: with an unlimited-
// capacity ZoneHVAC:IdealLoadsAirSystem, an instantaneous 10 C setpoint step
// forces the full 10 C temperature gap to close within a single 15-minute
// timestep, producing an unrealistic power spike (measured 5.54 kW — 19%
// above the published range max of 4.658 kW AND 22% above EnergyPlus
// 9.0.1's 4.559 kW: BOTH clauses of gate B fail, escalation trigger #1).
// This is exactly why the ramp exists: spreading the 10 C rise over six
// substeps keeps any single timestep's temperature change small. Since
// EnergyPlus 9.0.1's official case 640 peak-heating HOUR is not midnight
// (unlike every other case) — it is measured during the 07:00-08:00 window
// — this confirms the ramp is load-bearing physics for this metric, not a
// cosmetic modeling nicety.
// Fix: use the real ramp AND match its resolution — measure.rb also
// unconditionally sets `timestep.setNumberOfTimestepsPerHour(6)` (10-min
// resolution) for every BESTEST-GSR case, which is what the ramp was
// authored for. Cases 640/940 alone bump Timestep 4 -> 6 (an explicit,
// narrowly-scoped, same-authority-sourced delta — not a change to the
// locked case 600/610/620/900 base); with the timestep grid matched to the
// schedule grid, all DecodeHHMMField misalignment warnings disappear and
// case 640's peak_heating_kW measures 4.4903 kW — inside the published
// range and within 1.5% of EnergyPlus 9.0.1 (see PROVENANCE.md for the
// full before/after numbers).
// Cooling stays constant 27 C for setback cases (measure.rb line ~324-327),
// matching the spec prose exactly.
// Reused ScheduleTypeLimits "Temperature 1" (already defined in the base
// IDF and used by the "20.0 C"/"27.0 C" Schedule:Constant objects) rather
// than introducing a new ScheduleTypeLimits object.
const HTG_SETPOINT_LINE = '  20.0 C,                                 !- Heating Setpoint Temperature Schedule Name';
const HTG_SETBACK_LINE = '  Heating Setback Schedule,               !- Heating Setpoint Temperature Schedule Name';
const TIMESTEP_4_BLOCK = 'Timestep,\n  4;                                      !- Number of Timesteps per Hour';
const TIMESTEP_6_BLOCK = 'Timestep,\n  6;                                      !- Number of Timesteps per Hour';

const SETBACK_SCHEDULE_BLOCK = `
Schedule:Compact,
  Heating Setback Schedule,               !- Name
  Temperature 1,                          !- Schedule Type Limits Name
  Through: 12/31,                         !- Field 1
  For: AllDays,                           !- Field 2
  Until: 07:00,                           !- Field 3
  10,                                     !- Field 4
  Until: 07:10,                           !- Field 5
  11.67,                                  !- Field 6
  Until: 07:20,                           !- Field 7
  13.33,                                  !- Field 8
  Until: 07:30,                           !- Field 9
  15,                                     !- Field 10
  Until: 07:40,                           !- Field 11
  16.67,                                  !- Field 12
  Until: 07:50,                           !- Field 13
  18.33,                                  !- Field 14
  Until: 08:00,                           !- Field 15
  20,                                     !- Field 16
  Until: 23:00,                           !- Field 17
  20,                                     !- Field 18
  Until: 24:00,                           !- Field 19
  10;                                     !- Field 20
`;

function addSetbackSchedule(text) {
  if (!text.includes(HTG_SETPOINT_LINE)) {
    throw new Error('addSetbackSchedule(): heating setpoint schedule line not found verbatim');
  }
  if (!text.includes(TIMESTEP_4_BLOCK)) {
    throw new Error('addSetbackSchedule(): Timestep=4 block not found verbatim');
  }
  let out = text.replace(HTG_SETPOINT_LINE, HTG_SETBACK_LINE);
  out = out.replace(TIMESTEP_4_BLOCK, TIMESTEP_6_BLOCK);
  out = out.trimEnd() + '\n' + SETBACK_SCHEDULE_BLOCK;
  return out;
}

// --- Case 900/940: heavyweight (concrete block wall + foam insulation; -----
// concrete slab floor). Roof, windows, gains, infiltration, setpoints
// unchanged. Layer properties taken verbatim from shared_resources/
// bestest_resources.osm's "BESTEST HW" DefaultConstructionSet, and
// cross-checked byte-for-byte against measures/
// bestest_building_thermal_envelope_and_fabric_load_reporting/tests/
// 910_test_output.idf (High-Mass South Shading — the one official
// test-output artifact that actually contains the HWWALL/HWFLOOR
// constructions) — both sources agree exactly on every material property.
const HEAVYWEIGHT_MATERIALS_BLOCK = `
Material,
  CONCRETE BLOCK,                         !- Name
  Rough,                                  !- Roughness
  0.1,                                    !- Thickness {m}
  0.51,                                   !- Conductivity {W/m-K}
  1400,                                   !- Density {kg/m3}
  1000,                                   !- Specific Heat {J/kg-K}
  0.9,                                    !- Thermal Absorptance
  0.6,                                    !- Solar Absorptance
  0.6;                                    !- Visible Absorptance

Material,
  CONCRETE SLAB,                          !- Name
  Rough,                                  !- Roughness
  0.08,                                   !- Thickness {m}
  1.13,                                   !- Conductivity {W/m-K}
  1400,                                   !- Density {kg/m3}
  1000,                                   !- Specific Heat {J/kg-K}
  0.9,                                    !- Thermal Absorptance
  0.6,                                    !- Solar Absorptance
  0.6;                                    !- Visible Absorptance

Material,
  FOAM INSULATION,                        !- Name
  Rough,                                  !- Roughness
  0.0615,                                 !- Thickness {m}
  0.04,                                   !- Conductivity {W/m-K}
  10,                                     !- Density {kg/m3}
  1400,                                   !- Specific Heat {J/kg-K}
  0.9,                                    !- Thermal Absorptance
  0.6,                                    !- Solar Absorptance
  0.6;                                    !- Visible Absorptance

Material:NoMass,
  R-25 INSULATION 1,                      !- Name
  Rough,                                  !- Roughness
  25.175,                                 !- Thermal Resistance {m2-K/W}
  0.9,                                    !- Thermal Absorptance
  0.6,                                    !- Solar Absorptance
  0.6;                                    !- Visible Absorptance

Construction,
  HWWALL,                                 !- Name
  WOOD SIDING-1,                          !- Layer 1
  FOAM INSULATION,                        !- Layer 2
  CONCRETE BLOCK;                         !- Layer 3

Construction,
  HWFLOOR,                                !- Name
  R-25 INSULATION 1,                      !- Layer 1
  CONCRETE SLAB;                          !- Layer 2
`;

function addHeavyweightConstructions(text) {
  const wallRe = /(Wall,\s*!- Surface Type\r?\n\s*)LTWALL(,\s*!- Construction Name)/g;
  const floorRe = /(Floor,\s*!- Surface Type\r?\n\s*)LTFLOOR(,\s*!- Construction Name)/g;
  const nWall = (text.match(wallRe) || []).length;
  const nFloor = (text.match(floorRe) || []).length;
  if (nWall !== 4) throw new Error(`addHeavyweightConstructions(): expected 4 LTWALL surfaces, found ${nWall}`);
  if (nFloor !== 1) throw new Error(`addHeavyweightConstructions(): expected 1 LTFLOOR surface, found ${nFloor}`);
  let out = text.replace(wallRe, '$1HWWALL$2');
  out = out.replace(floorRe, '$1HWFLOOR$2');
  out = out.trimEnd() + '\n' + HEAVYWEIGHT_MATERIALS_BLOCK;
  return out;
}

// --- Assemble the six cases ---------------------------------------------------
const cases = {
  case600: transition(ORIG),
  case610: addOverhang(transition(ORIG)),
  case620: relocateWindowsEastWest(transition(ORIG)),
  case640: addSetbackSchedule(transition(ORIG)),
  case900: addHeavyweightConstructions(transition(ORIG)),
  case940: addSetbackSchedule(addHeavyweightConstructions(transition(ORIG))),
};

for (const [name, text] of Object.entries(cases)) {
  const outPath = path.join(DIR, `${name}.idf`);
  fs.writeFileSync(outPath, text);
  console.log(`wrote ${outPath} (${text.length} bytes)`);
}

// Determinism self-check: re-run the pure transforms in-process and confirm
// byte-identical output (the actual "run the script twice" invariant is
// checked by test/ep_ashrae140_gate.mjs at gate time via a checksum compare,
// but this in-process check catches any accidental non-determinism source
// — e.g. object property iteration order — immediately at authoring time).
const cases2 = {
  case600: transition(ORIG),
  case610: addOverhang(transition(ORIG)),
  case620: relocateWindowsEastWest(transition(ORIG)),
  case640: addSetbackSchedule(transition(ORIG)),
  case900: addHeavyweightConstructions(transition(ORIG)),
  case940: addSetbackSchedule(addHeavyweightConstructions(transition(ORIG))),
};
for (const name of Object.keys(cases)) {
  if (cases[name] !== cases2[name]) {
    throw new Error(`Non-deterministic output detected for ${name} — derive_cases.mjs must be a pure text transform`);
  }
}
console.log('Determinism self-check: PASS (all 6 cases byte-identical across two in-process runs)');
