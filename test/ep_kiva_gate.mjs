// E2 gate 3: ZoneCoupledKivaSlab (Kiva ground heat transfer).
// IDF Site:Location = Ohare Intl Ap IL USA TMY3 WMO#=725300 → Chicago O'Hare TMY3.
// Native oracle vs energyplus.wasm — max relΔ ≤ 1e-6 on eplusout.eso.
// Run: node test/ep_kiva_gate.mjs
import { runGate, repoPath } from './lib/ep_gate_common.mjs';

await runGate(
  'ZoneCoupledKivaSlab',
  repoPath('energyplus-src/testfiles/ZoneCoupledKivaSlab.idf'),
  repoPath('energyplus-src/weather/USA_IL_Chicago-OHare.Intl.AP.725300_TMY3.epw'),
);
