# PythonPlugin build: EnergyPlus inside Pyodide

This fork adds a second WebAssembly build of EnergyPlus v26.1.0 that supports `PythonPlugin:*` objects in the
browser. The original build (`scripts/configure-ep-wasm.sh`, `build/wasm-ep/`) is unchanged and still has no Python.

## How it works

EnergyPlus normally embeds its own CPython for plugins. A browser has no CPython, so this build uses
[Pyodide](https://pyodide.org) 314.0.7 (CPython 3.14.2 compiled to WebAssembly) as the host:

```
Pyodide (main module: CPython, libc, libc++, ctypes, numpy, ...)
  └─ pyenergyplus (stock Python API, loaded from /energyplus)
       └─ ctypes → libenergyplusapi.so  (EnergyPlus as an Emscripten SIDE_MODULE)
            └─ PythonPlugin:Instance → Python C API → back into Pyodide's interpreter
```

- `libenergyplusapi.so` is compiled against Pyodide's Python headers. Its Python C API symbols are not linked; they
  are resolved against Pyodide's main module when the library loads. Plugins therefore run in the same interpreter
  that started the simulation, and can import anything installed in it, such as `numpy` via
  `pyodide.loadPackage`.
- A simulation is started with the stock Python API: `EnergyPlusAPI().runtime.run_energyplus(state, args)`.
  The npm package [packages/sim-engine-wasm](packages/sim-engine-wasm/README.md) wraps this for JavaScript and
  TypeScript.
- Everything must match the Pyodide release: Emscripten 5.0.3 with Pyodide's emsdk patches, `-fPIC
  -fwasm-exceptions -sSUPPORT_LONGJMP=wasm`, and CPython 3.14. Pyodide 314.0.7 is pinned throughout.

## EnergyPlus changes (`patches/energyplus-pyodide/`)

These apply on top of the five toolchain patches in `patches/energyplus/`. All are Emscripten-only, and none of
them touches simulation physics.

| Patch | Change |
| --- | --- |
| 0001 | `src/EnergyPlus/CMakeLists.txt`: new `energyplusapi_pyodide` target that links the static `energyplusapi` archive whole into `libenergyplusapi.so` with `-sSIDE_MODULE=1`. It defines `energyplusapi_EXPORTS` so `ENERGYPLUSLIB_API` keeps the C API visible under `-fvisibility=hidden`. It also skips copying the host Python standard library. |
| 0002 | `PluginManager.cc`: `initPython` returns early if the interpreter is already running. Otherwise `Py_InitializeFromConfig` would reconfigure Pyodide and replace `sys.path` with `python_lib`. |
| 0003 | `FileSystem.cc`: `getProgramPath()` had no Emscripten branch and returned an uninitialized buffer. It now returns `/energyplus`. |
| 0004 | `api/api.py`: `api_path()` returns `libenergyplusapi.so` when `sys.platform == "emscripten"`. |

`scripts/configure-ep-pyodide.sh` also compiles C code with `-fvisibility=hidden`. Pyodide's main module exports its
own SQLite and Expat. Default-visibility copies in the side module would be replaced by those at load time, mixing
two SQLite builds. Every `Output:SQLite` model then failed with `null function or function signature mismatch`.

## Build

Requirements: git, curl, CMake ≥ 3.24, Ninja, and a host Python 3.12 or newer for build-time code generation
(3.14 recommended, to match Pyodide's headers). Tested on macOS 26.7.1 (arm64) with CMake 4.4.4, Ninja 1.13.2 and
Python 3.14.8.

```sh
bash scripts/setup-pyodide-toolchain.sh      # EnergyPlus source + patches, emsdk 5.0.3 + Pyodide patches, Pyodide 314.0.7
bash scripts/configure-ep-pyodide.sh --build # -> build/pyodide-ep/Products/{libenergyplusapi.so,pyenergyplus/}
```

The output is a single 33 MB side module plus the `pyenergyplus` package.

## Test

Use the Node that emsdk installs (`emsdk-pyodide/node/*/bin/node`) or any Node ≥ 22.15. Pass `--use-system-ca` if
a TLS-intercepting proxy sits between you and the Pyodide CDN; otherwise it can be omitted.

```sh
(cd packages/sim-engine-wasm && npm install && npm run stage && npm run build && npm test)
node --use-system-ca test/ep_pyodide_plugin_gate.mjs   # A–D below
node --use-system-ca test/ep_pyodide_plugin_sweep.mjs  # all upstream PythonPlugin*.idf examples
```

The gate, the sweep and the browser demo use the package's built `dist/`, so build the package first.

`ep_pyodide_plugin_gate.mjs` runs four checks in one Pyodide session:

- **A.** Upstream `PythonPluginCustomOutputVariable` (5 zones, Chicago design days). The plugin's volume-averaged
  temperature is reported at every timestep (288) and stays inside the zone temperature range.
- **B.** The same model with a numpy port of the plugin
  ([test/fixtures](test/fixtures/PythonPluginCustomOutputVariable_numpy.py)), with numpy 2.4.6 from the Pyodide CDN.
  It is identical to A (max relative difference 0).
- **D.** A plugin that raises: EnergyPlus exits 1 with the Python traceback in `eplusout.err`, and the session stays
  usable.
- **C.** `1ZoneUncontrolled` without plugins: the ESO is identical to the baseline `build/wasm-ep` binary (0 values
  differ). The baseline is the build validated against native EnergyPlus in this repository.

`ep_pyodide_plugin_sweep.mjs` result: all 23 upstream examples behave as expected, plus one corrected variant:

- 22 complete with 0 severe errors.
- `PythonPluginTestMathAndKill` is `EXPECT_FATAL` upstream. At v26.1.0 it stops on wiring errors in its own IDF
  before the plugin runs; the plugin-free baseline build fails identically.
- A corrected variant fixes the IDF wiring and an out-of-date `specific_heat` call in the upstream plugin. It passes
  the plugin's trend, curve/table, psychrometric and glycol checks, and stops through the plugin's own abort.

`test/ep_wasm_smoke.mjs` is a quick check of the baseline (no Python) build that needs no native oracle.

## Use in a browser

```sh
python3 -m http.server 8765        # from the repository root
open http://127.0.0.1:8765/web/pyodide-demo/
```

[web/pyodide-demo/](web/pyodide-demo/) runs Pyodide and EnergyPlus in a module Web Worker. Leave the inputs empty
to run the stock plugin example, or upload an IDF/epJSON, an EPW and the plugin `.py` files. Optionally list
Pyodide packages (e.g. `numpy`) to load first. All output files can be downloaded.

From your own code, use the npm package `@luzechao/sim-engine-wasm`; its
[README](packages/sim-engine-wasm/README.md) covers installation, serving the assets and the API.

## npm package and releases

[packages/sim-engine-wasm](packages/sim-engine-wasm) is published to npm as `@luzechao/sim-engine-wasm`. Its
version is the EnergyPlus version (`26.1.0`; rebuilds bump the patch number). `npm run stage` copies the built
`libenergyplusapi.so` and `pyenergyplus/` into `assets/`, and writes `LICENSE-EnergyPlus.txt` and
`THIRD_PARTY_NOTICES`. The notices are generated from the license files and headers of the libraries compiled
into the module.

[.github/workflows/sim-engine-wasm.yml](.github/workflows/sim-engine-wasm.yml) builds everything from source on
Ubuntu, runs the gate and the package tests, and uploads the package tarball as an artifact. Pushing a tag
`sim-engine-wasm-v<version>` (matching `package.json`) also publishes it to npm.

## Notes and limits

- **Use a Web Worker.** Simulations are synchronous. `installEnergyPlus` compiles the module with Pyodide's async
  `loadDynlib`, so the later `ctypes` load is a cache hit even on a page's main thread.
- **Packages.** `pyodide-core` contains no package wheels. `loadPackage` fetches them from `packageBaseUrl`, which
  the demo and the gate point at `cdn.jsdelivr.net/pyodide/v314.0.7/full/`.
- **Re-runs.** Plugin modules are imported from each run's own directory. `runEnergyPlus` drops cached modules from
  earlier runs, so editing a plugin and re-running picks up the change. Outputs stay in Pyodide's in-memory file
  system until `dispose()` is called on the result.
- **Not available.** Everything `PYTHON_CLI` provides (e.g. ground heat exchanger borehole field design), PixelCounting
  shading, `ExternalInterface`, and the Fortran preprocessors (ExpandObjects, Slab, Basement, EPMacro). These are
  the same gaps as the baseline build.
- **Memory.** The simulation shares Pyodide's heap, which can grow to 4 GB.
- **Version string.** `eplusout.err` shows a local commit hash after `26.1.0-`, because the patches are committed
  on top of `6f2e40d102`.

## Provenance of the tested build

| Item | Value |
| --- | --- |
| EnergyPlus | `6f2e40d10250a105b49966baa24d843711e61048` + `patches/energyplus/0001–0005` + `patches/energyplus-pyodide/0001–0004` |
| Pyodide | 314.0.7 (`pyodide-core`, `xbuildenv`), CPython 3.14.2, ABI `pyemscripten_2026_0` |
| Emscripten | 5.0.3 (clang 23.0.0git `e5927fecf8a6`) + Pyodide's five emsdk patches |
| Host | macOS 26.7.1 arm64 (Apple M4 Pro), CMake 4.4.4, Ninja 1.13.2, Python 3.14.8 |
| `libenergyplusapi.so` | 32,954,278 bytes, SHA-256 `532da382f66f4e2b07ae3faa704f66f7abc79b82926871e4dc78d000c87c1807` |
| Baseline `energyplus.js-26.1.wasm` rebuilt on the same host with emsdk 6.0.0 | SHA-256 `dc9e06d2be13851cf938af21b58164ccc4500e7e36449eca5e0a0c44985e3b7e` |

Binary hashes depend on the host and toolchain. Rely on the gates above, not on matching hashes.
