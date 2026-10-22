// Standalone WebAssembly smoke test (no native oracle needed).
// Runs one model through build/wasm-ep and checks EnergyPlus completed successfully.
// Run: node test/ep_wasm_smoke.mjs [model.idf] [weather.epw]
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const idfPath = process.argv[2] || path.join(root, 'energyplus-src/testfiles/1ZoneUncontrolled.idf');
const epwPath = process.argv[3] || path.join(root, 'energyplus-src/weather/USA_IL_Chicago-OHare.Intl.AP.725300_TMY3.epw');

const require = createRequire(import.meta.url);
const createEnergyPlusModule = require(path.join(root, 'build/wasm-ep/Products/energyplus.js'));

const t0 = performance.now();
const Module = await createEnergyPlusModule({ print: () => {}, printErr: () => {} });
Module.FS.writeFile('/in.idf', fs.readFileSync(idfPath));
Module.FS.writeFile('/weather.epw', fs.readFileSync(epwPath));
Module.FS.mkdir('/out');
try {
  Module.callMain(['-w', '/weather.epw', '-d', '/out', '/in.idf']);
} catch (e) {
  if (!(e && e.name === 'ExitStatus')) throw e;
}
const seconds = (performance.now() - t0) / 1000;

const end = Module.FS.readFile('/out/eplusout.end', { encoding: 'utf8' }).trim();
const esoLines = Module.FS.readFile('/out/eplusout.eso', { encoding: 'utf8' }).split('\n').length;
console.log(`${path.basename(idfPath)}: ${end}`);
console.log(`eplusout.eso: ${esoLines} lines; ${seconds.toFixed(2)} s`);
if (!end.includes('EnergyPlus Completed Successfully')) {
  console.error(Module.FS.readFile('/out/eplusout.err', { encoding: 'utf8' }));
  process.exit(1);
}
