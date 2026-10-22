#!/usr/bin/env bash
# configure-ep-wasm.sh
#
# Reproduces the EXACT `emcmake cmake` configure + build invocation used to
# produce build/wasm-ep/Products/energyplus.js{,-26.1.wasm} (EnergyPlus
# v26.1.0, commit 6f2e40d102, + the 5 toolchain patches in patches/energyplus/).
#
# Every -D flag below was recovered from build/wasm-ep/CMakeCache.txt and
# verified 2026-07-17 by a fresh `emcmake cmake` configure-only dry run into a
# throwaway directory: every non-default cache entry (CMAKE_BUILD_TYPE,
# CMAKE_C_FLAGS, CMAKE_CXX_FLAGS, CMAKE_EXE_LINKER_FLAGS,
# CMAKE_CROSSCOMPILING_EMULATOR, BUILD_STATIC_ENERGYPLUS_API,
# OPENGL_REQUIRED/OPENGL_FOUND, CMAKE_TOOLCHAIN_FILE, CMAKE_INSTALL_PREFIX)
# matched the real cache byte-for-byte. Do not add or remove flags without
# re-running that diff — see CLAUDE.md "E+ build patches so far" and
# paper1/methods_evidence.md Fact 2/Reproducibility gap 1 for the provenance
# trail this script closes.
#
# Usage:
#   scripts/configure-ep-wasm.sh [build-dir]
#   scripts/configure-ep-wasm.sh --build [build-dir]   # also runs the build (hours)
#
# build-dir defaults to build/wasm-ep (relative to the repo root this script
# lives in). Source tree is energyplus-build/ (the patched working copy —
# see patches/energyplus/README.md to reproduce it from the pristine
# energyplus-src/ clone).

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SOURCE_DIR="${REPO_ROOT}/energyplus-build"
BUILD_DIR="${2:-${REPO_ROOT}/build/wasm-ep}"
DO_BUILD=0
if [[ "${1:-}" == "--build" ]]; then
  DO_BUILD=1
  BUILD_DIR="${2:-${REPO_ROOT}/build/wasm-ep}"
elif [[ -n "${1:-}" ]]; then
  BUILD_DIR="$1"
fi

# --- Step (a): activate emsdk ---------------------------------------------
# Pinned toolchain (see BUILD_PROVENANCE.md): emcc 6.0.0, LLVM/clang
# 23.0.0git @ c6c2ad52586c28e74a724570985a48dc0022d250.
EMSDK_DIR="${EMSDK_DIR:-${REPO_ROOT}/emsdk}"
if [[ ! -f "${EMSDK_DIR}/emsdk_env.sh" ]]; then
  echo "error: emsdk/emsdk_env.sh not found — install/activate emsdk first (see BUILD_PROVENANCE.md)" >&2
  exit 1
fi
# shellcheck disable=SC1091
source "${EMSDK_DIR}/emsdk_env.sh"

echo "emcc: $(emcc --version | head -1)"
echo "node (CMAKE_CROSSCOMPILING_EMULATOR): $(node --version 2>/dev/null || echo 'not on PATH, using emsdk-bundled node explicitly below')"

# --- Step (b): emcmake cmake configure -------------------------------------
# CMAKE_CXX_FLAGS / CMAKE_C_FLAGS: -fwasm-exceptions — WASM exception handling
#   (EnergyPlus core throws/catches C++ exceptions in normal control flow).
# CMAKE_EXE_LINKER_FLAGS: memory/runtime shape for the shipped module —
#   FORCE_FILESYSTEM (Emscripten virtual FS for IDF/EPW/ESO I/O),
#   ALLOW_MEMORY_GROWTH + INITIAL_MEMORY=256MB + MAXIMUM_MEMORY=4GB (annual
#   simulations exceed the 16 MB WASM default heap), STACK_SIZE=8MB,
#   MODULARIZE + EXPORT_NAME=createEnergyPlusModule (Node/browser-loadable
#   factory, matches CLAUDE.md Stage 5-E), EXPORTED_RUNTIME_METHODS=FS,callMain
#   (virtual-FS + argv-driven entry point), INVOKE_RUN=0 (caller controls when
#   main() runs, does not auto-run on module load).
# CMAKE_CROSSCOMPILING_EMULATOR: required because idd/CMakeLists.txt's
#   generate_embeddable_epJSON_schema build-time tool is itself compiled to
#   JS and must be *run* via node during the build (the cross-compile trap
#   documented in CLAUDE.md patch 5). Emscripten.cmake only auto-sets this
#   `if (NOT DEFINED CMAKE_CROSSCOMPILING_EMULATOR)`, so passing it here
#   pins the exact node binary rather than relying on emsdk's default pick.
# BUILD_STATIC_ENERGYPLUS_API=ON: static lib (no libenergyplusapi.so) — a
#   shared library is not meaningful for a single self-contained wasm binary,
#   and this cmake (4.2.3) cannot emit Emscripten shared libraries anyway
#   (see the harmless "does not support emscripten shared libraries" warning
#   below, upstream limitation, not a project decision).
# OPENGL_REQUIRED=OFF: EnergyPlus default is ON (searches for OpenGL and, if
#   found, builds third_party/penumbra, which needs GLFW -> X11). WASM has no
#   OpenGL/X11; without this flag the configure step fails hunting X11 dev
#   libraries. Native oracle also passes OFF for parity (see
#   configure-ep-native.sh) even though X11 happens to be present there —
#   penumbra (daylighting raytracing via ray-traced GPU shading) is not part
#   of the validated CBDM/EnergyPlus feature set either way.
emcmake cmake -S "${SOURCE_DIR}" -B "${BUILD_DIR}" \
  -DCMAKE_BUILD_TYPE=Release \
  -DOPENGL_REQUIRED=OFF \
  -DCMAKE_C_FLAGS="-fwasm-exceptions" \
  -DCMAKE_CXX_FLAGS="-fwasm-exceptions" \
  -DCMAKE_EXE_LINKER_FLAGS="-fwasm-exceptions -sFORCE_FILESYSTEM=1 -sALLOW_MEMORY_GROWTH=1 -sINITIAL_MEMORY=268435456 -sMAXIMUM_MEMORY=4294967296 -sSTACK_SIZE=8388608 -sMODULARIZE=1 -sEXPORT_NAME=createEnergyPlusModule -sEXPORTED_RUNTIME_METHODS=FS,callMain -sINVOKE_RUN=0" \
  -DCMAKE_CROSSCOMPILING_EMULATOR="${EMSDK}/node/22.16.0_64bit/bin/node" \
  -DBUILD_STATIC_ENERGYPLUS_API=ON

# --- Step (c): build --------------------------------------------------------
# `energyplus` target produces Products/energyplus.js (glue) +
# Products/energyplus.js-26.1.wasm (31 MB). Full build takes on the order of
# tens of minutes; NOT run by default — pass --build to actually run it.
if [[ "${DO_BUILD}" -eq 1 ]]; then
  cmake --build "${BUILD_DIR}" --target energyplus -j"$(getconf _NPROCESSORS_ONLN)"
else
  echo "Configured only (pass --build as the first argument to also build; this step takes a long time)."
  echo "Equivalent manual build command:"
  echo "  cmake --build '${BUILD_DIR}' --target energyplus -j\$(getconf _NPROCESSORS_ONLN)"
fi
