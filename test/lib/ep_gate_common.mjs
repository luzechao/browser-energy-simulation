// E2 gate common: run an EnergyPlus case through the native oracle and the
// WASM build, compare eplusout.end status + eplusout.eso values.
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
export const repoPath = (p) => fileURLToPath(new URL('../../' + p, import.meta.url));

const require = createRequire(import.meta.url);

const NATIVE_EP = process.env.ENERGYPLUS_NATIVE_EXE || repoPath('build/native-ep/Products/energyplus');
const WASM_EP_JS = repoPath('build/wasm-ep/Products/energyplus.js');
const REL_THRESHOLD = 1e-6;
const NATIVE_TIMEOUT_MS = 600000;

function readEnd(text) {
  const success = /EnergyPlus Completed Successfully/.test(text);
  const warnMatch = text.match(/(\d+)\s+Warning/);
  const severeMatch = text.match(/(\d+)\s+Severe Errors/);
  return {
    success,
    warnings: warnMatch ? parseInt(warnMatch[1], 10) : NaN,
    severe: severeMatch ? parseInt(severeMatch[1], 10) : NaN,
    raw: text.trim(),
  };
}

export function runNative(idfPath, epwPath) {
  const outdir = fs.mkdtempSync(path.join(os.tmpdir(), 'ep-gate-native-'));
  const t0 = performance.now();
  let execError = null;
  try {
    execFileSync(NATIVE_EP, ['-w', epwPath, '-d', outdir, idfPath], {
      timeout: NATIVE_TIMEOUT_MS,
      stdio: 'pipe',
      maxBuffer: 64 * 1024 * 1024,
    });
  } catch (e) {
    execError = e;
  }
  const seconds = (performance.now() - t0) / 1000;
  const endPath = path.join(outdir, 'eplusout.end');
  if (!fs.existsSync(endPath)) {
    throw new Error(
      `native run produced no eplusout.end (outdir ${outdir})` +
        (execError ? `: ${execError.message}\nstderr: ${execError.stderr}` : ''),
    );
  }
  const end = readEnd(fs.readFileSync(endPath, 'utf8'));
  if (!end.success || end.severe !== 0) {
    throw new Error(`native run failed: ${end.raw} (outdir ${outdir})`);
  }
  const eso = fs.readFileSync(path.join(outdir, 'eplusout.eso'), 'utf8');
  const err = fs.existsSync(path.join(outdir, 'eplusout.err')) ? fs.readFileSync(path.join(outdir, 'eplusout.err'), 'utf8') : '';
  const tbl = fs.existsSync(path.join(outdir, 'eplustbl.csv')) ? fs.readFileSync(path.join(outdir, 'eplustbl.csv'), 'utf8') : '';
  return { end, eso, err, tbl, seconds, outdir };
}

export async function runWasm(idfPath, epwPath) {
  const stderr = [];
  const factory = require(WASM_EP_JS);
  const Module = await factory({
    print: () => {},
    printErr: (s) => stderr.push(s),
  });
  const vfsModel = idfPath.toLowerCase().endsWith('.epjson') ? '/model.epJSON' : '/model.idf';
  Module.FS.writeFile(vfsModel, new Uint8Array(fs.readFileSync(idfPath)));
  Module.FS.writeFile('/weather.epw', new Uint8Array(fs.readFileSync(epwPath)));
  Module.FS.mkdir('/out');
  const t0 = performance.now();
  try {
    // callMain mutates its argument array — always pass a fresh literal
    Module.callMain(['-w', '/weather.epw', '-d', '/out', vfsModel]);
  } catch (e) {
    if (e && e.name !== 'ExitStatus') {
      throw new Error(`WASM run threw: ${e}\nstderr:\n${stderr.join('\n')}`);
    }
  }
  const seconds = (performance.now() - t0) / 1000;
  let endText;
  try {
    endText = Module.FS.readFile('/out/eplusout.end', { encoding: 'utf8' });
  } catch {
    throw new Error(`WASM run produced no eplusout.end\nstderr:\n${stderr.join('\n')}`);
  }
  const end = readEnd(endText);
  if (!end.success || end.severe !== 0) {
    throw new Error(`WASM run failed: ${end.raw}\nstderr:\n${stderr.join('\n')}`);
  }
  const eso = Module.FS.readFile('/out/eplusout.eso', { encoding: 'utf8' });
  const err = Module.FS.readFile('/out/eplusout.err', { encoding: 'utf8' });
  let tbl = '';
  try {
    tbl = Module.FS.readFile('/out/eplustbl.csv', { encoding: 'utf8' });
  } catch {}
  return { end, eso, err, tbl, seconds };
}

// absFloor: values whose absolute difference is at or below this (Joules,
// matching ESO energy units) are exempt from the relative-error gate. This
// exists for near-zero-crossing hourly energy variables (e.g. "Zone Air
// System Sensible Cooling Energy" transitioning through ~10-100 J at the
// hour a load starts/stops, sandwiched between exact-0 and 1e5-1e6 J
// hours) where sub-ULP native/WASM noise is a physically meaningless but
// relatively huge ratio. Default 0 preserves the original strict
// relative-only gate for all existing callers (E2/E2b) — do not change the
// default; pass absFloor explicitly per call site instead.
export function compareESO(nativeEso, wasmEso, { absFloor = 0 } = {}) {
  const a = nativeEso.split('\n');
  const b = wasmEso.split('\n');
  if (a.length !== b.length) {
    throw new Error(`ESO line count differs: native ${a.length} vs wasm ${b.length}`);
  }
  let maxRel = 0;
  let maxAbs = 0;
  let nDiff = 0;
  const worst = []; // top diverging lines by relΔ (post-absFloor exemption)

  for (let i = 0; i < a.length; i++) {
    if (a[i] === b[i]) continue;
    // Program Version line carries the run timestamp (YMD=...) — not physics
    if (a[i].startsWith('Program Version') && b[i].startsWith('Program Version')) continue;
    const fa = a[i].split(',');
    const fb = b[i].split(',');
    let lineRel = 0;
    if (fa.length !== fb.length) {
      lineRel = Infinity;
      nDiff++;
    } else {
      for (let j = 0; j < fa.length; j++) {
        if (fa[j] === fb[j]) continue;
        const x = parseFloat(fa[j]);
        const y = parseFloat(fb[j]);
        if (!Number.isFinite(x) || !Number.isFinite(y)) {
          lineRel = Infinity;
          nDiff++;
          continue;
        }
        const abs = Math.abs(x - y);
        const rel = abs / Math.max(Math.abs(x), Math.abs(y), 1e-30);
        nDiff++;
        if (abs > maxAbs) maxAbs = abs;
        if (abs <= absFloor) continue; // near-zero-crossing exemption — see absFloor doc above
        if (rel > lineRel) lineRel = rel;
      }
    }
    if (lineRel > maxRel) maxRel = lineRel;
    if (lineRel > 0) {
      worst.push({ lineNo: i + 1, rel: lineRel, native: a[i], wasm: b[i] });
      worst.sort((p, q) => q.rel - p.rel);
      if (worst.length > 3) worst.pop();
    }
  }
  return { maxRel, maxAbs, nDiff, worst };
}

export async function runGate(caseName, idfPath, epwPath) {
  console.log(`[${caseName}] native oracle run...`);
  const native = runNative(idfPath, epwPath);
  console.log(`[${caseName}] native done in ${native.seconds.toFixed(2)}s (${native.end.raw})`);

  console.log(`[${caseName}] WASM run...`);
  const wasm = await runWasm(idfPath, epwPath);
  console.log(`[${caseName}] wasm done in ${wasm.seconds.toFixed(2)}s (${wasm.end.raw})`);

  if (native.end.warnings !== wasm.end.warnings) {
    console.error(`FAIL ${caseName}: warning count mismatch — native ${native.end.warnings} vs wasm ${wasm.end.warnings}`);
    process.exit(1);
  }

  const cmp = compareESO(native.eso, wasm.eso);
  const relStr = cmp.maxRel.toExponential(2);
  const absStr = cmp.maxAbs.toExponential(2);
  if (cmp.maxRel <= REL_THRESHOLD) {
    console.log(
      `PASS ${caseName}: ${cmp.nDiff} differing values, max relΔ=${relStr}, max absΔ=${absStr}, ` +
        `native ${native.seconds.toFixed(2)}s / wasm ${wasm.seconds.toFixed(2)}s`,
    );
    process.exit(0);
  }
  console.error(
    `FAIL ${caseName}: max relΔ=${relStr} exceeds ${REL_THRESHOLD} (${cmp.nDiff} differing values, max absΔ=${absStr})`,
  );
  for (const w of cmp.worst) {
    console.error(`  line ${w.lineNo} (relΔ=${w.rel.toExponential(2)})`);
    console.error(`    native: ${w.native}`);
    console.error(`    wasm:   ${w.wasm}`);
  }
  process.exit(1);
}
