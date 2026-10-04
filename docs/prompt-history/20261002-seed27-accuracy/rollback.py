"""Check saved bytes by default; restore only with explicitly requested --apply."""
import argparse
import json
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument('--apply', action='store_true')
args = parser.parse_args()
snapshot = Path(__file__).resolve().parent
repo = snapshot.parents[2]
files = json.loads((snapshot / 'manifest.json').read_text())['files']
restores = []
for name in files:
    target = (repo / name).resolve()
    if not target.is_relative_to(repo / 'src'):
        raise SystemExit(f'Outside source tree: {name}')
    if target.read_bytes() != (snapshot / 'after' / name).read_bytes():
        raise SystemExit(f'Later edits detected; no files restored: {name}')
    restores.append((target, (snapshot / 'before' / name).read_bytes()))
if args.apply:
    for target, content in restores:
        target.write_bytes(content)
print(f'{len(restores)} files ' + ('restored.' if args.apply else 'match; no writes.'))
