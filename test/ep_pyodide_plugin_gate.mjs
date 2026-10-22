// PythonPlugin gate for the Pyodide build (build/pyodide-ep). Three runs in one Pyodide session:
//
//  A. EnergyPlus's own PythonPluginCustomOutputVariable example (5 zones, Chicago winter + summer design days).
//     The plugin-defined "Averaged Building Temperature" must be reported at every timestep and lie within the
//     range of the five zone mean air temperatures it volume-averages.
//  B. The same IDF with test/fixtures/PythonPluginCustomOutputVariable_numpy.py (numpy loaded from the Pyodide
//     package index). Its series must match run A to 1e-9, which also proves stale plugin modules are not reused.
//     Skipped with EP_SKIP_NUMPY=1 (needs network access to the Pyodide CDN).
//  C. 1ZoneUncontrolled (no plugin) compared with the baseline build/wasm-ep binary (relative 1e-6, the repository's
//     native-vs-wasm criterion). Skipped if build/wasm-ep is absent.
//  D. (runs before C) a plugin that raises: EnergyPlus must fail with the Python traceback in eplusout.err, and the
//     same Pyodide session must still run C afterwards.
//
// Run: node --use-system-ca test/ep_pyodide_plugin_gate.mjs   (--use-system-ca only behind TLS-intercepting proxies)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { installEnergyPlus, runEnergyPlus } from '../packages/sim-engine-wasm/dist/index.js';
import { compareESO, runWasm } from './lib/ep_gate_common.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const products = process.env.EP_PYODIDE_PRODUCTS || path.join(root, 'build/pyodide-ep/Products');
const pyodideDir = process.env.PYODIDE_DIR || path.join(root, 'third_party/pyodide/pyodide');
const testfiles = path.join(root, 'energyplus-pyodide/testfiles');
const chicago = path.join(root, 'energyplus-src/weather/USA_IL_Chicago-OHare.Intl.AP.725300_TMY3.epw');
const PLUGIN_IDF = path.join(testfiles, 'PythonPluginCustomOutputVariable.idf');
const PLUGIN_MODULE = 'PythonPluginCustomOutputVariable.py';
const PLUGIN_ZONES = ['PERIMETER_ZN_1', 'PERIMETER_ZN_2', 'PERIMETER_ZN_3', 'PERIMETER_ZN_4', 'CORE_ZN'];
// Reported zone values are averages over HVAC sub-steps; the plugin samples them at the end of the zone timestep.
const SLACK_C = 0.05;

const log = [];
const fail = (msg, run) => {
  console.error(`FAIL: ${msg}`);
  if (run) console.error((run.readText('eplusout.err') || '').split('\n').slice(-40).join('\n'));
  console.error(log.slice(-20).join('\n'));
  process.exit(1);
};

function simulate(pyodide, label, request) {
  const t0 = performance.now();
  const run = runEnergyPlus(pyodide, request);
  const end = (run.readText('eplusout.end') || '').trim();
  console.log(`[${label}] exit ${run.exitCode}; ${end || 'no eplusout.end'}; ${((performance.now() - t0) / 1000).toFixed(2)} s`);
  if (run.exitCode !== 0 || !/Completed Successfully.* 0 Severe/.test(end)) fail(`${label}: EnergyPlus did not complete`, run);
  return run;
}

// Returns [{ avg, zones: [5 temps] }] for every timestep that reports the plugin's zones.
function pluginSeries(eso, run) {
  const lines = eso.split('\n');
  const header = new Map();
  let i = 0;
  for (; i < lines.length && !lines[i].startsWith('End of Data Dictionary'); i++) {
    const parts = lines[i].split(',');
    if (parts.length >= 4) header.set(parts[0], [parts[2].toUpperCase(), parts[3]]);
  }
  const avgId = [...header].find(([, [key]]) => key === 'AVERAGED BUILDING TEMPERATURE')?.[0];
  const zoneIds = [...header]
    .filter(([, [key, name]]) => PLUGIN_ZONES.includes(key) && name.startsWith('Zone Mean Air Temperature'))
    .map(([id]) => id);
  if (!avgId) fail('plugin output variable "Averaged Building Temperature" missing from ESO', run);
  if (zoneIds.length !== 5) fail(`expected 5 zone temperature series, found ${zoneIds.length}`, run);

  const series = [];
  let block = null;
  const flush = () => block && block.zones.length === 5 && series.push(block);
  for (i++; i < lines.length; i++) {
    const [id, value] = lines[i].split(',');
    if (id === '2') {
      flush();
      block = { stamp: lines[i], zones: [] };
    } else if (block && id === avgId) {
      block.avg = Number(value);
    } else if (block && zoneIds.includes(id)) {
      block.zones.push(Number(value));
    }
  }
  flush();
  return series;
}

const { loadPyodide } = await import(pathToFileURL(path.join(pyodideDir, 'pyodide.mjs')).href);
let t0 = performance.now();
const pyodide = await loadPyodide({
  indexURL: pyodideDir + '/',
  // pyodide-core ships the lockfile but no package wheels; fetch them from the matching CDN release.
  packageBaseUrl: process.env.PYODIDE_PACKAGE_BASE_URL || 'https://cdn.jsdelivr.net/pyodide/v314.0.7/full/',
  // Without this, Node caches wheels under a directory literally named after packageBaseUrl in the cwd.
  packageCacheDir: path.join(root, 'build/pyodide-cache'),
  stdout: (line) => log.push(line),
  stderr: (line) => log.push(line),
});
const apiVersion = await installEnergyPlus(pyodide, async (name) => fs.readFileSync(path.join(products, name)));
console.log(`Pyodide ${pyodide.version} + EnergyPlus API ${apiVersion} ready in ${((performance.now() - t0) / 1000).toFixed(2)} s`);

// A. stock plugin
const runA = simulate(pyodide, 'A stock plugin', {
  idf: fs.readFileSync(PLUGIN_IDF),
  epw: fs.readFileSync(chicago),
  files: { [PLUGIN_MODULE]: fs.readFileSync(path.join(testfiles, PLUGIN_MODULE)) },
});
const seriesA = pluginSeries(runA.readText('eplusout.eso'), runA);
let widest = 0;
for (const { avg, zones, stamp } of seriesA) {
  if (avg === undefined) fail(`plugin average missing at ${stamp}`, runA);
  const lo = Math.min(...zones);
  const hi = Math.max(...zones);
  if (avg < lo - SLACK_C || avg > hi + SLACK_C) fail(`average ${avg} outside zone range [${lo}, ${hi}] at ${stamp}`, runA);
  widest = Math.max(widest, hi - lo);
}
if (seriesA.length === 0) fail('no timesteps reported', runA);
console.log(`PASS A: plugin average inside the zone temperature range at all ${seriesA.length} timesteps (zone spread up to ${widest.toFixed(2)} C)`);

// B. numpy plugin
if (process.env.EP_SKIP_NUMPY === '1') {
  console.log('SKIP B: EP_SKIP_NUMPY=1');
} else {
  t0 = performance.now();
  await pyodide.loadPackage('numpy', {
    messageCallback: () => {},
    errorCallback: (message) => fail(`loadPackage(numpy): ${message}`),
  });
  console.log(`numpy loaded in ${((performance.now() - t0) / 1000).toFixed(2)} s`);
  const runB = simulate(pyodide, 'B numpy plugin', {
    idf: fs.readFileSync(PLUGIN_IDF),
    epw: fs.readFileSync(chicago),
    files: { [PLUGIN_MODULE]: fs.readFileSync(path.join(root, 'test/fixtures/PythonPluginCustomOutputVariable_numpy.py')) },
  });
  // The module EnergyPlus imported for run B must be the numpy variant, not run A's cached module.
  const pluginNumpy = pyodide.runPython(`
import sys
_m = sys.modules.get("${path.basename(PLUGIN_MODULE, '.py')}")
getattr(getattr(_m, "np", None), "__version__", None)
`);
  if (!pluginNumpy) fail('run B did not execute the numpy plugin module', runB);
  const seriesB = pluginSeries(runB.readText('eplusout.eso'), runB);
  if (seriesB.length !== seriesA.length) fail(`run B reported ${seriesB.length} timesteps, run A ${seriesA.length}`, runB);
  let maxRel = 0;
  seriesA.forEach((a, k) => {
    maxRel = Math.max(maxRel, Math.abs(a.avg - seriesB[k].avg) / Math.max(Math.abs(a.avg), 1e-30));
  });
  if (!(maxRel <= 1e-9)) fail(`numpy plugin differs from stock plugin: max rel ${maxRel}`, runB);
  console.log(`PASS B: numpy ${pluginNumpy} plugin matches stock plugin at ${seriesB.length} timesteps (max rel ${maxRel.toExponential(2)})`);
}

// D. a plugin that raises: EnergyPlus must stop with a fatal error that carries the Python traceback,
//    and the Pyodide session must survive for run C.
{
  const runD = runEnergyPlus(pyodide, {
    idf: fs.readFileSync(PLUGIN_IDF),
    epw: fs.readFileSync(chicago),
    files: { [PLUGIN_MODULE]: fs.readFileSync(path.join(root, 'test/fixtures/PythonPluginCustomOutputVariable_raises.py')) },
  });
  const err = runD.readText('eplusout.err') || '';
  if (runD.exitCode === 0) fail('raising plugin: EnergyPlus reported success', runD);
  if (!err.includes('Fatal') || !err.includes('deliberate failure from test fixture') || !err.includes('Python traceback')) {
    fail('raising plugin: eplusout.err lacks the fatal error and Python traceback', runD);
  }
  console.log(`PASS D: raising plugin -> exit ${runD.exitCode}, fatal error with Python traceback in eplusout.err`);
}

// C. no plugin, compared with the baseline Emscripten build
const baselineJs = path.join(root, 'build/wasm-ep/Products/energyplus.js');
if (!fs.existsSync(baselineJs)) {
  console.log('SKIP C: build/wasm-ep not built');
} else {
  const idfC = path.join(root, 'energyplus-src/testfiles/1ZoneUncontrolled.idf');
  const runC = simulate(pyodide, 'C 1ZoneUncontrolled', { idf: fs.readFileSync(idfC), epw: fs.readFileSync(chicago) });
  const baseline = await runWasm(idfC, chicago);
  const cmp = compareESO(baseline.eso, runC.readText('eplusout.eso'));
  if (!(cmp.maxRel <= 1e-6)) fail(`ESO differs from baseline wasm: max rel ${cmp.maxRel} ${JSON.stringify(cmp.worst[0])}`, runC);
  console.log(`PASS C: ESO matches baseline wasm (max rel ${cmp.maxRel.toExponential(2)}, ${cmp.nDiff} differing values)`);
}
