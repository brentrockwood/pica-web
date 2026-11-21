import { describe, expect, it } from "vitest";
import { choose } from "./subject";

it("unique selected title", () => { expect(choose("left")).toBe("L"); });
it("prefix unique selected title", () => { expect(choose("right")).toBe("R"); });
describe("first suite", () => { it("duplicate leaf", () => { expect(choose("left")).toBe("L"); }); });
describe("second suite", () => { it.skip("duplicate leaf", () => {}); });
it.skip("static skip", () => {});
it("runtime skip", (context) => { context.skip(); });
it("failing case", () => { expect(choose("left")).toBe("wrong"); });
it("retry case", { retry: 1 }, () => { expect(choose("left")).toBe("L"); });
it("repeat case", { repeats: 1 }, () => { expect(choose("left")).toBe("L"); });
it.concurrent("concurrent case", () => { expect(choose("left")).toBe("L"); });
