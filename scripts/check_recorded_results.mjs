import fs from 'node:fs';
import assert from 'node:assert/strict';
const root = new URL('../', import.meta.url);
const read = p => JSON.parse(fs.readFileSync(new URL(p, root), 'utf8'));
const criteria = read('test/ep-reference/ashrae140-2023/ashrae140_2023_ranges.json');
const results = read('paper1/data/ashrae140_2023_results.json');
for (const group of criteria.groups) {
  const pass = group.tests.filter(t => {
    const value = results.cases[t.expression.case][t.metric] - (t.expression.minus ? results.cases[t.expression.minus][t.metric] : 0);
    assert(Number.isFinite(value));
    return value >= t.min && value <= t.max;
  }).length;
  assert.equal(pass, group.tests.length, `${group.id}: changed recorded verdict`);
  console.log(`PASS ${group.id}: ${pass}/${group.tests.length}; minimum ${group.minimum_passing}`);
}
const lines = fs.readFileSync(new URL('paper1/data/runtime_reps.csv', root), 'utf8').trim().split('\n').slice(1);
assert.equal(lines.length, 90);
const groups = new Map();
for (const line of lines) {
  const [name, engine, rep, seconds] = line.split(',');
  assert(['native', 'wasm'].includes(engine));
  assert(Number(seconds) > 0);
  const key = `${name}/${engine}`;
  if (!groups.has(key)) groups.set(key, new Set());
  assert(!groups.get(key).has(rep));
  groups.get(key).add(rep);
}
assert.equal(groups.size, 18);
for (const reps of groups.values()) assert.equal(reps.size, 5);
console.log('PASS timing observations: nine cases, two engines, five repetitions each');
