"""Replay saved prototype evidence into a NEW root; original raw artifacts stay read-only."""
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys

source, output = map(Path, sys.argv[1:])
output.mkdir(parents=True, exist_ok=False)
for name in ['source-hashes.json', 'transforms.json']:
    if (source/name).exists():
        shutil.copyfile(source/name, output/name)
results = []
for original in sorted(source.glob('jobs*-r*/*/unified.json')):
    directory = output/original.parent.relative_to(source)
    directory.mkdir(parents=True)
    for name in ['case.json', 'tests.json', 'aggregate', 'native', 'contexts', 'workers']:
        item = original.parent/name
        if item.is_dir():
            shutil.copytree(item, directory/name, copy_function=os.link)
        else:
            os.link(item, directory/name)
    for item in original.parent.glob('execve.*'):
        os.link(item, directory/item.name)
    with (directory/'normalize.log').open('w') as log:
        result = subprocess.run(['node', 'scripts/test-coverage-pilot/unify-coverage.mjs', str(directory), str(output/'source-hashes.json')], stdout=log, stderr=subprocess.STDOUT)
    assert result.returncode in [0, 2], directory
    old = json.loads(original.read_text())
    new = json.loads((directory/'unified.json').read_text())
    def comparable(report):
        return (report['completeness']['status'], sorted(p['kind'] for p in report['completeness']['problems']),
                sorted((line['file'], line['line']) for line in report['lines']))
    assert comparable(old) == comparable(new), f'Changed evidence: {directory}'
    results.append(str(directory))
assert results, 'No saved observations found'
(output/'regression.json').write_text(json.dumps(dict(observations=len(results), unchanged=True), indent=2)+'\n')
print(f'{len(results)} artifact regressions unchanged: {output}')
