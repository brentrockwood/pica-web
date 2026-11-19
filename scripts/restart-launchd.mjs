#!/usr/bin/env node
// Checkout maintenance tool. Run with node --import tsx; never imported by live services.
import { spawnSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { accessSync, constants, appendFileSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { homedir, userInfo } from "node:os";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { awaitServicesReady, restartLaunchdService } from "../src/nativeServices/serviceAction.ts";

const script = fileURLToPath(import.meta.url);
const require = createRequire(import.meta.url);
const order = ["web", "uiDev", "sessiond"];

export function validatePlan(value) {
  if (!value || !Array.isArray(value.services) || value.services.length === 0) throw new Error("Plan requires services.");
  const ids = new Set();
  const labels = new Set();
  for (const service of value.services) {
    if (!order.includes(service.id) || ids.has(service.id)) throw new Error("Service IDs must be unique: web, uiDev, sessiond.");
    if (typeof service.label !== "string" || !/^[a-zA-Z0-9][a-zA-Z0-9._-]+$/.test(service.label) || labels.has(service.label)) throw new Error("Service labels must be unique launchd labels.");
    if (typeof service.plist !== "string" || !isAbsolute(service.plist)) throw new Error("Service plist must be an absolute path.");
    const health = service.health;
    if (!health || typeof health.url !== "string" || new URL(health.url).protocol !== "http:") throw new Error("Service health requires an explicit HTTP URL.");
    if (health.socket !== undefined && (typeof health.socket !== "string" || !isAbsolute(health.socket))) throw new Error("Health socket must be an absolute path.");
    if (health.host !== undefined && (typeof health.host !== "string" || /[\r\n]/.test(health.host))) throw new Error("Invalid health Host header.");
    if (typeof health.jsonOk !== "boolean") throw new Error("Specify health.jsonOk: true for JSON {ok:true}, false for an HTTP page.");
    ids.add(service.id); labels.add(service.label);
  }
  if (typeof value.notify !== "string" || !isAbsolute(value.notify)) throw new Error("Plan requires an absolute notification executable path.");
  return value;
}

export function command(commandName, args) {
  const result = spawnSync(commandName, args, { encoding: "utf8", timeout: 120_000, maxBuffer: 4 * 1024 * 1024 });
  return { status: result.status ?? 1, stdout: result.stdout ?? "", stderr: `${result.stderr ?? ""}${result.error ? `\n${result.error.message}` : ""}` };
}

function checked(commandName, args) {
  const result = command(commandName, args);
  if (result.status !== 0) throw new Error(`${commandName} ${args.join(" ")}: ${result.stderr || result.stdout} (exit ${result.status})`);
  return result.stdout;
}

function fingerprint(path) { return createHash("sha256").update(readFileSync(path)).digest("hex"); }

export function preflight(plan, capture = checked) {
  for (const service of plan.services) {
    const plist = JSON.parse(capture("/usr/bin/plutil", ["-convert", "json", "-o", "-", service.plist]));
    if (plist.Label !== service.label || !Array.isArray(plist.ProgramArguments) || plist.ProgramArguments.length === 0) throw new Error(`Service definition does not match plan: ${service.plist}`);
    capture("/bin/launchctl", ["print", `gui/${userInfo().uid}/${service.label}`]);
    const health = capture("/usr/bin/curl", healthArgs(service.health));
    if (service.health.jsonOk && JSON.parse(health).ok !== true) throw new Error(`Health preflight failed: ${service.label}`);
  }
}

function healthArgs(health) {
  return ["--fail", "--silent", "--show-error", "--max-time", "5", ...(health.socket ? ["--unix-socket", health.socket] : []), ...(health.host ? ["-H", `Host: ${health.host}`] : []), health.url];
}

/** Shared lifecycle implementation, with subprocess/state/clock seams for safe tests. */
export async function runRestart(plan, deps) {
  const result = { restart: "running", services: [], notification: "pending" };
  deps.save(result);
  const run = (program, args) => {
    const response = deps.command(program, args);
    deps.log({ program, args, ...response });
    return response;
  };
  let current;
  try {
    for (const id of order) {
      const service = plan.services.find((candidate) => candidate.id === id);
      if (!service) continue;
      current = { label: service.label, state: "restarting" };
      result.services.push(current); deps.save(result);
      const ref = { id, launchdLabel: service.label };
      await restartLaunchdService(ref, {
        domain: deps.domain, plistPath: () => service.plist,
      }, {
        run: (program, args) => run(program, args).status,
        runQuiet: (program, args) => {
          const response = run(program, args);
          if (args[0] === "bootout" && response.status !== 0) throw new Error(`Stop failed for ${service.label} (exit ${response.status}); inspect commands.jsonl before recovery.`);
          return response.status;
        },
        sleep: deps.sleep,
      });
      current.state = "checking"; deps.save(result);
      const unready = await awaitServicesReady([ref], {
        sleep: deps.sleep,
        isServiceRunning: () => {
          const manager = run("/bin/launchctl", ["print", `${deps.domain}/${service.label}`]);
          return manager.status === 0 && /\bstate = running\b/.test(manager.stdout);
        },
        isComponentReady: async () => {
          const probe = run("/usr/bin/curl", healthArgs(service.health));
          if (probe.status !== 0) return false;
          try { return !service.health.jsonOk || JSON.parse(probe.stdout).ok === true; } catch { return false; }
        },
      }, { readinessTimeoutMs: 120_000, readinessIntervalMs: 2_000 });
      if (unready.length > 0) throw new Error(`${service.label} did not become ready. Inspect the command log and service logs before recovery; no automatic retry.`);
      current.state = "ready"; deps.save(result);
    }
    result.restart = "completed";
  } catch (error) {
    result.restart = "failed";
    result.error = error instanceof Error ? error.message : String(error);
    if (current) current.state = "unresolved";
  }
  // Persist service outcome before notification; delivery failure cannot rewrite it.
  deps.save(result);
  const notice = run(plan.notify, [`PI WEB restart ${result.restart}. ${result.error ?? "All planned services passed readiness checks."} Details: ${deps.resultPath}`]);
  result.notification = notice.status === 0 ? "accepted" : "failed";
  deps.save(result);
  return result;
}

export function handoffPlist({ label, packet, delay, log, cwd }) {
  return { Label: label, ProgramArguments: [process.execPath, "--import", require.resolve("tsx"), script, "--run", packet, String(delay)], WorkingDirectory: cwd,
    EnvironmentVariables: { HOME: homedir(), PATH: process.env.PATH ?? "/usr/bin:/bin:/usr/sbin:/sbin" },
    RunAtLoad: true, KeepAlive: false, StandardOutPath: log, StandardErrorPath: log };
}

async function main(args) {
  const [mode, path, seconds] = args;
  if (!["--check", "--schedule", "--run"].includes(mode) || !path || args.length > 3) throw new Error("Usage: node --import tsx scripts/restart-launchd.mjs --check PLAN | --schedule PLAN DELAY_SECONDS (explicit restart approval required)");
  if (process.platform !== "darwin") throw new Error("This maintenance tool is for macOS launchd only.");
  const delay = seconds === undefined ? 0 : Number(seconds);
  if (!Number.isInteger(delay) || delay < 0 || delay > 3600 || (mode === "--schedule" && seconds === undefined)) throw new Error("Specify an integer delay of 0–3600 seconds.");
  const source = JSON.parse(readFileSync(resolve(path), "utf8"));
  if (mode === "--run") {
    const directory = dirname(resolve(path));
    writeFileSync(join(directory, "started"), new Date().toISOString(), { flag: "wx", mode: 0o600 });
    await sleep(delay * 1000);
    const resultPath = join(directory, "result.json");
    const log = (entry) => appendFileSync(join(directory, "commands.jsonl"), JSON.stringify({ at: new Date().toISOString(), ...entry }) + "\n", { mode: 0o600 });
    const save = (result) => {
      writeFileSync(resultPath + ".tmp", JSON.stringify({ ...result, updatedAt: new Date().toISOString() }, null, 2) + "\n", { mode: 0o600 });
      renameSync(resultPath + ".tmp", resultPath);
    };
    try {
      const plan = validatePlan(source.plan);
      for (const service of plan.services) if (fingerprint(service.plist) !== source.fingerprints[service.plist]) throw new Error(`Definition changed since scheduling: ${service.plist}. Nothing restarted.`);
      accessSync(plan.notify, constants.X_OK);
      preflight(plan, (program, args) => {
        const response = command(program, args); log({ program, args, ...response });
        if (response.status !== 0) throw new Error(`${program}: ${response.stderr || response.stdout} (exit ${response.status})`);
        return response.stdout;
      });
    } catch (error) {
      const result = { restart: "failed", error: String(error), notification: "pending" };
      save(result); log({ error: String(error) });
      const response = command(source.plan.notify, [`PI WEB restart preflight failed; nothing restarted. ${String(error)} Details: ${resultPath}`]);
      log({ notification: response }); result.notification = response.status === 0 ? "accepted" : "failed"; save(result);
      process.exitCode = 1;
      return;
    }
    const result = await runRestart(source.plan, { domain: `gui/${userInfo().uid}`, command, sleep, save, log, resultPath });
    if (result.restart !== "completed" || result.notification !== "accepted") process.exitCode = 1;
    // Leave the exited, non-repeating job inspectable; no self-bootout to kill diagnostics.
    return;
  }
  const plan = validatePlan(source);
  accessSync(plan.notify, constants.X_OK);
  preflight(plan);
  console.log(JSON.stringify({ services: order.flatMap((id) => plan.services.filter((s) => s.id === id)), notify: plan.notify }, null, 2));
  if (mode === "--check") { console.log("Definition, loaded-service, notification-executable and health preflights passed; nothing scheduled or restarted."); return; }
  const label = `com.pi-web.maintenance-restart.${randomUUID()}`;
  const directory = join(homedir(), ".local", "state", "pi-web-restarts", label);
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const packet = join(directory, "packet.json");
  writeFileSync(packet, JSON.stringify({ plan, fingerprints: Object.fromEntries(plan.services.map((s) => [s.plist, fingerprint(s.plist)])) }), { mode: 0o600 });
  const plist = join(directory, "job.plist");
  writeFileSync(plist, JSON.stringify(handoffPlist({ label, packet, delay, log: join(directory, "job.log"), cwd: process.cwd() })), { mode: 0o600 });
  checked("/usr/bin/plutil", ["-convert", "xml1", plist]);
  console.log(`Dispatching restart with a ${delay}-second delay; any targeted daemon restart interrupts sessions and terminals. Result: ${join(directory, "result.json")}`);
  console.log(`Inspect job: launchctl print gui/${userInfo().uid}/${label}`);
  console.log(`After inspecting the result, unload the finished job: launchctl bootout gui/${userInfo().uid}/${label}`);
  // Outside LaunchAgents: no reload on login. No interval or KeepAlive retry.
  checked("/bin/launchctl", ["bootstrap", `gui/${userInfo().uid}`, plist]);
  console.log("Dispatch accepted. Inspect the saved outcome; this is not confirmation of restart completion.");
}

if (process.argv[1] && resolve(process.argv[1]) === script) {
  main(process.argv.slice(2)).catch((error) => { console.error(error); process.exitCode = 1; });
}
