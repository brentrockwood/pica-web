"""Run real CLI failure boundaries into a NEW directory; all exclusions are expected."""
import json
from pathlib import Path
import subprocess
import sys

root = Path(sys.argv[1])
root.mkdir(parents=True, exist_ok=False)
cli = ['python3', 'scripts/test-coverage-pilot/coverage.py', 'run']
for key, title, status in [('empty', 'has no project source execution', 'empty'),
                           ('timeout', 'exceeds the job timeout', 'timeout'),
                           ('unsupported', 'rejects query-bearing descendants', 'incomplete')]:
    output = root/key
    command = cli + ['--file', 'scripts/test-coverage-pilot/fixtures/operational.spec.ts', '--title', title,
                     '--output', str(output), '--timeout', '3' if key == 'timeout' else '120']
    result = subprocess.run(command, capture_output=True, text=True)
    (root/f'{key}.log').write_text(result.stdout+result.stderr)
    assert result.returncode == 2, (key, result.returncode, result.stderr)
    observation = json.loads((output/'observations.json').read_text())[0]
    assert observation['status'] == status, observation
    assert json.loads((output/'summary.json').read_text())['accepted'] == 0
    if key == 'unsupported':
        assert 'unmapped-native-source' in {problem['kind'] for problem in observation['problems']}
    original = (output/'summary.json').read_bytes()
    retry = subprocess.run(command, capture_output=True, text=True)
    assert retry.returncode == 1 and (output/'summary.json').read_bytes() == original
selection = root/'selection'
result = subprocess.run(cli+['--cases', 'scripts/test-coverage-pilot/selection-cases.json', '--jobs', '4', '--output', str(selection)])
assert result.returncode == 2
subprocess.run(['python3', 'scripts/test-coverage-pilot/check-results.py', str(selection), 'selection'], check=True)
print('Empty, timeout, unsupported native source, output preservation and selection controls passed')
