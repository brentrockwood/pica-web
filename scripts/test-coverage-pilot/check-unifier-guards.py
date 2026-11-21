"""Exercise rejection paths using copied artifacts; never alter collected evidence."""
import json
from pathlib import Path
import shutil
import subprocess
import sys

root = Path(sys.argv[1])
batch = root/('run-2' if (root/'run-2').exists() else 'jobs4-r2')
original = batch/'child'
probes = root/'adapter-probes'
probes.mkdir(exist_ok=False)
source_hashes = root/'source-hashes.json'

def copy_case(name, original=original):
    directory = probes/name
    directory.mkdir()
    for item in ['case.json','tests.json','aggregate','native','contexts','workers']:
        src=original/item
        if item=='workers' and not src.exists(): continue
        if src.is_dir(): shutil.copytree(src,directory/item)
        else: shutil.copyfile(src,directory/item)
    for path in original.glob('execve.*'): shutil.copyfile(path,directory/path.name)
    return directory

def run(directory, expected, manifest=source_hashes):
    result = subprocess.run(['node','scripts/test-coverage-pilot/unify-coverage.mjs',str(directory),str(manifest)],capture_output=True,text=True)
    (directory/'probe.log').write_text(result.stdout+result.stderr)
    assert result.returncode == expected, (directory,result.returncode,result.stderr)
    return json.loads((directory/'unified.json').read_text()) if (directory/'unified.json').exists() else None

assert run(copy_case('positive-control'),0)['completeness']['status']=='scope-complete'
missing=copy_case('missing-exit')
context=next(path for path in (missing/'contexts').glob('*.json') if json.loads(path.read_text())['role']=='descendant')
Path(str(context)+'.exit').unlink()
assert 'descendant-exit-unconfirmed' in {problem['kind'] for problem in run(missing,2)['completeness']['problems']}

unsupported=copy_case('unsupported-source-mapping')
for path in (unsupported/'native').glob('*.json'):
    report=json.loads(path.read_text())
    for script in report['result']:
        if script['url'].endswith('/child-subject.mjs'): script['url']+='?transformed'
    path.write_text(json.dumps(report))
assert 'unmapped-native-source' in {problem['kind'] for problem in run(unsupported,2)['completeness']['problems']}

unknown_exec=copy_case('unsupported-execveat')
with next(unknown_exec.glob('execve.*')).open('a') as log:
    log.write('execveat(AT_FDCWD, "/usr/bin/node", ["node"], 0x0, 0) = 0\n')
assert 'unparsed-successful-exec' in {problem['kind'] for problem in run(unknown_exec,2)['completeness']['problems']}

for label, file in [('changed-source','scripts/test-coverage-pilot/fixtures/child-subject.mjs'),
                    ('changed-test',json.loads((original/'case.json').read_text())['case']['file'])]:
    stale=copy_case(label)
    manifest=json.loads(source_hashes.read_text())
    manifest[file]='0'*64
    bad_manifest=probes/(label+'-hashes.json')
    bad_manifest.write_text(json.dumps(manifest))
    (stale/'unified.json').write_text('{"stale":true}')
    assert run(stale,1,bad_manifest) is None, 'Failed validation must not leave a stale accepted output'
nested=batch/'nested-worker'
if nested.exists():
    def rejected(directory, problem):
        assert problem in {item['kind'] for item in run(directory,2)['completeness']['problems']}
    missing_exit=copy_case('missing-worker-exit',nested)
    next((missing_exit/'workers').glob('*.json.exit')).unlink()
    rejected(missing_exit,'worker-exit-unconfirmed')
    missing_launch=copy_case('missing-worker-launch',nested)
    next((missing_launch/'workers').glob('*.json')).unlink()
    rejected(missing_launch,'worker-launch-record-missing')
    missing_parent=copy_case('missing-worker-parent',nested)
    records=[json.loads(path.read_text()) for path in (missing_parent/'workers').glob('*.json')]
    parent=next(record for record in records if record['parentThreadId']==0)
    (missing_parent/'contexts'/f'{parent["pid"]}-{parent["threadId"]}.json').unlink()
    rejected(missing_parent,'worker-parent-unregistered')
    missing_parent_audit=copy_case('missing-parent-audit',nested)
    parent_context=missing_parent_audit/'contexts'/f'{parent["pid"]}-{parent["threadId"]}.json'
    metadata=json.loads(parent_context.read_text())
    del metadata['workerCreationAudit']
    parent_context.write_text(json.dumps(metadata))
    rejected(missing_parent_audit,'worker-parent-audit-missing')
    missing_report=copy_case('missing-worker-report',nested)
    child=next(record for record in records if record['parentThreadId']==parent['threadId'])
    reports=list((missing_report/'native').glob(f'coverage-{child["pid"]}-*-{child["threadId"]}.json'))
    assert reports
    for path in reports:path.unlink()
    rejected(missing_report,'worker-report-missing')
    missing_audit=copy_case('missing-worker-audit',nested)
    shutil.rmtree(missing_audit/'workers')
    rejected(missing_audit,'worker-audit-missing')
    print('Worker reconciliation guards passed: missing exit, launch, parent, parent audit, report, audit directory.')
print('Unifier rejection checks passed: missing closure, unmapped source, unknown exec format, source drift, stale-output invalidation.')
