# R-3 runtime summary (n=5 per cell, fresh process per run)

Machine: Intel Core i7-1165G7 @ 2.80 GHz, 8 logical cores (WASM single-threaded),
7.5 GiB RAM, Linux 6.6 WSL2. Node v24.16.0. Date: 2026-07-16.
Timing = gate methodology (ep_gate_common.mjs): native = E+ binary wall time;
WASM = callMain wall time, module already instantiated (excludes 31 MB load).

| Case | Native mean±sd (s) | WASM mean±sd (s) | Native median | WASM median | Overhead (mean ratio) | Overhead (median ratio) |
|---|---|---|---|---|---|---|
| 1zone | 0.82 ± 0.04 | 2.16 ± 0.16 | 0.81 | 2.18 | 2.65× | 2.69× |
| 5zone | 4.52 ± 0.06 | 7.53 ± 0.14 | 4.52 | 7.55 | 1.67× | 1.67× |
| kiva | 1.15 ± 0.02 | 2.65 ± 0.09 | 1.15 | 2.65 | 2.30× | 2.32× |
| a600 | 1.36 ± 0.11 | 2.92 ± 0.18 | 1.32 | 2.86 | 2.15× | 2.16× |
| a610 | 1.34 ± 0.03 | 3.37 ± 0.37 | 1.35 | 3.50 | 2.51× | 2.59× |
| a620 | 1.61 ± 0.37 | 4.77 ± 2.26 | 1.46 | 3.76 | 2.96× | 2.58× |
| a640 | 1.95 ± 0.30 | 4.02 ± 0.28 | 1.83 | 3.90 | 2.06× | 2.13× |
| a900 | 1.63 ± 0.37 | 3.48 ± 0.21 | 1.43 | 3.40 | 2.13× | 2.37× |
| a940 | 2.03 ± 0.22 | 4.24 ± 0.29 | 1.97 | 4.08 | 2.09× | 2.07× |

Overhead range (mean ratios): 1.67–2.96×
Overhead range (median ratios): 1.67–2.69×
