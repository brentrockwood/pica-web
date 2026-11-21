"""Small self-checks for selection gates and deterministic candidate arithmetic."""
import copy
import importlib.util
from pathlib import Path
import tempfile

spec = importlib.util.spec_from_file_location('coverage_tool', Path(__file__).with_name('coverage.py'))
tool = importlib.util.module_from_spec(spec)
spec.loader.exec_module(tool)

case = dict(key='one', file='src/shared/themePreference.test.ts', title='a title')
test = dict(file=str(tool.ROOT/case['file']), title=case['title'], options={}, result=dict(state='passed'))
selection = dict(tests=[test], errors=[], reason='passed')
assert tool.selection_status(selection, case) is None
for status in ['failed', 'skipped', 'pending']:
    altered = copy.deepcopy(selection)
    altered['tests'][0]['result']['state'] = status
    assert tool.selection_status(altered, case)[0] == status
for tests in [[], [test, test]]:
    assert tool.selection_status(dict(selection, tests=tests), case)[0] == 'invalid-selection'
for option in ['retry', 'repeats', 'concurrent']:
    altered = copy.deepcopy(selection)
    altered['tests'][0]['options'][option] = 1
    assert tool.selection_status(altered, case)[0] == 'unsupported'

footprints = dict(a={'x:1', 'x:2'}, b={'x:1', 'x:2'}, c={'x:1'}, d={'x:2', 'x:3'}, e={'y:1'})
index, candidates = tool.screen(footprints)
assert index['x:1'] == ['a', 'b', 'c']
by_pair = {(c['a'], c['b']): c for c in candidates}
assert len(candidates) == 5
assert by_pair['a', 'b']['relation'] == 'equal'
assert by_pair['a', 'c']['relation'] == 'b-contained-in-a'
assert by_pair['a', 'd']['intersection'] == ['x:2']
assert by_pair['a', 'd']['onlyA'] == ['x:1'] and by_pair['a', 'd']['onlyB'] == ['x:3']
assert by_pair['a', 'd']['jaccard'] == 1/3 and by_pair['a', 'd']['containmentA'] == .5
assert tool.screen(dict(reversed(list(footprints.items())))) == (index, candidates)
try:
    tool.screen(dict(empty=set()))
    raise AssertionError('Empty evidence accepted')
except ValueError:
    pass

# Drive the actual summary boundary: incomplete, unstable and source drift never reach candidates.
with tempfile.TemporaryDirectory() as temp:
    output = Path(temp)
    tool.save(output/'source-hashes.json', {})
    cases = [dict(case, key=key) for key in ['valid', 'incomplete', 'unstable']]
    observations = []
    for selected in cases:
        for repeat in [1, 2]:
            artifact = f'{selected["key"]}-{repeat}'
            (output/artifact).mkdir()
            status = 'incomplete' if selected['key'] == 'incomplete' else 'scope-complete'
            tool.save(output/artifact/'unified.json', dict(test=selected, lines=[dict(file='x', line=repeat if selected['key'] == 'unstable' else 1)]))
            observations.append(dict(key=selected['key'], artifact=artifact, status=status))
    summary = tool.summarize(output, cases, observations)
    assert summary['accepted'] == 1 and summary['candidates'] == 0
    tool.save(output/'source-hashes.json', {'missing-source.ts': 'bad'})
    assert tool.summarize(output, cases, observations)['accepted'] == 0
print('CLI selection, exclusion, drift and candidate checks passed')
