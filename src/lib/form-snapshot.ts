export function createFormSnapshot(
  values: Iterable<readonly [string, string]>,
  occurredAt: string,
): string {
  return JSON.stringify([Array.from(values), occurredAt]);
}
