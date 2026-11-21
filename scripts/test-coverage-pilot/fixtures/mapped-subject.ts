export interface Input {
  side: "left" | "right";
}

export function mapped(input: Input): string {
  const prefix: string = "🧪";
  if (input.side === "left") {
    return prefix + ":left";
  }
  return prefix + ":right";
}

export function untouched(value: number): number {
  return value * 100;
}
