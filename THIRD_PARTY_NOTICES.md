# Third-party notices

EnergyPlus v26.1.0 source pin: `6f2e40d10250a105b49966baa24d843711e61048`. Its license is retained verbatim in `LICENSES/EnergyPlus.txt`. This applies to upstream example models, the bundled Chicago weather file, and the EnergyPlus portion of the separately packaged compiled engine. EnergyPlus is a third-party trademark; this artifact is not an official distribution or endorsement.

BESTEST-GSR source pin: `80c3f2e56a501da996676086573f4c7f29fe9c5c`. Its license is retained in `LICENSES/BESTEST-GSR.md` and beside the 2023 case models. Original model/weather provenance and transformations are documented in the two `test/ep-reference/` provenance files.

Dependency license/notice files collected from the pinned EnergyPlus `third_party/` tree are under `LICENSES/third_party/`, with their directory structure retained. These notices are also in the WASM release archive. Their inclusion does not imply every listed component is linked into the tested build. Upstream licenses are not replaced by any license chosen for the author's scripts.

The copyrighted ASHRAE standard and addenda PDFs are not redistributed. The package includes machine-readable annual acceptance bounds used by the tests and cites the standard and its official supporting material. Consult the lawful standard for the full normative requirements.

Cairo TMYx weather is not included; see `weather/README.md`. npm dependencies are installed from their original packages and retain their own licenses.
