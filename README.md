# Browser energy simulation: EnergyPlus v26.1 WebAssembly research artifact

This repository accompanies Islam Mashaly's manuscript, *Browser-native whole-building energy simulation: a WebAssembly port of EnergyPlus validated against ASHRAE Standard 140*.

The contribution is a browser port of EnergyPlus v26.1.0, five build-tooling patches, and numerical validation. It is an independent research artifact, not an official EnergyPlus release. The source version is pinned to `6f2e40d10250a105b49966baa24d843711e61048` in [the upstream repository](https://github.com/NatLabRockies/EnergyPlus).

## What is included

| Path | Purpose |
| --- | --- |
| `patches/energyplus/` | Five patches affecting six files; no physics-source edits |
| `scripts/configure-ep-*.sh` | Native and WebAssembly configure/build commands |
| `BUILD_PROVENANCE.md` | Recorded source, toolchain, and build provenance |
| `test/ep_*_gate.mjs`, `test/lib/` | Three core fidelity tests and 21-case annual acceptance gate |
| `test/ep-reference/ashrae140-2023/` | Final 2023 cases, criteria, input derivation and provenance |
| `test/ep-reference/ashrae140/` | Older six-case inputs retained for Table 4 timings; not the final standards verdict |
| `energyplus-src/` | Three upstream example inputs and Chicago weather only; not a full source checkout |
| `src/browser-energy-worker.mjs`, `src/ep-results.mjs` | Browser integration worker and results parser |
| `paper1/data/` | Captured results, timing repetitions, and analysis scripts |
| `paper1/figures/` | Workflow image and reproducible annual-acceptance plot |
| `ARTIFACTS.json` | Exact tested binary and omitted-input hashes |
| `LICENSES/`, `THIRD_PARTY_NOTICES.md` | Upstream licenses and provenance |
| `MANIFEST.sha256`, `PACKAGE_PROVENANCE.json` | Upload content hashes and source-copy audit |

The full design application, IFC models, teaching studies, unrelated simulation engines, private drafts, and repository history are outside this package. The manuscript itself can be supplied to the journal separately. `src/` exposes the integration code but is not a standalone design interface.

## Inspect the published results without compiling

Use Node.js 24.16.0 and Python 3. Run from this directory:

```sh
python3 scripts/check_manifest.py
node scripts/check_recorded_results.mjs
node paper1/data/summarize_timings.mjs
```

The first two commands only verify packaged content and recorded numerical results; they do not rerun EnergyPlus. The summary command regenerates `runtime_summary.md` from the 90 captured observations. Once a generated file changes, the original manifest correctly reports it as changed.

Expected recorded results: low mass **21/21**, minimum **18**; high mass **19/19**, minimum **17**. Median runtime ratios span **1.67–2.69**, with a single 8.79 s case-620 outlier retained in the means. Numerical agreement is judged at a relative threshold of `1e-6`. The reported maximum is `3.36e-9` for the three core models and `1.62e-7` for the expanded cases.

## Run the simulations

1. Install the dependencies listed in `environment/README.md`.
2. Download the exact Cairo weather input described in `weather/README.md` and check its SHA-256 against `ARTIFACTS.json`.
3. Download the separately supplied `wasm-engine-v26.1-tested.zip` release asset. Extract its contents **into this directory**. It creates `build/wasm-ep/Products/energyplus.js` and `energyplus.js-26.1.wasm`. The archive includes upstream license notices.
4. Build the native reference with the following commands. `energyplus-build` must not already exist; the included `energyplus-src` directory contains fixtures only.

```sh
git clone https://github.com/NatLabRockies/EnergyPlus.git energyplus-build
git -C energyplus-build checkout 6f2e40d10250a105b49966baa24d843711e61048
git -C energyplus-build apply ../patches/energyplus/0001-cstdint-include-lib_battery_dispatch.patch
git -C energyplus-build apply ../patches/energyplus/0002-fmt8-udl-format-h.patch
git -C energyplus-build apply ../patches/energyplus/0003-fmt8-udl-xchar-h.patch
git -C energyplus-build apply ../patches/energyplus/0004-fmt8-consteval-clang15.patch
git -C energyplus-build apply ../patches/energyplus/0005-cmake-werror-and-idd-emscripten-linkflags.patch
bash scripts/configure-ep-native.sh
cmake --build build/native-ep --target energyplus -j2
node scripts/run_validation.mjs
```

The runner executes the three core comparisons followed by all 21 Section 7 cases, and saves complete console logs under `verification-runs/`. Any failed gate makes the runner exit with a nonzero status. Numerical results should match the reported thresholds; elapsed times depend on the host. The tests use temporary directories for native outputs, as in the original harness. This package preserves historical console logs and derived results, but not a complete historical raw ESO/ERR archive for every case.

## Rebuild WebAssembly as well

After preparing the patched `energyplus-build` above:

```sh
git clone https://github.com/emscripten-core/emsdk.git emsdk
git -C emsdk checkout d223ae7
./emsdk/emsdk install 6.0.0
./emsdk/emsdk activate 6.0.0
bash scripts/configure-ep-wasm.sh
cmake --build build/wasm-ep --target energyplus -j2
node scripts/run_validation.mjs
```

The configure script uses the local `emsdk` directory by default, or `EMSDK_DIR` if supplied. The exact recorded compiler versions are in `BUILD_PROVENANCE.md`. Building on a different toolchain may produce different binary hashes; rerun the numerical gates before relying on those builds. Source build instructions have been assembled from the recorded configuration; a new clean-machine full compilation has not been performed for this packaging revision.

## Regenerate the acceptance plot

`make_fig1.mjs` is the historical filename; its output is **Figure 2** in the final manuscript. It reads the final 2023 results, not the older six-case results.

```sh
npm ci
npx playwright install --with-deps chromium
node paper1/figures/make_fig1.mjs
```

This writes SVG and, when Chromium launches successfully, PNG. Inspect the output for a `PNG render skipped` message. The existing PNG is included. The Figure 1 workflow is a raster illustration with corrected labels, not a data-derived plot; see `FIGURE_NOTES.md`.

## Scope and limitations

The annual acceptance result covers ANSI/ASHRAE Standard 140-2023 **as published, Section 7 annual heating/cooling groups only**. It does not claim whole-standard compliance, certification of a user interface, or the time-series criteria of later Addendum a. The core comparison and expanded gate run WebAssembly under Node.js; the separately recorded browser feasibility check used a headless Chromium worker. This curated package does not include the entire application required to rerun that historical interface gate. Its browser logs are included as captured evidence.

Simulation is single-threaded. Large complex models, all browsers and devices, offline operation, subprocess-dependent features, and the full 4 GB memory boundary were not validated. The recorded runtime machine had 7.5 GiB RAM; this is not a measured minimum hardware specification.

## Release and citation

Author: Islam Mashaly, Department of Architecture, The American University in Cairo. ORCID: https://orcid.org/0000-0002-4021-4308.

Use `CITATION.cff`. Add the actual repository URL, immutable release tag, and archival DOI when published; none has been invented here. Upstream licenses apply to their respective files. The author's own code license remains to be selected in `LICENSE_STATUS.md`.
