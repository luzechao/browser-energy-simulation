// E2 gate 2: 5ZoneAirCooled (multi-zone, windows, solar distribution, HVAC),
// Chicago O'Hare TMY3. Native oracle vs energyplus.wasm — max relΔ ≤ 1e-6.
// Run: node test/ep_5zone_gate.mjs
import { runGate, repoPath } from './lib/ep_gate_common.mjs';

await runGate(
  '5ZoneAirCooled',
  repoPath('energyplus-src/testfiles/5ZoneAirCooled.idf'),
  repoPath('energyplus-src/weather/USA_IL_Chicago-OHare.Intl.AP.725300_TMY3.epw'),
);
