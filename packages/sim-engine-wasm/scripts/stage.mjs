// Stages build outputs and legal files into this package.
//   assets/                   libenergyplusapi.so + pyenergyplus/  (from build/pyodide-ep/Products)
//   LICENSE-EnergyPlus.txt    EnergyPlus license, verbatim
//   THIRD_PARTY_NOTICES       notices of the libraries compiled into libenergyplusapi.so
// Usage: node scripts/stage.mjs [--check]
//   env PRODUCTS_DIR (default <repo>/build/pyodide-ep/Products), EP_SOURCE (<repo>/energyplus-pyodide),
//       EMSDK_DIR (<repo>/emsdk-pyodide)
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const repoRoot = path.resolve(packageRoot, '../..')
const products = process.env.PRODUCTS_DIR || path.join(repoRoot, 'build/pyodide-ep/Products')
const epSource = process.env.EP_SOURCE || path.join(repoRoot, 'energyplus-pyodide')
const emsdk = process.env.EMSDK_DIR || path.join(repoRoot, 'emsdk-pyodide')

const ASSETS = [
  'libenergyplusapi.so',
  ...['__init__', 'api', 'common', 'datatransfer', 'func', 'plugin', 'runtime', 'state'].map((m) => `pyenergyplus/${m}.py`),
]
const LEGAL = ['LICENSE', 'LICENSE-EnergyPlus.txt', 'NOTICE', 'THIRD_PARTY_NOTICES']

if (process.argv.includes('--check')) {
  const missing = [...ASSETS.map((a) => `assets/${a}`), ...LEGAL].filter((f) => !fs.existsSync(path.join(packageRoot, f)))
  if (missing.length) {
    console.error(`Not staged: ${missing.join(', ')}\nRun \`npm run stage\` after building with scripts/configure-ep-pyodide.sh`)
    process.exit(1)
  }
  const api = fs.readFileSync(path.join(packageRoot, 'assets/pyenergyplus/api.py'), 'utf8')
  if (!api.includes('sys.platform == "emscripten"')) {
    console.error('assets/pyenergyplus/api.py lacks the emscripten patch; was it built from energyplus-pyodide?')
    process.exit(1)
  }
  console.log('stage: all assets and legal files present')
  process.exit(0)
}

// --- assets -------------------------------------------------------------
const assetsOut = path.join(packageRoot, 'assets')
fs.rmSync(assetsOut, { recursive: true, force: true })
for (const asset of ASSETS) {
  const from = path.join(products, asset)
  if (!fs.existsSync(from)) throw new Error(`${from} not found; build with scripts/configure-ep-pyodide.sh --build`)
  fs.mkdirSync(path.dirname(path.join(assetsOut, asset)), { recursive: true })
  fs.copyFileSync(from, path.join(assetsOut, asset))
}

// --- EnergyPlus license -----------------------------------------------------
fs.copyFileSync(path.join(epSource, 'LICENSE.txt'), path.join(packageRoot, 'LICENSE-EnergyPlus.txt'))

// --- third-party notices ------------------------------------------------
// Each entry quotes a license file, or the license block at the top of a source file when the vendored copy
// has no license file. Paths are relative to the EnergyPlus source tree unless prefixed "emsdk:" or "pkg:".
const NOTICES = [
  { name: 'ObjexxFCL (Objexx Fortran-C++ Library)', header: 'third_party/ObjexxFCL/src/ObjexxFCL/AlignedAllocator.hh' },
  { name: 'SQLite', header: 'third_party/SQLite/sqlite3.c', from: /The author disclaims copyright/ },
  { name: 'Expat', files: ['third_party/Expat/COPYING'] },
  { name: 'RE2', files: ['third_party/re2/LICENSE'] },
  { name: '{fmt}', files: ['third_party/fmt-8.0.1/LICENSE.rst'] },
  { name: 'JSON for Modern C++ (nlohmann/json)', files: ['third_party/libtk205/vendor/json/LICENSE.MIT'] },
  { name: 'CLI11', files: ['third_party/CLI/LICENSE'] },
  { name: 'Btwxt', files: ['third_party/btwxt/LICENSE'] },
  { name: 'Courierr', files: ['third_party/btwxt/vendor/courierr/LICENSE.txt'] },
  { name: 'Kiva', files: ['third_party/kiva/LICENSE'] },
  { name: 'Boost (as vendored by Kiva)', files: ['third_party/kiva/vendor/boost-1.88.0/LICENSE_1_0.txt'] },
  { name: 'Eigen', files: ['third_party/eigen/COPYING.MPL2'],
    note: 'Eigen source code is available at https://gitlab.com/libeigen/eigen.' },
  { name: 'libtk205', files: ['third_party/libtk205/LICENSE.txt'] },
  { name: 'SAM Simulation Core (SSC)', files: ['third_party/ssc/LICENSE'] },
  { name: 'JsonCpp (as vendored by SSC)', files: ['third_party/ssc/jsoncpp/LICENSE'] },
  { name: 'SPLINTER (as vendored by SSC)', header: 'third_party/ssc/splinter/bsplinebasis.cpp',
    note: 'SPLINTER source code is available at https://github.com/bgrimstad/splinter.' },
  { name: 'Windows-CalcEngine', files: ['third_party/Windows-CalcEngine/Legal.txt'] },
  { name: 'DElight', header: 'third_party/DElight/BGL.h' },
  { name: 'BCVTB', header: 'third_party/BCVTB/utilSocket.c' },
  { name: 'FMI / FMU parser', header: 'third_party/FMUParser/fmiFunctions.h' },
  { name: 'gsl-lite', header: 'third_party/GSL/span.h' },
  { name: 'fast_float', header: 'third_party/fast_float/fast_float.h' },
  { name: 'Milo Yip dtoa (RapidJSON)', header: 'third_party/milo/biginteger.h' },
  { name: 'Alphanum (doj)', header: 'third_party/doj/alphanum.hpp' },
  { name: 'valijson', files: ['pkg:scripts/licenses/valijson-LICENSE'],
    note: 'The vendored copy carries no license file; this is the upstream LICENSE (https://github.com/tristanpenman/valijson).' },
  { name: 'zlib', header: 'third_party/zlib/zlib.h' },
  { name: 'Emscripten runtime', files: ['emsdk:upstream/emscripten/LICENSE'] },
  { name: 'LLVM compiler-rt', files: ['emsdk:upstream/emscripten/system/lib/compiler-rt/LICENSE.TXT'] },
]

function resolveSource(p) {
  if (p.startsWith('pkg:')) return path.join(packageRoot, p.slice('pkg:'.length))
  return p.startsWith('emsdk:') ? path.join(emsdk, p.slice('emsdk:'.length)) : path.join(epSource, p)
}

// The leading comment block(s) of a C/C++ file, skipping include guards; or the block starting at `from`.
function licenseHeader(file, from) {
  let lines = fs.readFileSync(file, 'utf8').split(/\r?\n/)
  if (from) {
    const start = lines.findIndex((l) => from.test(l))
    if (start < 0) throw new Error(`${file}: ${from} not found`)
    lines = lines.slice(Math.max(0, start - 2))
  }
  const out = []
  let inBlock = false
  for (const line of lines) {
    const t = line.trim()
    if (inBlock) {
      out.push(line)
      if (t.includes('*/')) inBlock = false
      continue
    }
    if (t.startsWith('/*')) {
      out.push(line)
      inBlock = !t.includes('*/')
    } else if (t.startsWith('//') || t.startsWith('**') || (from && t.startsWith('*'))) {
      out.push(line)
    } else if (t === '' || t.startsWith('#ifndef') || t.startsWith('#define') || t.startsWith('#pragma once')) {
      if (out.length) out.push(line)
    } else {
      break
    }
    if (out.length > 80) break
  }
  return out.join('\n').trim()
}

const rule = '-'.repeat(78)
const sections = [
  `THIRD-PARTY SOFTWARE NOTICES\n\nlibenergyplusapi.so contains EnergyPlus version 26.1.0 software (see LICENSE-EnergyPlus.txt) and the\nthird-party libraries EnergyPlus links statically, listed below with the license text from their source.`,
]
for (const entry of NOTICES) {
  let body
  if (entry.files) {
    body = entry.files.map((f) => fs.readFileSync(resolveSource(f), 'utf8').trim()).join('\n\n')
  } else {
    const file = resolveSource(entry.header)
    body = fs.existsSync(file) ? licenseHeader(file, entry.from) : ''
    if (!/copyright|licen[cs]e|public domain|disclaim/i.test(body)) {
      if (!entry.fallback) throw new Error(`${entry.header}: no license text found in header`)
      body = entry.fallback
    }
  }
  sections.push(`${rule}\n${entry.name}\n${rule}\n${entry.note ? entry.note + '\n\n' : ''}${body}`)
}
fs.writeFileSync(path.join(packageRoot, 'THIRD_PARTY_NOTICES'), sections.join('\n\n') + '\n')

const size = fs.statSync(path.join(assetsOut, 'libenergyplusapi.so')).size
console.log(`stage: ${ASSETS.length} assets (libenergyplusapi.so ${(size / 1048576).toFixed(1)} MiB), ${NOTICES.length} notices`)
