// E2 gate 1: 1ZoneUncontrolled (pure heat balance), Cairo TMYx.
// Native oracle vs energyplus.wasm — max relΔ ≤ 1e-6 on eplusout.eso.
// Run: node test/ep_1zone_gate.mjs
import { runGate, repoPath } from './lib/ep_gate_common.mjs';

await runGate(
  '1ZoneUncontrolled',
  repoPath('energyplus-src/testfiles/1ZoneUncontrolled.idf'),
  repoPath('weather/EGY_QH_Cairo.Intl.AP.623660_TMYx.2007-2021.epw'),
);
