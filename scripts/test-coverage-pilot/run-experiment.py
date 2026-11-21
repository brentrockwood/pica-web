"""One isolated validation run: OUTPUT baseline|coverage WORKERS SELECTION [Vitest args]."""
import json
import os
from pathlib import Path
import subprocess
import sys

output = Path(sys.argv[1]).resolve()
collect = sys.argv[2] == "coverage"
workers = int(sys.argv[3])
selection = Path(sys.argv[4]).resolve()
output.mkdir(parents=True, exist_ok=False)
state = output / "state"
for part in ("home", "tmp", "config", "cache", "data"):
    (state / part).mkdir(parents=True)
env = {k: v for k, v in os.environ.items() if not k.startswith(("PI_WEB_", "PER_TEST_"))}
env.update({
    "HOME": str(state / "home"), "TMPDIR": str(state / "tmp"),
    "XDG_CONFIG_HOME": str(state / "config"), "XDG_CACHE_HOME": str(state / "cache"),
    "PI_WEB_DATA_DIR": str(state / "data"), "PI_WEB_CONFIG": str(state / "config" / "config.json"),
    "PI_WEB_SESSIOND_SOCKET": str(state / "sessiond.sock"),
    "PER_TEST_OUTPUT": str(output), "PER_TEST_COLLECT": str(int(collect)),
    "PER_TEST_WORKERS": str(workers), "PER_TEST_SELECTION": str(selection), "NO_COLOR": "1",
})
command = ["node", "node_modules/vitest/vitest.mjs", "run", "--config", "scripts/test-coverage-pilot/config.mjs", *sys.argv[5:]]
time = ["/usr/bin/time", "-f", "%e %U %S %M %I %O %x"]
with (output / "run.log").open("w") as log:
    result = subprocess.run([*time, "-o", str(output / "time.txt"), *command], env=env, stdout=log, stderr=subprocess.STDOUT)
# GNU time prefixes failed commands with a diagnostic; metrics are on its last line.
wall, user, system, rss, inputs, outputs, code = (output / "time.txt").read_text().splitlines()[-1].split()
metrics = dict(command=command, selection=json.loads(selection.read_text()), workers=workers, collect=collect,
               wallSeconds=float(wall), userSeconds=float(user), systemSeconds=float(system), maxRssKiB=int(rss),
               inputBlocks=int(inputs), outputBlocks=int(outputs), exitCode=int(code))
report_path = output / "tests.json"
if report_path.exists():
    report = json.loads(report_path.read_text())
    metrics.update(passed=report["numPassedTests"], failed=report["numFailedTests"], skipped=report["numPendingTests"], success=report["success"])
(output / "metrics.json").write_text(json.dumps(metrics, indent=2) + "\n")
print(json.dumps(dict(output=str(output), **metrics)), flush=True)
if result.returncode:
    print((output / "run.log").read_text()[-16000:], flush=True)
    sys.exit(result.returncode)
assert metrics.get("passed", 0) > 0, "No tests passed: reject an empty selection"
if collect:
    with (output / "normalize.log").open("w") as log:
        normalized = subprocess.run([*time, "-o", str(output / "normalize-time.txt"),
                                    "node", "scripts/test-coverage-pilot/evidence.mjs", str(output)],
                                   env=env, stdout=log, stderr=subprocess.STDOUT)
    print((output / "normalize.log").read_text(), flush=True)
    sys.exit(normalized.returncode)
