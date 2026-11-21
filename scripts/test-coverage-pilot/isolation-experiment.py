"""Fresh Vitest process + worker per case; parallelize jobs, never tests in a worker."""
from concurrent.futures import ThreadPoolExecutor
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import signal
import subprocess
import sys
import time

def prepare(output, transform_manifest=None):
    source_hashes = {}
    for base in ['src', 'pi-packages', 'pi-web-plugins', 'scripts', 'extensions']:
        for path in Path(base).rglob('*'):
            if path.is_file() and path.suffix in ('.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.mts', '.cts'):
                source_hashes[str(path)] = hashlib.sha256(path.read_bytes()).hexdigest()
    if transform_manifest:
        transforms = json.loads(Path(transform_manifest).read_text())
        (output/'transforms.json').write_text(json.dumps(transforms,indent=2)+'\n')
        for generated, record in transforms.items():
            for file in [generated, record['map']]:
                source_hashes[file] = hashlib.sha256(Path(file).read_bytes()).hexdigest()
    (output/'source-hashes.json').write_text(json.dumps(source_hashes,indent=2)+'\n')

    return source_hashes

def run_case(batch, case, output, tracked=True, traced=True, timeout=120):
    root = Path.cwd()
    node_executable = str(Path(shutil.which('node')).resolve())
    directory = batch / case['key']
    for part in ('home', 'tmp', 'config', 'cache', 'data', 'native'):
        (directory / part).mkdir(parents=True)
    env = {k: v for k, v in os.environ.items() if not k.startswith(('PI_WEB_', 'PER_TEST_', 'ISOLATION_')) and k not in ('NODE_OPTIONS', 'NODE_V8_COVERAGE', 'NODE_COMPILE_CACHE')}
    env.update({
        'HOME': str(directory / 'home'), 'TMPDIR': str(directory / 'tmp'),
        'XDG_DATA_HOME': str(directory / 'data'), 'TMP': str(directory / 'tmp'), 'TEMP': str(directory / 'tmp'),
        'XDG_CONFIG_HOME': str(directory / 'config'), 'XDG_CACHE_HOME': str(directory / 'cache'),
        'PI_WEB_DATA_DIR': str(directory / 'data'), 'PI_WEB_CONFIG': str(directory / 'config/config.json'),
        'PI_WEB_SESSIOND_SOCKET': str(directory / 'sessiond.sock'),
        'ISOLATION_OUTPUT': str(directory), 'ISOLATION_FILE': case['file'],
        'NODE_V8_COVERAGE': str(directory / 'native'), 'NODE_DISABLE_COMPILE_CACHE': '1',
        'NO_COLOR': '1',
        'MAPPED_TRANSFORMS': str(output/'transforms.json'),
    })
    if tracked:
        env.update(COVERAGE_JOB_DIR=str(directory), ISOLATION_TRACKED='1',
                   NODE_OPTIONS='--require='+str(root/'scripts/test-coverage-pilot/native-context.cjs'))
    test_command = ['node', 'node_modules/vitest/vitest.mjs', 'run', '--config', 'scripts/test-coverage-pilot/isolation.config.mjs',
                    '-t', '(?:^| > )' + re.escape(case['title']) + '$']
    if traced:
        test_command = ['strace', '-ff', '-qq', '-e', 'trace=execve,execveat', '-o', str(directory/'execve'), *test_command]
    command = ['/usr/bin/time', '-f', '%e %U %S %M %I %O %x', '-o', str(directory / 'time.txt'), *test_command]
    with (directory / 'run.log').open('w') as log:
        process = subprocess.Popen(command, env=env, stdout=log, stderr=subprocess.STDOUT, start_new_session=True)
        try:
            code = process.wait(timeout=timeout)
        except subprocess.TimeoutExpired:
            os.killpg(process.pid, signal.SIGKILL)
            process.wait()
            code = 124
        except BaseException:
            os.killpg(process.pid, signal.SIGKILL)
            process.wait()
            raise
    (directory / 'case.json').write_text(json.dumps(dict(case=case, command=command, exitCode=code,
                                                       launchAudit='strace-execve' if traced else 'none', nodeExecutable=node_executable), indent=2)+'\n')
    assert code == 0, f'{directory}: runner failed; inspect run.log'
    report = json.loads((directory / 'tests.json').read_text())
    matching = [test for file in report['testResults'] for test in file['assertionResults'] if test['title'] == case['title']]
    assert len(matching) == 1, f'{directory}: ambiguous or missing title'
    passed = [(file['name'], test['title']) for file in report['testResults'] for test in file['assertionResults'] if test['status']=='passed']
    assert report['success'] and passed == [(str(root/case['file']), case['title'])], f'{directory}: wrong test selection'
    assert (directory/'aggregate/coverage-final.json').is_file()
    assert list((directory/'native').glob('coverage*.json')), f'{directory}: no native coverage'
    wall, user, system, rss, inputs, outputs, code = (directory/'time.txt').read_text().splitlines()[-1].split()
    return dict(case=case['key'], wallSeconds=float(wall), cpuSeconds=float(user)+float(system),
                maxRssKiB=int(rss), inputBlocks=int(inputs), outputBlocks=int(outputs), exitCode=int(code))

def main():
    output = Path(sys.argv[1]).resolve()
    output.mkdir(parents=True, exist_ok=False)
    cases = json.loads(Path(sys.argv[2] if len(sys.argv) > 2 else 'scripts/test-coverage-pilot/isolation-cases.json').read_text())
    tracked = len(sys.argv) > 3 and sys.argv[3] in ('tracked', 'traced')
    traced = len(sys.argv) > 3 and sys.argv[3] == 'traced'
    prepare(output, sys.argv[4] if len(sys.argv) > 4 else None)
    summary = []
    for jobs in (1, 4):
        for repeat in (1, 2):
            batch = output / f'jobs{jobs}-r{repeat}'
            started = time.monotonic()
            with ThreadPoolExecutor(max_workers=jobs) as executor:
                results = list(executor.map(lambda case: run_case(batch, case, output, tracked, traced), cases))
            item = dict(batch=batch.name, jobs=jobs, wallSeconds=time.monotonic()-started, results=results)
            summary.append(item)
            (output/'metrics.json').write_text(json.dumps(summary,indent=2)+'\n')
            print(json.dumps(dict(batch=item['batch'], jobs=jobs, cases=len(results), wallSeconds=item['wallSeconds'])),flush=True)

if __name__ == '__main__':
    main()
