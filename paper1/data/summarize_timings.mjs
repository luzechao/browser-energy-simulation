// R-3 summary: mean ± sd (n=5), median, and WASM/native overhead per case.
// Reads runtime_reps.csv, writes runtime_summary.md.
import fs from 'node:fs';

const rows = fs.readFileSync(new URL('./runtime_reps.csv', import.meta.url), 'utf8')
  .trim().split('\n').slice(1).map((l) => {
    const [c, e, r, s] = l.split(',');
    return { c, e, s: parseFloat(s) };
  });

const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
const sd = (a) => { const m = mean(a); return Math.sqrt(a.reduce((x, y) => x + (y - m) ** 2, 0) / (a.length - 1)); };
const median = (a) => { const s = [...a].sort((x, y) => x - y); return s[(s.length - 1) / 2 | 0]; };

const cases = [...new Set(rows.map((r) => r.c))];
let out = '# R-3 runtime summary (n=5 per cell, fresh process per run)\n\n';
out += 'Machine: Intel Core i7-1165G7 @ 2.80 GHz, 8 logical cores (WASM single-threaded),\n';
out += '7.5 GiB RAM, Linux 6.6 WSL2. Measurement runtime: Node v24.16.0.\n';
out += `Summary regenerated ${new Date().toISOString().slice(0, 10)} with ${process.version}; this is not a new timing experiment.\n`;
out += 'Timing = gate methodology (ep_gate_common.mjs): native = E+ binary wall time;\n';
out += 'WASM = callMain wall time, module already instantiated (excludes 31 MB load).\n\n';
out += '| Case | Native mean±sd (s) | WASM mean±sd (s) | Native median | WASM median | Overhead (mean ratio) | Overhead (median ratio) |\n';
out += '|---|---|---|---|---|---|---|\n';
const ratios = [];
for (const c of cases) {
  const n = rows.filter((r) => r.c === c && r.e === 'native').map((r) => r.s);
  const w = rows.filter((r) => r.c === c && r.e === 'wasm').map((r) => r.s);
  const rm = mean(w) / mean(n);
  const rmed = median(w) / median(n);
  ratios.push({ c, rm, rmed });
  out += `| ${c} | ${mean(n).toFixed(2)} ± ${sd(n).toFixed(2)} | ${mean(w).toFixed(2)} ± ${sd(w).toFixed(2)} | ${median(n).toFixed(2)} | ${median(w).toFixed(2)} | ${rm.toFixed(2)}× | ${rmed.toFixed(2)}× |\n`;
}
out += `\nOverhead range (mean ratios): ${Math.min(...ratios.map((r) => r.rm)).toFixed(2)}–${Math.max(...ratios.map((r) => r.rm)).toFixed(2)}×\n`;
out += `Overhead range (median ratios): ${Math.min(...ratios.map((r) => r.rmed)).toFixed(2)}–${Math.max(...ratios.map((r) => r.rmed)).toFixed(2)}×\n`;
fs.writeFileSync(new URL('./runtime_summary.md', import.meta.url), out);
console.log(out);
