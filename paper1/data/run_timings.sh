#!/usr/bin/env bash
# R-3 driver: 9 cases x {native,wasm} x 5 reps, fresh Node process per run.
# Output: paper1/data/runtime_reps.csv (case,engine,rep,seconds)
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/../.."

CSV=paper1/data/runtime_reps.csv
echo "case,engine,rep,seconds" > "$CSV"

EPW_CAIRO=weather/EGY_QH_Cairo.Intl.AP.623660_TMYx.2007-2021.epw
EPW_CHI=energyplus-src/weather/USA_IL_Chicago-OHare.Intl.AP.725300_TMY3.epw
EPW_140=test/ep-reference/ashrae140/725650TYCST.epw

declare -a NAMES IDFS EPWS
NAMES=(1zone 5zone kiva a600 a610 a620 a640 a900 a940)
IDFS=(
  energyplus-src/testfiles/1ZoneUncontrolled.idf
  energyplus-src/testfiles/5ZoneAirCooled.idf
  energyplus-src/testfiles/ZoneCoupledKivaSlab.idf
  test/ep-reference/ashrae140/case600.idf
  test/ep-reference/ashrae140/case610.idf
  test/ep-reference/ashrae140/case620.idf
  test/ep-reference/ashrae140/case640.idf
  test/ep-reference/ashrae140/case900.idf
  test/ep-reference/ashrae140/case940.idf
)
EPWS=("$EPW_CAIRO" "$EPW_CHI" "$EPW_CHI" "$EPW_140" "$EPW_140" "$EPW_140" "$EPW_140" "$EPW_140" "$EPW_140")

for i in "${!NAMES[@]}"; do
  for engine in native wasm; do
    for rep in 1 2 3 4 5; do
      s=$(node paper1/data/time_one.mjs "$engine" "${IDFS[$i]}" "${EPWS[$i]}")
      echo "${NAMES[$i]},$engine,$rep,$s" >> "$CSV"
      echo "  ${NAMES[$i]} $engine rep$rep: ${s}s"
    done
  done
done

echo "done -> $CSV"
