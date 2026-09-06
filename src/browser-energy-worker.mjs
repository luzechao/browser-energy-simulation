/**
 * Browser worker: runs ONE annual EnergyPlus WASM simulation per 'run'
 * message. First-level module worker (fetch + blob-URL import, the
 * established browser-radiance.mjs pattern applied to EnergyPlus).
 *
 * No pool, no reentrancy: EnergyPlus is a sequential coupled heat-balance
 * solver (zones are boundary conditions for each other, hour h+1 depends on
 * h through thermal mass) and the WASM build is single-threaded — see
 * PHASE5E_E4_BROWSER_ENERGY_PLAN.md §1.1. A fresh Module instance is used
 * per run (E+ is not reentrant-safe on a dirty VFS).
 *
 * Message protocol — see PHASE5E_E4_BROWSER_ENERGY_PLAN.md §1.4:
 *   in:  { type:'run', epjsonText, epw: ArrayBuffer, climateFileName,
 *          floorAreaM2, floorAreaByZone, zoneNamesByKey, surfaceManifest }
 *   out: { type:'download', loadedMB, totalMB }
 *        { type:'progress', phase, dayOfYear?, fraction?, line }
 *        { type:'result', ok, end:{success,warnings,severe}, metrics,
 *          monthly, errText, seconds }
 *        { type:'error', message, errText? }
 */

import {
  parseEso, annualSums, monthlySums, hourlyPeaks,
  buildAnnualSurfaceSolar, buildMonthlyEnergyBalance, buildFangerComfort,
} from '/src/ep-results.mjs?v=energy-balance-elements-20260810';

const GLUE_URL   = '/build/wasm-ep/Products/energyplus.js';
const WASM_URL   = '/build/wasm-ep/Products/energyplus.js-26.1.wasm';
const LOCATE_DIR = '/build/wasm-ep/Products/';
const J_PER_KWH  = 3.6e6;

function post(msg) { self.postMessage(msg); }

// Real download progress for the ~31 MB wasm binary: fetch it ourselves
// with a byte counter, then hand the bytes to the Emscripten factory via
// Module.wasmBinary (skips the factory's own internal fetch entirely --
// verified against the shipped glue: `if(Module["wasmBinary"])
// wasmBinary=Module["wasmBinary"]` runs before findWasmBinary/getWasmBinary).
async function fetchWithProgress(url, onProgress) {
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`fetch ${url} failed: HTTP ${resp.status}`);
  const total = Number(resp.headers.get('Content-Length')) || 0;
  if (!resp.body) {
    const buf = new Uint8Array(await resp.arrayBuffer());
    onProgress(buf.byteLength, total || buf.byteLength);
    return buf;
  }
  const reader = resp.body.getReader();
  const chunks = [];
  let received = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    received += value.length;
    onProgress(received, total || received);
  }
  const out = new Uint8Array(received);
  let offset = 0;
  for (const c of chunks) { out.set(c, offset); offset += c.length; }
  return out;
}

let _factoryCache = null;
async function loadEnergyPlusFactory() {
  if (_factoryCache) return _factoryCache;
  const resp = await fetch(GLUE_URL, { cache: 'force-cache' });
  if (!resp.ok) throw new Error(`failed to fetch ${GLUE_URL} (HTTP ${resp.status})`);
  const text = await resp.text();
  // MODULARIZE=1 EXPORT_NAME=createEnergyPlusModule (see CLAUDE.md Stage 5-E
  // E1) declares `var createEnergyPlusModule=...` at top level; appending an
  // ES export lets a blob-URL dynamic import() retrieve the factory.
  const blob = new Blob([text, '\nexport default createEnergyPlusModule;'], { type: 'application/javascript' });
  const blobUrl = URL.createObjectURL(blob);
  try {
    _factoryCache = (await import(blobUrl)).default;
  } finally {
    URL.revokeObjectURL(blobUrl);
  }
  return _factoryCache;
}

// EPW/E+ "Continuing Simulation at MM/DD/YYYY" -- day-of-year for the
// annual progress fraction (Feb is always 28 here; a 1-day wobble in a
// progress bar is not worth leap-year plumbing).
const CUM_DAYS = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
function dayOfYearFromMonthDay(month, day) {
  return CUM_DAYS[month - 1] + day;
}

function parseProgressLine(line) {
  const warm = line.match(/^Warming up \{(\d+)\}/);
  if (warm) return { phase: 'warmup', line };
  const sim = line.match(/^(?:Starting|Continuing) Simulation at (\d{2})\/(\d{2})\/\d{4}/);
  if (sim) {
    const dayOfYear = dayOfYearFromMonthDay(Number(sim[1]), Number(sim[2]));
    return { phase: 'run', dayOfYear, fraction: Math.min(1, dayOfYear / 365), line };
  }
  return { phase: undefined, line };
}

function toKwh(joules) { return joules / J_PER_KWH; }
function sumAll(obj) { return Object.values(obj).reduce((a, b) => a + b, 0); }

// ESO series keys are not always the bare zone name -- e.g. the
// ZoneHVAC:IdealLoadsAirSystem component name is "<ZONE>_IDEALLOADS", while
// Lights/ElectricEquipment report under the exact zone name. Match by
// prefix, same convention as test/btm_epjson_physics_gate.mjs's
// sumForZoneUpper (Gate P reference).
function matchesZone(key, zoneUpper) {
  return key === zoneUpper || key.startsWith(zoneUpper + '_');
}

function byZoneKwh(sums, floorAreaByZone, zoneNamesByKey = {}) {
  const out = {};
  for (const [zoneUpper, area] of Object.entries(floorAreaByZone)) {
    const joules = Object.entries(sums)
      .filter(([k]) => matchesZone(k, zoneUpper))
      .reduce((a, [, v]) => a + v, 0);
    out[zoneUpper] = {
      displayName: zoneNamesByKey[zoneUpper] || zoneUpper,
      kWh: toKwh(joules),
      kWhPerM2: area > 0 ? toKwh(joules) / area : null,
    };
  }
  return out;
}

// Builds the §1.4 `metrics` shape directly from the Gate-P-proven
// annualSums/monthlySums/hourlyPeaks primitives (ep-results.mjs) rather than
// via euiBreakdown, which composes the same primitives but has never been
// exercised by any gate -- see the E4 plan's §1.4 builder note.
function buildMetrics(esoText, floorAreaM2, floorAreaByZone, zoneNamesByKey = {}, surfaceManifest = []) {
  const esoData = parseEso(esoText);
  const streamVars = {
    heating:   'Zone Ideal Loads Supply Air Total Heating Energy',
    cooling:   'Zone Ideal Loads Supply Air Total Cooling Energy',
    lights:    'Zone Lights Electricity Energy',
    equipment: 'Zone Electric Equipment Electricity Energy',
  };

  const streams = {};
  for (const [name, variable] of Object.entries(streamVars)) {
    const sums = annualSums(esoData, variable);
    const joules = sumAll(sums);
    streams[name] = {
      kWh: toKwh(joules),
      kWhPerM2: floorAreaM2 > 0 ? toKwh(joules) / floorAreaM2 : null,
      byZone: byZoneKwh(sums, floorAreaByZone, zoneNamesByKey),
    };
  }

  // Ideal Loads normally has no explicit fan object. Preserve a real fan
  // stream when EnergyPlus reports one; the viewer otherwise falls back to
  // its clearly labelled fan/pump allowance.
  const fanVariable = 'Zone Ventilation Fan Electricity Energy';
  const fanSums = annualSums(esoData, fanVariable);
  if (Object.keys(fanSums).length) {
    const fanJoules = sumAll(fanSums);
    streams.fans = {
      kWh: toKwh(fanJoules),
      kWhPerM2: floorAreaM2 > 0 ? toKwh(fanJoules) / floorAreaM2 : null,
      byZone: byZoneKwh(fanSums, floorAreaByZone, zoneNamesByKey),
      sourceVariable: fanVariable,
    };
  }

  const peakOf = peaks => Object.values(peaks).reduce(
    (best, p) => (p.value > best.value ? p : best), { value: 0, timestamp: null });
  const heatPeak = peakOf(hourlyPeaks(esoData, streamVars.heating));
  const coolPeak = peakOf(hourlyPeaks(esoData, streamVars.cooling));

  const sumMonthly = variable => Object.values(monthlySums(esoData, variable))
    .reduce((a, b) => a.map((v, i) => v + b[i]), Array(12).fill(0))
    .map(toKwh);

  return {
    streams,
    peaks: {
      heatingWPerM2: floorAreaM2 > 0 ? heatPeak.value / 3600 / floorAreaM2 : null,
      heatingTimestamp: heatPeak.timestamp,
      coolingWPerM2: floorAreaM2 > 0 ? coolPeak.value / 3600 / floorAreaM2 : null,
      coolingTimestamp: coolPeak.timestamp,
    },
    monthly: {
      heating: sumMonthly(streamVars.heating),
      cooling: sumMonthly(streamVars.cooling),
    },
    balance: buildMonthlyEnergyBalance(esoData, surfaceManifest),
    solar: buildAnnualSurfaceSolar(esoData, surfaceManifest),
    comfort: buildFangerComfort(esoData, floorAreaByZone, zoneNamesByKey),
  };
}

function readEnd(text) {
  const success = /EnergyPlus Completed Successfully/.test(text);
  const warnMatch = text.match(/(\d+)\s+Warning/);
  const severeMatch = text.match(/(\d+)\s+Severe Errors/);
  return {
    success,
    warnings: warnMatch ? parseInt(warnMatch[1], 10) : NaN,
    severe: severeMatch ? parseInt(severeMatch[1], 10) : NaN,
  };
}

self.onmessage = async (e) => {
  const msg = e.data;
  if (!msg || msg.type !== 'run') return;
  const t0 = performance.now();

  try {
    post({ type: 'progress', phase: 'download', line: 'Fetching EnergyPlus engine (one-time, ~31 MB)…' });
    const [wasmBytes, factory] = await Promise.all([
      fetchWithProgress(WASM_URL, (loaded, total) => post({ type: 'download', loadedMB: loaded / 1e6, totalMB: total / 1e6 })),
      loadEnergyPlusFactory(),
    ]);

    post({ type: 'progress', phase: 'init', line: 'Initializing EnergyPlus…' });
    const stderrLines = [];
    const Module = await factory({
      locateFile: f => LOCATE_DIR + f,
      wasmBinary: wasmBytes,
      print: line => post({ type: 'progress', ...parseProgressLine(line) }),
      printErr: line => stderrLines.push(line),
    });

    Module.FS.writeFile('/model.epJSON', new TextEncoder().encode(msg.epjsonText));
    Module.FS.writeFile('/weather.epw', new Uint8Array(msg.epw));
    Module.FS.mkdir('/out');

    try {
      // callMain mutates its argument array -- always pass a fresh literal.
      Module.callMain(['-w', '/weather.epw', '-d', '/out', '/model.epJSON']);
    } catch (err) {
      if (err && err.name !== 'ExitStatus') throw err;
    }
    const seconds = (performance.now() - t0) / 1000;

    let endText;
    try {
      endText = Module.FS.readFile('/out/eplusout.end', { encoding: 'utf8' });
    } catch {
      throw new Error(`EnergyPlus produced no eplusout.end\n${stderrLines.join('\n')}`);
    }
    const end = readEnd(endText);
    const errText = (() => {
      try { return Module.FS.readFile('/out/eplusout.err', { encoding: 'utf8' }); } catch { return ''; }
    })();

    if (!end.success || end.severe !== 0) {
      post({ type: 'result', ok: false, end, metrics: null, monthly: null, errText, seconds });
      return;
    }

    const esoText = Module.FS.readFile('/out/eplusout.eso', { encoding: 'utf8' });
    const metrics = buildMetrics(
      esoText,
      msg.floorAreaM2,
      msg.floorAreaByZone || {},
      msg.zoneNamesByKey || {},
      msg.surfaceManifest || [],
    );

    post({ type: 'result', ok: true, end, metrics, monthly: metrics.monthly, errText, seconds });
  } catch (err) {
    post({ type: 'error', message: err?.message || String(err), errText: err?.stack });
  }
};
