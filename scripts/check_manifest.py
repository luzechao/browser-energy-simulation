from pathlib import Path
import hashlib
import sys
root = Path(__file__).resolve().parents[1]
failures = []
lines = (root / 'MANIFEST.sha256').read_text().splitlines()
for line in lines:
    expected, name = line.split('  ', 1)
    file = root / name
    if not file.is_file() or hashlib.sha256(file.read_bytes()).hexdigest() != expected:
        failures.append(name)
if failures:
    print('Missing or changed:', *failures, sep='\n')
    sys.exit(1)
print(f'PASS: {len(lines)} packaged files match SHA-256 manifest')
