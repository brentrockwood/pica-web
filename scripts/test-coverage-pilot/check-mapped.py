"""Compare known original TS lines across providers, then exercise map rejection."""
import hashlib
import json
from pathlib import Path
import shutil
import subprocess
import sys

root=Path(sys.argv[1])
source='scripts/test-coverage-pilot/fixtures/mapped-subject.ts'
native_source='scripts/test-coverage-pilot/fixtures/native-only-subject.ts'
locations={}
batches = ['run-1', 'run-2'] if (root/'run-1').exists() else ['jobs1-r1','jobs1-r2','jobs4-r1','jobs4-r2']
for batch in batches:
    for side in ['left','right']:
        for mode in ['main','child','worker','native-only']:
            key=f'{mode}-{side}'
            directory=root/batch/key
            report=json.loads((directory/'unified.json').read_text())
            tests=json.loads((directory/'tests.json').read_text())
            assert tests['success'] and tests['numPassedTests']==1
            assert report['completeness']['status']=='scope-complete'
            expected=({(native_source,4),(native_source,5 if side=='left' else 7)} if mode=='native-only'
                      else {(source,6),(source,7),(source,8 if side=='left' else 10)})
            assert {(row['file'],row['line']) for row in report['lines']}==expected,(batch,key,report['lines'])
            for row in report['lines']:
                providers={origin['provider'] for origin in row['origins']}
                assert providers==({'istanbul'} if mode=='main' else {'v8'})
                if mode!='main':assert all('sourceMap' in origin for origin in row['origins'])
                locations.setdefault(f'{row["file"]}:{row["line"]}',set()).add(key)
assert len(locations)==7
(root/'mapping-line-index.json').write_text(json.dumps({location:sorted(tests) for location,tests in sorted(locations.items())},indent=2)+'\n')

probes=root/'map-probes'
probes.mkdir(exist_ok=False)
original=root/batches[-1]/'child-left'
base_transforms=json.loads((root/'transforms.json').read_text())
generated=next(file for file in base_transforms if file.endswith('/mapped-subject.js'))
results=[]
for kind in ['positive','missing-registration','missing-inventory','compiler-mismatch','stale-original','generated-hash-mismatch','map-hash-mismatch','coherent-bad-map']:
    directory=probes/kind
    directory.mkdir()
    for item in ['case.json','tests.json','aggregate','native','contexts','workers']:
        src=original/item
        if src.is_dir():shutil.copytree(src,directory/item)
        else:shutil.copyfile(src,directory/item)
    for path in original.glob('execve.*'):shutil.copyfile(path,directory/path.name)
    transforms=json.loads(json.dumps(base_transforms))
    hashes=json.loads((root/'source-hashes.json').read_text())
    record=transforms[generated]
    if kind in ['missing-registration','missing-inventory']:del transforms[generated]
    if kind=='missing-inventory':del hashes[generated]
    if kind=='compiler-mismatch':record['compilerVersion']='0.0.0'
    if kind=='stale-original':record['originalHash']='0'*64
    if kind=='generated-hash-mismatch':record['generatedHash']='0'*64
    if kind=='map-hash-mismatch':record['mapHash']='0'*64
    if kind=='coherent-bad-map':
        original_map=Path(record['map']).read_text()
        wrong_map=original_map.replace('"mappings":"','"mappings":";',1)
        assert wrong_map!=original_map
        copy=directory/'wrong.js.map'
        copy.write_text(wrong_map)
        record['map']=str(copy)
        record['mapHash']=hashlib.sha256(copy.read_bytes()).hexdigest()
        hashes[str(copy)]=record['mapHash']
    (directory/'transforms.json').write_text(json.dumps(transforms))
    (directory/'source-hashes.json').write_text(json.dumps(hashes))
    result=subprocess.run(['node','scripts/test-coverage-pilot/unify-coverage.mjs',str(directory),str(directory/'source-hashes.json')],capture_output=True,text=True)
    (directory/'probe.log').write_text(result.stdout+result.stderr)
    assert result.returncode==(0 if kind=='positive' else 2),(kind,result.returncode,result.stderr)
    report=json.loads((directory/'unified.json').read_text())
    if kind=='missing-inventory':assert any(p['kind']=='unregistered-generated-source' for p in report['completeness']['problems'])
    if kind=='coherent-bad-map':assert any('deterministic rebuild' in p.get('reason','') for p in report['completeness']['problems'])
    results.append(dict(probe=kind,status=report['completeness']['status'],problems=report['completeness']['problems']))
summary=dict(executions=len(batches)*8,accepted=len(batches)*8,locations=7,knownUnexecutedLinesExcluded=True,providerLineSetsAgree=True,probes=results)
(root/'validation.json').write_text(json.dumps(summary,indent=2)+'\n')
print(json.dumps(summary,indent=2))
