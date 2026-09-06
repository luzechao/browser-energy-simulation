#!/usr/bin/env bash
# configure-ep-native.sh
#
# Reproduces the EXACT `cmake` configure + build invocation used to produce
# build/native-ep/Products/energyplus-26.1.0 — the native oracle EnergyPlus
# WASM output is validated against (bit-of-agreement gates in test/, see
# CLAUDE.md "Stage 5-E"). Built from the SAME source tree as the WASM build
# (energyplus-build/, pinned commit 6f2e40d102 + the 5 patches in
# patches/energyplus/), just with the host toolchain instead of emcc.
#
# Every -D flag below was recovered from build/native-ep/CMakeCache.txt and
# verified 2026-07-17 by a fresh `cmake` configure-only dry run into a
# throwaway directory: every non-default cache entry (CMAKE_BUILD_TYPE,
# CMAKE_CXX_COMPILER, CMAKE_C_COMPILER, OPENGL_REQUIRED/OPENGL_FOUND,
# CMAKE_INSTALL_PREFIX) matched the real cache byte-for-byte. Unlike the WASM
# build, no CMAKE_*_FLAGS/CMAKE_EXE_LINKER_FLAGS were passed — the native
# oracle uses stock Release flags (-O3 -DNDEBUG) with no extra compile/link
# options.
#
# Usage:
#   scripts/configure-ep-native.sh [build-dir]
#   scripts/configure-ep-native.sh --build [build-dir]   # also runs the build (tens of minutes)
#
# build-dir defaults to build/native-ep (relative to the repo root this
# script lives in). Source tree is energyplus-build/.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SOURCE_DIR="${REPO_ROOT}/energyplus-build"
BUILD_DIR="${REPO_ROOT}/build/native-ep"
DO_BUILD=0
if [[ "${1:-}" == "--build" ]]; then
  DO_BUILD=1
  BUILD_DIR="${2:-${REPO_ROOT}/build/native-ep}"
elif [[ -n "${1:-}" ]]; then
  BUILD_DIR="$1"
fi

echo "cmake: $(cmake --version | head -1)"
echo "c++:   $(c++ --version | head -1)"

# --- cmake configure ---------------------------------------------------
# CMAKE_BUILD_TYPE=Release: only non-default flag besides OPENGL_REQUIRED —
#   the default host compilers (CXX=/usr/bin/c++, C=/usr/bin/cc) and their
#   Release-config flags (-O3 -DNDEBUG, from EnergyPlus's own CMakeLists.txt)
#   are auto-detected, not passed explicitly.
# OPENGL_REQUIRED=OFF: kept OFF for parity with the WASM build even though
#   this host has usable OpenGL/X11 — penumbra (GPU daylighting raytracer) is
#   not part of the validated EnergyPlus feature set on either side, and
#   building it here would make the native oracle a different feature-set
#   binary than what was actually cross-checked against WASM.
cmake -S "${SOURCE_DIR}" -B "${BUILD_DIR}" \
  -DCMAKE_BUILD_TYPE=Release \
  -DOPENGL_REQUIRED=OFF

# --- build ---------------------------------------------------------------
# `energyplus` target produces Products/energyplus-26.1.0 (+ symlinks
# energyplus, EnergyPlus) and libenergyplusapi.so.26.1.0.
if [[ "${DO_BUILD}" -eq 1 ]]; then
  cmake --build "${BUILD_DIR}" --target energyplus -j"$(nproc)"
else
  echo "Configured only (pass --build as the first argument to also build; this step takes a long time)."
  echo "Equivalent manual build command:"
  echo "  cmake --build '${BUILD_DIR}' --target energyplus -j\$(nproc)"
fi
