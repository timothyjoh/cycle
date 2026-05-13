Plan ready. Output to stdout (engine captures it as PLAN.md).

```markdown
# Implementation Plan: Cycle 0025

## Overview

Stamp `last_cycle_id: "<cycle_id>"` into `failed/<id>.md` frontmatter at the terminal-failure file-move so failed issues are self-describing, and lock in regression coverage for the existing `blocked_by` immediate-predecessor semantics on a 2+ hop chain end-to-end.

## Current State (from Research)

- `src/cli.ts:120-157` `terminalDrain` already calls `mutateFrontmatter(todoPath, fm => ({...fm, failed_at, failed_step?, failed_attempts}))` immediately before `rename(todoPath, failed/<id>.md)`. `cycleId` is already a parameter (line 125), threaded from both `runResumeOnce` (line 288) and the fresh-pop path (line 380). Only the patch object lacks `last_cycle_id`.
- `src/engine/queue.ts` `drainFailedTerminal` only mutates `.cycle/tbd.jsonl`; it does not touch files. SPEC's "in `queue.ts`" phrasing is approximate — terminal-failure file-move + frontmatter stamp live in `cli.ts:terminalDrain`. Plan keeps that separation.
- `src/engine/blocked.ts:42-47` already stamps `blocked_at` + immediate-predecessor `blocked_by` before each rename. BFS frontier walk yields immediate-only by construction.
- `src/engine/frontmatter.ts` `serializeValue` / `needsQuote` quote all-digit strings, so `"0042"` round-trips as string (proven by `origin_cycle_id` round-trip at `tests/engine/frontmatter.test.ts:94-99`).
- `tests/cli/halt.test.ts:237` already runs the end-to-end `A` fails → propagate-blocked `B` path but never asserts on `failed/A.md` body. Cheapest landing spot for the new `last_cycle_id` assertion.
- `tests/engine/blocked.test.ts:111` already covers transitive A→B→C immediacy at the engine layer.
- RFC-001 schema (`docs/RFC-001-issue-lifecycle.md:93`) already lists `last_cycle_id: "0042"`. Only `CLAUDE.md:41` lags.

## Desired End State

- On terminal failure, `failed/<id>.md` frontmatter contains all four fields: `failed_at`, `failed_step`, `failed_attempts`, `last_cycle_id`. `last_cycle_id` equals the cycle id from the matching `cycle.start` event (zero-padded 4-digit string).
- `blocked_at` + immediate-predecessor `blocked_by` semantics unchanged, with a CLI-level regression test driving a 2+ hop chain (`A ← B ← C`) end-to-end.
- `CLAUDE.md:41` queue.ts architecture line enumerates `last_cycle_id` alongside the existing failed-frontmatter fields.
- `npm test`, `npm run typecheck`, and `npm run test:coverage` (≥ 95 / 75 / 90) all pass.

Verify by: `rg "last_cycle_id" src/cli.ts tests/cli/ CLAUDE.md`, run halt E2E test, inspect a fixture `failed/A.md`.

## What We're NOT Doing

- No change to `propagateBlocked` behavior or `blocked/<id>.md` frontmatter shape — already correct.
- No migration / backfill of existing `failed/*.md` files in-tree.
- No new event shapes in `log.jsonl`.
- No move of the frontmatter-stamp call from `cli.ts:terminalDrain` into `queue.ts` — SPEC prose says `queue.ts`, but the actual stamp lives in `cli.ts`; moving it would expand scope and shuffle the queue.ts ↔ cli.ts file-move boundary. We resolve the SPEC's wording in favor of the smallest correct diff and document the location in CLAUDE.md.
- No `last_cycle_id` stamping anywhere else (success move, blocked move, queue rows).
- No README.md changes — not user-facing CLI surface.
- No new helper, no new exports.

## Implementation Approach

Single-field frontmatter patch in `terminalDrain`. One CLI E2E test extension to assert all four failed-frontmatter fields on the existing fixture, one new CLI E2E test for the 2+ hop blocked-by chain. CLAUDE.md doc update. No new modules, no signature changes.

Built as two vertical slices: slice 1 ships the stamp + extends the existing halt test for failed-frontmatter assertions; slice 2 adds the blocked-chain regression test. Slice 1 is the load-bearing change; slice 2 is pure coverage.

---

## Task 1: Stamp `last_cycle_id` on terminal-failure move and assert end-to-end

### Overview

Add `last_cycle_id: cycleId` to the existing `mutateFrontmatter` patch in `terminalDrain`. Extend the existing halt E2E to assert every failed-frontmatter field, including the new one, with `last_cycle_id` cross-checked against the matching `cycle.start` event.

### Changes Required

**File**: `src/cli.ts`
**Changes**: Add `last_cycle_id: cycleId` to the patch object at lines 132–137. One-line addition inside the existing `mutateFrontmatter` callback.

```ts
await mutateFrontmatter(todoPath, (fm) => ({
  ...fm,
  failed_at: new Date().toISOString(),
  ...(failingStep ? { failed_step: failingStep } : {}),
  failed_attempts: failedAttempts,
  last_cycle_id: cycleId,
}));
```

No signature changes — `cycleId: string` is already in scope.

**File**: `tests/cli/halt.test.ts`
**Changes**: In the existing test at line 237 ("propagateBlocked moves dependent to blocked/ when parent fails…"), after the `failedFiles` assertion (line 256), add:

```ts
const failedBody = await readFile(join(root, "docs/cycle/issues/failed/A.md"), "utf8");
const cycleStart = events.find((e) => e.event === "cycle.start") as Record<string, unknown>;
const cycleId = cycleStart.cycle_id as string;
assert.match(failedBody, /^failed_at: /m);
assert.match(failedBody, /^failed_step: verify/m);
assert.match(failedBody, /^failed_attempts: 1/m);
assert.match(failedBody, new RegExp(`^last_cycle_id: "${cycleId}"$`, "m"));
```

`cycleId` from `cycle.start` is the source of truth — asserting `last_cycle_id` equals that value (rather than hard-coding `"0001"`) keeps the test resilient to cycle-id allocation drift between runs and locks in the SPEC's "value equals the `cycle_id` emitted in the matching `cycle.start`" requirement.

**File**: `CLAUDE.md` (line 41, the `queue.ts` architecture line)
**Changes**: Update the enumeration of frontmatter fields stamped on terminal failure from `failed_at`/`failed_step`/`failed_attempts` to include `last_cycle_id`. Replace the substring `stamps \`failed_at\`/\`failed_step\`/\`failed_attempts\` into the file's frontmatter` with `stamps \`failed_at\`/\`failed_step\`/\`failed_attempts\`/\`last_cycle_id\` into the file's frontmatter`.

### Success Criteria

- [ ] `npm run typecheck` passes with no new warnings.
- [ ] `npm test` passes; the extended halt test asserts all four failed-frontmatter fields.
- [ ] `failed/A.md` body shows `last_cycle_id: "0001"` (or whatever value `cycle.start` recorded), quoted as string.
- [ ] `CLAUDE.md` line 41 includes `last_cycle_id`.

---

## Task 2: CLI E2E regression for 2+ hop `blocked_by` immediacy

### Overview

Add a sibling test in `tests/cli/halt.test.ts` that drives a 3-node chain `A ← B ← C` through the CLI binary, fails `A`, and asserts each dependent's `blocked_by` lists only its immediate predecessor. Engine-level coverage at `tests/engine/blocked.test.ts:111` already exists; this is the E2E counterpart the SPEC's acceptance criteria asks for and proves the contract holds through the real drain path, not just the engine helper.

### Changes Required

**File**: `tests/cli/halt.test.ts`
**Changes**: Add a new `test(...)` block after the existing `halt: propagateBlocked …` case (after line 268). Bootstrap the same fixture shape, seed `A` (no deps), `B` (depends on A), `C` (depends on B), fail `A` via `verifyScript(["A"])`, run the binary, then assert:

```ts
const blockedFiles = (await readdir(join(root, "docs/cycle/issues/blocked"))).sort();
assert.deepEqual(blockedFiles, ["B.md", "C.md"]);
const b = await readFile(join(root, "docs/cycle/issues/blocked/B.md"), "utf8");
const c = await readFile(join(root, "docs/cycle/issues/blocked/C.md"), "utf8");
assert.match(b, /^blocked_by: \[A\]$/m);
assert.match(c, /^blocked_by: \[B\]$/m);
assert.match(b, /^blocked_at: /m);
assert.match(c, /^blocked_at: /m);
const propagated = events.find((e) => e.event === "queue.propagate_blocked") as Record<string, unknown>;
assert.deepEqual((propagated.blocked as string[]).sort(), ["B", "C"]);
```

Reuse the existing `bootstrapRepo`, `seedTodo`, `workflowYml`, `verifyScript`, `readEvents` helpers — no new helpers.

`max_consecutive_failures: 2` with `max_cycle_attempts: 1` matches the existing pattern in the propagateBlocked test on line 241 and ensures `A`'s single failure terminally drains and triggers propagation without halting the engine (B and C never run because they're moved to blocked/ before being popped).

### Success Criteria

- [ ] New test passes alongside existing halt tests.
- [ ] `blocked/B.md` shows exactly `blocked_by: [A]` — not `[A, B]`, not transitive.
- [ ] `blocked/C.md` shows exactly `blocked_by: [B]`.
- [ ] `queue.propagate_blocked` event lists both `B` and `C` in its `blocked` array.
- [ ] No `engine.halted` event (one terminal failure, threshold 2).

---

## Testing Strategy

### Unit Tests

- No new engine-unit test needed: the existing `tests/engine/frontmatter.test.ts:94-99` `origin_cycle_id: "0042"` round-trip case already covers the `last_cycle_id` string-quoting path. They are the same code path through `serializeValue` / `needsQuote`.
- No new `propagateBlocked` engine-unit test: `tests/engine/blocked.test.ts:111` (transitive A→B→C) and `:135` (diamond) already encode the immediate-predecessor contract at the engine layer. Task 2 adds the CLI counterpart that the SPEC's "regression test" requirement calls for.
- Mocking: none. Prefer the existing real-fs / real-spawn fixture pattern.

### Integration / E2E Tests

- Task 1 extends the existing `tests/cli/halt.test.ts:237` halt+propagate test to assert all four failed-frontmatter fields including `last_cycle_id` cross-referenced against the `cycle.start` event. This is the load-bearing E2E gate.
- Task 2 adds a sibling CLI E2E for the 3-node chain `A ← B ← C` to lock in `blocked_by` immediacy end-to-end.

### Coverage

- `last_cycle_id` line in `terminalDrain` is exercised by both halt-test scenarios (the existing propagate test + the new chain test). The new branch coverage is nil — `last_cycle_id: cycleId` is unconditional.
- `npm run test:coverage` expected: stays at-or-above current 97.14 / 90.64 / 96.21 baseline. No new branches in product code; new test code adds covered lines.
- Report exact post-change numbers in `BUILD.md` / `FIX.md`.

## Risk Assessment

- **SPEC says `queue.ts`; code lives in `cli.ts`**: Resolved — keep the stamp in `cli.ts:terminalDrain` (preserves queue.ts = jsonl / cli.ts = file moves separation). RESEARCH already flagged this and recommended option (a). Documented in CLAUDE.md update so future readers don't grep `queue.ts` looking for the stamp.
- **`mutateFrontmatter` serialize failure dropping `last_cycle_id`**: Existing failed-frontmatter fields already share this fallback (see `src/cli.ts:138-152` — emits `queue.drain_warning` and continues the rename). `last_cycle_id` inherits the same behavior. Acceptable per SPEC ("preserved with current semantics") and per RESEARCH open question 3.
- **Cycle-id allocation drift**: The new test reads `cycle.start`'s `cycle_id` instead of hard-coding `"0001"`, so if `allocateCycleId` ever changes its first-allocation behavior, the test still passes as long as the two values match.
- **YAML quoting regression**: `needsQuote` quotes all-digit strings, so `last_cycle_id: "0042"` round-trips as string. Already covered by `tests/engine/frontmatter.test.ts:94-99` for the structurally identical `origin_cycle_id`. No new helper coverage needed.
- **Resume path missed**: Both call sites — fresh-pop (`src/cli.ts:380`) and resume (`src/cli.ts:288`) — go through the same `terminalDrain` function, so the stamp lands on both paths. No call-site-specific work needed.
```
