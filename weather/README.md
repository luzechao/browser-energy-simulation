# Weather inputs

The Section 7 weather is included as `test/ep-reference/ashrae140/725650TYCST.epw`, with BESTEST-GSR provenance and license. Chicago TMY3 is included from the pinned EnergyPlus source under `energyplus-src/weather/`, retaining EnergyPlus licensing.

The Cairo file was not redistributed because specific redistribution terms were not established during this preparation. Obtain `EGY_QH_Cairo.Intl.AP.623660_TMYx.2007-2021.epw` from [Climate.OneBuilding's Egypt collection](https://climate.onebuilding.org/WMO_Region_1_Africa/EGY_Egypt/index.html), and place it in this directory. Select the **2007–2021** dataset, not a newer weather period. Cite Linda K. Lawrie and Drury B. Crawley, *Development of Global Typical Meteorological Years (TMYx)*, Climate.OneBuilding.Org, with the access date.

Compare its SHA-256 with the Cairo entry in `ARTIFACTS.json`. The website may refresh a file even when the dataset period is unchanged. If its hash differs, this is not the exact manuscript input: preserve the mismatch and obtain the recorded file from the author with appropriate permission before claiming exact reproduction.

The Cairo input is required by the one-zone comparison and the nine-case timing script; the expanded Section 7 gate and the other two core comparisons do not require it.
