"""Check historical normalization guards with installed Istanbul dependencies, no collection."""
import json
from pathlib import Path
import subprocess
import sys
import tempfile

here = Path(__file__).resolve().parent
tools = Path('.analysis/tools/node_modules').resolve()

with tempfile.TemporaryDirectory() as temporary:
    root = Path(temporary).resolve()
    (root/'.analysis/tools').mkdir(parents=True)
    (root/'.analysis/tools/node_modules').symlink_to(tools, target_is_directory=True)
    source = root/'src/source.js'
    source.parent.mkdir()
    source.write_text('export const value = 1;\n')
    output = root/'run'
    output.mkdir()
    # prepare() inventories the checkout relative to the working directory.
    subprocess.run([sys.executable, '-c',
                    'import runpy; from pathlib import Path; '
                    f'runpy.run_path({str(here/"isolation-experiment.py")!r})["prepare"](Path("run"))'],
                   cwd=root, check=True)
    snapshot = (output/'source-hashes.json').read_text()
    location = dict(line=1, column=1)
    report = dict(success=True, numPendingTests=0, testResults=[dict(
        name=str(root/'src/source.test.js'), assertionResults=[dict(
            status='passed', fullName='example', location=location)])])
    (output/'tests.json').write_text(json.dumps(report))
    coverage = dict(path=str(source), statementMap={'0': dict(
        start=dict(line=1, column=0), end=dict(line=1, column=23))},
        s={'0': 1}, fnMap={}, f={}, branchMap={}, b={})
    record = dict(id='test', file='src/source.test.js', names=['example'], location=location,
                  state='pass', bodyExecuted=True, environment='node',
                  phases=dict(body={str(source): coverage}))
    (output/'test.json').write_text(json.dumps(record))

    def normalize(error=None):
        result = subprocess.run(['node', str(here/'evidence.mjs'), str(output)],
                                cwd=root, capture_output=True, text=True)
        if error is None:
            assert result.returncode == 0, result.stderr
            evidence = json.loads((output/'evidence.json').read_text())
            assert evidence['sources'] == json.loads(snapshot)
            assert len(evidence['tests']) == len(evidence['locations']) == 1
        else:
            assert result.returncode != 0, 'Invalid evidence accepted'
            assert error in result.stderr, result.stderr
            assert not (output/'evidence.json').exists(), 'Stale evidence retained'

    normalize()
    source.write_text('export const value = 2;\n')
    normalize('Source changed since collection')
    source.write_text('export const value = 1;\n')
    normalize()
    (output/'source-hashes.json').unlink()
    normalize('ENOENT')
    (output/'source-hashes.json').write_text(snapshot)
    normalize()
    (output/'source-hashes.json').write_text('{}')
    normalize('Source missing from pre-run manifest')
    (output/'source-hashes.json').write_text(snapshot)
    normalize()
    source.unlink()
    normalize('ENOENT')

print('Historical evidence checks passed: unchanged source accepted; drift, missing snapshot, '
      'missing manifest entry and deleted source rejected without stale evidence.')
