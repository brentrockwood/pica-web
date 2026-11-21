export type Choice = "left" | "right";

export function nativeOnly(choice: Choice): string {
  if (choice === "left") {
    return "native:left";
  }
  return "native:right";
}

export function untouched(): string {
  return "never";
}
