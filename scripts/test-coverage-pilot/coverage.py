#!/usr/bin/env python3
"""Bounded per-test execution coverage. See docs/test-coverage-tool.md."""
import argparse
from concurrent.futures import ThreadPoolExecutor
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import platform
import re
import shutil
import subprocess
import sys

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
spec = importlib.util.spec_from_file_location('isolation', HERE/'isolation-experiment.py')
isolation = importlib.util.module_from_spec(spec)
spec.loader.exec_module(isolation)


def save(path, value):
    temp = path.with_suffix(path.suffix + '.tmp')
    temp.write_text(json.dumps(value, indent=2, sort_keys=True) + '\n')
    temp.replace(path)


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def preflight():
    if platform.system() != 'Linux':
        raise ValueError('Collection requires Linux with strace and GNU time; no untraced fallback')
    if subprocess.check_output(['node', '--version'], text=True).strip() != 'v22.22.1':
        raise ValueError('Validated runtime is Node 22.22.1')
    for command in ['strace', '/usr/bin/time']:
        if not shutil.which(command):
            raise ValueError(f'Missing {command}')
    for file, version in [('node_modules/vitest/package.json', '5.0.4'),
                          ('node_modules/typescript/package.json', '6.0.3'),
                          ('node_modules/@vitest/coverage-istanbul/package.json', '5.0.4'),
                          ('.analysis/converter/node_modules/v8-to-istanbul/package.json', '9.3.0')]:
        if json.loads(Path(file).read_text())['version'] != version:
            raise ValueError(f'{file} must be {version}; see setup instructions')


def setup():
    for name in ['tools', 'converter']:
        target = ROOT/'.analysis'/name
        target.mkdir(parents=True, exist_ok=True)
        for file in ['package.json', 'package-lock.json']:
            source = HERE/'dependencies'/name/file
            destination = target/file
            if destination.exists() and destination.read_bytes() != source.read_bytes():
                raise ValueError(f'Refusing to overwrite different dependency manifest: {destination}')
            shutil.copyfile(source, destination)
        subprocess.run(['npm', 'ci', '--ignore-scripts', '--no-audit', '--no-fund', '--prefix', str(target)], check=True)
    link = ROOT/'node_modules/@vitest/coverage-istanbul'
    target = ROOT/'.analysis/tools/node_modules/@vitest/coverage-istanbul'
    if link.exists() or link.is_symlink():
        if link.resolve() != target.resolve():
            raise ValueError(f'Refusing to replace {link}; use the isolated provider described in docs')
    else:
        link.parent.mkdir(parents=True, exist_ok=True)
        link.symlink_to(os.path.relpath(target, link.parent), target_is_directory=True)
    preflight()
    print('Coverage dependencies ready; root manifests unchanged.')


def validate_cases(cases):
    if not isinstance(cases, list) or not cases:
        raise ValueError('Select at least one case')
    keys, identities = set(), set()
    for case in cases:
        if not isinstance(case, dict) or not all(isinstance(case.get(k), str) and case[k] for k in ['key', 'file', 'title']):
            raise ValueError('Each case requires nonempty key, file and title strings')
        if not re.fullmatch(r'[a-zA-Z0-9][a-zA-Z0-9_-]*', case['key']) or case['key'] in keys:
            raise ValueError('Keys must be unique, path-safe names')
        file = Path(case['file'])
        if file.is_absolute() or '..' in file.parts or not file.is_file() or file.as_posix() != case['file']:
            raise ValueError(f'Expected existing repository-relative file: {file}')
        if not file.resolve().is_relative_to(ROOT):
            raise ValueError('Test file must be inside the checkout')
        identity = (case['file'], case['title'])
        if identity in identities:
            raise ValueError('Duplicate file/title selection')
        keys.add(case['key'])
        identities.add(identity)
    return sorted(cases, key=lambda case: case['key'])


def selection_status(selection, case):
    matching = [test for test in selection['tests'] if test['title'] == case['title']]
    if len(matching) != 1 or Path(matching[0]['file']).resolve() != (ROOT/case['file']).resolve():
        return 'invalid-selection', 'Expected exactly one collected test with this file and leaf title'
    test = matching[0]
    options, diagnostic = test['options'], test.get('diagnostic') or {}
    if any(options.get(k) for k in ['retry', 'repeats', 'concurrent']) or any(diagnostic.get(k) for k in ['retryCount', 'repeatCount']):
        return 'unsupported', 'Retries, repeats and concurrent-marked tests are not supported'
    if test['result']['state'] != 'passed':
        return test['result']['state'], 'Selected test did not pass'
    executed = [t for t in selection['tests'] if t['result']['state'] in ['passed', 'failed']]
    if len(executed) != 1 or selection['reason'] != 'passed' or selection['errors']:
        return 'failed', 'Unexpected execution count, lifecycle failure or unhandled error'
    return None


def observe(output, batch, case, timeout):
    directory = output/batch/case['key']
    result = dict(key=case['key'], artifact=str(directory.relative_to(output)))
    try:
        result['metrics'] = isolation.run_case(output/batch, case, output, timeout=timeout)
    except Exception as error:
        metadata = json.loads((directory/'case.json').read_text()) if (directory/'case.json').exists() else {}
        result.update(status='timeout' if metadata.get('exitCode') == 124 else 'failed', reason=str(error))
    try:
        selection = json.loads((directory/'selection.json').read_text())
        problem = selection_status(selection, case)
        if problem:
            result.update(status=problem[0], reason=problem[1])
        elif 'status' not in result:
            with (directory/'normalize.log').open('w') as log:
                normalized = subprocess.run(['node', str(HERE/'unify-coverage.mjs'), str(directory), str(output/'source-hashes.json')], stdout=log, stderr=subprocess.STDOUT, timeout=timeout)
            if normalized.returncode not in [0, 2]:
                raise ValueError('Normalization failed; inspect normalize.log')
            report = json.loads((directory/'unified.json').read_text())
            completeness = report['completeness']
            if completeness['nodeProcessLaunchAudit'] != 'strace-execve' or completeness['workerCreationAudit'] != 'parent-process-worker-event-v1':
                raise ValueError('Required process/worker audit missing')
            result.update(status=completeness['status'], problems=completeness['problems'])
            if not report['lines'] and result['status'] == 'scope-complete':
                result.update(status='empty', reason='No supported executable source lines; not evidence of no useful coverage')
    except Exception as error:
        if 'status' not in result:
            result.update(status='failed', reason=str(error))
        else:
            result['selectionError'] = str(error)
    save(directory/'result.json', result)
    print(f"{result['artifact']}: {result['status']}", flush=True)
    return result


def screen(footprints):
    """Only positive, accepted, same-source observations belong in this function."""
    index = {}
    for key, locations in sorted(footprints.items()):
        if not locations:
            raise ValueError('Empty evidence cannot participate in overlap decisions')
        for location in sorted(locations):
            index.setdefault(location, []).append(key)
    pairs = set()
    for tests in index.values():
        for i, a in enumerate(tests):
            for b in tests[i+1:]:
                pairs.add((a, b))
    candidates = []
    for a, b in sorted(pairs):
        left, right = footprints[a], footprints[b]
        shared = left & right
        relation = 'equal' if left == right else 'a-contained-in-b' if left < right else 'b-contained-in-a' if right < left else 'overlap'
        candidates.append(dict(a=a, b=b, relation=relation, intersection=sorted(shared),
                               onlyA=sorted(left-right), onlyB=sorted(right-left),
                               intersectionCount=len(shared), unionCount=len(left|right),
                               containmentA=len(shared)/len(left), containmentB=len(shared)/len(right),
                               jaccard=len(shared)/len(left|right)))
    return index, candidates


def summarize(output, cases, observations):
    footprints, tests = {}, {}
    source_hashes = json.loads((output/'source-hashes.json').read_text())
    # Detect drift even in files not reached by a selected case.
    drift = [file for file, digest in source_hashes.items() if not Path(file).is_file() or sha(Path(file)) != digest]
    for case in cases:
        runs = [r for r in observations if r['key'] == case['key']]
        entry = dict(selection=case, observations=runs, eligible=False)
        tests[case['key']] = entry
        if drift:
            entry.update(status='source-drift', reason=drift)
            continue
        if any(r['status'] != 'scope-complete' for r in runs):
            entry.update(status='excluded')
            continue
        reports = [json.loads((output/r['artifact']/'unified.json').read_text()) for r in runs]
        sets = [{f"{line['file']}:{line['line']}" for line in report['lines']} for report in reports]
        if any(locations != sets[0] for locations in sets[1:]):
            entry.update(status='unstable', reason='Repeated executions differ; no intersection substituted')
            continue
        entry.update(status='accepted', eligible=True, identity=reports[0]['test'], lineCount=len(sets[0]))
        footprints[case['key']] = sets[0]
    index, candidates = screen(footprints)
    warning = 'Execution overlap includes collection/imports, setup and awaited cleanup. It is not assertion equivalence or evidence that deletion is safe.'
    save(output/'line-index.json', dict(schema=1, sources=source_hashes, locations=index, tests=tests, warning=warning))
    save(output/'candidates.json', dict(schema=1, candidates=candidates, warning=warning,
                                      provenance='line-index.json links identities and observations; each unified.json retains provider/context/map origins',
                                      uniqueLines={key: sorted(line for line in lines if len(index[line]) == 1) for key, lines in footprints.items()}))
    summary = dict(selected=len(cases), observations=len(observations), accepted=len(footprints), excluded=len(cases)-len(footprints),
                   locations=len(index), candidates=len(candidates), warning=warning)
    save(output/'summary.json', summary)
    return summary


def run(args):
    preflight()
    cases = validate_cases(json.loads(Path(args.cases).read_text()) if args.cases else [dict(key='selected', file=args.file, title=args.title)])
    output = Path(args.output).resolve()
    output.mkdir(parents=True, exist_ok=False)
    save(output/'selection.json', cases)
    isolation.prepare(output, args.transforms)
    tool_files = [p for p in HERE.rglob('*') if p.is_file() and '__pycache__' not in p.parts]
    provenance = dict(command=sys.argv, revision=subprocess.check_output(['git', 'rev-parse', 'HEAD'], text=True).strip(),
                      platform=platform.platform(), node=subprocess.check_output(['node', '--version'], text=True).strip(),
                      python=platform.python_version(), jobs=args.jobs, repeats=args.repeat,
                      tools={str(p.relative_to(ROOT)): sha(p) for p in tool_files},
                      projectInputs={f: sha(Path(f)) for f in ['package.json', 'package-lock.json', 'vitest.config.ts']})
    save(output/'provenance.json', provenance)
    shutil.copytree(HERE, output/'tools', ignore=shutil.ignore_patterns('__pycache__'))
    observations = []
    for repeat in range(1, args.repeat+1):
        with ThreadPoolExecutor(max_workers=args.jobs) as executor:
            observations.extend(executor.map(lambda case: observe(output, f'run-{repeat}', case, args.timeout), cases))
        save(output/'observations.json', observations)
    changed_inputs = [file for file, digest in {**provenance['tools'], **provenance['projectInputs']}.items()
                      if not Path(file).is_file() or sha(Path(file)) != digest]
    if changed_inputs:
        for observation in observations:
            observation.update(status='collector-drift', reason=changed_inputs)
        save(output/'observations.json', observations)
    summary = summarize(output, cases, observations)
    print(json.dumps(summary, indent=2))
    return 2 if summary['excluded'] else 0


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest='command', required=True)
    commands.add_parser('setup', help='Install pinned isolated analysis dependencies, not root dependencies')
    collect = commands.add_parser('run', help='Run fresh isolated executions and build index/candidates')
    selection = collect.add_mutually_exclusive_group(required=True)
    selection.add_argument('--cases', help='JSON array of {key, file, title}; title is an exact unique leaf title')
    selection.add_argument('--file', help='One repository-relative test file')
    collect.add_argument('--title', help='Exact unique leaf title, with --file')
    collect.add_argument('--output', required=True, help='New output directory; never overwritten')
    collect.add_argument('--jobs', type=int, default=1, help='Independent jobs (default: 1); opt in only for host-safe tests')
    collect.add_argument('--repeat', type=int, default=1)
    collect.add_argument('--timeout', type=int, default=120, help='Seconds per collection/conversion; collection timeout kills only its own process group')
    collect.add_argument('--transforms', help='Manifest from the fixed mapped builder')
    args = parser.parse_args()
    if sys.flags.optimize:
        parser.error('Do not use python -O: evidence checks require assertions')
    os.chdir(ROOT)
    try:
        if args.command == 'setup':
            setup()
            return 0
        if min(args.jobs, args.repeat, args.timeout) < 1 or bool(args.file) != bool(args.title):
            raise ValueError('Use positive jobs/repeat/timeout; --file requires --title and vice versa')
        return run(args)
    except (OSError, ValueError, subprocess.SubprocessError) as error:
        print(f'coverage: {error}', file=sys.stderr)
        return 1


if __name__ == '__main__':
    sys.exit(main())
