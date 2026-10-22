// EnergyPlus (with PythonPlugin support) inside Pyodide.
//
// libenergyplusapi.so is an Emscripten side module built by scripts/configure-ep-pyodide.sh. It is loaded into
// Pyodide and driven through the stock pyenergyplus API, so PythonPlugin:Instance classes run in Pyodide's own
// interpreter (and can import anything installed in it, e.g. numpy via pyodide.loadPackage).
//
// Works in Node and in browsers. In a browser, run it in a Web Worker: simulations are long and synchronous.

const EP_ROOT = '/energyplus';
const PYENERGYPLUS_FILES = [
  '__init__.py',
  'api.py',
  'common.py',
  'datatransfer.py',
  'func.py',
  'plugin.py',
  'runtime.py',
  'state.py',
];

/**
 * Install EnergyPlus into a loaded Pyodide instance.
 * @param {object} pyodide       result of loadPyodide()
 * @param {(name: string) => Promise<Uint8Array>} readAsset
 *        returns the bytes of `libenergyplusapi.so` or `pyenergyplus/<file>.py` (relative to the build Products dir)
 */
export async function installEnergyPlus(pyodide, readAsset) {
  const { FS } = pyodide;
  FS.mkdirTree(`${EP_ROOT}/pyenergyplus`);
  for (const file of PYENERGYPLUS_FILES) {
    FS.writeFile(`${EP_ROOT}/pyenergyplus/${file}`, await readAsset(`pyenergyplus/${file}`));
  }
  FS.writeFile(`${EP_ROOT}/libenergyplusapi.so`, await readAsset('libenergyplusapi.so'));

  // Compile the ~30 MB module asynchronously now, so ctypes' later dlopen of the same path is a cache hit.
  // (Browsers refuse large synchronous WebAssembly compiles on the main thread.)
  if (pyodide._api && typeof pyodide._api.loadDynlib === 'function') {
    await pyodide._api.loadDynlib(`${EP_ROOT}/libenergyplusapi.so`);
  }

  pyodide.runPython(`
import sys
if ${JSON.stringify(EP_ROOT)} not in sys.path:
    sys.path.insert(0, ${JSON.stringify(EP_ROOT)})
from pyenergyplus.api import EnergyPlusAPI
_ep_api = EnergyPlusAPI()
`);
  return pyodide.runPython('_ep_api.api_version()');
}

/**
 * Run one simulation. Plugin modules are written next to the model, which EnergyPlus puts on sys.path.
 * @param {object} pyodide
 * @param {object} options
 * @param {string|Uint8Array} options.idf         model text (IDF or epJSON)
 * @param {string|Uint8Array} [options.epw]       weather file; omit for design-day-only runs
 * @param {Record<string, string|Uint8Array>} [options.files]  extra files for the run directory, e.g. plugin .py
 * @param {string} [options.inputName]            file name for the model (default in.idf)
 * @param {string[]} [options.extraArgs]          extra EnergyPlus CLI arguments
 * @returns {{ exitCode: number, outputDir: string, readOutput: (name: string) => string|null }}
 */
export function runEnergyPlus(pyodide, { idf, epw, files = {}, inputName = 'in.idf', extraArgs = [] }) {
  const { FS } = pyodide;
  const runDir = `/run/${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const outputDir = `${runDir}/out`;
  FS.mkdirTree(outputDir);
  FS.writeFile(`${runDir}/${inputName}`, idf);
  for (const [name, content] of Object.entries(files)) {
    FS.writeFile(`${runDir}/${name}`, content);
  }
  const args = [...extraArgs, '-d', outputDir];
  if (epw !== undefined) {
    FS.writeFile(`${runDir}/in.epw`, epw);
    args.push('-w', `${runDir}/in.epw`);
  }
  args.push(`${runDir}/${inputName}`);

  const runner = pyodide.runPython(`
def _ep_run(run_dir, args):
    import importlib, sys
    # A previous run may have imported a plugin module with the same name from another run directory.
    for name, module in list(sys.modules.items()):
        if (getattr(module, "__file__", None) or "").startswith("/run/"):
            del sys.modules[name]
    importlib.invalidate_caches()
    state = _ep_api.state_manager.new_state()
    try:
        return _ep_api.runtime.run_energyplus(state, list(args))
    finally:
        _ep_api.state_manager.delete_state(state)
_ep_run
`);
  let exitCode;
  try {
    exitCode = runner(runDir, args);
  } finally {
    runner.destroy();
  }

  const readOutput = (name) => {
    try {
      return FS.readFile(`${outputDir}/${name}`, { encoding: 'utf8' });
    } catch {
      return null;
    }
  };
  return { exitCode, outputDir, readOutput };
}
