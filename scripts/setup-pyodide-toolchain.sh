#!/usr/bin/env bash
# setup-pyodide-toolchain.sh
#
# Fetches everything scripts/configure-ep-pyodide.sh needs. Each step is skipped if already done.
#   energyplus-pyodide/   EnergyPlus 4bd7a1f26f (v26.2.0) + patches/energyplus/* + patches/energyplus-pyodide/*
#   emsdk-pyodide/        emsdk 5.0.3 (Pyodide 314.0.7's Emscripten) + Pyodide's emsdk patches
#   third_party/pyodide/  pyodide-core-314.0.7 (runtime) and xbuildenv-314.0.7 (Python headers, emsdk patches)
#
# Usage: scripts/setup-pyodide-toolchain.sh

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
EP_COMMIT=4bd7a1f26fb749a83257855aba6760e26c8a3c8f
EP_REPO=https://github.com/NatLabRockies/EnergyPlus.git
PYODIDE_VERSION=314.0.7
PYODIDE_EMSCRIPTEN_VERSION=5.0.3
PYODIDE_RELEASE_URL="https://github.com/pyodide/pyodide/releases/download/${PYODIDE_VERSION}"

SOURCE_DIR="${REPO_ROOT}/energyplus-pyodide"
EMSDK_DIR="${REPO_ROOT}/emsdk-pyodide"
PYODIDE_DIR="${REPO_ROOT}/third_party/pyodide"

# --- Pyodide runtime and cross-build environment --------------------------
if [[ ! -f "${PYODIDE_DIR}/pyodide/pyodide.asm.wasm" ]]; then
  mkdir -p "${PYODIDE_DIR}"
  curl -fL "${PYODIDE_RELEASE_URL}/pyodide-core-${PYODIDE_VERSION}.tar.bz2" | tar xj -C "${PYODIDE_DIR}"
fi
if [[ ! -d "${PYODIDE_DIR}/xbuildenv/xbuildenv/pyodide-root" ]]; then
  mkdir -p "${PYODIDE_DIR}/xbuildenv"
  curl -fL "${PYODIDE_RELEASE_URL}/xbuildenv-${PYODIDE_VERSION}.tar.bz2" | tar xj -C "${PYODIDE_DIR}/xbuildenv"
fi
PYODIDE_ROOT="${PYODIDE_DIR}/xbuildenv/xbuildenv/pyodide-root"

# --- emsdk at Pyodide's Emscripten version, with Pyodide's patches --------
if [[ ! -f "${EMSDK_DIR}/emsdk" ]]; then
  git clone https://github.com/emscripten-core/emsdk.git "${EMSDK_DIR}"
fi
if [[ ! -f "${EMSDK_DIR}/upstream/emscripten/emscripten-version.txt" ]] ||
   ! grep -q "\"${PYODIDE_EMSCRIPTEN_VERSION}\"" "${EMSDK_DIR}/upstream/emscripten/emscripten-version.txt"; then
  "${EMSDK_DIR}/emsdk" install "${PYODIDE_EMSCRIPTEN_VERSION}"
  "${EMSDK_DIR}/emsdk" activate "${PYODIDE_EMSCRIPTEN_VERSION}"
  rm -f "${EMSDK_DIR}/.pyodide-patches-applied"
fi
if [[ ! -f "${EMSDK_DIR}/.pyodide-patches-applied" ]]; then
  for p in "${PYODIDE_ROOT}"/emsdk/patches/*.patch; do
    patch -d "${EMSDK_DIR}/upstream/emscripten" -p1 -N < "${p}"
  done
  touch "${EMSDK_DIR}/.pyodide-patches-applied"
fi

# --- EnergyPlus source with both patch series ------------------------------
if [[ ! -d "${SOURCE_DIR}/.git" && ! -f "${SOURCE_DIR}/.git" ]]; then
  mkdir -p "${SOURCE_DIR}"
  git -C "${SOURCE_DIR}" init -q
  git -C "${SOURCE_DIR}" remote add origin "${EP_REPO}"
  git -C "${SOURCE_DIR}" fetch --depth 1 origin "${EP_COMMIT}"
  git -C "${SOURCE_DIR}" checkout -q FETCH_HEAD
  for p in "${REPO_ROOT}/patches/energyplus/0005-cmake-werror-and-idd-emscripten-linkflags.patch" "${REPO_ROOT}"/patches/energyplus-pyodide/*.patch; do
    git -C "${SOURCE_DIR}" apply "${p}"
    echo "applied $(basename "${p}")"
  done
fi

echo "Ready. Next: bash scripts/configure-ep-pyodide.sh --build"
