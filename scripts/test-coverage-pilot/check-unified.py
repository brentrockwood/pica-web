"""Validate unified maps and publish a line-to-tests index only for accepted observations."""
import json
from pathlib import Path
import sys

root = Path(sys.argv[1])
cases = json.loads(Path('scripts/test-coverage-pilot/unified-cases.json').read_text())
source_hashes = {}
locations = {}
tests = {}
reference = {}
excluded = []
for batch in ['jobs1-r1','jobs1-r2','jobs4-r1','jobs4-r2']:
    for case in cases:
        directory = root / batch / case['key']
        report = json.loads((directory/'unified.json').read_text())
        assert report['test']['key'] == case['key']
        assert report['completeness']['status'] == case['expectedCompleteness']
        assert report['completeness']['exhaustiveDescendantDiscovery'] is False
        problems = {problem['kind'] for problem in report['completeness']['problems']}
        if case['key'] == 'suppressed-child':
            assert 'expected-native-execution-missing' in problems
        if case['key'] == 'killed-child':
            assert 'descendant-exit-unconfirmed' in problems
        if problems:
            excluded.append(str(directory))
            continue
        observed = {(line['file'],line['line']) for line in report['lines']}
        providers = {(line['file'],line['line'],origin['provider']) for line in report['lines'] for origin in line['origins']}
        previous = reference.setdefault(case['key'], (observed, providers))
        assert (observed, providers) == previous, f'Unstable normalized evidence: {directory}'
        for source, digest in report['sources'].items():
            assert source_hashes.setdefault(source,digest) == digest, f'Mixed source revisions: {source}'
        tests.setdefault(case['key'],dict(file=case['file'],title=case['title'],observations=0))['observations'] += 1
        for line in report['lines']:
            assert line['origins'] and isinstance(line['line'],int) and line['line'] > 0
            key=f'{line["file"]}:{line["line"]}'
            location=locations.setdefault(key,dict(file=line['file'],line=line['line'],tests=set()))
            location['tests'].add(case['key'])
for location in locations.values(): location['tests'] = sorted(location['tests'])
shared='scripts/test-coverage-pilot/fixtures/child-subject.mjs:1'
assert locations[shared]['tests'] == ['child','main-shared','thread']
subject='scripts/test-coverage-pilot/fixtures/subject.ts'
assert {'left','right'} <= set(locations[subject+':9']['tests'])
assert 'right' in locations[subject+':10']['tests'] and 'left' not in locations[subject+':10']['tests']
boundary='scripts/test-coverage-pilot/fixtures/boundary-subject.ts'
assert 'background-owner' in locations[boundary+':4']['tests']
assert 'background-observer' not in locations[boundary+':4']['tests']
assert {'cache-first','cache-second'} <= set(locations[boundary+':2']['tests'])
assert len(tests) == 13 and len(excluded) == 8
assert all(test['observations']==4 for test in tests.values())
index=dict(schema=1,granularity='original-source statement-start line',scope='declared source/Node execution boundary, not exhaustive process discovery',
           sources=source_hashes,tests=tests,locations=locations,excludedIncomplete=excluded)
(root/'line-index.json').write_text(json.dumps(index,indent=2)+'\n')
print(json.dumps(dict(acceptedObservations=52,excludedObservations=len(excluded),tests=len(tests),locations=len(locations),sharedLine=locations[shared]),indent=2))
