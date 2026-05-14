Cycle 0042 context loaded. Resolving the four RESEARCH open questions and emitting plan to stdout.

```markdown
# Implementation Plan: Cycle 0042

## Overview
Add an optional `--priority N` (integer 1..10, default 3) flag to `cycle drop` so the priority on freeform issues is set at drop time instead of via post-hoc frontmatter edits. Thread the value from `parseArgs` through `materializeFreeformIssue` so it lands in the rendered `raw/<id>.md` frontmatter.

## Current State (from Research)
- `parseArgs(argv)` returns `RunArgs | DropArgs`. The `drop` branch is hand-rolled positional-only parsing at `src/cli/parse-args.ts:17-22`; the `run` branch already uses `node:util parseArgs` at `src/cli/parse-args.ts:26-33`.
- `DropArgs` = `{ command: "drop"; text: string }` — no flags today (`src/cli/parse-args.ts:10-13`).
- CLI dispatches drop at `src/cli.ts:68-72`, calling `materializeFreeformIssue(args.text, cwd)`, then logging one JSON line on stdout and exiting 0. Drop runs **before** logger init / `engine.start`, so no `.cycle/log.jsonl` writes happen.
- `materializeFreeformIssue(text, repoRoot, now = new Date())` hard-codes `"priority: 3"` at `src/issue/materialize.ts:17`. Frontmatter is an array-joined fixed-order list (lines 10-22) pinned by `tests/issue/materialize.test.ts:21-29`.
- Tests use Node's built-in `node:test` with `node:assert/strict`. `tests/cli/parse-args.test.ts:29` asserts the `drop` shape via `deepEqual` — adding a `priority` field requires updating that expectation.
- Spawn pattern for CLI end-to-end: `tests/cli/status.test.ts:172-177` — `spawnSync(process.execPath, [join(process.cwd(), "dist/cycle.js"), ...], { cwd: root, ... })`. `pretest` builds `dist/cycle.js` automatically.
- `README.md:104` is the single documented `drop` example. `CLAUDE.md` Commands table does not list `drop` (confirmed by grep) — no row to update.
- No `priority` consumer exists in `src/engine/triage.ts` / `src/engine/queue.ts` today; the field is advisory metadata that persists into the file.

## Desired End State
- `cycle drop "<text>" [--priority N]` writes `docs/cycle/issues/raw/<id>.md` whose YAML frontmatter contains `priority: N` (or `priority: 3` when the flag is omitted).
- `--priority` accepts only `Number.isInteger(N) && 1 <= N <= 10`. Anything else exits non-zero with a stderr message naming the flag and the `1..10` range.
- Flag order is insignificant: both `cycle drop --priority 7 "foo"` and `cycle drop "foo" --priority 7` succeed.
- Success stdout remains exactly one line `{"event":"issue.dropped","issue_id":"…","path":"…"}`.
- README `drop` example surfaces `--priority` once with the default and range.
- `npm test` green, `npm run typecheck` clean, coverage not regressed against the master baseline (line ≥ 95%, branch ≥ 75%, function ≥ 90%).

Verify by running `cycle drop "foo" --priority 7` against a fresh temp repo and inspecting the resulting frontmatter, plus the test suite below.

## What We're NOT Doing
- No `--priority` flag on `cycle run` (the second `materializeFreeformIssue` call site at `src/cli.ts:78` is left alone).
- No `priority` consumer changes — triage / queue do not yet read this field.
- No general `--help` framework, banner, or usage-text infra beyond the parse-error message required by SPEC.
- No bundling with the sibling `cli-drop-writes-to-raw-status-command` issue.
- No `priority` field added to triage's `tbd.jsonl` row schema.
- No `priority_hint` reflection-prompt changes (`src/engine/reflection.ts` / `src/defaults/prompts/reflection.md`).

## Implementation Approach
Switch the `drop` branch in `parseArgs` to `node:util parseArgs` with `allowPositionals: true`, mirroring the `run` branch precedent. This is the right call for four reasons surfaced in RESEARCH §Open Questions:
1. **Parser strategy** — `node:util parseArgs` already handles positional + flag interleaving natively; the hand-rolled `argv.slice(1).join(" ").trim()` cannot.
2. **Order-of-positional-vs-flag** — `allowPositionals: true` covers both orders with no extra logic.
3. **Integer + range validation** — done inside `parseArgs` immediately after `nodeParseArgs` returns, so `DropArgs.priority: number` is fully validated on return. One throw site, one error shape.
4. **Missing-value semantics** — wrap `nodeParseArgs`'s native error in a try/catch and re-throw with the same usage string used for range errors, so every `--priority` failure exits with one consistent message.

`DropArgs` becomes `{ command: "drop"; text: string; priority: number }`. The CLI dispatch at `src/cli.ts:69` forwards `args.priority` as the new fourth arg to `materializeFreeformIssue`. `materializeFreeformIssue` gets a defaulted fourth parameter `priority: number = 3` so the existing run-branch call at `src/cli.ts:78` (and any other internal caller) stays source-compatible.

The implementation is one vertical slice: parser + materialize + CLI + tests + docs all ship together so the test suite is end-to-end green at every commit boundary inside the cycle.

---

## Task 1: Thread `priority` through `materializeFreeformIssue`

### Overview
Add a defaulted `priority` parameter to the materialize helper so it can write a caller-supplied value into the frontmatter. Default preserves the current `priority: 3` behavior for all existing callers.

### Changes Required
**File**: `src/issue/materialize.ts`
**Changes**: Add a fourth parameter and template the priority line.

```ts
export async function materializeFreeformIssue(
  text: string,
  repoRoot: string,
  now: Date = new Date(),
  priority: number = 3,
) {
  const id = freeformId(text, now);
  const dir = join(repoRoot, "docs", "cycle", "issues", "raw");
  await mkdir(dir, { recursive: true });
  const path = join(dir, `${id}.md`);
  const frontmatter = [
    "---",
    `id: ${id}`,
    "source: text",
    `title: "${text.replace(/"/g, '\\"')}"`,
    `added_at: ${now.toISOString()}`,
    "triage_attempts: 0",
    `priority: ${priority}`,
    "---",
    "",
    text,
    "",
  ].join("\n");
  await writeFile(path, frontmatter, "utf8");
  return { path, id };
}
```

No defensive validation here — `parseArgs` is the authoritative validator. Internal callers passing the default keep working unchanged.

### Success Criteria
- [ ] `npm run typecheck` clean.
- [ ] Existing `tests/issue/materialize.test.ts` continues to pass unchanged (default still writes `priority: 3`).
- [ ] New test (Task 4) confirms an explicit `priority: 7` round-trips to the frontmatter.

---

## Task 2: Validate `--priority` in `parseArgs`

### Overview
Switch the `drop` branch to `node:util parseArgs` with `allowPositionals: true`, parse `--priority` as a string, validate integer + range, and surface a single consistent error message for every failure mode (range, non-integer, non-numeric, missing value).

### Changes Required
**File**: `src/cli/parse-args.ts`
**Changes**: Update `DropArgs` and rewrite the drop branch.

```ts
export type DropArgs = {
  command: "drop";
  text: string;
  priority: number;
};

// ... inside parseArgs:

if (argv[0] === "drop") {
  let values: Record<string, unknown>;
  let positionals: string[];
  try {
    ({ values, positionals } = nodeParseArgs({
      args: argv.slice(1),
      options: {
        priority: { type: "string" },
      },
      allowPositionals: true,
    }));
  } catch (err) {
    // Wrap node:util parseArgs's native "option requires argument" / unknown-option
    // error so drop has one consistent failure shape.
    throw new Error(
      `drop: ${(err as Error).message} (usage: cycle drop "<text>" [--priority N]; N is an integer 1..10, default 3)`,
    );
  }

  const text = positionals.join(" ").trim();
  if (!text) throw new Error("drop requires task text");

  let priority = 3;
  if (values.priority !== undefined) {
    const raw = String(values.priority);
    const n = Number(raw);
    if (!/^-?\d+$/.test(raw) || !Number.isInteger(n) || n < 1 || n > 10) {
      throw new Error(
        `drop: --priority must be an integer 1..10 (got "${raw}"); usage: cycle drop "<text>" [--priority N]`,
      );
    }
    priority = n;
  }

  return { command: "drop", text, priority };
}
```

Notes:
- The `/^-?\d+$/` regex rejects `"3.5"` and `"high"` cleanly before `Number(...)` rounds or returns `NaN`. `Number.isInteger` is a defense-in-depth check.
- The wrap of `nodeParseArgs`'s error catches the `--priority` (no value), unknown-option, and shorthand-misuse cases with one message.
- Throwing matches the existing convention: CLI does not catch `parseArgs` exceptions, so the process exits non-zero and the message lands on stderr via Node's uncaught-exception default. Confirmed by existing tests at `tests/cli/parse-args.test.ts:33,37` that use the same `throws` pattern and by the CLI's lack of a try/catch around `parseArgs(argv)` at `src/cli.ts:65`.

### Success Criteria
- [ ] `npm run typecheck` clean (`DropArgs.priority: number` propagates through the union).
- [ ] All existing parser tests pass (after Task 4 updates `tests/cli/parse-args.test.ts:29` to include `priority: 3`).
- [ ] New parser tests in Task 4 cover default, both flag orders, boundaries (1 and 10), and every rejection mode.

---

## Task 3: Forward `priority` from the CLI dispatch and update docs

### Overview
Pass the validated `priority` into `materializeFreeformIssue` from the `drop` dispatch in `src/cli.ts`. Leave the `run`-text dispatch (line 78) untouched per SPEC §Out of Scope. Update README's single `drop` example.

### Changes Required
**File**: `src/cli.ts`
**Changes**: Forward `args.priority` to the materialize call.

```ts
if (args.command === "drop") {
  const { id, path } = await materializeFreeformIssue(args.text, cwd, new Date(), args.priority);
  console.log(JSON.stringify({ event: "issue.dropped", issue_id: id, path }));
  process.exit(0);
}
```

Pass `new Date()` explicitly so the call site reads cleanly with the fourth arg; the helper's default for `now` is identical, so behavior is unchanged.

**File**: `README.md` (around line 104)
**Changes**: Add a one-line variant showing `--priority`, e.g.:

```sh
./.cycle/bin/cycle.js drop "investigate why checkout retries twice"
./.cycle/bin/cycle.js drop "investigate why checkout retries twice" --priority 7
```

Mention default `3` and range `1..10` in one trailing sentence. Do not introduce new sections.

**File**: `CLAUDE.md` — no change. Confirmed by grep that the Commands table does not list `cycle drop`, and SPEC says skip if not present.

### Success Criteria
- [ ] `npm run typecheck` clean.
- [ ] `dist/cycle.js` (rebuilt by `pretest`) emits `priority: 5` in the raw file when invoked as `cycle drop "x" --priority 5` against a fresh repo.
- [ ] README diff is two lines + one explanatory sentence; no new section headers.

---

## Task 4: Tests

### Overview
Unit tests for both layers plus one end-to-end spawn test exercising the real CLI binary. Tests are written alongside the implementation in the same cycle.

### Changes Required

**File**: `tests/cli/parse-args.test.ts`
- Update existing `drop <text>` assertion (currently line 27-30) to include `priority: 3`:
  ```ts
  assert.deepEqual(r, { command: "drop", text: "queue this task", priority: 3 });
  ```
- Add tests:
  - `drop "foo" --priority 7` → `{ command: "drop", text: "foo", priority: 7 }`.
  - `drop --priority 7 "foo"` (flag before text) → same shape.
  - Boundary: `--priority 1` and `--priority 10` accepted.
  - Reject: `--priority 0`, `--priority 11`, `--priority 3.5`, `--priority high`, all via `assert.throws(..., /must be an integer 1\.\.10/)`.
  - Reject: `--priority` with no following value, via `assert.throws(..., /drop:/)` (catches the wrapped node:util parseArgs error).

**File**: `tests/issue/materialize.test.ts`
- Keep the existing test unchanged (asserts default `priority: 3`).
- Add a second test for explicit priority:
  ```ts
  test("writes explicit priority into frontmatter when supplied", async () => {
    const root = await mkdtemp(join(tmpdir(), "cycle-test-"));
    try {
      const { path } = await materializeFreeformIssue(
        "fix login bug", root, new Date("2026-05-12T10:30:00Z"), 7,
      );
      const body = await readFile(path, "utf8");
      assert.match(body, /^priority: 7$/m);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
  ```
  Reads back the file, asserts the frontmatter line, not just the return value (per SPEC §Testing Strategy).

**File**: `tests/cli/drop-priority.test.ts` (new)
- One spawn-based end-to-end test using the pattern from `tests/cli/status.test.ts:172-177`:
  ```ts
  const bin = join(process.cwd(), "dist/cycle.js");
  const root = await mkdtemp(join(tmpdir(), "cycle-drop-priority-"));
  const result = spawnSync(process.execPath, [bin, "drop", "foo", "--priority", "5"], {
    cwd: root, env: process.env, encoding: "utf8",
  });
  assert.equal(result.status, 0);
  // stdout: single JSON line with event/issue_id/path
  const out = JSON.parse(result.stdout.trim());
  assert.equal(out.event, "issue.dropped");
  // on-disk frontmatter has priority: 5
  const body = await readFile(out.path, "utf8");
  assert.match(body, /^priority: 5$/m);
  ```
- Cleanup via `rm({ recursive: true, force: true })` in `finally`.
- `pretest` already rebuilds `dist/cycle.js`, so no extra build step is needed in the test itself.

### Success Criteria
- [ ] `npm test` green, including the new e2e test.
- [ ] `npm run test:coverage` reports line ≥ 95%, branch ≥ 75%, function ≥ 90% (no regression vs. master baseline).
- [ ] No existing test was deleted or weakened; the frontmatter-pin test still locks the six-field order with `priority: 3` as the default.

---

## Testing Strategy

### Unit Tests
- **Parser** (`tests/cli/parse-args.test.ts`): full table covering default, flag-after-text, flag-before-text, boundaries (1, 10), rejection (0, 11, 3.5, "high", missing value). No mocks — `parseArgs` is pure.
- **Materialize** (`tests/issue/materialize.test.ts`): default-priority test stays; new explicit-priority test reads back the on-disk file to verify the frontmatter line, not just the return value. Uses the existing `mkdtemp` / `rm` cleanup pattern — no fs mocking.

### Integration / E2E Tests
- **CLI end-to-end** (`tests/cli/drop-priority.test.ts`): `spawnSync` against the real `dist/cycle.js` binary, asserts both the success-path stdout JSON shape and the on-disk frontmatter contents. Uses a temp directory; no monkeypatching, no shell wrappers. `pretest` script handles the build automatically — confirmed by the existing `tests/cli/status.test.ts:169-177` test that spawns the same binary.

Anti-mock note: there is nothing worth mocking here. The parser is synchronous and pure, the materializer touches a temp directory, and the e2e test runs the real binary. No subprocess shims, no fs stubs.

## Risk Assessment
- **Tests pinning the old `DropArgs` shape break loudly**: `tests/cli/parse-args.test.ts:29` uses `deepEqual` with the no-priority shape. Mitigation: explicitly call out in Task 4 — the assertion has to be updated in the same diff, or `deepEqual` reports an extra-keys mismatch.
- **Frontmatter pin breaks if the priority line moves**: `tests/issue/materialize.test.ts:21-29` locks the full six-field block with `priority: 3` at the fixed position. Mitigation: we keep the line in exactly the same position, only template the numeric literal. The existing test continues to pass; the new explicit-priority test uses `assert.match(/^priority: 7$/m)` so it does not double-lock position.
- **`node:util parseArgs` rejecting unknown flags**: switching the drop branch to `nodeParseArgs` will reject unknown flags (e.g. `cycle drop "foo" --bogus`), where the old hand-rolled parser silently absorbed `--bogus` into the positional string. Mitigation: this is an intentional improvement (now consistent with the `run` branch), and SPEC's stdout contract is unchanged on success. If any existing caller relies on `--`-prefixed tokens inside drop text, they need to be quoted — flag in the README example if surface-visible (it is not today).
- **CYCLE_BASE / branch-mode tests unaffected**: `cycle drop` exits at line 72 before any logger / branch logic runs. No risk to engine resume, queue, or triage code paths.
- **Coverage drop from added branches**: the new validation has three new branches (range fail, regex fail, missing value). All three are exercised by Task 4 tests, so coverage should not regress; verify with `npm run test:coverage`.
```

Plan emitted to stdout. Open questions all resolved: drop branch switches to `node:util parseArgs` with `allowPositionals`; integer + range validation lives inside `parseArgs` so `DropArgs.priority` is fully validated on return; missing-value and unknown-flag errors are wrapped to a single consistent message; one-line usage hint is embedded in the parse-error string (no new help system).
