"""Regenerate content hashes after deliberate release edits."""
from pathlib import Path
import hashlib
root = Path(__file__).resolve().parents[1]
excluded = {'.git', 'node_modules', 'build', 'emsdk', 'energyplus-build', 'verification-runs', '__pycache__'}
files = sorted(p for p in root.rglob('*') if p.is_file() and not p.is_symlink()
               and not excluded.intersection(p.relative_to(root).parts)
               and p.name != 'MANIFEST.sha256' and not p.name.endswith(('.zip', '.pyc')))
(root / 'MANIFEST.sha256').write_text(''.join(hashlib.sha256(p.read_bytes()).hexdigest() + '  ' + p.relative_to(root).as_posix() + '\n' for p in files))
print(f'Manifest written for {len(files)} files')
