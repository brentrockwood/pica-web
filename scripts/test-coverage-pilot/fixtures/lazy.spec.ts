import { expect, it } from "vitest";

it("allows the first instrumented import inside the test body", async () => {
  const { choose } = await import("./subject");
  expect(choose("left")).toBe("L");
});
