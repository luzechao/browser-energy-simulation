/**
 * EnergyPlus version 26.2.0 software as a Pyodide side module, with PythonPlugin support.
 *
 * `libenergyplusapi.so` is loaded into a running Pyodide and driven through the stock `pyenergyplus` API, so
 * `PythonPlugin:Instance` classes execute in Pyodide's own interpreter and can import its packages (numpy, ...).
 * Simulations are synchronous: in a browser, call these from a Web Worker.
 */
import type { PyodideAPI } from 'pyodide'

/** EnergyPlus release compiled into the bundled side module. */
export const ENERGYPLUS_VERSION = '26.2.0'
/** Pyodide release the side module was built against. Any 314.0.x shares its ABI (pyemscripten_2026_0). */
export const PYODIDE_VERSION = '314.0.7'
/** Where Pyodide package wheels (numpy, ...) are served for this Pyodide release. */
export const PYODIDE_PACKAGE_BASE_URL = `https://cdn.jsdelivr.net/pyodide/v${PYODIDE_VERSION}/full/`

/** Files under the package's `assets/` directory, as `installEnergyPlus` requests them. */
export const ASSET_FILES = [
  'libenergyplusapi.so',
  'pyenergyplus/__init__.py',
  'pyenergyplus/api.py',
  'pyenergyplus/common.py',
  'pyenergyplus/datatransfer.py',
  'pyenergyplus/func.py',
  'pyenergyplus/plugin.py',
  'pyenergyplus/runtime.py',
  'pyenergyplus/state.py',
] as const
export type AssetName = (typeof ASSET_FILES)[number]

/** Returns the bytes of one asset, e.g. by fetching it from wherever the app serves the package's `assets/`. */
export type AssetReader = (name: AssetName) => Promise<Uint8Array>

const ENGINE_ROOT = '/energyplus'
const RUN_ROOT = '/run'

type FileContent = string | Uint8Array

interface PyodideInternals {
  _api?: { loadDynlib?: (path: string) => Promise<void> }
}

interface PyCallable {
  (...args: unknown[]): unknown
  destroy(): void
}

/** An `AssetReader` that fetches assets relative to `baseUrl` (which should end with `/`). */
export function fetchAssets(baseUrl: string | URL, init?: RequestInit): AssetReader {
  return async (name) => {
    const url = new URL(name, baseUrl)
    const response = await fetch(url, init)
    if (!response.ok) throw new Error(`Could not fetch ${url}: HTTP ${response.status}`)
    return new Uint8Array(await response.arrayBuffer())
  }
}

/**
 * Write the engine into Pyodide's file system and load it. Call once per Pyodide instance.
 * @returns the pyenergyplus API version, e.g. "0.2"
 */
export async function installEnergyPlus(pyodide: PyodideAPI, readAsset: AssetReader): Promise<string> {
  const { FS } = pyodide
  FS.mkdirTree(`${ENGINE_ROOT}/pyenergyplus`)
  await Promise.all(
    ASSET_FILES.map(async (name) => {
      FS.writeFile(`${ENGINE_ROOT}/${name}`, await readAsset(name))
    }),
  )

  // Compile the ~33 MB module asynchronously now, so ctypes' later dlopen of the same path is a cache hit.
  // Browsers refuse large synchronous WebAssembly compiles on the main thread.
  const internals = pyodide as unknown as PyodideInternals
  if (typeof internals._api?.loadDynlib === 'function') {
    await internals._api.loadDynlib(`${ENGINE_ROOT}/libenergyplusapi.so`)
  }

  pyodide.runPython(`
import sys
if ${JSON.stringify(ENGINE_ROOT)} not in sys.path:
    sys.path.insert(0, ${JSON.stringify(ENGINE_ROOT)})
from pyenergyplus.api import EnergyPlusAPI
_ep_api = EnergyPlusAPI()
`)
  return String(pyodide.runPython('_ep_api.api_version()'))
}

export interface RunOptions {
  /** Model text or bytes: IDF, or epJSON when `inputName` ends in `.epJSON`. */
  idf: FileContent
  /** Weather file. Omit for models that only simulate sizing periods. */
  epw?: FileContent | undefined
  /** Extra files for the run directory, such as PythonPlugin modules. EnergyPlus puts this directory on sys.path. */
  files?: Record<string, FileContent> | undefined
  /** File name for the model inside the run directory. Default `in.idf`. */
  inputName?: string | undefined
  /** Extra EnergyPlus command-line arguments, e.g. `['--annual']` or `['-r']`. */
  extraArgs?: string[] | undefined
}

export interface EndSummary {
  success: boolean
  warnings: number
  severe: number
  /** The whole line, e.g. "EnergyPlus Completed Successfully-- 2 Warning; 0 Severe Errors; Elapsed Time=..." */
  raw: string
}

export type Severity = 'warning' | 'severe' | 'fatal'

export interface ErrMessage {
  severity: Severity
  message: string
  /** `**   ~~~   **` continuation lines that follow the message. */
  details: string[]
}

export interface RunResult {
  /** EnergyPlus's return code: 0 on success. */
  exitCode: number
  /** Directory in Pyodide's file system holding the outputs. */
  outputDir: string
  /** Parsed `eplusout.end`, or undefined if EnergyPlus did not write one. */
  summary: EndSummary | undefined
  /** Warning, severe and fatal messages from `eplusout.err`, in order. */
  messages: ErrMessage[]
  /** Output file names, e.g. `eplusout.err`, `eplustbl.htm`, `eplusout.sql`. */
  files(): string[]
  readText(name: string): string | undefined
  readBytes(name: string): Uint8Array | undefined
  /** Delete the run directory. Outputs live in memory, so call this once they have been read. */
  dispose(): void
}

let runCounter = 0

/** Run one simulation synchronously. */
export function runEnergyPlus(pyodide: PyodideAPI, options: RunOptions): RunResult {
  const { FS } = pyodide
  const { idf, epw, files = {}, inputName = 'in.idf', extraArgs = [] } = options
  const runDir = `${RUN_ROOT}/${Date.now().toString(36)}-${(runCounter++).toString(36)}`
  const outputDir = `${runDir}/out`
  FS.mkdirTree(outputDir)
  FS.writeFile(`${runDir}/${inputName}`, idf)
  for (const [name, content] of Object.entries(files)) {
    FS.writeFile(`${runDir}/${name}`, content)
  }
  const args = [...extraArgs, '-d', outputDir]
  if (epw !== undefined) {
    FS.writeFile(`${runDir}/in.epw`, epw)
    args.push('-w', `${runDir}/in.epw`)
  }
  args.push(`${runDir}/${inputName}`)

  const runner = pyodide.runPython(`
def _ep_run(run_dir, args):
    import importlib, sys
    # A previous run may have imported a plugin module with the same name from another run directory.
    for name, module in list(sys.modules.items()):
        if (getattr(module, "__file__", None) or "").startswith(${JSON.stringify(RUN_ROOT + '/')}):
            del sys.modules[name]
    importlib.invalidate_caches()
    state = _ep_api.state_manager.new_state()
    try:
        return _ep_api.runtime.run_energyplus(state, list(args))
    finally:
        _ep_api.state_manager.delete_state(state)
_ep_run
`) as PyCallable
  let exitCode: number
  try {
    exitCode = Number(runner(runDir, args))
  } finally {
    runner.destroy()
  }

  const readBytes = (name: string): Uint8Array | undefined => {
    try {
      return FS.readFile(`${outputDir}/${name}`) as Uint8Array
    } catch {
      return undefined
    }
  }
  const readText = (name: string): string | undefined => {
    const bytes = readBytes(name)
    return bytes === undefined ? undefined : new TextDecoder().decode(bytes)
  }
  const end = readText('eplusout.end')
  const err = readText('eplusout.err')
  return {
    exitCode,
    outputDir,
    summary: end === undefined ? undefined : parseEndFile(end),
    messages: err === undefined ? [] : parseErrFile(err),
    files: () => (FS.readdir(outputDir) as string[]).filter((name) => name !== '.' && name !== '..'),
    readText,
    readBytes,
    dispose: () => removeTree(pyodide, runDir),
  }
}

/** Parse `eplusout.end`. */
export function parseEndFile(text: string): EndSummary {
  const raw = text.trim()
  const warnings = /(\d+)\s+Warning/.exec(raw)
  const severe = /(\d+)\s+Severe Errors/.exec(raw)
  return {
    success: /EnergyPlus Completed Successfully/.test(raw),
    warnings: warnings ? Number(warnings[1]) : 0,
    severe: severe ? Number(severe[1]) : 0,
    raw,
  }
}

/** Extract the warning, severe and fatal messages from `eplusout.err` (recurring-error summaries are not included). */
export function parseErrFile(text: string): ErrMessage[] {
  const messages: ErrMessage[] = []
  for (const line of text.split(/\r?\n/)) {
    const head = /^\s*\*\*\s+(Warning|Severe|Fatal)\s+\*\*\s?(.*)$/.exec(line)
    if (head) {
      messages.push({ severity: head[1]!.toLowerCase() as Severity, message: head[2]!.trim(), details: [] })
      continue
    }
    const more = /^\s*\*\*\s+~~~\s+\*\*\s?(.*)$/.exec(line)
    const last = messages[messages.length - 1]
    if (more && last) last.details.push(more[1]!.trim())
  }
  return messages
}

function removeTree(pyodide: PyodideAPI, path: string): void {
  const { FS } = pyodide
  let mode: number
  try {
    mode = FS.stat(path).mode
  } catch {
    return
  }
  if (FS.isDir(mode)) {
    for (const name of FS.readdir(path) as string[]) {
      if (name !== '.' && name !== '..') removeTree(pyodide, `${path}/${name}`)
    }
    FS.rmdir(path)
  } else {
    FS.unlink(path)
  }
}
