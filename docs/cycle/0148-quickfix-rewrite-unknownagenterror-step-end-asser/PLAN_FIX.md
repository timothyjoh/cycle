Need write permission to create the plan file. Please approve, then I'll write `docs/cycle/0148-quickfix-rewrite-unknownagenterror-step-end-asser/PLAN.md`.

Here's the plan summary while you decide:

**Fix** — `tests/engine/run-cycle.test.ts:1588`

Replace:
```ts
assert.match(log, /"event":"step.end","cycle_id":"0001","step":"bogus","status":"failed","exit_code":-1/);
```
With structural JSON assertions:
1. Add import: `resolveAgent, UnknownAgentError` from `../../src/engine/exec.ts`
2. Add module-level `findStepEnd` helper (identical to `run-cycle.step-end-stderr-dispatch.test.ts:51`)
3. Before `runCycle`, call `resolveAgent("made-up")` in try/catch to capture `expectedStderr`
4. Replace the regex assert with:
   ```ts
   const stepEndParsed = findStepEnd(log, "bogus");
   assert.equal(stepEndParsed.status, "failed");
   assert.equal(stepEndParsed.exit_code, -1);
   assert.equal(stepEndParsed.stderr, expectedStderr);
   ```

**Test** — same test `"step with unregistered agent fails the step and ends the cycle"` now explicitly verifies `stderr` key contains the `UnknownAgentError` message for agent `"made-up"`, matching the convention in the dispatch test file.
