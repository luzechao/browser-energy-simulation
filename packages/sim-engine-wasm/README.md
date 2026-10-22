# @luzechao/sim-engine-wasm

EnergyPlus version 26.1.0 software compiled to WebAssembly, running inside [Pyodide](https://pyodide.org), with
**PythonPlugin** support. `PythonPlugin:Instance` classes run in Pyodide's interpreter and can import Pyodide
packages such as numpy. Everything runs client-side; no server is involved.

**The package version is the EnergyPlus version it bundles.** Models must be IDF/epJSON version 26.1. Rebuilds
of the same EnergyPlus release use the patch number (26.1.1, 26.1.2, ...).

## Install

```sh
npm install @luzechao/sim-engine-wasm pyodide@314.0.7
```

Until the package is on the npm registry, install the CI-built tarball from the GitHub Release instead:

```sh
npm install https://github.com/luzechao/browser-energy-simulation/releases/download/sim-engine-wasm-v26.1.0/luzechao-sim-engine-wasm-26.1.0.tgz pyodide@314.0.7
```

`pyodide` is a peer dependency, and any 314.0.x works. The engine is a Pyodide side module, so it only loads into
the Pyodide ABI it was built for.

## Serve the assets

The engine (about 33 MB) and Pyodide's runtime are static files that the app serves itself. Copy them into a
public directory before `dev` and `build`:

```jsonc
// package.json
"scripts": {
  "predev": "sim-engine-wasm-assets public/sim-engine",
  "prebuild": "sim-engine-wasm-assets public/sim-engine"
}
```

This writes `public/sim-engine/engine/` (the engine and `pyenergyplus/`) and `public/sim-engine/pyodide/` (the
runtime, taken from the app's own `pyodide` install). Add `public/sim-engine/` to `.gitignore`.

## Run a simulation (in a Web Worker)

Simulations block until they finish, so call the API from a worker:

```ts
// simulate.worker.ts
import { loadPyodide } from 'pyodide'
import { installEnergyPlus, runEnergyPlus, fetchAssets, PYODIDE_PACKAGE_BASE_URL } from '@luzechao/sim-engine-wasm'

const base = new URL('/sim-engine/', self.location.origin)
const pyodide = await loadPyodide({
  indexURL: new URL('pyodide/', base).href,
  packageBaseUrl: PYODIDE_PACKAGE_BASE_URL, // numpy etc. come from the Pyodide CDN
})
await installEnergyPlus(pyodide, fetchAssets(new URL('engine/', base)))

const run = runEnergyPlus(pyodide, {
  idf: idfText,
  epw: epwBytes, // omit for sizing-period-only models
  files: { 'MyPlugin.py': pluginSource }, // PythonPlugin modules go next to the model
})
console.log(run.exitCode, run.summary, run.messages) // parsed eplusout.end / eplusout.err
const table = run.readText('eplustbl.htm')
run.dispose() // outputs live in memory; free them when done
```

With Vite, exclude Pyodide from dependency pre-bundling: `optimizeDeps: { exclude: ['pyodide'] }`.

To use packages in plugins, load them before running, e.g. `await pyodide.loadPackage('numpy')`.

## API

| Export | Purpose |
| --- | --- |
| `installEnergyPlus(pyodide, readAsset)` | Load the engine into a Pyodide instance (once). Returns the pyenergyplus API version. |
| `runEnergyPlus(pyodide, { idf, epw?, files?, inputName?, extraArgs? })` | Run one simulation synchronously. Returns `{ exitCode, summary, messages, files(), readText(), readBytes(), dispose() }`. |
| `fetchAssets(baseUrl)` | An asset reader that fetches `engine/` files over HTTP. |
| `parseEndFile(text)`, `parseErrFile(text)` | Parse `eplusout.end` and `eplusout.err`. |
| `ENERGYPLUS_VERSION`, `PYODIDE_VERSION`, `PYODIDE_PACKAGE_BASE_URL`, `ASSET_FILES` | Metadata. |

In Node, pass a reader that uses `fs`, such as
`(name) => fs.promises.readFile(new URL('./node_modules/@luzechao/sim-engine-wasm/assets/' + name, import.meta.url))`.

## What is and is not supported

Supported: the EnergyPlus simulation, including PythonPlugin, EMS, AirflowNetwork, Kiva, conduction finite
difference and `Output:SQLite`. Every upstream `PythonPlugin*.idf` example runs. The build is tested against the
upstream examples, and its results match a plain (no-Python) WebAssembly build exactly.

Not included: ExpandObjects (`HVACTemplate:*`), Slab/Basement preprocessors, EPMacro and other Fortran tools,
PixelCounting shading (EnergyPlus falls back to PolygonClipping), `ExternalInterface`, and the features that need
EnergyPlus's Python CLI (e.g. borehole field design). The engine shares Pyodide's single thread and its heap
(up to 4 GB).

Browsers: anything Pyodide 314 supports. WebAssembly exception handling is required.

## Build from source

See [PYODIDE.md](https://github.com/luzechao/browser-energy-simulation/blob/main/PYODIDE.md) in the source
repository: `scripts/setup-pyodide-toolchain.sh`, `scripts/configure-ep-pyodide.sh --build`, then
`npm run stage && npm pack` in `packages/sim-engine-wasm`.

## License

See `NOTICE`. The bundled EnergyPlus software is under `LICENSE-EnergyPlus.txt`, the libraries compiled into it
are covered by `THIRD_PARTY_NOTICES`, and this package's own JavaScript is MIT (`LICENSE`).
