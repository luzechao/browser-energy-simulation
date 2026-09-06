# EnergyPlus toolchain patch series

Five patches, all build-system/toolchain edits that let EnergyPlus v26.1.0
(`NatLabRockies/EnergyPlus` commit `6f2e40d10250a105b49966baa24d843711e61048`)
compile with a newer toolchain than upstream CI pins: gcc-15 (native oracle)
and Emscripten's bundled clang-23 (WASM build). **None of these patches
touches simulation physics.** Every changed file lives under `third_party/`,
`cmake/`, or `idd/` — build tooling and vendored third-party code, never
`src/EnergyPlus/` (the physics/algorithm core). Confirmed by a full-tree diff
(`diff -rq energyplus-src energyplus-build`, excluding `.git` and the
generated `idd/schema/__pycache__` directory) — exactly these 6 files differ,
nothing else.

## Apply order and command

The patches are independent (they touch disjoint files, except 0005 which
touches two files in one patch) and apply cleanly in any order, but they are
numbered to match the order the underlying compile errors were hit and fixed
during the original port (CLAUDE.md "E+ build patches so far"). Apply all
five, in order, from the root of a pristine `energyplus-src/` clone (or any
checkout of commit `6f2e40d102`):

```sh
cd energyplus-src   # pristine checkout, NEVER the working copy in energyplus-build/
for p in ../patches/energyplus/*.patch; do
  patch -p1 < "$p"
done
```

Each patch was verified 2026-07-17 by (a) `patch --dry-run -p1` against a copy
of the exact pristine file(s) it touches, and (b) applying it for real and
diffing the result against the corresponding file in `energyplus-build/` —
byte-identical in every case. This reproduces `energyplus-build/` from
`energyplus-src/` exactly; it is not an approximation.

## Patch index

| # | File(s) | What | Why (toolchain, not physics) |
|---|---|---|---|
| 0001 | `third_party/ssc/shared/lib_battery_dispatch.cpp` | add `#include <cstdint>` | `SIZE_MAX` not transitively included with gcc≥15 header hygiene |
| 0002 | `third_party/fmt-8.0.1/include/fmt/format.h` | `operator"" _a`/`operator"" _format` → no space (2 sites) | clang≥23 promotes deprecated-literal-operator spacing to a hard error; tokenization only |
| 0003 | `third_party/fmt-8.0.1/include/fmt/xchar.h` | same de-spacing, wchar_t overloads (2 sites) | same as 0002 |
| 0004 | `third_party/fmt-8.0.1/include/fmt/core.h` | disable `FMT_CONSTEVAL` for clang≥15 | fmt 8's consteval format-string check is a hard error on clang≥15; disables only the *compile-time* check, runtime formatting unchanged |
| 0005 | `cmake/CompilerFlags.cmake` + `idd/CMakeLists.txt` | drop global `-Werror` (+ `-Wno-restrict` gcc-15 false positive); per-target Emscripten link-flag override for the build-time epJSON-schema generator tool | warning-policy change (emits no code) + build-time-tool-only link flags (never the shipped engine) |

Full verbatim diffs and the load-bearing verdict ("no file under
`src/EnergyPlus/` was modified, and no edit changes a numerical code path")
are also recorded in `paper1/methods_evidence.md` Fact 3, and condensed in
`CLAUDE.md` §"E+ build patches so far".

## Relationship to `energyplus-build/`

`energyplus-build/` is the mutable working copy these patches were extracted
from — it already has them applied, plus the ordinary build-generated
artifacts (`idd/schema/__pycache__`, `CMakeFiles/`, etc., which are gitignored
build output, not source deviations). If `energyplus-build/` is ever lost, it
can be recreated exactly by cloning the pinned commit into a fresh
`energyplus-src/`-style checkout and applying this patch series — see
`scripts/configure-ep-wasm.sh` / `scripts/configure-ep-native.sh` for the
configure/build commands to run against the result.
