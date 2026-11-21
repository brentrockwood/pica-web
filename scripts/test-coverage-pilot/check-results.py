"""Check a fresh CLI run: real, production-map, selection, or controls."""
import json
from pathlib import Path
import sys

root, kind = Path(sys.argv[1]), sys.argv[2]
summary = json.loads((root/'summary.json').read_text())
index = json.loads((root/'line-index.json').read_text())
tests = index['tests']

if kind == 'real':
    assert summary['selected'] == summary['accepted'] == 16 and summary['observations'] == 32
    assert summary['candidates'] > 0 and summary['locations'] > 1000
    assert len({entry['selection']['file'] for entry in tests.values()}) == 6
elif kind == 'production-map':
    source = 'src/shared/themePreference.ts'
    expected = {'valid': {3, 5, 9, 10, 11, 12, 13, 14, 18}, 'invalid': {3, 5, 9, 18}}
    assert summary['accepted'] == 6 and summary['observations'] == 12
    for key, entry in tests.items():
        mode, label = key.split('-')
        for observation in entry['observations']:
            report = json.loads((root/observation['artifact']/'unified.json').read_text())
            assert {(row['file'], row['line']) for row in report['lines']} == {(source, line) for line in expected[label]}
            if mode != 'main':
                native = [origin for row in report['lines'] for origin in row['origins'] if origin['provider'] == 'v8']
                assert native and all('sourceMap' in origin for origin in native)
    # Early return must not credit the later condition; unused validator must stay unexecuted.
    assert f'{source}:13' not in [line for line, owners in index['locations'].items() if 'child-invalid' in owners]
    assert all(int(line.rsplit(':', 1)[1]) < 21 for line in index['locations'])
elif kind == 'selection':
    expected = {'unique': 'scope-complete', 'duplicate': 'invalid-selection', 'zero': 'invalid-selection',
                'static-skip': 'skipped', 'runtime-skip': 'skipped', 'failed': 'failed',
                'retry': 'unsupported', 'repeat': 'unsupported', 'concurrent': 'unsupported'}
    assert summary['accepted'] == 1 and summary['excluded'] == 8
    for key, status in expected.items():
        assert all(r['status'] == status for r in tests[key]['observations']), (key, tests[key])
    assert all(owners == ['unique'] for owners in index['locations'].values())
elif kind == 'controls':
    expected = {'suppressed-worker': 'worker-launch-unregistered', 'terminated-worker': 'worker-nonzero-exit',
                'removed-worker-audit': 'worker-audit-removed', 'suppressed-child': 'node-launch-unregistered',
                'killed-child': 'descendant-exit-unconfirmed'}
    for key, problem in expected.items():
        assert not tests[key]['eligible']
        for run in tests[key]['observations']:
            assert run['status'] == 'incomplete' and problem in {p['kind'] for p in run['problems']}
    def lines(key):
        assert tests[key]['eligible'], tests[key]
        return {line for line, owners in index['locations'].items() if key in owners}
    assert lines('left') != lines('right') and lines('left') & lines('right')
    assert lines('cache-first') == lines('cache-second')
    assert 'scripts/test-coverage-pilot/fixtures/boundary-subject.ts:4' in lines('background-owner')
    for key in ['background-observer', 'rejected-worker']:
        assert not tests[key]['eligible'] and all(run['status'] == 'empty' for run in tests[key]['observations'])
        assert all(json.loads((root/run['artifact']/'unified.json').read_text())['lines'] == [] for run in tests[key]['observations'])
    helper = 'scripts/test-coverage-pilot/fixtures/child-subject.mjs:1'
    assert index['locations'][helper] == ['child', 'main-shared', 'nested-worker', 'thread']
    nested = tests['nested-worker']['observations'][0]
    report = json.loads((root/nested['artifact']/'unified.json').read_text())
    parent = next(w for w in report['workerLaunches'] if w['parentThreadId'] == 0)
    child = next(w for w in report['workerLaunches'] if w['parentThreadId'] == parent['threadId'])
    assert child['pid'] == parent['pid']
else:
    raise ValueError(f'Unknown check: {kind}')
# Independently verify saved candidate set calculations from the inverse index.
footprints = {key: {line for line, owners in index['locations'].items() if key in owners} for key, entry in tests.items() if entry['eligible']}
candidates = json.loads((root/'candidates.json').read_text())['candidates']
expected_pairs = {(a, b) for a in footprints for b in footprints if a < b and footprints[a] & footprints[b]}
assert {(pair['a'], pair['b']) for pair in candidates} == expected_pairs
for pair in candidates:
    left, right = footprints[pair['a']], footprints[pair['b']]
    assert set(pair['intersection']) == left & right
    assert set(pair['onlyA']) == left - right and set(pair['onlyB']) == right - left
    assert pair['intersectionCount'] == len(left & right) and pair['unionCount'] == len(left | right)
    assert pair['jaccard'] == len(left & right)/len(left | right)
print(f'{kind}: identities, exclusions, source lines and candidate calculations passed ({root})')
