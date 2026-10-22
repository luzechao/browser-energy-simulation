#!/usr/bin/env bash
# configure-ep-pyodide.sh
#
# Builds EnergyPlus v26.1.0 with PythonPlugin support as a Pyodide side module:
#   build/pyodide-ep/Products/libenergyplusapi.so   (Emscripten SIDE_MODULE)
#   build/pyodide-ep/Products/pyenergyplus/          (Python API, loads the .so via ctypes)
#
# EnergyPlus is not linked against its own CPython. It is compiled against Pyodide's Python headers
# and loaded into a running Pyodide, so PythonPlugin:Instance classes execute in Pyodide's interpreter
# (with access to Pyodide packages such as numpy). Everything must match the Pyodide release exactly:
# Emscripten version, -fwasm-exceptions, -sSUPPORT_LONGJMP=wasm, -fPIC and CPython minor version.
#
# Inputs (see README "PythonPlugin build (Pyodide)" for how to fetch them):
#   energyplus-pyodide/        EnergyPlus source + patches/energyplus/*.patch + patches/energyplus-pyodide/*.patch
#   emsdk-pyodide/             emsdk 5.0.3 with Pyodide's emsdk patches applied
#   third_party/pyodide/       pyodide-core-314.0.7 and xbuildenv-314.0.7
#
# Usage:
#   scripts/configure-ep-pyodide.sh [--build] [build-dir]

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SOURCE_DIR="${SOURCE_DIR:-${REPO_ROOT}/energyplus-pyodide}"
DO_BUILD=0
if [[ "${1:-}" == "--build" ]]; then
  DO_BUILD=1
  shift
fi
BUILD_DIR="${1:-${REPO_ROOT}/build/pyodide-ep}"

PYODIDE_VERSION="${PYODIDE_VERSION:-314.0.7}"
PYODIDE_DIR="${PYODIDE_DIR:-${REPO_ROOT}/third_party/pyodide}"
PYODIDE_ROOT="${PYODIDE_DIR}/xbuildenv/xbuildenv/pyodide-root"
PYTHON_INCLUDE_DIR="$(echo "${PYODIDE_ROOT}"/cpython/installs/python-*/include/python3.*)"
PYTHON_MINOR="$(basename "${PYTHON_INCLUDE_DIR}")"   # e.g. python3.14

EMSDK_DIR="${EMSDK_DIR:-${REPO_ROOT}/emsdk-pyodide}"
if [[ ! -f "${EMSDK_DIR}/emsdk_env.sh" ]]; then
  echo "error: ${EMSDK_DIR}/emsdk_env.sh not found -- install emsdk 5.0.3 there first" >&2
  exit 1
fi
if [[ ! -f "${PYTHON_INCLUDE_DIR}/Python.h" ]]; then
  echo "error: Pyodide Python headers not found under ${PYODIDE_ROOT}" >&2
  exit 1
fi
# shellcheck disable=SC1091
source "${EMSDK_DIR}/emsdk_env.sh" >/dev/null 2>&1

EXPECTED_EMCC="$(sed -n 's/^export PYODIDE_EMSCRIPTEN_VERSION ?= //p' "${PYODIDE_ROOT}/Makefile.envs")"
ACTUAL_EMCC="$(tr -d '"' < "${EMSDK}/upstream/emscripten/emscripten-version.txt")"
if [[ "${EXPECTED_EMCC}" != "${ACTUAL_EMCC}" ]]; then
  echo "error: Pyodide ${PYODIDE_VERSION} needs Emscripten ${EXPECTED_EMCC}, found ${ACTUAL_EMCC}" >&2
  exit 1
fi
echo "emcc ${ACTUAL_EMCC}; Python headers ${PYTHON_INCLUDE_DIR}"

HOST_PYTHON="${HOST_PYTHON:-$(command -v "${PYTHON_MINOR}" || command -v python3)}"
NODE_BIN="$(ls -d "${EMSDK}"/node/*/bin/node | head -1)"
NPROC="$(getconf _NPROCESSORS_ONLN 2>/dev/null || echo 4)"

# FindPython's Development component insists on a library file. Nothing should be linked from it:
# Python C API symbols are imported from Pyodide's main module when the side module is loaded.
mkdir -p "${BUILD_DIR}/pystub"
STUB_LIB="${BUILD_DIR}/pystub/lib${PYTHON_MINOR}.a"
if [[ ! -f "${STUB_LIB}" ]]; then
  echo "" > "${BUILD_DIR}/pystub/empty.c"
  emcc -c "${BUILD_DIR}/pystub/empty.c" -o "${BUILD_DIR}/pystub/empty.o"
  emar rcs "${STUB_LIB}" "${BUILD_DIR}/pystub/empty.o"
fi

# Compile flags = Pyodide's SIDE_MODULE_CFLAGS (CFLAGS_BASE: -fPIC -fwasm-exceptions -sSUPPORT_LONGJMP=wasm).
PYODIDE_CFLAGS="-fPIC -fwasm-exceptions -sSUPPORT_LONGJMP=wasm"
# C code is compiled with hidden visibility (EnergyPlus already does this for C++): Pyodide's main module exports
# its own SQLite and Expat, and default-visibility copies in the side module would be interposed by them at load
# time, mixing two SQLite builds (seen as "null function or function signature mismatch" on Output:SQLite).
# Executable link flags only matter for the build-time schema generator run under node.
EXE_LDFLAGS="-fwasm-exceptions -sSUPPORT_LONGJMP=wasm -sALLOW_MEMORY_GROWTH=1 -sSTACK_SIZE=8388608"

emcmake cmake -S "${SOURCE_DIR}" -B "${BUILD_DIR}" -G Ninja \
  -DCMAKE_BUILD_TYPE=Release \
  -DCMAKE_POSITION_INDEPENDENT_CODE=ON \
  -DOPENGL_REQUIRED=OFF \
  -DBUILD_STATIC_ENERGYPLUS_API=ON \
  -DLINK_WITH_PYTHON=ON \
  -DPYTHON_CLI=OFF \
  -DPython_EXECUTABLE="${HOST_PYTHON}" \
  -DPython_INCLUDE_DIR="${PYTHON_INCLUDE_DIR}" \
  -DPython_LIBRARY="${STUB_LIB}" \
  -DCMAKE_C_FLAGS="${PYODIDE_CFLAGS}" \
  -DCMAKE_CXX_FLAGS="${PYODIDE_CFLAGS}" \
  -DCMAKE_C_VISIBILITY_PRESET=hidden \
  -DCMAKE_EXE_LINKER_FLAGS="${EXE_LDFLAGS}" \
  -DCMAKE_CROSSCOMPILING_EMULATOR="${NODE_BIN}"

if [[ "${DO_BUILD}" -eq 1 ]]; then
  cmake --build "${BUILD_DIR}" --target energyplusapi_pyodide -j"${NPROC}"
  ls -la "${BUILD_DIR}/Products/libenergyplusapi.so" "${BUILD_DIR}/Products/pyenergyplus"
else
  echo "Configured only. Build with:"
  echo "  cmake --build '${BUILD_DIR}' --target energyplusapi_pyodide -j${NPROC}"
fi
