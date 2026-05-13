Now write PLAN.md to stdout. Output below.

```markdown
# Implementation Plan: Cycle 0015

## Overview
Land `src/engine/triage.ts` as the engine's authoritative `raw/ → todo/` pipeline. Spawn the configured triage agent, validate its JSON output, atomically apply queue mutations with per-raw retry up to 3 attempts, and wire it into `cli.ts` at engine.start and between cycles. Retire `scanRaw`'s raw→todo move.

## Current State (from Research)
- `scanRaw` (`src/engine/scan.ts:11`) is the only current path that moves `raw/*.md → todo/*.md` and appends a `QueueRow`. Called once from `cli.ts:51`.
- `loadConfig` (`src/engine/workflow.ts:37`) already validates `triage: { agent, prompt, max_turns }` and exposes it on `CycleConfig`.
- Subprocess template (`src/engine/exec-claudecode.ts:11`) uses `spawn("claude", [...], { shell: false, env: buildChildEnv(env) })` — triage mirrors this shape.
- Queue primitives (`readQueue`, `writeQueue`, `appendRow`) and `bootstrapArchiveIfLegacy` live in `src/engine/queue.ts`. `popNextPending` is a linear top-down scan — ordering rewrite directly controls pop order.
- `parseFrontmatter` / `serializeFrontmatter` / `mutateFrontmatter` cover all frontmatter I/O. Type is `Record<string, string | number | string[]>` — no nested objects.
- `materializeFreeformIssue` seeds `triage_attempts: 0` in every `raw/<id>.md` (`src/issue/materialize.ts:16`) — the counter triage increments on retry.
- Tests stub external binaries by prepending a temp `bin/` dir with a chmodded fake script (`tests/engine/exec-claudecode.test.ts:11-20`).
- Integration tests boot `git init` + `.cycle/workflows.yml` + `spawnSync("node", [dist, "run", ...])` (`tests/cli/queue-drain.test.ts:16-36`).
- `src/defaults/workflows.yml:5-8` already declares `triage: { agent: claudecode, prompt: prompts/triage.md, max_turns: 10 }`; `prompts/triage.md` does not exist yet.
- `scripts/sync-defaults.mjs` recursively copies `src/defaults/prompts/` into `.cycle/prompts/` — new files ride along automatically.

## Desired End State
- `src/engine/triage.ts` exports `runTriage(repoRoot, cfg, log, deps?)` and is the only writer that moves files out of `raw/`.
- `src/defaults/prompts/triage.md` exists; `npm run sync-defaults` surfaces `.cycle/prompts/triage.md`.
- `src/cli.ts` calls `runTriage` at engine.start (after legacy archive check) and between cycles in the pop loop when `raw/` is non-empty; `scanRaw` is removed (legacy archive call inlined into `runTriage`'s entry).
- `tbd.jsonl` ordering is rewritten per `ordering[]` after every triage pass: `in_progress` rows first (unchanged order), then `pending` rows in agent-supplied order, then any pending rows the agent omitted (with a `triage.warning` log per omission).
- Log emits `triage.start`, `triage.raw.ok`, `triage.raw.failed`, `triage.warning`, `triage.end`. On whole-pass failure, also `engine.paused` with `reason: "triage_failed"`; `cli.ts` exits 1.
- Coverage stays at line ≥ 95%, branch ≥ 75%, function ≥ 90%.

Verification:
- `npm test` (137 → ~150+) all green.
- `npm run typecheck` clean apart from the documented pre-existing `findLast` errors.
- `npm run sync-defaults` produces `.cycle/prompts/triage.md`.
- Integration test exercises stubbed claudecode end-to-end and asserts on-disk artifacts + log events.

## What We're NOT Doing
- Resume-from-`log.jsonl` semantics (BB-5).
- `propagateBlocked` rewrite or `max_consecutive_failures` halt counter (BB-6 — current single-failure halt stays).
- Reflection step (BB-7).
- Multi-agent abstraction: only `agent: claudecode` is dispatched; `cfg.triage.agent !== "claudecode"` throws.
- Smarter `depends_on` inference — only what the agent emits is honored.
- Modifying `runCycle` or anything downstream of `popNextPending`.
- Rewriting `--dry-run` semantics beyond the explicit decision recorded below (dry-run skips triage).

## Implementation Approach

Three vertical slices, each shippable on its own with passing tests:

1. **Slice 1 — Pure triage module + unit tests.** Build `triage.ts` against an injected `execTriageAgent` callback and a stubbed log/filesystem. No `cli.ts` wiring yet. This isolates the JSON validator, retry loop, atomic-apply, and `ordering[]` rewrite under unit-test microscopes.
2. **Slice 2 — Wire into cli.ts + retire scanRaw.** Replace the `scanRaw(cwd)` call with `runTriage(cwd, cfg, log)`; add the second trigger inside the pop loop when `raw/` is non-empty; delete `scanRaw` (and `tests/engine/scan.test.ts`), inline `bootstrapArchiveIfLegacy` into the triage entry. Add the default prompt file and verify `sync-defaults`.
3. **Slice 3 — Integration test with stubbed claudecode + docs.** Drive the bundled `dist/cycle.js` against a fake `claude` binary on PATH and assert raw-decomposes-into-two-todo end-to-end. Update `CLAUDE.md` architecture line.

### Resolved Open Questions

- **scanRaw retention.** Delete `src/engine/scan.ts` and `tests/engine/scan.test.ts`. `bootstrapArchiveIfLegacy` is called once at the top of `runTriage` (idempotent — returns false when already archived). The current `scanRaw` is purely a passthrough shim and BB-4 makes it dead code; preserving a "thin guard" creates an empty husk nobody calls.
- **engine.paused exit wiring.** `runTriage` returns `{ status: "ok" | "paused" | "empty"; processed: string[]; failed: string[] }`. `cli.ts` branches on `status === "paused"` → emit `engine.stop({status: "halted"})` and `process.exit(1)`. `runTriage` itself emits the `engine.paused` event so the failure detector and the emitter are colocated.
- **Atomic-apply rollback semantics.** Apply order per successful raw: (A) write `todo/<id>.md` via tmp+rename, (B) `appendRow` to `tbd.jsonl`, (C) `rename(raw/<id>.md → done/<id>_raw.md)`. Failures: A fails → nothing to roll back; B fails → `unlink(todo/<id>.md)`, surface error; C fails → `unlink(todo/<id>.md)` AND `writeQueue` filtering the just-added row, surface error. Raw file is therefore never moved until both the todo file and queue row are durable. This matches SPEC §Requirements ("leave the raw file in place and surface the error").
- **Test stub seam.** Unit tests inject `execTriageAgent` via a `deps` parameter (`runTriage(repoRoot, cfg, log, { execTriageAgent? })`). Integration test stubs the real `claude` binary by prepending a temp `bin/` dir with a chmodded shell script that prints the canned JSON — same pattern as `tests/engine/exec-claudecode.test.ts:11-20`.
- **`ordering[]` validation strictness.** `ordering[]` must contain (a) every `pending` row id present before triage that is not in `decomposed_parents[]`, and (b) every new child id from `children[]`. Children ids must be unique within the batch and must not collide with any existing pending or in-progress row id. If an agent-emitted `ordering[]` omits a known pending row, the row is appended at the end and a `triage.warning` event is logged. Extra ids in `ordering[]` (not from `children[]` and not in current pending) → validator error → retry.
- **Empty `raw/`.** `runTriage` returns `{ status: "ok", processed: [], failed: [] }` when `raw/` is missing or empty. Emits `triage.start` then `triage.end` with `processed: 0`. No `engine.paused`.
- **Dry-run interaction.** `--dry-run` skips triage entirely. Rationale: agent spawn is side-effectful (writes `todo/<id>.md`, moves files, mutates queue) and the dry-run branch's purpose is reading queue rows without state mutation. Dry-run reports whatever the current `tbd.jsonl` already has.

---

## Task 1: Default triage prompt template

### Overview
Create the prompt template that the spawned agent consumes. The prompt describes inputs (raw bodies, current `tbd.jsonl`, `todo/` listing) and the required JSON output shape.

### Changes Required

**File**: `src/defaults/prompts/triage.md` (new)

Content shape (~80 lines):
- Role framing ("you are the triage agent…").
- Inputs section: explicit placeholders `{{RAWS_BLOCK}}`, `{{TBD_JSONL}}`, `{{TODO_LISTING}}`, `{{RETRY_FEEDBACK}}` — `triage.ts` substitutes these at render time.
- Output contract: JSON only, exact schema, field-by-field requirements (`id == raw_id + "-" + slug`, `workflow` must match a `workflows[].name`, `depends_on` is array of ids, etc.).
- Rules: parent decomposition vs enrich-only, allowed reordering of pending rows, no touching `in_progress` rows.
- Example output JSON block.

### Success Criteria
- [ ] File exists at `src/defaults/prompts/triage.md`.
- [ ] `npm run sync-defaults` produces `.cycle/prompts/triage.md` with identical bytes.
- [ ] No code references `prompts/triage.md` yet (filled in by Task 2 / 4).

---

## Task 2: `src/engine/triage.ts` core module

### Overview
Pure, dependency-injectable module that does everything triage does except wire into `cli.ts`. Built first under unit tests, then consumed by Task 4.

### Changes Required

**File**: `src/engine/triage.ts` (new)

Exports:
```ts
export type TriageDeps = {
  execTriageAgent?: (prompt: string, cfg: TriageConfig, repoRoot: string) =>
    Promise<{ exitCode: number; stdout: string; stderr: string }>;
};

export type TriageResult = {
  status: "ok" | "paused" | "empty";
  processed: string[];
  failed: string[];
};

export async function runTriage(
  repoRoot: string,
  cfg: CycleConfig,
  log: Logger,
  deps?: TriageDeps,
): Promise<TriageResult>;
```

Internal pieces:

1. **`execClaudecodeTriage(prompt, cfg, repoRoot)`** — default exec impl. Mirrors `exec-claudecode.ts`: `spawn("claude", ["-p", prompt], { cwd: repoRoot, env: buildChildEnv({}), shell: false })`, resolve on `close`. Throws on `cfg.triage.agent !== "claudecode"` with message `"unsupported triage agent: <name>"`.

2. **`loadRaws(repoRoot)`** — `mkdir -p raw/`, `readdir`, filter `.md`, read+parse each, return `{ id, body, fm, srcPath, attempts: Number(fm.triage_attempts ?? 0) }[]`.

3. **`renderPrompt(template, raws, queueRows, todoListing, retryFeedback)`** — read `.cycle/prompts/triage.md`, substitute placeholders. `retryFeedback` is empty on first attempt, otherwise the validator error string prefixed by `"PREVIOUS ATTEMPT FAILED VALIDATION:\n"`.

4. **`validateOutput(rawStdout, raws, queueRows): { ok: true; parsed: TriageOutput } | { ok: false; reason: string }`** —
   - Parse JSON; reject with `"stdout is not valid JSON: <msg>"`.
   - `ordering` is array of strings.
   - `children` is array; every entry has `raw_id: string`, `slug: string`, `id: string`, `title: string`, `workflow: string`, `depends_on: string[]`, `body: string`. Reject specific missing/wrong-type field with `"children[i].<field>: expected <type>, got <actual>"`.
   - `id === ` raw_id + "-" + slug` invariant.
   - `workflow` ∈ `cfg.workflows.map(w => w.name)`.
   - `decomposed_parents: string[]`, each ∈ `raws.map(r => r.id)`.
   - Children ids unique within batch.
   - Children ids do not collide with any existing pending or in_progress row id in `queueRows`.
   - `ordering[]` is a permutation containing all (currentPendingIds − decomposedParents) ∪ childrenIds. Missing entries → warning at apply time (not validator error). Extra entries that match nothing → validator error.

5. **`applyOne(repoRoot, child, srcRawPath)`** — atomic per-raw apply.
   - Write `todo/<id>.md` via tmp+rename, with serialized frontmatter: `id, parent (if child.id !== raw_id), title, workflow, depends_on, triaged_at: new Date().toISOString(), source: fm.source ?? "triage"`. Body is `child.body`.
   - On Step A failure: throw.
   - `appendRow(repoRoot, { id, parent, title, status: "pending", attempt: 0, depends_on, triaged_at })`.
   - On Step B failure: `unlink(todo/<id>.md)`, rethrow.
   - For the parent raw: only the last child for that raw triggers the `rename(raw/<id>.md → done/<id>_raw.md)`. (Or simpler: rename happens once per `raw_id` after all its children are applied — see `processOneRaw` below.)
   - On Step C failure: roll back this child (unlink todo + writeQueue filter) AND every prior child of the same raw, rethrow.

6. **`processOneRaw(repoRoot, raw, parsed, log)`** — for one raw_id:
   - All children whose `raw_id === raw.id` are applied sequentially via `applyOne` with rename held back.
   - After all children land, `rename(raw/<id>.md → done/<id>_raw.md)`.
   - On any error mid-flight: roll back applied children for this raw (unlink + queue filter), increment `raw.fm.triage_attempts` via `mutateFrontmatter`, emit `triage.raw.failed { raw_id, attempt, reason }`, return failure.

7. **`runTriage` outer loop:**
   - Emit `triage.start { count: raws.length }`.
   - Call `bootstrapArchiveIfLegacy` once.
   - If `raws.length === 0`: emit `triage.end { processed: 0 }`, return `{ status: "ok", processed: [], failed: [] }`.
   - Read `queueRows = await readQueue(repoRoot)`, `todoListing = readdir(todo/)`.
   - For each raw: up to 3 attempts. On each attempt, render prompt with previous error feedback, call `execTriageAgent`, validate, apply. Track success/failure per raw. After 3 failures, move `raw/<id>.md → failed/<id>.md` with `triage_attempts: 3` and `failed_at: <iso>`, `failed_step: "triage"`.
   - After all raws: rewrite `tbd.jsonl` per agent's last successful `ordering[]` if any raw succeeded. Ordering rewrite:
     - In-progress rows first (current order preserved).
     - Pending rows in `ordering[]` order; rows omitted by the agent are appended at the end (one `triage.warning { reason: "ordering_omitted", id }` per omission).
   - If `failed.length === raws.length && raws.length > 0`: emit `engine.paused { reason: "triage_failed" }`, return `{ status: "paused", processed, failed }`.
   - Else: emit `triage.end { processed, failed }`, return `{ status: "ok", processed, failed }`.

### Success Criteria
- [ ] `npm run typecheck` passes (no new errors).
- [ ] Unit tests cover schema validator per-field, retry feedback injection, 3-attempt move to `failed/`, partial-failure rollback, ordering rewrite, empty-raw path. (See Task 3.)
- [ ] Module exports the documented public surface.
- [ ] No `cli.ts` consumer yet — module is dead code at this point (will be wired in Task 4).

---

## Task 3: Unit tests for `triage.ts`

### Overview
Stand up the test file before Task 4 wires triage into `cli.ts`. Inject the `execTriageAgent` dep with canned responses.

### Changes Required

**File**: `tests/engine/triage.test.ts` (new)

Test scenarios (each uses `mkdtemp` + `try/finally`):

1. **Happy path, decompose.** `raw/parent.md` with `triage_attempts: 0`. Fake exec returns `{children: [{raw_id: "parent", slug: "a", id: "parent-a", ...}, {raw_id: "parent", slug: "b", id: "parent-b", ...}], ordering: ["parent-a","parent-b"], decomposed_parents: ["parent"]}`. Assert: `todo/parent-a.md` and `todo/parent-b.md` exist with correct frontmatter, `done/parent_raw.md` exists, `tbd.jsonl` has both rows in order, log has `triage.start` + `triage.end` + per-raw.ok.

2. **Happy path, enrich-only.** Single raw, single child with `id === raw_id`. Assert: one `todo/<id>.md`, `done/<id>_raw.md` exists, queue has one new row.

3. **Reordering preserves in-progress.** Pre-seed `tbd.jsonl` with one `in_progress` row + one `pending` row. Add one raw; agent emits `ordering` listing new id first, then existing pending. Assert: in-progress stays at top, then new id, then existing pending.

4. **Ordering omission → warning + append.** Agent's `ordering[]` skips an existing pending row. Assert: omitted row is appended to queue tail; `triage.warning { reason: "ordering_omitted", id }` is logged.

5. **Validator failure → retry feeds error back.** First exec returns JSON missing `depends_on`. Second exec returns valid JSON. Spy on `execTriageAgent` and assert: second invocation's prompt contains the literal `"PREVIOUS ATTEMPT FAILED VALIDATION:"` prefix and the specific error reason string. `triage_attempts` written back to raw frontmatter as `1` before success.

6. **3-attempt exhaustion, partial pass.** Raw A always returns invalid JSON; raw B succeeds on first try. Assert: A ends in `failed/A.md` with `triage_attempts: 3`, `failed_at`, `failed_step: "triage"`. B ends in `todo/B.md`. No `engine.paused`. Return `{ status: "ok", processed: ["B"], failed: ["A"] }`.

7. **Whole-pass failure.** Single raw, always invalid JSON. Assert: `failed/A.md` with `triage_attempts: 3`, `engine.paused` event emitted, return `{ status: "paused", processed: [], failed: ["A"] }`.

8. **Empty raw/.** Empty directory. Assert: `{ status: "ok", processed: [], failed: [] }`; `triage.start` and `triage.end` both logged; no exec call.

9. **Atomic apply rollback — appendRow failure.** Inject a `deps.execTriageAgent` returning valid JSON, but pre-seed `.cycle/tbd.jsonl` as a directory (or chmod 0 on the cycle dir post-`mkdir`) to force append failure. Assert: `todo/<id>.md` does not exist after rollback; raw still in `raw/`; queue unchanged.

10. **Atomic apply rollback — raw rename failure.** Decompose into 2 children; first applies fine; second-child apply succeeds; rename `raw → done/_raw` fails (chmod 0 on `done/` parent). Assert: both children removed from `todo/` and queue; raw still in `raw/`; `triage.raw.failed` emitted; retry counter incremented.

11. **Unsupported agent.** `cfg.triage.agent = "codex"`. Assert: `runTriage` throws `"unsupported triage agent: codex"`.

### Success Criteria
- [ ] All 11 scenarios pass under `npm test`.
- [ ] Module-level coverage for `triage.ts`: line ≥ 95%, branch ≥ 75%, function ≥ 90%.
- [ ] No test invokes a real `claude` binary.

---

## Task 4: Wire triage into `cli.ts` and retire `scanRaw`

### Overview
Replace the `scanRaw(cwd)` call with `runTriage`, add the between-cycle trigger, delete `src/engine/scan.ts` + `tests/engine/scan.test.ts`. `bootstrapArchiveIfLegacy` is now invoked by `runTriage` itself.

### Changes Required

**File**: `src/cli.ts`

- Remove `import { scanRaw } from "./engine/scan.ts";`.
- Add `import { runTriage } from "./engine/triage.ts";`.
- Replace line 51 (`await scanRaw(cwd)`) with:
  ```ts
  if (!args.dryRun) {
    const cfg = await loadConfig(cwd);
    const triageResult = await runTriage(cwd, cfg, log);
    if (triageResult.status === "paused") {
      await log.emit("engine.stop", {
        status: "halted",
        dry_run: false,
        cycles_processed: 0,
        reason: "triage_failed",
      });
      process.exit(1);
    }
  }
  ```
- Inside the `while (true)` pop loop, **before** `popNextPending`, add a between-cycle trigger:
  ```ts
  // Re-triage between cycles if new raws arrived
  try {
    const rawListing = await readdir(join(cwd, "docs/cycle/issues/raw"));
    if (rawListing.some((f) => f.endsWith(".md"))) {
      const cfgForTriage = await loadConfig(cwd);
      const r = await runTriage(cwd, cfgForTriage, log);
      if (r.status === "paused") {
        halted = { issueId: "", failingStep: "triage" };
        break;
      }
    }
  } catch {
    // raw/ missing — fine, skip
  }
  ```
  (Add `readdir` to the `node:fs/promises` import.)
- In the dry-run branch, do nothing new — triage already skipped above; `readQueue` of the existing `tbd.jsonl` is the dry-run contract.
- Remove now-unused imports if any.

**File**: `src/engine/scan.ts` — delete.

**File**: `tests/engine/scan.test.ts` — delete. Any behavior worth preserving has already migrated into `tests/engine/triage.test.ts` (dedup is now schema-uniqueness validation; legacy-archive is exercised through the empty-raw happy path).

**File**: `src/defaults/workflows.yml` — already has the `triage:` block. No change.

**File**: `package.json` — no change.

### Success Criteria
- [ ] `npm run typecheck` clean.
- [ ] `npm test` — all existing tests still pass.
- [ ] No source file references `scan.ts` or `scanRaw`.
- [ ] `cli.ts` calls `runTriage` exactly twice: pre-loop and between cycles.
- [ ] Dry-run path does not invoke triage.

---

## Task 5: Integration test — `dist/cycle.js` end-to-end with fake `claude` binary

### Overview
Boot a fresh git sandbox, drop a raw issue with `cycle drop`, stage a fake `claude` binary on PATH that prints canned JSON, run the engine in dry-run, and assert the on-disk shape after triage.

### Changes Required

**File**: `tests/cli/triage.test.ts` (new)

Test outline:
- `mkdtemp` sandbox; `git init -b main`; `git config user.email/name`.
- Write `.cycle/workflows.yml` from inline template (one workflow named `feature` with a single trivial bash step so triage doesn't have to wire a real cycle; the test runs in `--dry-run` mode).
- Write `.cycle/prompts/triage.md` (copy from `src/defaults/prompts/triage.md`).
- `mkdir docs/cycle/issues/{raw,todo,done,failed,blocked}`.
- Drop one raw using `spawnSync(node, [distPath, "drop", "implement feature X"], { cwd })`.
- Write a fake `claude` script at `<tmp>/bin/claude`, `chmod 0o755`, body:
  ```sh
  #!/usr/bin/env bash
  cat <<'JSON'
  {
    "ordering": ["<raw_id>-decompose-a","<raw_id>-decompose-b"],
    "children": [
      {"raw_id":"<raw_id>","slug":"decompose-a","id":"<raw_id>-decompose-a","title":"A","workflow":"feature","depends_on":[],"body":"A body"},
      {"raw_id":"<raw_id>","slug":"decompose-b","id":"<raw_id>-decompose-b","title":"B","workflow":"feature","depends_on":["<raw_id>-decompose-a"],"body":"B body"}
    ],
    "decomposed_parents": ["<raw_id>"]
  }
  JSON
  ```
  (The `<raw_id>` substitution happens via reading the materialized file's frontmatter and rewriting the script before `chmod`.)
- `spawnSync(node, [distPath, "run", "--dry-run"], { env: { ...process.env, PATH: tmpBin + ":" + process.env.PATH } })`.
- Assert: `todo/<id>-decompose-a.md` and `todo/<id>-decompose-b.md` exist with correct frontmatter; `done/<id>_raw.md` exists; `tbd.jsonl` has two rows in the agent-supplied order; `log.jsonl` contains `triage.start`, `triage.raw.ok`, `triage.end`, `engine.start`, `engine.stop`.

Note: dry-run currently skips triage per Task 4 — invert this test to use the `run` command without `--dry-run` and stub a workflow whose only step is `echo ok` so the cycle returns immediately.

Actually adjust: drop a single raw whose triage produces a single trivial child whose `workflow: feature` runs a one-step `bash` workflow `echo ok`. The test asserts on triage artifacts and ignores cycle outcome.

### Success Criteria
- [ ] Test passes deterministically across 3 consecutive runs.
- [ ] No reliance on the real `claude` binary being installed.
- [ ] Asserts both file shape and `log.jsonl` events.

---

## Task 6: Documentation

### Overview
Update `CLAUDE.md` architecture line. RFC §5 already documents the design; add an implementation-note line per RFC §12 if the pattern is in use elsewhere.

### Changes Required

**File**: `CLAUDE.md`

- Under "Architecture quick reference":
  - Add a line: `Triage subroutine: src/engine/triage.ts spawns the agent in workflows.yml > triage to convert raw/ drops into todo/ items. Wired at engine.start and between cycles. Per-raw retry up to 3 attempts; whole-pass failure emits engine.paused.`
  - Update the line about "Issue state machine" to drop the `scanRaw` reference (no longer the entry point).

**File**: `BUILD.md` (produced by build step, not edited here).

**File**: `docs/RFC-001-issue-lifecycle.md`

- Append to §5 a single line: `Implemented in cycle 0015.` (matches the precedent style used by BB-1/BB-2/BB-3 cycles if present; otherwise skip per SPEC §Documentation Updates wording "if precedent exists").

### Success Criteria
- [ ] CLAUDE.md mentions `triage.ts` and removes stale `scanRaw` references.
- [ ] RFC §5 reflects implementation status (only if precedent exists; otherwise leave untouched).
- [ ] No README change.

---

## Testing Strategy

### Unit Tests (`tests/engine/triage.test.ts`)
All 11 scenarios listed in Task 3. Key principles:
- Inject `execTriageAgent` via `deps` arg — no real `claude` invocation.
- Build real filesystems via `mkdtemp`; do not mock `fs`.
- Build real `tbd.jsonl` files and assert on their parsed contents (real `readQueue`).
- Build real frontmatter and parse it back (real `parseFrontmatter`).
- Use a sink-backed `createLogger(repoRoot, sink)` for log assertions.

### Integration Test (`tests/cli/triage.test.ts`)
End-to-end via `spawnSync(node, [distPath, "run", ...])` against a sandboxed repo with a fake `claude` binary on PATH. Reuses the queue-drain test scaffolding patterns.

### Mocking Boundary
Only mock: the `claude` subprocess itself, via PATH-prepended fake binary (integration) or `deps.execTriageAgent` (unit). All filesystem, frontmatter, and queue operations use real implementations.

### Coverage Targets
- `triage.ts` standalone: ≥ 95% line, ≥ 75% branch, ≥ 90% function.
- Project total: same baseline holds (line ≥ 95%, branch ≥ 75%, function ≥ 90%).
- Net delta: `scan.ts` deletion removes ~50 lines of covered code; `triage.ts` adds ~250 lines. New tests must cover the delta. Report in `BUILD.md`.

## Risk Assessment

- **Risk: agent JSON is non-deterministic and tests are flaky.** Mitigation: all tests use canned JSON. The validator is fully deterministic given the input string.
- **Risk: removing `scanRaw` breaks an unknown caller.** Mitigation: `grep -r scanRaw src/ tests/ docs/` before commit — only `cli.ts:6,51` and `tests/engine/scan.test.ts` reference it. Both removed in Task 4.
- **Risk: `bootstrapArchiveIfLegacy` is called twice per engine start (once in `runTriage`, once inside the between-cycle loop).** Mitigation: function is idempotent — checks for legacy lines and no-ops when none remain.
- **Risk: between-cycle trigger fires before queue stabilizes if a previous cycle left files in `raw/`.** Mitigation: `runTriage` reads `raw/` fresh each call; nothing else writes to `raw/` mid-cycle except `cycle drop` (out-of-band).
- **Risk: partial-failure rollback leaves orphan files.** Mitigation: rollback is best-effort with try/catch; orphan `todo/<id>.md` files are guarded by `appendRow` failing first (Step B before Step C). Test scenarios 9/10 cover both failure modes.
- **Risk: ordering rewrite races with in-flight `markInProgress` writes.** Mitigation: triage runs strictly between cycles, never concurrent with `runCycle`. Single-process engine.
- **Risk: prompt template placeholder substitution drifts from prompt file content.** Mitigation: placeholders are exact tokens (`{{RAWS_BLOCK}}`, `{{TBD_JSONL}}`, `{{TODO_LISTING}}`, `{{RETRY_FEEDBACK}}`); `renderPrompt` errors loudly if a token is missing from the template.
- **Risk: `cfg.triage.agent !== "claudecode"` accidentally triggers a no-op fallback.** Mitigation: explicit throw with a clear message; covered by test scenario 11.
- **Risk: Fake claude script is non-portable.** Mitigation: bash shebang + `chmod 0o755` is the existing pattern in `tests/engine/exec-claudecode.test.ts:11-20` and runs on Linux + macOS CI matrices.
```
