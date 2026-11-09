import { join } from "node:path";
import { expect, it } from "vitest";
import { testEnvironment } from "./test-fork-update.mjs";

it("isolates live Pi, MCP, PI WEB, and Git configuration without clearing the nested-session marker", () => {
  const inherited = {
    PATH: "/tools", HOME: "/live", PI_CODING_AGENT_DIR: "/live/agent",
    PI_WEB_SESSION: "1", PI_WEB_CONFIG: "/live/config.json", PI_WEB_PORT: "8504",
    PI_WEB_SESSIOND_PORT: "8505", PI_WEB_PI_PACKAGE_DIR: "/old/pi",
    GIT_CONFIG_GLOBAL: "/live/gitconfig", npm_config_ignore_scripts: "true",
  };
  const isolated = testEnvironment(inherited, "/isolated");
  expect(isolated).toMatchObject({
    PATH: "/tools", HOME: "/isolated", PI_WEB_SESSION: "1",
    PI_CODING_AGENT_DIR: join("/isolated", "agent"),
    PI_WEB_CONFIG: join("/isolated", "config.json"),
    PI_WEB_DATA_DIR: join("/isolated", "data"),
    PI_WEB_SESSIOND_SOCKET: join("/isolated", "sessiond.sock"),
    GIT_CONFIG_NOSYSTEM: "1", npm_config_ignore_scripts: "false",
  });
  expect(isolated.GIT_CONFIG_GLOBAL).not.toBe(inherited.GIT_CONFIG_GLOBAL);
  for (const key of ["PI_WEB_PORT", "PI_WEB_SESSIOND_PORT", "PI_WEB_PI_PACKAGE_DIR"]) expect(isolated).not.toHaveProperty(key);
  expect(inherited.HOME).toBe("/live");
});
