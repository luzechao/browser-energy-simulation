// Package tests: parsers, and real simulations through the staged assets (run `npm run stage` first).
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { loadPyodide } from 'pyodide'
import { ASSET_FILES, installEnergyPlus, parseEndFile, parseErrFile, runEnergyPlus } from '../dist/index.js'

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const repoRoot = path.resolve(packageRoot, '../..')
const testfiles = path.join(repoRoot, 'energyplus-pyodide/testfiles')
const chicago = path.join(repoRoot, 'energyplus-src/weather/USA_IL_Chicago-OHare.Intl.AP.725300_TMY3.epw')

test('parseEndFile reads success and counts', () => {
  const ok = parseEndFile('EnergyPlus Completed Successfully-- 2 Warning; 0 Severe Errors; Elapsed Time=00hr 00min  0.95sec\n')
  assert.deepEqual({ ...ok, raw: undefined }, { success: true, warnings: 2, severe: 0, raw: undefined })
  const fatal = parseEndFile('EnergyPlus Terminated--Fatal Error Detected. 0 Warning; 10 Severe Errors; Elapsed Time=00hr 00min  0.40sec')
  assert.equal(fatal.success, false)
  assert.equal(fatal.severe, 10)
})

test('parseErrFile groups continuation lines and skips recurring summaries', () => {
  const messages = parseErrFile(
    [
      'Program Version,EnergyPlus, Version 26.2.0',
      '   ** Warning ** Pump power is 0',
      '   **   ~~~   ** for pump=SHWSYS1 PUMP',
      '   ** Severe  ** Node X connects to no component',
      '   **  Fatal  ** Preceding errors cause termination',
      '   *************  ** Warning ** recurring summary line',
      '   *************  **   ~~~   **   This error occurred 3 total times;',
    ].join('\n'),
  )
  assert.deepEqual(messages, [
    { severity: 'warning', message: 'Pump power is 0', details: ['for pump=SHWSYS1 PUMP'] },
    { severity: 'severe', message: 'Node X connects to no component', details: [] },
    { severity: 'fatal', message: 'Preceding errors cause termination', details: [] },
  ])
})

const haveAssets = ASSET_FILES.every((f) => fs.existsSync(path.join(packageRoot, 'assets', f)))
const haveFixtures = fs.existsSync(testfiles) && fs.existsSync(chicago)

test('runs EnergyPlus and a PythonPlugin in Pyodide', { skip: !(haveAssets && haveFixtures) && 'assets or fixtures missing' }, async () => {
  const pyodide = await loadPyodide({ stdout: () => {}, stderr: () => {} })
  const apiVersion = await installEnergyPlus(pyodide, (name) => fs.promises.readFile(path.join(packageRoot, 'assets', name)))
  assert.match(apiVersion, /^\d+\.\d+$/)

  const plain = runEnergyPlus(pyodide, {
    idf: fs.readFileSync(path.join(repoRoot, 'energyplus-src/testfiles/1ZoneUncontrolled.idf')),
    epw: fs.readFileSync(chicago),
  })
  assert.equal(plain.exitCode, 0)
  assert.equal(plain.summary?.success, true)
  assert.ok(plain.files().includes('eplusout.eso'))
  plain.dispose()
  assert.throws(() => pyodide.FS.stat(plain.outputDir))

  const plugin = runEnergyPlus(pyodide, {
    idf: fs.readFileSync(path.join(testfiles, 'PythonPluginCustomOutputVariable.idf')),
    epw: fs.readFileSync(chicago),
    files: { 'PythonPluginCustomOutputVariable.py': fs.readFileSync(path.join(testfiles, 'PythonPluginCustomOutputVariable.py')) },
  })
  assert.equal(plugin.exitCode, 0)
  assert.equal(plugin.summary?.severe, 0)
  assert.match(plugin.readText('eplusout.eso') ?? '', /Averaged Building Temperature/i)
  plugin.dispose()
})
