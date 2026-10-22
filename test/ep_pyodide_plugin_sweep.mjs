// Runs every upstream PythonPlugin*.idf example through the Pyodide build in one Pyodide session and reports which
// ones complete. The examples come from energyplus-pyodide/testfiles with their plugin .py files; all use the
// bundled Chicago weather (upstream pairs several with other locations, so location warnings are expected).
//
// PythonPluginTestMathAndKill is registered upstream with EXPECT_FATAL, but at v26.1.0 it never reaches its plugin:
// its zone splitter outlets bypass the air terminals ("connects to no component"; the baseline build without Python
// fails identically), and its psychrometric test calls specific_heat(state, w, T) against the 26.1 signature
// specific_heat(state, w). A corrected variant ("TestMathAndKill (fixed)") is therefore run as well; it must pass
// the plugin's trend, curve/table, psychrometric and glycol checks and stop through the plugin's own abort.
//
// Run: node --use-system-ca test/ep_pyodide_plugin_sweep.mjs [name-filter]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { installEnergyPlus, runEnergyPlus } from '../packages/sim-engine-wasm/dist/index.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const products = process.env.EP_PYODIDE_PRODUCTS || path.join(root, 'build/pyodide-ep/Products');
const pyodideDir = process.env.PYODIDE_DIR || path.join(root, 'third_party/pyodide/pyodide');
const testfiles = path.join(root, 'energyplus-pyodide/testfiles');
const epw = fs.readFileSync(path.join(root, 'energyplus-src/weather/USA_IL_Chicago-OHare.Intl.AP.725300_TMY3.epw'));
const filter = process.argv[2] || '';
// Expected to stop with a fatal error (see header).
const EXPECTED_FAILURES = new Set(['PythonPluginTestMathAndKill.idf']);

const { loadPyodide } = await import(pathToFileURL(path.join(pyodideDir, 'pyodide.mjs')).href);
const pyodide = await loadPyodide({ indexURL: pyodideDir + '/', stdout: () => {}, stderr: () => {} });
await installEnergyPlus(pyodide, async (name) => fs.readFileSync(path.join(products, name)));

const models = fs.readdirSync(testfiles).filter((f) => /^PythonPlugin.*\.idf$/.test(f) && f.includes(filter)).sort();
let unexpected = 0;
for (const model of models) {
  const idf = fs.readFileSync(path.join(testfiles, model), 'utf8');
  const modules = [...idf.matchAll(/^\s*([^,;!\s]+)\s*[,;]\s*!-\s*Python Module Name/gim)].map((m) => m[1]);
  const files = {};
  for (const module of new Set(modules)) {
    const file = path.join(testfiles, `${module}.py`);
    if (fs.existsSync(file)) files[`${module}.py`] = fs.readFileSync(file);
  }
  const t0 = performance.now();
  let status;
  try {
    const run = runEnergyPlus(pyodide, { idf, epw, files });
    const end = (run.readText('eplusout.end') || '').trim();
    const ok = run.exitCode === 0 && /Completed Successfully.* 0 Severe/.test(end);
    const expected = EXPECTED_FAILURES.has(model) ? !ok : ok;
    if (!expected) unexpected++;
    status = `${expected ? 'ok  ' : 'FAIL'} exit ${run.exitCode}; ${end.replace(/; Elapsed.*/, '') || 'no eplusout.end'}`;
    if (!expected) {
      const err = run.readText('eplusout.err') || '';
      status += '\n      ' + err.split('\n').filter((l) => /Severe|Fatal|Error|Traceback|>>>/.test(l)).slice(0, 8).join('\n      ');
    }
  } catch (error) {
    unexpected++;
    status = `FAIL threw ${error}`;
  }
  console.log(`${model.padEnd(64)} ${((performance.now() - t0) / 1000).toFixed(1).padStart(6)} s  ${status}`);
}

let total = models.length;
if (models.includes('PythonPluginTestMathAndKill.idf')) {
  total++;
  const name = 'PythonPluginTestMathAndKill (fixed)';
  const idf = fs
    .readFileSync(path.join(testfiles, 'PythonPluginTestMathAndKill.idf'), 'utf8')
    .replace(/^(\s*)(\S[^,;\n]* Direct Air Inlet Node Name)(\s*[,;]\s*!-\s*Outlet \d+ Node Name)/gm, '$1$2 ATInlet$3');
  const plugin = fs
    .readFileSync(path.join(testfiles, 'PythonPluginTestMathAndKill.py'), 'utf8')
    .replace('p.specific_heat(state, hum_ratio, temp)', 'p.specific_heat(state, hum_ratio)');
  const t0 = performance.now();
  const run = runEnergyPlus(pyodide, { idf, epw, files: { 'PythonPluginTestMathAndKill.py': plugin } });
  const err = run.readText('eplusout.err') || '';
  const killed = run.exitCode !== 0 && /returned 1 to indicate EnergyPlus should abort/.test(err);
  const testsFailed = /aborting|Aborting!|connects to no component/.test(err);
  const ok = killed && !testsFailed;
  if (!ok) unexpected++;
  const detail = ok
    ? 'trend, curve/table, psychrometric and glycol checks passed; stopped by the plugin as designed'
    : err.split('\n').filter((l) => /Severe|Fatal/.test(l)).slice(0, 6).join('\n      ');
  console.log(`${name.padEnd(64)} ${((performance.now() - t0) / 1000).toFixed(1).padStart(6)} s  ${ok ? 'ok  ' : 'FAIL'} exit ${run.exitCode}; ${detail}`);
}
console.log(`${total - unexpected}/${total} behaved as expected`);
process.exit(unexpected ? 1 : 0);
