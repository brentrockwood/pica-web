import { expect, it } from "vitest";
import { choose } from "./subject";

it("runtime skip", (context) => { context.skip(); });
it("after runtime skip", () => { expect(choose("left")).toBe("L"); });
it("configured retry", { retry: 1 }, () => { expect(choose("right")).toBe("R"); });
