// Module worker: Pyodide + EnergyPlus side module. Simulations block, so they never run on the page's main thread.
import { installEnergyPlus, runEnergyPlus } from '../../src/pyodide-energyplus.mjs';

const params = new URL(self.location.href).searchParams;
const PYODIDE_URL = params.get('pyodide') || '../../third_party/pyodide/pyodide/';
const PRODUCTS_URL = params.get('products') || '../../build/pyodide-ep/Products/';
// pyodide-core ships the lockfile but no package wheels; fetch them from the matching CDN release.
const PACKAGES_URL = params.get('packages') || 'https://cdn.jsdelivr.net/pyodide/v314.0.7/full/';

let ready = null;

async function init() {
  const pyodideBase = new URL(PYODIDE_URL, self.location.href);
  const { loadPyodide } = await import(new URL('pyodide.mjs', pyodideBase).href);
  const pyodide = await loadPyodide({ indexURL: pyodideBase.href, packageBaseUrl: PACKAGES_URL });
  pyodide.setStdout({ batched: (line) => self.postMessage({ type: 'stdout', line }) });
  pyodide.setStderr({ batched: (line) => self.postMessage({ type: 'stdout', line }) });
  const productsBase = new URL(PRODUCTS_URL, self.location.href);
  const apiVersion = await installEnergyPlus(pyodide, async (name) => {
    const response = await fetch(new URL(name, productsBase));
    if (!response.ok) throw new Error(`fetch ${name}: HTTP ${response.status}`);
    return new Uint8Array(await response.arrayBuffer());
  });
  return { pyodide, apiVersion };
}

self.onmessage = async ({ data }) => {
  try {
    if (data.type === 'init') {
      const t0 = performance.now();
      ready ??= init();
      const { pyodide, apiVersion } = await ready;
      self.postMessage({ type: 'ready', pyodideVersion: pyodide.version, apiVersion, seconds: (performance.now() - t0) / 1000 });
    } else if (data.type === 'loadPackages') {
      const { pyodide } = await ready;
      const errors = [];
      await pyodide.loadPackage(data.packages, { errorCallback: (message) => errors.push(message) });
      if (errors.length) throw new Error(errors.join('\n'));
      self.postMessage({ type: 'packagesLoaded', packages: data.packages });
    } else if (data.type === 'run') {
      const { pyodide } = await ready;
      const t0 = performance.now();
      const run = runEnergyPlus(pyodide, data.request);
      const outputs = {};
      for (const name of pyodide.FS.readdir(run.outputDir)) {
        if (name === '.' || name === '..') continue;
        outputs[name] = pyodide.FS.readFile(`${run.outputDir}/${name}`);
      }
      self.postMessage({ type: 'done', exitCode: run.exitCode, seconds: (performance.now() - t0) / 1000, outputs });
    }
  } catch (error) {
    self.postMessage({ type: 'error', message: String(error && error.stack ? error.stack : error) });
  }
};
