// ASHRAE Standard 140-2023 Section 7 annual-load acceptance gate.
//
// This is intentionally separate from ep_ashrae140_gate.mjs. The earlier
// gate is a six-case project regression gate with project-defined fallback
// tolerances. This gate executes all 21 low/high-mass models and applies the
// published Section 7 / Annex A3 group acceptance criteria without overrides.
//
// Run: node test/ep_ashrae140_2023_gate.mjs
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { compareESO } from './lib/ep_gate_common.mjs';

const require = createRequire(import.meta.url);
const TEST_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.dirname(TEST_DIR);
const CASE_DIR = path.join(TEST_DIR, 'ep-reference', 'ashrae140-2023');
const EPW_PATH = path.join(TEST_DIR, 'ep-reference', 'ashrae140', '725650TYCST.epw');
const NATIVE_PRODUCTS = path.join(ROOT_DIR, 'build', 'native-ep', 'Products');
const WASM_EP_JS = path.join(ROOT_DIR, 'build', 'wasm-ep', 'Products', 'energyplus.js');
const NATIVE_TIMEOUT_MS = 10 * 60 * 1000;
const ESO_REL_THRESHOLD = 1e-6;
const CASES = [
  '600', '610', '620', '630', '640', '650', '660', '670', '680', '685', '695',
  '900', '910', '920', '930', '940', '950', '960', '980', '985', '995',
];

const criteria = JSON.parse(
  fs.readFileSync(path.join(CASE_DIR, 'ashrae140_2023_ranges.json'), 'utf8'),
);

function readEnd(text) {
  const warnings = text.match(/(\d+)\s+Warning/);
  const severe = text.match(/(\d+)\s+Severe Errors/);
  return {
    success: /EnergyPlus Completed Successfully/.test(text),
    warnings: warnings ? Number.parseInt(warnings[1], 10) : Number.NaN,
    severe: severe ? Number.parseInt(severe[1], 10) : Number.NaN,
    raw: text.trim(),
  };
}

function resolveNativeLaunch() {
  const configured = process.env.ENERGYPLUS_NATIVE_EXE;
  if (configured) return { command: configured, prefix: [] };

  const unversioned = path.join(NATIVE_PRODUCTS, 'energyplus');
  try {
    const stat = fs.statSync(unversioned);
    fs.accessSync(unversioned, fs.constants.X_OK);
    if (stat.size > 0) return { command: unversioned, prefix: [] };
  } catch {}

  // Some extracted local builds retain the versioned ELF but lose its execute
  // bit/symlink. Invoking it through the system loader remains read-only and
  // lets this gate diagnose that build without rewriting user build artifacts.
  const versioned = path.join(NATIVE_PRODUCTS, 'energyplus-26.1.0');
  const loader = '/lib64/ld-linux-x86-64.so.2';
  if (fs.existsSync(versioned) && fs.statSync(versioned).size > 0 && fs.existsSync(loader)) {
    return {
      command: loader,
      prefix: ['--library-path', NATIVE_PRODUCTS, versioned],
    };
  }
  throw new Error(
    `No usable native EnergyPlus executable. Expected ${unversioned}, ${versioned}, ` +
      'or ENERGYPLUS_NATIVE_EXE.',
  );
}

function runNative(idfPath) {
  const outdir = fs.mkdtempSync(path.join(os.tmpdir(), 'ashrae140-2023-native-'));
  const launch = resolveNativeLaunch();
  const args = [...launch.prefix, '-w', EPW_PATH, '-d', outdir, idfPath];
  const started = performance.now();
  let execError;
  try {
    execFileSync(launch.command, args, {
      timeout: NATIVE_TIMEOUT_MS,
      stdio: 'pipe',
      maxBuffer: 64 * 1024 * 1024,
    });
  } catch (error) {
    execError = error;
  }
  const seconds = (performance.now() - started) / 1000;

  const endPath = path.join(outdir, 'eplusout.end');
  if (!fs.existsSync(endPath)) {
    fs.rmSync(outdir, { recursive: true, force: true });
    throw new Error(
      `Native run produced no eplusout.end` +
        (execError ? `: ${execError.message}\n${String(execError.stderr || '')}` : ''),
    );
  }
  const end = readEnd(fs.readFileSync(endPath, 'utf8'));
  const eso = fs.readFileSync(path.join(outdir, 'eplusout.eso'), 'utf8');
  const errPath = path.join(outdir, 'eplusout.err');
  const err = fs.existsSync(errPath) ? fs.readFileSync(errPath, 'utf8') : '';
  fs.rmSync(outdir, { recursive: true, force: true });
  return { end, eso, err, seconds, execError };
}

async function runWasm(idfPath) {
  const stderr = [];
  const factory = require(WASM_EP_JS);
  const Module = await factory({ print: () => {}, printErr: (line) => stderr.push(line) });
  Module.FS.writeFile('/model.idf', new Uint8Array(fs.readFileSync(idfPath)));
  Module.FS.writeFile('/weather.epw', new Uint8Array(fs.readFileSync(EPW_PATH)));
  Module.FS.mkdir('/out');
  const started = performance.now();
  try {
    Module.callMain(['-w', '/weather.epw', '-d', '/out', '/model.idf']);
  } catch (error) {
    if (error?.name !== 'ExitStatus') {
      throw new Error(`WASM run threw: ${error}\n${stderr.join('\n')}`);
    }
  }
  const seconds = (performance.now() - started) / 1000;
  let endText;
  try {
    endText = Module.FS.readFile('/out/eplusout.end', { encoding: 'utf8' });
  } catch {
    throw new Error(`WASM run produced no eplusout.end\n${stderr.join('\n')}`);
  }
  return {
    end: readEnd(endText),
    eso: Module.FS.readFile('/out/eplusout.eso', { encoding: 'utf8' }),
    err: Module.FS.readFile('/out/eplusout.err', { encoding: 'utf8' }),
    seconds,
  };
}

function extractAnnualLoads(esoText) {
  const lines = esoText.split('\n');
  const ids = { heating: new Set(), cooling: new Set() };
  let dataStart = -1;

  for (let i = 0; i < lines.length; i++) {
    if (lines[i] === 'End of Data Dictionary') {
      dataStart = i + 1;
      break;
    }
    const fields = lines[i].split(',');
    const id = fields[0];
    if (!/^\d+$/.test(id)) continue;
    if (lines[i].includes('Zone Air System Sensible Heating Energy [J] !Hourly')) {
      ids.heating.add(id);
    }
    if (lines[i].includes('Zone Air System Sensible Cooling Energy [J] !Hourly')) {
      ids.cooling.add(id);
    }
  }
  if (dataStart < 0 || ids.heating.size === 0 || ids.cooling.size === 0) {
    throw new Error('Could not find hourly zone sensible heating/cooling variables in ESO dictionary');
  }

  const sums = { heating: 0, cooling: 0 };
  const counts = { heating: new Map(), cooling: new Map() };
  for (const metric of Object.keys(ids)) {
    for (const id of ids[metric]) counts[metric].set(id, 0);
  }
  for (let i = dataStart; i < lines.length && lines[i] !== 'End of Data'; i++) {
    const comma = lines[i].indexOf(',');
    if (comma < 0) continue;
    const id = lines[i].slice(0, comma);
    for (const metric of Object.keys(ids)) {
      if (!ids[metric].has(id)) continue;
      const value = Number.parseFloat(lines[i].slice(comma + 1));
      if (!Number.isFinite(value)) throw new Error(`Non-numeric ESO value for output id ${id}`);
      sums[metric] += value;
      counts[metric].set(id, counts[metric].get(id) + 1);
    }
  }
  for (const metric of Object.keys(counts)) {
    for (const [id, count] of counts[metric]) {
      if (count < 8760) throw new Error(`${metric} output id ${id} has only ${count} hourly rows`);
    }
  }
  return {
    heating: sums.heating / 3.6e9,
    cooling: sums.cooling / 3.6e9,
  };
}

function evaluateBoundary(value, min, max) {
  return { pass: value >= min && value <= max };
}

function expressionValue(expression, metric, caseMetrics) {
  const value = caseMetrics[expression.case]?.[metric];
  if (!Number.isFinite(value)) throw new Error(`Missing ${metric} result for Case ${expression.case}`);
  if (!expression.minus) return value;
  const subtract = caseMetrics[expression.minus]?.[metric];
  if (!Number.isFinite(subtract)) throw new Error(`Missing ${metric} result for Case ${expression.minus}`);
  return value - subtract;
}

const caseMetrics = {};
const consistencyResults = [];
let projectChecksPass = true;

console.log(`${criteria.standard}, Section ${criteria.section}`);
console.log(`Running ${CASES.length} cases (native oracle + WASM under test)...`);

for (const caseId of CASES) {
  const idfPath = path.join(CASE_DIR, `case${caseId}.idf`);
  const native = runNative(idfPath);
  const wasm = await runWasm(idfPath);
  const nativeHealthy = native.end.success && native.end.severe === 0;
  const wasmHealthy = wasm.end.success && wasm.end.severe === 0;
  const warningsMatch = native.end.warnings === wasm.end.warnings;
  const comparison = compareESO(native.eso, wasm.eso);
  const esoMatches = comparison.maxRel <= ESO_REL_THRESHOLD;
  const consistencyPass = nativeHealthy && wasmHealthy && warningsMatch && esoMatches;
  projectChecksPass &&= consistencyPass;

  caseMetrics[caseId] = extractAnnualLoads(wasm.eso);
  consistencyResults.push({ caseId, native, wasm, comparison, consistencyPass });
  console.log(
    `  ${caseId}: H=${caseMetrics[caseId].heating.toFixed(4)} MWh, ` +
      `C=${caseMetrics[caseId].cooling.toFixed(4)} MWh; ` +
      `native ${native.seconds.toFixed(1)}s / WASM ${wasm.seconds.toFixed(1)}s; ` +
      `ESO relΔ=${comparison.maxRel.toExponential(2)}; ${consistencyPass ? 'OK' : 'PROJECT CHECK FAIL'}`,
  );
}

console.log('\nASHRAE 140-2023 Section 7 annual acceptance groups:');
let section7Pass = true;
for (const group of criteria.groups) {
  let passing = 0;
  const failures = [];
  for (const test of group.tests) {
    const value = expressionValue(test.expression, test.metric, caseMetrics);
    const result = evaluateBoundary(value, test.min, test.max);
    if (result.pass) passing++;
    else failures.push(`${test.id}=${value.toFixed(4)} outside [${test.min}, ${test.max}]`);
  }
  const groupPass = passing >= group.minimum_passing;
  section7Pass &&= groupPass;
  console.log(
    `  ${group.label}: ${passing}/${group.tests.length} pass; minimum ` +
      `${group.minimum_passing} -> ${groupPass ? 'PASS' : 'FAIL'}`,
  );
  for (const failure of failures) console.log(`    - ${failure}`);
}

console.log('\nExtra project checks (not ASHRAE acceptance criteria):');
console.log(`  Native/WASM ESO agreement, run health, warning parity: ${projectChecksPass ? 'PASS' : 'FAIL'}`);
for (const result of consistencyResults.filter((item) => !item.consistencyPass)) {
  console.log(
    `    - Case ${result.caseId}: native=${result.native.end.raw}; WASM=${result.wasm.end.raw}; ` +
      `ESO max relΔ=${result.comparison.maxRel}`,
  );
}

console.log(
  `\n${section7Pass ? 'PASS' : 'FAIL'}: ${criteria.standard} Section 7 annual-load acceptance criteria`,
);
console.log(`${projectChecksPass ? 'PASS' : 'FAIL'}: repository native/WASM consistency requirements`);
process.exit(section7Pass && projectChecksPass ? 0 : 1);
