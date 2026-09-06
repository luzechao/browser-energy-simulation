# Reproduction environment

Measured environment: Ubuntu 26.04 LTS under WSL2, x86-64; GCC 15.2.0 (Ubuntu package 15.2.0-16ubuntu1), CMake 4.2.3, Node.js 24.16.0. Emscripten 6.0.0 uses LLVM commit c6c2ad52586c28e74a724570985a48dc0022d250; its build-helper Node is 22.16.0. See BUILD_PROVENANCE.md for complete pins and roles.

On Ubuntu, install Git, build-essential (C/C++ compiler and make), CMake, Python 3, curl, ca-certificates, unzip, and Node.js. Verify the versions above before an exact-toolchain reproduction. Package-manager defaults may differ. The Emscripten install is given in the top-level README.

The Node simulation gates use built-in modules and require no npm packages. Playwright is needed only for PNG rendering and any separately implemented browser checks. `package-lock.json` pins the supplied renderer dependency; its browser revision is determined by that Playwright version. This is a package verification environment, not evidence of the exact historical Chromium build, whose version was not retained in the browser timing log.

Allow tens of minutes to hours for two source builds, depending on CPU and parallelism. Use `-j2` initially to limit memory demand. Reserve approximately 20 GB of disk space as a planning allowance, not a measured requirement. The original run host had 7.5 GiB RAM, but build peak memory and minimum viable RAM were not measured. The curated artifact plus compiled WASM archive is much smaller than a full source/build tree.

No container image is claimed to be validated. The exact source/configuration is recorded; a clean-machine full rebuild remains a release-hardening task.
