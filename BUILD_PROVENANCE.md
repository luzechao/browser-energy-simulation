# Build Provenance — EnergyPlus WASM Port

Every value below was measured directly on the build host on 2026-07-17
(commands shown); nothing is quoted from memory or from CLAUDE.md prose.
This record exists to close reproducibility gap B-4 (paper1/methods_evidence.md
§Reproducibility gaps item 3 / §Discrepancies) — pin the exact toolchain used
to produce `build/wasm-ep/` and `build/native-ep/`, not just "emcc 6 / clang 23".

## 1. EnergyPlus source pin

```
$ git -C energyplus-src remote -v
origin  https://github.com/NatLabRockies/EnergyPlus.git (fetch)
origin  https://github.com/NatLabRockies/EnergyPlus.git (push)

$ git -C energyplus-src rev-parse HEAD
6f2e40d10250a105b49966baa24d843711e61048

$ git -C energyplus-build rev-parse HEAD
6f2e40d10250a105b49966baa24d843711e61048
```

Both `energyplus-src/` (pristine) and `energyplus-build/` (working copy, +
the 5 patches in `patches/energyplus/`) are at identical HEAD `6f2e40d102`
("Merge pull request #11488 from NatLabRockies/26.1-final-cleanups", v26.1.0
per `energyplus-build/cmake/Version.cmake`).

## 2. Emscripten toolchain (WASM build)

```
$ source ~/emsdk/emsdk_env.sh
$ emcc --version
emcc (Emscripten gcc/clang-like replacement + linker emulating GNU ld) 6.0.0 (afa15e0c56d1292e073c2c91bafc1d5e0cdf0dd3)

$ ~/emsdk/upstream/bin/clang --version
clang version 23.0.0git (https://github.com/llvm/llvm-project c6c2ad52586c28e74a724570985a48dc0022d250)
Target: x86_64-unknown-linux-gnu

$ cat ~/emsdk/upstream/emscripten/emscripten-version.txt
"6.0.0"
```

- **emcc / Emscripten:** `6.0.0`, upstream commit `afa15e0c56d1292e073c2c91bafc1d5e0cdf0dd3`.
- **clang (LLVM):** `23.0.0git`, LLVM/llvm-project commit
  `c6c2ad52586c28e74a724570985a48dc0022d250`. This is a development snapshot,
  not a tagged LLVM release — the commit hash, not "clang 23", is the
  reproducible identifier.
- **emsdk activation:** `~/emsdk` is a git clone of
  `https://github.com/emscripten-core/emsdk.git`, checked out at commit
  `d223ae7` ("Release 6.0.0 (#1720)"). The active SDK was selected with
  `emsdk install 6.0.0 && emsdk activate 6.0.0`, which resolves (per
  `emsdk list --old`, marked `INSTALLED`/`*`/`(*)`) to the pinned toolset
  `sdk-releases-772bb4648be4a897ca062d6adc65bc70223d2703-64bit` /
  `releases-772bb4648be4a897ca062d6adc65bc70223d2703-64bit` — the
  `emscripten-releases` pin commit `772bb4648be4a897ca062d6adc65bc70223d2703`
  that emsdk's release manifest maps to LLVM `c6c2ad525...` above.
  Reproduce with:
  ```sh
  git clone https://github.com/emscripten-core/emsdk.git
  cd emsdk && git checkout d223ae7
  ./emsdk install 6.0.0
  ./emsdk activate 6.0.0
  source ./emsdk_env.sh
  ```
- **Bundled node (used as `CMAKE_CROSSCOMPILING_EMULATOR` and by
  Emscripten's own `NODE_JS` config):**
  ```
  $ cat ~/emsdk/.emscripten | grep NODE_JS
  NODE_JS = emsdk_path + '/node/22.16.0_64bit/bin/node'
  ```
  → **v22.16.0**, at `~/emsdk/node/22.16.0_64bit/bin/node`.

## 3. Node.js (shell / test-harness runtime)

```
$ node --version
v24.16.0
$ which node
/home/islam/.nvm/versions/node/v24.16.0/bin/node
```

**v24.16.0** (nvm-managed) — this is the Node used to run the WASM module in
the test/gate scripts (`test/ep_version.mjs` etc.) and the `configure-ep-*.sh`
scripts' own shell, distinct from the emsdk-bundled v22.16.0 used internally
by the Emscripten build tooling (§2 above). Both are recorded because they
are different binaries with different roles.

## 4. Native oracle compiler (GCC)

```
$ /usr/bin/c++ --version
c++ (Ubuntu 15.2.0-16ubuntu1) 15.2.0

$ /usr/bin/cc --version
cc (Ubuntu 15.2.0-16ubuntu1) 15.2.0

$ grep '^CMAKE_CXX_COMPILER:\|^CMAKE_C_COMPILER:' build/native-ep/CMakeCache.txt
CMAKE_CXX_COMPILER:FILEPATH=/usr/bin/c++
CMAKE_C_COMPILER:FILEPATH=/usr/bin/cc
```

**GCC 15.2.0** (Ubuntu package `15.2.0-16ubuntu1`), confirmed as the exact
compiler CMake recorded for `build/native-ep/` (not just what's on `$PATH`
today — the cache is the ground truth for what actually built the oracle).

## 5. CMake

```
$ cmake --version
cmake version 4.2.3
```

**CMake 4.2.3** — used for both the native and WASM configure (the latter via
the `emcmake` wrapper, which invokes this same system `cmake` with
`-DCMAKE_TOOLCHAIN_FILE=.../Emscripten.cmake`; see
`scripts/configure-ep-wasm.sh`). Note: this version emits a harmless warning
during Emscripten configure ("This version of cmake (4.2.3) does not support
emscripten shared libraries") — irrelevant here since
`BUILD_STATIC_ENERGYPLUS_API=ON` is set for the WASM build.

## 6. OS / kernel

```
$ uname -a
Linux ang-p07-1132-02 6.6.114.1-microsoft-standard-WSL2 #1 SMP PREEMPT_DYNAMIC Mon Dec 1 20:46:23 UTC 2025 x86_64 GNU/Linux

$ cat /etc/os-release
PRETTY_NAME="Ubuntu 26.04 LTS"
NAME="Ubuntu"
VERSION_ID="26.04"
VERSION="26.04 LTS (Resolute Raccoon)"
VERSION_CODENAME=resolute
```

**Ubuntu 26.04 LTS ("Resolute Raccoon")** on **WSL2**, kernel
`6.6.114.1-microsoft-standard-WSL2`, `x86_64`.

## 7. Build artifact dates (mtime)

```
$ stat -c '%y %n' build/wasm-ep/Products/energyplus.js-26.1.wasm \
                   build/wasm-ep/Products/energyplus.js-26.1.0 \
                   build/native-ep/Products/energyplus-26.1.0
2026-07-06 14:13:07 build/wasm-ep/Products/energyplus.js-26.1.wasm
2026-07-06 14:13:07 build/wasm-ep/Products/energyplus.js-26.1.0
2026-07-06 13:54:43 build/native-ep/Products/energyplus-26.1.0
```

- **Native oracle** (`energyplus-26.1.0`, ELF) built **2026-07-06 13:54:43**
  (link-finish time; `build/native-ep/build.log` starts ~13:25 the same day).
- **WASM module** (`energyplus.js-26.1.wasm`, 31,290,070 bytes +
  `energyplus.js-26.1.0` glue, 88,965 bytes) built **2026-07-06 14:13:07**
  (`build/wasm-ep/build.log` starts ~13:42 the same day) — i.e. the WASM
  build was configured and run immediately after the native oracle, same
  session, same source tree state (§1).

## 8. Reproducing the configure step

See `scripts/configure-ep-wasm.sh` and `scripts/configure-ep-native.sh` —
both scripts' flags were extracted from the actual `CMakeCache.txt` files and
verified byte-for-byte against a fresh configure-only dry run (2026-07-17;
see the scripts' header comments for what was checked). Building the patch
series first (`patches/energyplus/`, applied to a pristine `energyplus-src/`
clone at the commit in §1) reproduces `energyplus-build/` exactly; running
the two configure scripts against that tree reproduces the exact
`build/wasm-ep/` and `build/native-ep/` configure state recorded here.
