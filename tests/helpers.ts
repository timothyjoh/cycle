import { strict as assert } from "node:assert";

export function expectExactlyOne<T>(
  events: T[],
  eventName: string,
): T {
  const matches = events.filter((e) => (e as Record<string, unknown>).event === eventName);
  assert.equal(matches.length, 1, `expected exactly one "${eventName}" event, got ${matches.length}`);
  return matches[0];
}
