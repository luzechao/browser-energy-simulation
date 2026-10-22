#!/usr/bin/env node
// Copies what a web app must serve as static files:
//   <out>/engine/   libenergyplusapi.so + pyenergyplus/   (from this package)
//   <out>/pyodide/  Pyodide's runtime files              (from the app's installed `pyodide` package)
// Usage: sim-engine-wasm-assets <out-dir> [--no-pyodide]
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const PYODIDE_FILES = ['pyodide.asm.mjs', 'pyodide.asm.wasm', 'python_stdlib.zip', 'pyodide-lock.json', 'pyodide.mjs']

const args = process.argv.slice(2)
const outDir = args.find((a) => !a.startsWith('--'))
if (!outDir || args.includes('--help')) {
  console.error('Usage: sim-engine-wasm-assets <out-dir> [--no-pyodide]')
  process.exit(outDir ? 0 : 1)
}

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const assets = path.join(packageRoot, 'assets')
if (!fs.existsSync(path.join(assets, 'libenergyplusapi.so'))) {
  console.error(`sim-engine-wasm-assets: ${assets} is missing libenergyplusapi.so`)
  process.exit(1)
}
const engineOut = path.resolve(outDir, 'engine')
fs.rmSync(engineOut, { recursive: true, force: true })
fs.cpSync(assets, engineOut, { recursive: true })
console.log(`sim-engine-wasm-assets: engine -> ${path.relative(process.cwd(), engineOut) || '.'}`)

if (!args.includes('--no-pyodide')) {
  // Prefer the app's own pyodide so the copied runtime matches what its bundler imports.
  let pyodideRoot
  for (const base of [path.join(process.cwd(), 'package.json'), path.join(packageRoot, 'package.json')]) {
    try {
      pyodideRoot = path.dirname(createRequire(base).resolve('pyodide/package.json'))
      break
    } catch {}
  }
  if (!pyodideRoot) {
    console.error('sim-engine-wasm-assets: `pyodide` is not installed (npm install pyodide@314.0.x), or pass --no-pyodide')
    process.exit(1)
  }
  const { version } = JSON.parse(fs.readFileSync(path.join(pyodideRoot, 'package.json'), 'utf8'))
  if (!/^314\.0\./.test(version)) {
    console.error(`sim-engine-wasm-assets: pyodide ${version} found, but this engine needs pyodide 314.0.x`)
    process.exit(1)
  }
  const pyodideOut = path.resolve(outDir, 'pyodide')
  fs.rmSync(pyodideOut, { recursive: true, force: true })
  fs.mkdirSync(pyodideOut, { recursive: true })
  for (const file of PYODIDE_FILES) fs.copyFileSync(path.join(pyodideRoot, file), path.join(pyodideOut, file))
  console.log(`sim-engine-wasm-assets: pyodide ${version} -> ${path.relative(process.cwd(), pyodideOut)}`)
}
