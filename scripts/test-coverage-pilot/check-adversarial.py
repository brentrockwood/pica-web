"""Fresh review regressions and real-copy corruption checks; expected exclusions are not passes."""
import json
from pathlib import Path
import shutil
import subprocess
import sys

root = Path(sys.argv[1])
root.mkdir(parents=True, exist_ok=False)

def run(command, expected, log):
    result = subprocess.run(command, capture_output=True, text=True)
    log.write_text(result.stdout + result.stderr)
    assert result.returncode == expected, (command, result.returncode, log)

def read(path):
    return json.loads(path.read_text())

build = root/'build'
run(['node', 'scripts/test-coverage-pilot/build-mapped-fixtures.mjs', str(build),
     'scripts/test-coverage-pilot/fixtures/ambiguous-class.ts'], 0, root/'build.log')
titles = [f'class {extension} {mode}' for extension in ['mjs', 'ts'] for mode in ['main', 'child', 'worker']]
titles += ['require true', 'require false', 'cjs import', 'cjs child']
cases = [dict(key=title.replace(' ', '-'), file='scripts/test-coverage-pilot/fixtures/adversarial.spec.mjs', title=title) for title in titles]
(root/'cases.json').write_text(json.dumps(cases))
collection = root/'collection'
run(['python3', 'scripts/test-coverage-pilot/coverage.py', 'run', '--cases', str(root/'cases.json'),
     '--jobs', '2', '--repeat', '2', '--timeout', '60', '--transforms', str(build/'transforms.json'),
     '--output', str(collection)], 2, root/'collection.log')
summary = read(collection/'summary.json')
assert summary['accepted'] == 4 and summary['excluded'] == 6 and summary['observations'] == 20, summary
for observation in read(collection/'observations.json'):
    key = observation['key']
    report = read(collection/observation['artifact']/'unified.json')
    if key.startswith('class-'):
        if key.endswith('-main'):
            assert observation['status'] == 'scope-complete'
            source = 'scripts/test-coverage-pilot/fixtures/ambiguous-class.' + key.split('-')[1]
            assert {(row['file'], row['line']) for row in report['lines']} == {(source, line) for line in [8, 9, 11]}
        else:
            assert observation['status'] == 'incomplete'
            assert any('Conflicting equally specific V8 ranges' in p.get('reason', '') for p in report['completeness']['problems'])
    elif key.startswith('require-'):
        assert observation['status'] == 'incomplete'
        assert any(p['kind'] == 'main-native-project-load' and p['file'].endswith('/required-subject.cjs') for p in report['completeness']['problems'])
        assert report['lines'], 'Keep the positive unrelated helper control'
    else:
        assert observation['status'] == 'scope-complete'
        source = 'scripts/test-coverage-pilot/fixtures/required-subject.cjs'
        assert {(row['file'], row['line']) for row in report['lines']} == {(source, line) for line in [1, 2, 3, 4, 8]}
assert all(not pair['a'].startswith('require-') and not pair['b'].startswith('require-') for pair in read(collection/'candidates.json')['candidates'])

# Real copies, not links: incomplete positive maps must invalidate earlier accepted output.
for provider, key in [('istanbul', 'cjs-import'), ('v8', 'cjs-child')]:
    for mutation in ['missing', 'null', 'string', 'negative', 'extra']:
        if provider == 'v8' and mutation == 'extra':
            continue
        directory = root/f'{provider}-{mutation}'
        shutil.copytree(collection/'run-1'/key, directory)
        if provider == 'istanbul':
            path = directory/'aggregate/coverage-final.json'
            raw = read(path)
            coverage = next(value for file, value in raw.items() if file.endswith('/required-subject.cjs'))
            counters = coverage['s']
            counter = next(k for k, loc in coverage['statementMap'].items() if loc['start']['line'] == 2)
        else:
            for path in (directory/'native').glob('*.json'):
                raw = read(path)
                script = next((s for s in raw['result'] if s['url'].endswith('/required-subject.cjs')), None)
                if script:
                    counters = next(fn for fn in script['functions'] if fn['functionName'] == 'exports.run')['ranges'][0]
                    counter = 'count'
                    break
            else:
                raise AssertionError('Missing real native subject')
        if mutation == 'missing': del counters[counter]
        elif mutation == 'extra': counters['extra'] = 1
        else: counters[counter] = {'null': None, 'string': '1', 'negative': -1}[mutation]
        path.write_text(json.dumps(raw))
        run(['node', 'scripts/test-coverage-pilot/unify-coverage.mjs', str(directory), str(collection/'source-hashes.json')],
            1 if provider == 'istanbul' else 2, directory/'mutation.log')
        if provider == 'istanbul':
            assert not (directory/'unified.json').exists(), 'Stale accepted output survived'
            assert 'Istanbul statement' in (directory/'mutation.log').read_text()
        else:
            report = read(directory/'unified.json')
            assert report['completeness']['status'] == 'incomplete'
            assert any('Invalid V8 range count' in p.get('reason', '') for p in report['completeness']['problems'])

for mutation in ['registration', 'receipt']:
    directory = root/f'load-audit-{mutation}'
    shutil.copytree(collection/'run-1/cjs-import', directory)
    context = next(path for path in (directory/'contexts').glob('*.json') if read(path)['role'] == 'test-worker')
    if mutation == 'registration':
        record = read(context)
        del record['nativeModuleLoadAudit']
        context.write_text(json.dumps(record))
    else:
        Path(str(context)+'.loads').unlink()
    run(['node', 'scripts/test-coverage-pilot/unify-coverage.mjs', str(directory), str(collection/'source-hashes.json')], 2, directory/'mutation.log')
    assert any(p['kind'] == 'main-native-load-audit-missing' for p in read(directory/'unified.json')['completeness']['problems'])
print('Class attribution, positive require bypass, malformed positive counters and missing load-audit regressions passed')
