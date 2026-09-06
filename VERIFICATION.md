# Package verification, 6 September 2026

The prepared source package was copied to a new directory under /tmp, and the separately packaged WASM archive was extracted there. The existing tested native executable/library and exact local Cairo weather file were supplied only in that temporary verification directory. They are not silently included in the upload package.

The three core gates and the full 21-case Section 7 gate passed with the relocated paths. Maximum ESO relative differences reproduced the manuscript values: 2.83×10⁻⁹ (one zone), 1.15×10⁻⁹ (five zone), 3.36×10⁻⁹ (Kiva), and 1.62×10⁻⁷ (expanded set). Low mass passed 21/21 and high mass 19/19. Complete new console logs are in `paper1/data/package-verification-2026-09-06/`.

The recorded-results checker independently recalculated the 40 annual comparisons from the packaged JSON and inclusive bounds and checked the structure of all 90 timing observations. Runtime summary regeneration passed in the temporary copy. The packaging changes do not replace the historical runtime measurements.

The runner treats a child-process launch error, signal, nonzero exit, or missing positive verdict as failure. An initial sandbox-restricted check could not launch subprocesses; the successful simulation checks were rerun outside that restriction. Only successful numerical-run logs are archived here.

Not performed: a new full source compilation on a clean machine; a rerun of the full design-app Chromium gate; cross-browser testing; Word pagination rendering. The source package includes the browser worker and captured historical browser log, but not the entire design application. PNG plot regeneration may require installing Playwright's OS dependencies; the publication SVG and PNG are supplied.

The upload package is a curated snapshot, not yet a public release or immutable tagged commit. Its SHA-256 manifest verifies the prepared file contents; a release DOI and final Git commit must be assigned when published.
