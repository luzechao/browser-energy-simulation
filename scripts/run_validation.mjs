import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
const root = fileURLToPath(new URL('../', import.meta.url));
const dir = path.join(root, 'verification-runs', new Date().toISOString().replaceAll(':', '-'));
fs.mkdirSync(dir, { recursive: true });
for (const name of ['ep_1zone_gate', 'ep_5zone_gate', 'ep_kiva_gate', 'ep_ashrae140_2023_gate']) {
  console.log(`Running ${name} ...`);
  const r = spawnSync(process.execPath, [`test/${name}.mjs`], { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  fs.writeFileSync(path.join(dir, `${name}.txt`), (r.stdout || '') + (r.stderr || '') + (r.error ? String(r.error) : ''));
  if (r.error || r.signal || r.status !== 0 || !/PASS|CLEARED/.test(r.stdout || '')) {
    console.error(`FAIL ${name}; see ${dir}`);
    process.exit(1);
  }
  console.log(`PASS ${name}`);
}
console.log(`All four gates passed. Complete logs: ${dir}`);
