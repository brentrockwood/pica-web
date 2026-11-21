"""Validate known attribution answers and compare independent job footprints."""
import hashlib
import json
from pathlib import Path
import re
import sys

root = Path.cwd()
output = Path(sys.argv[1])
cases = json.loads(Path('scripts/test-coverage-pilot/isolation-cases.json').read_text())
first = {}
changes = []
summaries = []
child_source = root / 'scripts/test-coverage-pilot/fixtures/child-subject.mjs'

def functions(coverage, suffix):
    data = next(data for name, data in coverage.items() if name.endswith(suffix))
    return {data['fnMap'][key]['name']: count for key, count in data['f'].items()}

def footprint(coverage):
    hits = set()
    for absolute, data in coverage.items():
        file = str(Path(absolute).relative_to(root))
        for kind, counter, definitions in [('statement','s','statementMap'),('function','f','fnMap'),('branch','b','branchMap')]:
            for key, count in data[counter].items():
                if kind == 'branch':
                    for arm, value in enumerate(count):
                        if value: hits.add(json.dumps([file,kind,data[definitions][key],arm],sort_keys=True))
                elif count: hits.add(json.dumps([file,kind,data[definitions][key]],sort_keys=True))
    return hits

for batch in ['jobs1-r1','jobs1-r2','jobs4-r1','jobs4-r2']:
    maps = {}
    native = {}
    for case in cases:
        directory = output / batch / case['key']
        report = json.loads((directory/'tests.json').read_text())
        assert report['success'] and report['numPassedTests'] == 1
        coverage = json.loads((directory/'aggregate/coverage-final.json').read_text())
        maps[case['key']] = coverage
        hits = footprint(coverage)
        if case['key'] in first and hits != first[case['key']]:
            changes.append(dict(batch=batch,case=case['key'],removed=len(first[case['key']]-hits),added=len(hits-first[case['key']])))
        first.setdefault(case['key'],hits)
        native[case['key']] = []
        for path in (directory/'native').glob('coverage*.json'):
            for script in json.loads(path.read_text())['result']:
                if script['url'] != child_source.as_uri(): continue
                for fn in script['functions']:
                    if fn['functionName'] != 'childOnly' or not fn['ranges'][0]['count']: continue
                    span = fn['ranges'][0]
                    assert child_source.read_text()[span['startOffset']:span['endOffset']].startswith('function childOnly')
                    match = re.fullmatch(r'coverage-(\d+)-(\d+)-(\d+)\.json',path.name)
                    assert match, f'Unexpected Node 22 coverage filename: {path}'
                    native[case['key']].append(dict(artifact=path.name,pid=int(match[1]),threadId=int(match[3]),
                                                  file=str(child_source.relative_to(root)),function=fn['functionName'],**span))
        if case['key'] in ['child','thread']:
            assert len(native[case['key']]) == 1
            assert native[case['key']][0]['count'] == 1
            assert (native[case['key']][0]['threadId'] > 0) == (case['key']=='thread')
            assert functions(coverage,'/child-subject.mjs')['childOnly'] == 0
        else:
            assert not native[case['key']], f'Foreign child execution attributed to {case["key"]}'
    for key in ['left','right']:
        f = functions(maps[key],'/subject.ts')
        assert all(f[name] == 1 for name in ['choose','importOnly','setupOnly','teardownOnly'])
    assert first['left'] & first['right'], 'Shared code must appear in both tests'
    left_subject = next(data for path,data in maps['left'].items() if path.endswith('/subject.ts'))
    right_subject = next(data for path,data in maps['right'].items() if path.endswith('/subject.ts'))
    assert left_subject['b'] != right_subject['b'], 'The left/right cases must retain distinct branch hits'
    assert functions(maps['background-owner'],'/boundary-subject.ts')['backgroundOnly'] == 1
    assert functions(maps['background-observer'],'/boundary-subject.ts')['backgroundOnly'] == 0
    for key in ['cache-first','cache-second','reload']:
        assert functions(maps[key],'/boundary-subject.ts')['fillCache'] == 1
    assert functions(maps['lazy'],'/subject.ts')['choose'] == 1
    assert native['child'][0]['startOffset'] == native['thread'][0]['startOffset']
    assert native['child'][0]['endOffset'] == native['thread'][0]['endOffset']
    summaries.append(dict(batch=batch,nativeHits={key:hits for key,hits in native.items() if hits}))
assert not [change for change in changes if not change['case'].startswith('real-')], changes
summary = dict(cases=len(cases),executions=len(cases)*len(summaries),batches=summaries,footprintChanges=changes,
               primaryLocationCounts={key:len(hits) for key,hits in first.items()},
               nativeSubjectSha256=hashlib.sha256(child_source.read_bytes()).hexdigest(),
               scope='Full selected-case lifecycle including collection, imports and hooks; not assertion-level coverage.')
(output/'validation.json').write_text(json.dumps(summary,indent=2)+'\n')
print(json.dumps(dict(executions=summary['executions'],controlledAttribution='passed',footprintChanges=changes),indent=2))
