let cached: string | undefined;
export function fillCache() { return "cached"; }
export function cachedValue() { return cached ??= fillCache(); }
export function backgroundOnly() { return "background"; }
export async function startDeferred(gate: Promise<void>) {
  await gate;
  return backgroundOnly();
}
