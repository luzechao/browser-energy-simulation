#!/usr/bin/env node
// Rebuild the committed ASHRAE 140-2023 Section 7 IDFs from the public,
// BSD-licensed BESTEST-GSR release bundles. This script intentionally does
// not download anything; pass a directory containing all 21 zip files.
//
// Usage:
//   node test/ep-reference/ashrae140-2023/derive_cases.mjs /path/to/zips

// The only transformation is the EnergyPlus Version identifier, from 22.1
// to the repository's pinned EnergyPlus version, 26.1. The IDFs otherwise
// remain byte-for-byte as published in each bundle.
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const JSZip = require('jszip');
const OUT_DIR = path.dirname(fileURLToPath(import.meta.url));
const sourceDir = process.argv[2];

if (!sourceDir) {
  console.error('Usage: node derive_cases.mjs /path/to/BESTEST-zips');
  process.exit(2);
}

const ZIP_SHA256 = {
  '600': 'f4b0eee1ea0a823db8caf6171ebd759a5137c34a8bf0c20289d4146b3de1d353',
  '610': '9110ca126dc8a8490fe7e08188b21734be0e4e51963060985eeaca35eda2df1a',
  '620': 'b2bd74f2a4b81f4607795590cbad5a4ba66a0344a116ffa8ef7392c83af9ceee',
  '630': '22a8249fb30c499457477f776e27d0fb9c4720dad3572539b7500dc54dba33de',
  '640': '52c455c4a2070d3f9de0c4cfe31177acae7b6f625fca86f30cba5162805e6ee1',
  '650': '3f7824a02e7e53b9c273f8b6c0b60e0e47728800ba74ab81d17b698e52874893',
  '660': '45f748c37efe22bcb2d07d35e04b015fc9e56a2d4b65dd486067db918a5d4497',
  '670': '6e873bb67562294e35628ce36c5fb472cde18c568843510cc79abe3601e469d1',
  '680': '7f05c7f4f3aaa41076ce5f9056b38927e7e5d72c93bdda7ce2416344a84e6aa7',
  '685': 'e8b813aa6c45583d658d51735a89ed7bc5c59ff5bda14f97df07737da871a9c0',
  '695': '63d29e244586445ca2356af67dc6a7003427ea6762f15bcc735c42cee7c51f49',
  '900': 'd4f7fefbe532e2f78c9a48b2eeb2f9bad80a2acb7e843e48cb4d97a089283642',
  '910': 'b556bbb9962b9612ba86141f170f8004c0c1ec7f0f113b5d2e123940c0a9cc31',
  '920': '0f92dda1c1a916cb11f09b37e4f42b93be968d3353338a6299e5a7fe10d330da',
  '930': '98fe3251fd325f6168a99ccadd7c59b2e44c535653589c2fa60b770e5bb54bcd',
  '940': '4c9dfa5c1c30b645e8090354f1612b0df0305518b656c60101f055941ee1aec2',
  '950': '0e20114311392b34378ba95baf40bede4cb5debbcca095414ec2332feab739c4',
  '960': '21338ecf212dec5ba739963cefbb392cd1209cc226e6d114fef724f329c95dbf',
  '980': 'ba622903b63142ab4109dc4c3aaf308fbe680a0aa43e117b930a4873db6c5205',
  '985': '32d1b59000448788f6a51d49d17467274ae0f1588c876a45b6b3eea9068f599b',
  '995': '4d81f1259e61e50454c265eb7a13be6f773a01877ff3bb32c691c643e9113953',
};

for (const [caseId, expectedHash] of Object.entries(ZIP_SHA256)) {
  const zipPath = path.resolve(sourceDir, `BESTEST.Case.${caseId}.zip`);
  if (!fs.existsSync(zipPath)) throw new Error(`Missing ${zipPath}`);

  const bytes = fs.readFileSync(zipPath);
  const actualHash = crypto.createHash('sha256').update(bytes).digest('hex');
  if (actualHash !== expectedHash) {
    throw new Error(`SHA-256 mismatch for ${zipPath}: expected ${expectedHash}, got ${actualHash}`);
  }

  const zip = await JSZip.loadAsync(bytes);
  const entry = zip.file('in.idf');
  if (!entry) throw new Error(`${zipPath} does not contain in.idf`);
  const source = await entry.async('string');
  const transitioned = source.replace(
    /Version,\r?\n\s*22\.1;/,
    'Version,\n  26.1;',
  );
  if (transitioned === source || !/^Version,\r?\n\s*26\.1;/m.test(transitioned)) {
    throw new Error(`Could not perform the single 22.1 -> 26.1 Version transition for Case ${caseId}`);
  }

  const outputPath = path.join(OUT_DIR, `case${caseId}.idf`);
  fs.writeFileSync(outputPath, transitioned);
  console.log(`wrote ${path.relative(process.cwd(), outputPath)}`);
}
