"""Run the bounded pilot; GNU time measures the runner and all waited-for children."""
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import sys

spec = importlib.util.spec_from_file_location('isolation', Path(__file__).with_name('isolation-experiment.py'))
isolation = importlib.util.module_from_spec(spec)
spec.loader.exec_module(isolation)

root = Path.cwd()
output = root / ".analysis" / "pilot"
output.mkdir(parents=True, exist_ok=False)
metrics = []
for workers in (1, 2, 3):
    for repeat in (1, 2):
        for collect in (False, True):
            label = f"{'coverage' if collect else 'baseline'}-w{workers}-r{repeat}"
            directory = output / label
            directory.mkdir()
            state = directory / "state"
            for part in ("home", "tmp", "config", "cache", "data"):
                (state / part).mkdir(parents=True)
            env = {key: value for key, value in os.environ.items() if not key.startswith(("PI_WEB_", "PER_TEST_"))}
            env.update({
                "HOME": str(state / "home"), "TMPDIR": str(state / "tmp"),
                "XDG_CONFIG_HOME": str(state / "config"), "XDG_CACHE_HOME": str(state / "cache"),
                "PI_WEB_DATA_DIR": str(state / "data"), "PI_WEB_CONFIG": str(state / "config" / "config.json"),
                "PI_WEB_SESSIOND_SOCKET": str(state / "sessiond.sock"),
                "PER_TEST_OUTPUT": str(directory), "PER_TEST_COLLECT": str(int(collect)),
                "PER_TEST_WORKERS": str(workers), "NO_COLOR": "1",
            })
            if collect:
                isolation.prepare(directory)
            command = ["/usr/bin/time", "-f", "%e %U %S %M %I %O %x", "-o", str(directory / "time.txt"),
                       "node", "node_modules/vitest/vitest.mjs", "run", "--config", "scripts/test-coverage-pilot/config.mjs"]
            with (directory / "run.log").open("w") as log:
                result = subprocess.run(command, env=env, stdout=log, stderr=subprocess.STDOUT)
            if result.returncode:
                print((directory / "run.log").read_text(), flush=True)
                sys.exit(result.returncode)
            wall, user, system, rss, inputs, outputs, status = (directory / "time.txt").read_text().split()
            report = json.loads((directory / "tests.json").read_text())
            assert report["success"] and report["numPassedTests"] == 9 and report["numPendingTests"] == 0
            record = dict(label=label, workers=workers, repeat=repeat, collect=collect, wallSeconds=float(wall),
                          userSeconds=float(user), systemSeconds=float(system), maxRssKiB=int(rss),
                          inputBlocks=int(inputs), outputBlocks=int(outputs), exitCode=int(status))
            if collect:
                with (directory / "normalize.log").open("w") as log:
                    subprocess.run(["/usr/bin/time", "-f", "%e %U %S %M %I %O %x", "-o", str(directory / "normalize-time.txt"),
                                    "node", "scripts/test-coverage-pilot/evidence.mjs", str(directory)],
                                   env=env, stdout=log, stderr=subprocess.STDOUT, check=True)
                record["rawRecordBytes"] = sum(path.stat().st_size for path in directory.glob("*.json") if path.name not in ("tests.json", "evidence.json", "source-hashes.json"))
                record["evidenceBytes"] = (directory / "evidence.json").stat().st_size
            metrics.append(record)
            (output / "metrics.json").write_text(json.dumps(metrics, indent=2) + "\n")
            print(json.dumps(record), flush=True)
print(f"Complete: {output}", flush=True)
