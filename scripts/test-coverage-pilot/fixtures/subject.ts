type Direction =
  | "left"
  | "right";

export function importOnly() { return "import"; }
export function setupOnly() { return "setup"; }
export function teardownOnly() { return "teardown"; }
export function choose(direction: Direction) {
  if (direction === "left") return "L";
  return "R";
}
export async function asynchronous() {
  await Promise.resolve();
  return "async";
}
export function throws() { throw new Error("fixture failure"); }
importOnly();
