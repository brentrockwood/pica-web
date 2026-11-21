"""Check replay copying at the normalizer boundary; no historical acceptance claim."""
import json
import os
from pathlib import Path
import runpy
import tempfile
from types import SimpleNamespace
from unittest.mock import patch

script = Path(__file__).with_name('check-regression.py')
report = dict(completeness=dict(status='incomplete', problems=[]), lines=[])
with tempfile.TemporaryDirectory() as temp:
    source = Path(temp)/'source'
    case = source/'jobs1-r1'/'case'
    case.mkdir(parents=True)
    (source/'source-hashes.json').write_text('{}')
    for name in ['case.json', 'tests.json']:
        (case/name).write_text('{}')
    for name in ['aggregate', 'native', 'contexts']:
        (case/name).mkdir()
        (case/name/'receipt.json').write_text('{}')
    (case/'execve.1').write_text('original trace')
    (case/'unified.json').write_text(json.dumps(report))

    def normalize(command, **kwargs):
        directory = Path(command[2])
        (directory/'unified.json').write_text(json.dumps(report))
        return SimpleNamespace(returncode=2)

    def replay(output):
        with patch('sys.argv', [str(script), str(source), str(output)]), \
             patch('subprocess.run', side_effect=normalize), \
             patch('os.link', side_effect=OSError('hard links unavailable')):
            runpy.run_path(str(script), run_name='__main__')

    output = Path(temp)/'absent-workers'
    replay(output)
    copied = output/'jobs1-r1'/'case'
    assert not (copied/'workers').exists()
    assert json.loads((output/'regression.json').read_text())['observations'] == 1
    for name in ['case.json', 'aggregate/receipt.json', 'execve.1']:
        assert not os.path.samefile(case/name, copied/name)
        (copied/name).write_text('changed copy')
        assert (case/name).read_text() != 'changed copy'

    (case/'workers').mkdir()
    (case/'workers'/'receipt.json').write_text('{}')
    output = Path(temp)/'present-workers'
    replay(output)
    assert (output/'jobs1-r1/case/workers/receipt.json').read_text() == '{}'

    (case/'tests.json').unlink()
    try:
        replay(Path(temp)/'missing-required')
        raise AssertionError('Missing required artifact accepted')
    except FileNotFoundError:
        pass
print('Replay optional workers, independent copies, unavailable hard links and required artifacts checked')
