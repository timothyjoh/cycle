import { test } from "node:test";
import assert from "node:assert/strict";
import { recordTerminalFailure } from "../../src/engine/halt-accounting.ts";

test("recordTerminalFailure: each path increments by one and appends one entry", () => {
  // commit-failure path
  const commit = recordTerminalFailure(
    { consecutiveFailures: 0, failedCycles: [] },
    { cycleId: "0001", issueId: "iss-a", failingStep: "commit", maxConsecutiveFailures: 99 },
  );
  assert.equal(commit.consecutiveFailures, 1);
  assert.deepEqual(commit.failedCycles, ["0001"]);

  // fast-bail path (resolved step) continuing from the commit result
  const fastBail = recordTerminalFailure(
    { consecutiveFailures: commit.consecutiveFailures, failedCycles: commit.failedCycles },
    { cycleId: "0002", issueId: "iss-b", failingStep: "build", maxConsecutiveFailures: 99 },
  );
  assert.equal(fastBail.consecutiveFailures, 2);
  assert.equal(fastBail.failedCycles.length, 2);
  assert.deepEqual(fastBail.failedCycles, ["0001", "0002"]);

  // budget-exhausted path (resolved step) continuing again
  const budget = recordTerminalFailure(
    { consecutiveFailures: fastBail.consecutiveFailures, failedCycles: fastBail.failedCycles },
    { cycleId: "0003", issueId: "iss-c", failingStep: "verify", maxConsecutiveFailures: 99 },
  );
  assert.equal(budget.consecutiveFailures, 3);
  assert.equal(budget.failedCycles.length, 3);
  assert.deepEqual(budget.failedCycles, ["0001", "0002", "0003"]);
});

test("recordTerminalFailure: does not mutate the input failedCycles array", () => {
  const input = Object.freeze(["0001"]) as readonly string[];
  const result = recordTerminalFailure(
    { consecutiveFailures: 1, failedCycles: input },
    { cycleId: "0002", issueId: "iss", failingStep: "build", maxConsecutiveFailures: 99 },
  );
  // input untouched (frozen array would throw on mutation), result is a new ref
  assert.deepEqual(input, ["0001"]);
  assert.notEqual(result.failedCycles, input);
  assert.deepEqual(result.failedCycles, ["0001", "0002"]);
});

test("recordTerminalFailure: lastHaltContext carries per-path failingStep", () => {
  const commit = recordTerminalFailure(
    { consecutiveFailures: 0, failedCycles: [] },
    { cycleId: "c", issueId: "iss-a", failingStep: "commit", maxConsecutiveFailures: 99 },
  );
  assert.deepEqual(commit.lastHaltContext, { issueId: "iss-a", failingStep: "commit" });

  const resolved = recordTerminalFailure(
    { consecutiveFailures: 0, failedCycles: [] },
    { cycleId: "c", issueId: "iss-b", failingStep: "build", maxConsecutiveFailures: 99 },
  );
  assert.deepEqual(resolved.lastHaltContext, { issueId: "iss-b", failingStep: "build" });

  const undef = recordTerminalFailure(
    { consecutiveFailures: 0, failedCycles: [] },
    { cycleId: "c", issueId: "iss-c", failingStep: undefined, maxConsecutiveFailures: 99 },
  );
  assert.deepEqual(undef.lastHaltContext, { issueId: "iss-c", failingStep: undefined });
});

test("recordTerminalFailure: always resets fastFail to { key: null, count: 0 }", () => {
  for (const failingStep of ["commit", "build", undefined]) {
    const r = recordTerminalFailure(
      { consecutiveFailures: 5, failedCycles: ["x"] },
      { cycleId: "c", issueId: "iss", failingStep, maxConsecutiveFailures: 99 },
    );
    assert.deepEqual(r.fastFail, { key: null, count: 0 });
  }
});

test("recordTerminalFailure: halt only once the count reaches the threshold", () => {
  // threshold 2: first failure stays below, second crosses
  const first = recordTerminalFailure(
    { consecutiveFailures: 0, failedCycles: [] },
    { cycleId: "0001", issueId: "iss", failingStep: "build", maxConsecutiveFailures: 2 },
  );
  assert.equal(first.consecutiveFailures, 1);
  assert.equal(first.halt, false);

  const second = recordTerminalFailure(
    { consecutiveFailures: first.consecutiveFailures, failedCycles: first.failedCycles },
    { cycleId: "0002", issueId: "iss", failingStep: "build", maxConsecutiveFailures: 2 },
  );
  assert.equal(second.consecutiveFailures, 2);
  assert.equal(second.halt, true);
});

test("recordTerminalFailure: below-threshold terminal failure reports no halt", () => {
  const r = recordTerminalFailure(
    { consecutiveFailures: 1, failedCycles: ["0001"] },
    { cycleId: "0002", issueId: "iss", failingStep: "verify", maxConsecutiveFailures: 3 },
  );
  assert.equal(r.consecutiveFailures, 2);
  assert.equal(r.halt, false);
});

test("recordTerminalFailure: threshold 1 halts after a single terminal failure", () => {
  const r = recordTerminalFailure(
    { consecutiveFailures: 0, failedCycles: [] },
    { cycleId: "0001", issueId: "iss", failingStep: "commit", maxConsecutiveFailures: 1 },
  );
  assert.equal(r.consecutiveFailures, 1);
  assert.equal(r.halt, true);
});
