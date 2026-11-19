import { describe, expect, it, vi } from "vitest";
import { handoffPlist, preflight, runRestart, validatePlan } from "./restart-launchd.mjs";

const service = (id) => ({ id, label: `test.${id}`, plist: `/tmp/${id}.plist`, health: { url: "http://127.0.0.1/health", jsonOk: true } });
const plan = { services: [service("sessiond"), service("uiDev"), service("web")], notify: "/test/notify" };

function harness({ failBootstrap = false, failStop = false, notifyFails = false, unhealthy = false } = {}) {
  const calls = [];
  const states = new Map(plan.services.map((s) => [s.label, "running"]));
  const saves = [];
  const logs = [];
  const deps = {
    domain: "gui/501", resultPath: "/private/result.json",
    sleep: vi.fn(() => Promise.resolve()),
    save: (state) => saves.push(structuredClone(state)),
    log: (entry) => logs.push(entry),
    command: (program, args) => {
      calls.push([program, ...args]);
      if (program === plan.notify) return { status: notifyFails ? 1 : 0, stdout: "", stderr: notifyFails ? "notification unavailable" : "" };
      if (program === "/usr/bin/curl") return { status: 0, stdout: JSON.stringify({ ok: !unhealthy }), stderr: "" };
      const action = args[0];
      const label = args[1]?.split("/").at(-1);
      if (action === "bootout") {
        if (failStop) return { status: 1, stdout: "", stderr: "Permission denied" };
        states.set(label, "unloading");
      }
      if (action === "print") {
        const state = states.get(label);
        if (state === "unloading") { states.set(label, "absent"); return { status: 0, stdout: "state = exiting", stderr: "" }; }
        return { status: state === "absent" ? 113 : 0, stdout: "state = running", stderr: "" };
      }
      if (action === "bootstrap") {
        const id = args[2].split("/").at(-1).replace(".plist", "");
        if (failBootstrap) return { status: 5, stdout: "", stderr: "Bootstrap failed: 5: Input/output error" };
        expect(states.get(`test.${id}`)).toBe("absent");
        states.set(`test.${id}`, "running");
      }
      return { status: 0, stdout: "", stderr: "" };
    },
  };
  return { deps, calls, saves, logs };
}

describe("detached launchd maintenance restart", () => {
  it("uses the shared unload wait and verifies web/client before touching the daemon", async () => {
    const h = harness();
    const result = await runRestart(plan, h.deps);
    expect(result).toMatchObject({ restart: "completed", notification: "accepted" });
    expect(h.deps.sleep).toHaveBeenCalledWith(250);
    expect(h.calls.filter((c) => c[1] === "bootout").map((c) => c[2])).toEqual(["gui/501/test.web", "gui/501/test.uiDev", "gui/501/test.sessiond"]);
    const daemonStop = h.calls.findIndex((c) => c[1] === "bootout" && c[2].endsWith("sessiond"));
    expect(h.calls.slice(0, daemonStop).filter((c) => c[0] === "/usr/bin/curl")).toHaveLength(2);
    expect(h.saves.at(-2)).toMatchObject({ restart: "completed", notification: "pending" });
  });

  it("retains bootstrap stderr and unresolved state without restarting later services or retrying", async () => {
    const h = harness({ failBootstrap: true });
    const result = await runRestart(plan, h.deps);
    expect(result).toMatchObject({ restart: "failed", services: [{ label: "test.web", state: "unresolved" }], notification: "accepted" });
    expect(h.logs.some((line) => line.status === 5 && line.stderr.includes("Input/output error"))).toBe(true);
    expect(h.calls.filter((c) => c[1] === "bootstrap")).toHaveLength(1);
    expect(h.calls.filter((c) => c[1] === "bootout")).toHaveLength(1);
    expect(h.calls.at(-1)[1]).toContain("/private/result.json");
  });

  it("does not mistake a failed stop for a successful restart of the old healthy process", async () => {
    const h = harness({ failStop: true });
    expect(await runRestart(plan, h.deps)).toMatchObject({ restart: "failed" });
    expect(h.calls.some((c) => c[1] === "kickstart" || c[1] === "bootstrap")).toBe(false);
  });

  it("does not touch the daemon when web readiness fails", async () => {
    const h = harness({ unhealthy: true });
    expect(await runRestart(plan, h.deps)).toMatchObject({ restart: "failed", services: [{ label: "test.web", state: "unresolved" }] });
    expect(h.calls.filter((c) => c[1] === "bootout")).toHaveLength(1);
  });

  it("reports notification failure without overwriting a successful restart", async () => {
    const h = harness({ notifyFails: true });
    expect(await runRestart(plan, h.deps)).toMatchObject({ restart: "completed", notification: "failed" });
    expect(h.logs.at(-1).stderr).toBe("notification unavailable");
  });

  it("rejects duplicate roles and mismatched service definitions before changing services", () => {
    expect(() => validatePlan({ ...plan, services: [service("web"), service("web")] })).toThrow("unique");
    const capture = vi.fn(() => JSON.stringify({ Label: "wrong", ProgramArguments: ["node"] }));
    expect(() => preflight(plan, capture)).toThrow("does not match");
    expect(capture).toHaveBeenCalledTimes(1);
  });

  it("checks current health before admitting a restart", () => {
    const capture = vi.fn((program) => program === "/usr/bin/plutil"
      ? JSON.stringify({ Label: "test.web", ProgramArguments: ["node"] }) : program === "/usr/bin/curl" ? '{"ok":false}' : "loaded");
    expect(() => preflight({ ...plan, services: [service("web")] }, capture)).toThrow("Health preflight failed");
  });

  it("creates a one-shot manager-owned worker without inherited PI WEB session state", () => {
    const job = handoffPlist({ label: "test.restart", packet: "/private/packet.json", delay: 15, log: "/private/job.log", cwd: "/checkout" });
    expect(job).toMatchObject({ KeepAlive: false, RunAtLoad: true });
    expect(job).not.toHaveProperty("StartInterval");
    expect(job.EnvironmentVariables).not.toHaveProperty("PI_WEB_SESSION");
    expect(job.ProgramArguments.slice(-3)).toEqual(["--run", "/private/packet.json", "15"]);
  });
});
