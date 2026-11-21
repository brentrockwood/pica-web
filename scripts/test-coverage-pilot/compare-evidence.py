"""Compare execution evidence, not test redundancy: BASE OTHER... writes JSON to stdout."""
import json
from pathlib import Path
import sys

base = json.loads(Path(sys.argv[1]).read_text())
identity = lambda test: json.dumps([test['file'], test['names'], test['location']], sort_keys=True)
lookup = {identity(test): test for test in base['tests']}
assert len(lookup) == len(base['tests']), 'Ambiguous test identities'
comparisons = []
for argument in sys.argv[2:]:
    other = json.loads(Path(argument).read_text())
    for path in base['sources'].keys() & other['sources'].keys():
        assert base['sources'][path] == other['sources'][path], f'Source changed: {path}'
    changes = []
    common = 0
    for test in other['tests']:
        if identity(test) not in lookup:
            continue
        common += 1
        old = lookup[identity(test)]
        metadata = lambda record: {key: value for key, value in record.items() if key not in ('id', 'phases', 'durationMs')}
        assert metadata(old) == metadata(test), f'Test identity changed: {test["id"]}'
        phases = {}
        for phase in test['phases']:
            removed = set(old['phases'][phase]) - set(test['phases'][phase])
            added = set(test['phases'][phase]) - set(old['phases'][phase])
            if removed or added:
                phases[phase] = dict(removed=[base['locations'][key] for key in sorted(removed)],
                                     added=[other['locations'][key] for key in sorted(added)])
        if phases:
            changes.append(dict(id=old['id'], otherId=test['id'], file=test['file'], names=test['names'], phases=phases))
    assert common > 0, f'No comparable test identities in {argument}'
    comparisons.append(dict(other=argument, commonTests=common, changedTests=len(changes), changes=changes))
print(json.dumps(dict(base=sys.argv[1], comparisons=comparisons), indent=2))
