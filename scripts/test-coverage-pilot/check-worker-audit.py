"""Check parent-side worker inventory independently of declared source expectations."""
import json
from pathlib import Path
import sys

root=Path(sys.argv[1])
cases=json.loads(Path('scripts/test-coverage-pilot/worker-audit-cases.json').read_text())
expected_problems={
    'suppressed-worker': {'worker-launch-unregistered','worker-report-missing'},
    'terminated-worker': {'worker-nonzero-exit'},
    'removed-worker-audit': {'worker-audit-removed'},
    'suppressed-child': {'node-launch-unregistered'},
    'killed-child': {'descendant-exit-unconfirmed'},
}
reference={}
changes=[]
accepted=0
rejected=0
for batch in ['jobs1-r1','jobs1-r2','jobs4-r1','jobs4-r2']:
    for case in cases:
        directory=root/batch/case['key']
        metadata=json.loads((directory/'case.json').read_text())
        assert metadata['case']['expectedNativeSources']==[]
        test_report=json.loads((directory/'tests.json').read_text())
        assert test_report['success'] and test_report['numPassedTests']==1
        report=json.loads((directory/'unified.json').read_text())
        assert report['completeness']['status']==case['expectedCompleteness']
        assert report['completeness']['workerCreationAudit']=='parent-process-worker-event-v1'
        assert report['completeness']['nodeProcessLaunchAudit']=='strace-execve'
        problems={problem['kind'] for problem in report['completeness']['problems']}
        if case['key'] in expected_problems:
            assert expected_problems[case['key']] <= problems
            rejected+=1
            continue
        assert not problems
        accepted+=1
        footprint={(line['file'],line['line']) for line in report['lines']}
        previous=reference.setdefault(case['key'],footprint)
        if previous!=footprint:
            changes.append(dict(batch=batch,case=case['key'],removed=len(previous-footprint),added=len(footprint-previous)))
        if case['key']=='nested-worker':
            assert len(report['workerLaunches'])==2
            parent=next(worker for worker in report['workerLaunches'] if worker['parentThreadId']==0)
            child=next(worker for worker in report['workerLaunches'] if worker['parentThreadId']==parent['threadId'])
            assert parent['pid']==child['pid']
            assert parent['exit']['code']==child['exit']['code']==0
            line=next(line for line in report['lines'] if line['file'].endswith('/child-subject.mjs') and line['line']==1)
            assert any(origin['context']==f'{child["pid"]}-{child["threadId"]}' and origin['provider']=='v8' for origin in line['origins'])
        if case['key']=='rejected-worker':assert report['workerLaunches']==[]
        if case['key'] in ('child','thread','main-shared','real-lifecycle','real-catalog'):
            old_root=Path('.analysis/traced') if not case['key'].startswith('real-') else Path('.analysis/unified')
            old=json.loads((old_root/batch/case['key']/'unified.json').read_text())
            old_footprint={(line['file'],line['line']) for line in old['lines']}
            assert footprint==old_footprint,f'Regression changed line map: {directory}'
assert accepted==28 and rejected==20
assert not [change for change in changes if not change['case'].startswith('real-')]
shared_tests=sorted(key for key, lines in reference.items() if ('scripts/test-coverage-pilot/fixtures/child-subject.mjs',1) in lines)
assert shared_tests==['child','main-shared','nested-worker','thread']
summary=dict(executions=accepted+rejected,accepted=accepted,rejected=rejected,footprintChanges=changes,sharedLineTests=shared_tests,
             checks=['hidden worker detected without declaration','nested parent/child lineage','rejected constructor has no launch',
                     'audit removal detected','terminated worker rejected','existing process/thread/real-test line maps unchanged'])
(root/'validation.json').write_text(json.dumps(summary,indent=2)+'\n')
print(json.dumps(summary,indent=2))
