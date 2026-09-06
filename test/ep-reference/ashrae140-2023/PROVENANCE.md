# ASHRAE 140-2023 Section 7 gate provenance

## Scope and claim boundary

This directory supports the precise claim that the tested EnergyPlus build
meets the **annual heating and cooling acceptance criteria of ANSI/ASHRAE
Standard 140-2023, Section 7**. It does not support an unqualified claim of
compliance with the whole standard. Standard 140-2023 contains other normative
test sections and Annex A3 acceptance groups that this gate does not execute.

The criteria are pinned to the 2023 standard **as published**, before later
addenda. In particular, this gate does not claim the hourly/time-series checks
introduced by Addendum a.

## Case models

The 21 models are the low- and high-mass building-fabric cases required by the
Section 7 annual-load acceptance groups:

- Low mass: 600, 610, 620, 630, 640, 650, 660, 670, 680, 685, 695
- High mass: 900, 910, 920, 930, 940, 950, 960, 980, 985, 995

They were extracted from the public `v22.1b` BESTEST-GSR bundles at:

`https://besttest-gsr.s3-us-west-2.amazonaws.com/v22.1b/BESTEST.Case.<case>.zip`

The upstream source is the National Laboratory of the Rockies (formerly NREL)
BESTEST-GSR repository, commit
`80c3f2e56a501da996676086573f4c7f29fe9c5c`, distributed under its BSD-style
license (retained as `UPSTREAM_LICENSE.md`):

`https://github.com/NatLabRockies/BESTEST-GSR`

`derive_cases.mjs` records and verifies every source zip SHA-256. Its sole
model transformation is changing the EnergyPlus `Version` object from 22.1 to
26.1. The standard weather file is reused from
`../ashrae140/725650TYCST.epw`; its provenance is documented in that
directory's `PROVENANCE.md`.

## Acceptance data and evaluation

`ashrae140_2023_ranges.json` transcribes the published Section 7 annual-load
acceptance comparisons from Annex A3. The gate evaluates:

- low-mass annual loads: at least 18 of 21 comparisons must pass;
- high-mass annual loads: at least 17 of 19 comparisons must pass.

The published bounds are applied inclusively and exactly: a result must be
greater than or equal to the lower limit and less than or equal to the upper
limit. There is no project-defined EnergyPlus reference-value override, extra
boundary tolerance, or widened sensitivity tolerance.

The native-versus-WASM ESO comparison and zero-severe-error checks are extra
project quality checks. They are reported separately and are not presented as
ASHRAE acceptance criteria.

Primary standards references:

- ANSI/ASHRAE Standard 140-2023 and official supplemental files:
  `https://www.ashrae.org/technical-resources/bookstore/supplemental-files/ansi-ashrae-standard-140-2023-method-of-test-for-evaluating-building-performance-simulation-software`
- ASHRAE Standard 140 User's Manual, Part I:
  `https://data.ashrae.org/standard140/140UsersManual-PartI-Final%20%28050825%29.pdf`
- Addendum a (used only as a public cross-check of the unchanged annual-load
  tables; its new time-series requirements are not part of this gate):
  `https://www.ashrae.org/File%20Library/Technical%20Resources/Standards%20and%20Guidelines/Standards%20Addenda/140_2023_a_20250829.pdf`
