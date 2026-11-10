import { vi } from "vitest";

/** Color conversion is browser-owned; happy-dom does not implement Canvas 2D. */
export function mockMermaidCanvas(): void {
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(() => {
    const context = {
      fillStyle: "#000000",
      clearRect: () => undefined,
      fillRect: () => undefined,
      getImageData: () => ({ data: new Uint8ClampedArray([
        ...[1, 3, 5].map((offset) => parseInt(context.fillStyle.slice(offset, offset + 2), 16)), 255,
      ]) }),
    };
    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- Only the Canvas 2D operations used by theme conversion need a test implementation.
    return context as unknown as CanvasRenderingContext2D;
  });
}
