import { afterEach, beforeEach, expect, it } from "vitest";
import { asynchronous, choose, setupOnly, teardownOnly, throws } from "./subject";

beforeEach(() => { setupOnly(); });
afterEach(() => { teardownOnly(); });
it.each(["left", "right"] as const)("chooses %s", (direction) => {
  expect(choose(direction)).toBe(direction === "left" ? "L" : "R");
});
it("awaits asynchronous work", async () => { expect(await asynchronous()).toBe("async"); });
it.fails("records thrown test bodies", () => { throws(); });
it.skip("does not fabricate evidence for skipped tests", () => { choose("left"); });
if (process.env.PER_TEST_NEGATIVE === "1") {
  it.concurrent("rejects concurrent attribution", () => { choose("left"); });
}
