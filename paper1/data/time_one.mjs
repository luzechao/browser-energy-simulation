// R-3 timing probe: one (engine, case) run per process invocation.
// Reuses the gate suite's own runNative/runWasm so the timing methodology is
// identical to the E2 gates: native = execFileSync wall time of the E+ binary;
// wasm = callMain wall time (module already instantiated, FS already loaded).
// Usage: node paper1/data/time_one.mjs <native|wasm> <idf> <epw>
import { runNative, runWasm } from '../../test/lib/ep_gate_common.mjs';

const [, , engine, idf, epw] = process.argv;
if (engine === 'native') {
  const r = runNative(idf, epw);
  console.log(r.seconds.toFixed(3));
} else if (engine === 'wasm') {
  const r = await runWasm(idf, epw);
  console.log(r.seconds.toFixed(3));
} else {
  console.error('engine must be native|wasm');
  process.exit(1);
}
