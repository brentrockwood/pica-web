"""Small assertions for the evidence comparator's failure boundaries."""
import json
from pathlib import Path
import subprocess
import tempfile

with tempfile.TemporaryDirectory() as directory:
    root = Path(directory)
    record = dict(id='runner-a', file='source.test.ts', names=['example'], location=dict(line=1, column=1),
                  phases=dict(body=['old'], setup=[], teardown=[]), durationMs=1)
    base = dict(sources={'source.ts': 'hash'}, locations={'old': {'line': 1}}, tests=[record])
    other = dict(sources=base['sources'], locations={'new': {'line': 2}}, tests=[{
        **record, 'id': 'runner-b', 'durationMs': 2, 'phases': dict(body=['new'], setup=[], teardown=[])}])
    left = root / 'base.json'
    right = root / 'other.json'
    left.write_text(json.dumps(base))
    def compare(value):
        right.write_text(json.dumps(value))
        return subprocess.run(['python3', 'scripts/test-coverage-pilot/compare-evidence.py', str(left), str(right)], capture_output=True, text=True)
    result = compare(other)
    assert result.returncode == 0, result.stderr
    comparison = json.loads(result.stdout)['comparisons'][0]
    assert comparison['commonTests'] == comparison['changedTests'] == 1
    assert comparison['changes'][0]['phases']['body'] == dict(removed=[{'line': 1}], added=[{'line': 2}])
    assert compare({**other, 'tests': []}).returncode != 0
    assert compare({**other, 'sources': {'source.ts': 'changed'}}).returncode != 0
print('Comparator checks passed: identity, differences, empty-comparison rejection, source-change rejection.')
