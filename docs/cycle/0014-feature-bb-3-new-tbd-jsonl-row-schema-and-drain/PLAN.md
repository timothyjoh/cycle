```markdown
# Implementation Plan: Cycle 0014 — BB-3 tbd.jsonl Drain-Queue Schema & Semantics

## Overview
Replace the legacy inbox-shaped `tbd.jsonl` with a live drain-queue (RFC-001 §6).
Engine pops rows, runs cycles, then mutates the queue on `cycle.end`: success
removes the row and moves the todo file to `done/`; transient failure bumps
`attempt`; terminal failure removes the row, moves the file to `failed/` with
failure frontmatter, and calls `propagateBlocked(stub)`. Engine reads `workflow:`
from the popped todo's frontmatter. Legacy `tbd.jsonl` is archived once at
bootstrap.

## Current State (from Research)
- `scan.ts` writes legacy `TbdEntry = {id, source, title, path, added_at}` to
  `.cycle/tbd.jsonl`; dedup by id set (`src/engine/scan.ts:1-75`).
- `cli.ts` drain loop calls `scanRaw` → iterates ingested → `runCycle` per issue;
  halts on first failure; no per-cycle queue mutation (`src/cli.ts:47-71`).
- `runCycle` takes `workflow` name from `RunCycleOpts`, allocates `cycleId`
  internally, emits `cycle.start/end`, then a `finally` block runs
  `checkoutBase`+`pullBase` (`src/engine/run-cycle.ts:29-91`).
- `loadWorkflow` returns `Workflow.max_cycle_attempts` (typed; default not enforced)
  (`src/engine/workflow.ts:13-71`).
- `init.ts` creates `failed/` already; no work needed.
- Inline `parseFrontmatter` lives only in `scan.ts:6-15`; no shared helper.
- `materializeFreeformIssue` does NOT emit `workflow:` frontmatter
  (`src/issue/materialize.ts:10-22`).

## Desired End State
- `src/engine/queue.ts` is the single authority for `.cycle/tbd.jsonl` read/write.
- `scanRaw` emits new-schema rows directly (`status: "pending"`, `attempt: 0`,
  `depends_on: []`, `triaged_at: added_at`).
- `cli.ts` loop: `scanRaw` (ingest into queue) → loop `popNext` → pre-allocate
  `cycleId` → `markInProgress` → `runCycle({cycleId, workflow})` → drain on
  `cycle.end` result.
- Bootstrap archives any legacy `.cycle/tbd.jsonl` to `.cycle/tbd.jsonl.bootstrap-archive`
  on first start; idempotent.
- New `src/engine/frontmatter.ts` with parse / serialize / mutate; `scan.ts`
  refactored to use it; queue terminal-failure path uses `mutate` to append
  `failed_at`, `failed_step`, `failed_attempts`.
- New `src/engine/blocked.ts` exporting `propagateBlocked(repoRoot, queue, failedId)`
  as a no-op-on-empty-deps stub.
- `runCycle` accepts optional `cycleId`; falls back to `allocateCycleId` when
  absent (preserves test ergonomics).
- All existing tests pass; new tests added; coverage holds line ≥95%, branch ≥75%,
  func ≥90%.

Verify: `npm test` green; `npm run typecheck` clean; `npm run test:coverage`
within thresholds; integration test drives one ok cycle + one terminal failure.

## What We're NOT Doing
- **No triage subroutine** (BB-4) — `scanRaw` still writes the row directly.
- **No `log.jsonl`-tail resume** (BB-5).
- **No transitive `propagateBlocked` graph walk** (BB-6) — stub only.
- **No reflection step** (BB-7).
- **No pop-order skip-on-unsatisfied-deps** — FIFO over `pending` only;
  `depends_on` is read but ignored (always empty in BB-3-shipped rows).
- **No backfill of `workflow:` into existing seven BB-* todos** — R4 fallback
  to CLI default covers them.
- **No new `engine.halted` counter** (BB-6).
- **No `--workflow` CLI flag removal** — kept as fallback per R4.

## Implementation Approach

Strategy: build inside-out — small pure modules first (`frontmatter`, `queue`,
`blocked`), unit-test them in isolation, then wire `scan.ts`, `cli.ts`, and
`run-cycle.ts` to use them, then integration-test end-to-end. Five vertical
slices, each landing a green test suite before moving on.

Key seam decisions (resolving RESEARCH open questions):
- **Schema at source**: `scanRaw` writes the new schema. The bootstrap-archive
  path (R2) handles the one-time transition for any legacy file already on disk.
- **Drain timing**: drain runs in `cli.ts` *after* `runCycle` returns
  (i.e. after the `finally` checkout/pull). Log order stays
  `cycle.end → cycle.checkout → cycle.base_pull → (drain emits no new events
  beyond optional `queue.drained`)`.
- **R5 ordering**: `cli.ts` pre-allocates `cycleId`, calls `markInProgress`,
  then passes `cycleId` into `runCycle` via an optional `cycleId` field.
  `runCycle` falls back to `allocateCycleId` if absent (test-friendly).
- **`propagateBlocked`** lives in `src/engine/blocked.ts` — signature stable
  for BB-6.
- **Dry-run**: continues to skip `runCycle` and queue mutation; just enumerates
  what would pop. Preserves existing semantics.

---

## Task 1: Shared frontmatter helper + refactor `scan.ts`

### Overview
Extract `parseFrontmatter` from `scan.ts` into a shared module; add
`serializeFrontmatter` and `mutateFrontmatter` (read → patch keys → rewrite,
preserving body bytes). Refactor `scan.ts` to consume it. No behavior change.

### Changes Required
**File**: `src/engine/frontmatter.ts` (new)
```ts
export type Frontmatter = Record<string, string | number | string[]>;

export function parseFrontmatter(body: string): { fm: Frontmatter; bodyAfter: string };
export function serializeFrontmatter(fm: Frontmatter, bodyAfter: string): string;
export async function mutateFrontmatter(
  path: string,
  patch: (fm: Frontmatter) => Frontmatter
): Promise<void>;
```
- Regex `^---\n([\s\S]*?)\n---\n?` matches block; body = everything after.
- Serialize: stable key order — original keys first (preserved order), then new
  keys appended. Values: scalars unquoted; strings containing `:` / `"` / leading
  space wrapped in double quotes with `\"` escaping. Arrays as JSON-style
  `[a, b]` (only `depends_on` uses arrays for now — keep simple).
- `mutateFrontmatter` reads file, parses, calls patch, rewrites atomically
  (write to `path + ".tmp"` then `rename`).

**File**: `src/engine/scan.ts`
- Replace inline `parseFrontmatter` with `import { parseFrontmatter } from "./frontmatter.ts"`.
- Adapt: `parseFrontmatter` now returns `{fm, bodyAfter}` — use `.fm` only here.

**File**: `tests/engine/frontmatter.test.ts` (new)
- Round-trip parse → serialize preserves body bytes.
- `mutateFrontmatter` adds new keys, preserves existing key order.
- Quote handling: value containing `:` survives round-trip.
- Idempotent: mutate-twice with same patch = same file.

### Success Criteria
- [ ] `npm test` green (existing `tests/engine/scan.test.ts` still passes).
- [ ] `tests/engine/frontmatter.test.ts` covers all four cases above.
- [ ] `npm run typecheck` clean.

---

## Task 2: `queue.ts` module — schema, parse, mutate

### Overview
Owns `.cycle/tbd.jsonl` read/write. Pure-ish module: takes `repoRoot`, performs
JSONL ops, returns plain row objects. No engine wiring yet.

### Changes Required
**File**: `src/engine/queue.ts` (new)
```ts
export type QueueRowStatus = "pending" | "in_progress";

export type QueueRow = {
  id: string;
  parent?: string;
  title: string;
  status: QueueRowStatus;
  attempt: number;
  depends_on: string[];
  triaged_at: string;
  cycle_id?: string;
};

export async function readQueue(repoRoot: string): Promise<QueueRow[]>;
export async function writeQueue(repoRoot: string, rows: QueueRow[]): Promise<void>;
export async function appendRow(repoRoot: string, row: QueueRow): Promise<void>;
export async function bootstrapArchiveIfLegacy(repoRoot: string): Promise<boolean>;
export async function popNextPending(repoRoot: string): Promise<QueueRow | null>;
export async function markInProgress(
  repoRoot: string,
  id: string,
  cycleId: string
): Promise<void>;
export async function drainOk(repoRoot: string, id: string): Promise<void>;
export async function drainFailedRetry(repoRoot: string, id: string): Promise<void>;
export async function drainFailedTerminal(repoRoot: string, id: string): Promise<void>;
export function isLegacyLine(parsed: unknown): boolean;
```
Semantics:
- `readQueue`: read `.cycle/tbd.jsonl`; for each non-blank line, JSON.parse;
  tolerate malformed lines (skip). Rows where `status` is missing are treated
  as malformed (caller bootstrap should have archived).
- `writeQueue`: serialize rows, one JSON object per line, trailing newline,
  atomic write (`.tmp` + rename).
- `appendRow`: `appendFile`-style append (no rewrite) — used by `scanRaw`.
- `bootstrapArchiveIfLegacy`: if file exists AND any non-blank line parses to
  an object with no `status` field, `rename` to
  `.cycle/tbd.jsonl.bootstrap-archive`; if archive already exists, append-then-rename
  with a numeric suffix `.bootstrap-archive.N`. Returns `true` if archived.
  Idempotent: returns `false` when every line already has `status` (or file
  missing).
- `popNextPending`: returns first `status === "pending"` row by file order
  (FIFO); does NOT mutate (caller pairs with `markInProgress`).
- `markInProgress`: read all rows, mutate matching id (`status="in_progress"`,
  `cycle_id=cycleId`), `writeQueue` back.
- `drainOk`: read rows, drop matching id, `writeQueue` back.
- `drainFailedRetry`: read rows, mutate matching id (`attempt += 1`,
  `status="pending"`, delete `cycle_id`), `writeQueue` back.
- `drainFailedTerminal`: read rows, drop matching id, `writeQueue` back.

**File**: `tests/engine/queue.test.ts` (new)
- Parse round-trip for `pending` and `in_progress` rows (with/without `parent`,
  `cycle_id`).
- `bootstrapArchiveIfLegacy`:
  - legacy lines (no `status`) → archives, returns `true`, leaves empty file.
  - already-new lines → returns `false`, file unchanged.
  - missing file → returns `false`.
  - second call after archive → returns `false`.
- `popNextPending` is FIFO; skips `in_progress` rows.
- `markInProgress` mutates only the matching row; other rows untouched.
- `drainOk` removes only the matching row.
- `drainFailedRetry` bumps `attempt`, resets `status`, clears `cycle_id`.
- `drainFailedTerminal` removes the row.
- Tolerates malformed lines.

### Success Criteria
- [ ] `npm test` green; new `queue.test.ts` passes all enumerated cases.
- [ ] `npm run typecheck` clean.
- [ ] Coverage on `queue.ts`: line ≥95%, branch ≥75%, func ≥90%.

---

## Task 3: `propagateBlocked` stub module

### Overview
Lightweight signature-stable stub so the terminal-failure path can call it now;
BB-6 fills the body.

### Changes Required
**File**: `src/engine/blocked.ts` (new)
```ts
import type { QueueRow } from "./queue.ts";
export async function propagateBlocked(
  repoRoot: string,
  failedId: string
): Promise<{ blocked: string[] }> {
  // BB-6 will compute transitive deps from queue rows + write blocked/ files.
  // For BB-3, no-op when nothing depends on failedId.
  return { blocked: [] };
}
```

**File**: `tests/engine/blocked.test.ts` (new)
- Stub returns `{ blocked: [] }` regardless of input (locks the signature).

### Success Criteria
- [ ] Test passes.
- [ ] Module exists with stable signature `(repoRoot, failedId) → Promise<{blocked: string[]}>`.

---

## Task 4: Rewire `scan.ts` to emit new schema

### Overview
`scanRaw` writes new-schema `QueueRow`s instead of legacy `TbdEntry`. Bootstrap
archive runs before any append. Return type changes from `TbdEntry[]` to
`QueueRow[]` (caller in `cli.ts` updates in Task 5).

### Changes Required
**File**: `src/engine/scan.ts`
- Replace `TbdEntry` with `QueueRow` import.
- At entry, call `bootstrapArchiveIfLegacy(repoRoot)`.
- Build dedup id set via `readQueue` (skip malformed lines).
- For each new raw file: parse frontmatter via shared helper, `rename` to
  `todo/`, then `appendRow` with:
  ```ts
  {
    id: fm.id,
    title: fm.title,
    status: "pending",
    attempt: 0,
    depends_on: [],
    triaged_at: fm.added_at,
  }
  ```
  (`parent` only set if `fm.parent` is present.)
- Drop the `source`, `path` fields entirely — not in `QueueRow`. Callers that
  needed `path` can recompute from id.

**File**: `tests/engine/scan.test.ts`
- Update all `TbdEntry` assertions to `QueueRow` shape (status/attempt/depends_on/triaged_at).
- Add: legacy `.cycle/tbd.jsonl` present before scan → archived once; second scan
  does not re-archive.
- Add: when `added_at` is in frontmatter, it becomes `triaged_at` in row.

### Success Criteria
- [ ] All existing scan tests still pass under the new shape.
- [ ] New legacy-archive test asserts `.cycle/tbd.jsonl.bootstrap-archive` exists
      after first scan over a legacy file.
- [ ] `npm run typecheck` clean.

---

## Task 5: Wire `cli.ts` drain loop + `runCycle` cycleId/workflow seams

### Overview
- Extend `RunCycleOpts` with optional `cycleId`; `runCycle` uses provided id or
  allocates one.
- `cli.ts` loop: `scanRaw` first (one-shot ingest), then loop on `popNextPending`:
  pre-allocate `cycleId`, read todo frontmatter for `workflow:`, fall back to
  `args.workflow`, call `markInProgress(id, cycleId)`, call
  `runCycle({cycleId, workflow, ...})`, then drain on result. Halt-on-failure
  policy preserved.

### Changes Required
**File**: `src/engine/run-cycle.ts`
- `RunCycleOpts` gains `cycleId?: string`.
- Line 30: `const cycleId = opts.cycleId ?? await allocateCycleId(repoRoot);`.

**File**: `src/cli.ts`
- Replace `scanRaw` return-driven loop with:
  1. `await scanRaw(cwd)` (ingest; return value ignored — queue holds everything).
  2. `while (true)`:
     - `row = await popNextPending(cwd)`; if `null` → break.
     - emit `issue.ingested` for back-compat (or new `queue.popped` event —
       keep `issue.ingested` for now to avoid breaking log consumers; planner
       chooses additive over rename).
     - if `args.dryRun` → continue (no mutation).
     - `todoPath = join(cwd, "docs/cycle/issues/todo", row.id + ".md")`.
     - `wfName = (parseFrontmatter(body).fm.workflow as string) ?? args.workflow`.
     - `cycleId = await allocateCycleId(cwd)`.
     - `await markInProgress(cwd, row.id, cycleId)`.
     - `r = await runCycle(cwd, { cycleId, issueId: row.id, title: row.title, workflow: wfName })`.
     - if ok: `await drainOk(cwd, row.id); await rename(todoPath, donePath); cyclesProcessed++`.
     - if failed AND `row.attempt + 1 < maxAttempts`:
       `await drainFailedRetry(cwd, row.id)`; emit `issue.failed`; halt loop.
     - if failed AND `row.attempt + 1 >= maxAttempts`:
       `await mutateFrontmatter(todoPath, fm => ({...fm, failed_at: nowIso, failed_step: r.failingStep, failed_attempts: row.attempt+1}))`;
       `await rename(todoPath, failedPath)`;
       `await drainFailedTerminal(cwd, row.id)`;
       `await propagateBlocked(cwd, row.id)`;
       emit `issue.failed`; halt loop.
- `maxAttempts` source: `const cfg = await loadConfig(cwd); const wf = cfg.workflows.find(w => w.name === wfName); const maxAttempts = wf?.max_cycle_attempts ?? 3;`.
- Keep existing halt-on-failure behavior (break outer on failed).

**File**: `tests/cli/multi-loop.test.ts` (existing)
- Update assertions to reflect that the drained todo file now lands in `done/`
  (not just stays in `todo/`).
- Add a case where workflow's `max_cycle_attempts: 1` and `boom.sh` exits 42 →
  file ends up in `failed/` with `failed_at`/`failed_step`/`failed_attempts`
  frontmatter present; `tbd.jsonl` row removed.

**File**: `tests/engine/run-cycle.test.ts`
- Add a case asserting `cycleId` opt is honored when provided.

**File**: `tests/cli/queue-drain.test.ts` (new — integration)
- Build a tmp repo with two todo files (one with `workflow: feature` frontmatter,
  one without), `tbd.jsonl` containing rows for both. Use a fake `feature`
  workflow with one bash step that exits 0 → run `dist/cycle.js`. Assert:
  - both todos move to `done/`.
  - `tbd.jsonl` is empty.
  - emits `cycle.start` with `workflow: feature` for both.
  - one cycle picked up `workflow:` from frontmatter, the other from CLI default.
- Second test: bash step `exit 42`, `max_cycle_attempts: 2`. First run halts
  with row at `attempt: 1, status: pending`. Second run halts terminally;
  file in `failed/` with three failure-frontmatter keys; row gone.
- Third test: `propagateBlocked` invocation — easier as a unit test on the cli
  glue if extracted, OR assert via the side-effect signature. Use a spy import
  via `tests/cli/queue-drain-propagate.test.ts` that monkey-patches `blocked.ts`
  (or: skip spy and rely on Task-3 test for signature; assert call by
  observing returned `{blocked: []}` via a `queue.drained` log event — see
  "Optional event" below).

### Optional new log event
Emit `queue.drained` `{cycle_id, id, outcome: "ok"|"retry"|"terminal"}` from
`cli.ts` after each drain. Useful for BB-5 resume and for asserting
`propagateBlocked` was reached without a spy. **Decision: include it now;
trivial, audit-only, no consumer breakage.**

### Success Criteria
- [ ] `npm test` green including new queue-drain integration tests.
- [ ] `npm run typecheck` clean.
- [ ] `npm run test:coverage`: line ≥95%, branch ≥75%, func ≥90%; no per-file
      regression on `src/engine/*` or `src/cli.ts`.
- [ ] `dist/cycle.js` rebuilt (`npm run build`) — verify integration tests pass
      against the rebuilt bundle.
- [ ] Manual smoke: in a tmp dogfood, drop two issues, run cycle; both end in
      `done/`; `tbd.jsonl` empty.

---

## Task 6: Docs + defaults sync

### Overview
Per SPEC §Documentation Updates: one paragraph in `CLAUDE.md`. Sync defaults.

### Changes Required
**File**: `CLAUDE.md`
- Under "Architecture quick reference", add: queue authority is `src/engine/queue.ts`;
  `.cycle/tbd.jsonl` is now a live drain-queue (one row per pending/in-progress
  issue); audit log remains `.cycle/log.jsonl`; bootstrap archives any legacy
  file once to `.cycle/tbd.jsonl.bootstrap-archive`.

**File**: `src/defaults/workflows.yml`
- Confirm `max_cycle_attempts: 3` on the `feature` workflow. No change expected.

**Run**: `npm run sync-defaults` if any default file changed.

### Success Criteria
- [ ] CLAUDE.md note in place.
- [ ] `git diff src/defaults/` matches what `.cycle/` mirrors after `sync-defaults`.

---

## Testing Strategy

### Unit Tests
- `frontmatter.test.ts`: parse/serialize round-trip; mutate adds keys preserving
  order; quoted value with `:` survives; mutate idempotent.
- `queue.test.ts`: round-trip every status combo; bootstrap detection (legacy
  vs new vs missing vs idempotent); FIFO `popNextPending`; `markInProgress`
  isolated mutation; drain-ok/retry/terminal residual states; tolerates
  malformed lines.
- `blocked.test.ts`: stub returns `{ blocked: [] }` (locks signature).
- `scan.test.ts` (updated): new `QueueRow` shape; legacy-archive on first run;
  idempotent on second.
- Mocking: zero. Use real `fs/promises` against `mkdtemp` dirs as the rest of
  the suite does.

### Integration / E2E Tests
- `tests/cli/queue-drain.test.ts`:
  - ok path: two issues, both → `done/`, queue empty.
  - retry path: `boom.sh` fails, `max_cycle_attempts: 2`, first run leaves row
    at `attempt:1,status:pending`, file in `todo/`.
  - terminal path: same boom, run again, row gone, file in `failed/` with
    `failed_at`/`failed_step`/`failed_attempts` frontmatter, `propagateBlocked`
    fired (via the `queue.drained` log event with `outcome: "terminal"`).
  - workflow-from-frontmatter: fixture todo with `workflow: feature` →
    `cycle.start` log shows that workflow; fixture without → fallback to CLI
    default.
- All integration tests run `dist/cycle.js`, so `npm run build` is required
  before they execute (existing multi-loop tests already follow this pattern;
  ensure CI/`npm test` order is preserved).

## Risk Assessment
- **Coverage regression from `cli.ts` growth**: drain logic in `cli.ts` may push
  `cli.ts` past the line-coverage threshold. *Mitigation*: factor the drain
  step (per-row handler) into `src/engine/drain.ts` if `cli.ts` is hard to
  cover; preserve trivial top-level `await` in `cli.ts`. Decide after measuring
  in Task 5.
- **Bootstrap archive races**: two parallel `cycle` invocations could both
  attempt archive. *Mitigation*: `rename` is atomic; second caller's
  source-not-found error is caught and treated as "already archived".
- **`mutateFrontmatter` corrupting body bytes**: edge case where original file
  has CRLF endings or no trailing newline. *Mitigation*: serializer always
  re-emits LF and a single trailing newline matched to original; round-trip
  test in Task 1 covers both endings.
- **Workflow frontmatter quoting**: a malicious title with `\n---\n` inside a
  string could fool the regex parser. *Mitigation*: out of scope for this
  cycle; `materializeFreeformIssue` escapes quotes, not newlines — note as a
  future hardening item but don't expand scope here.
- **`max_cycle_attempts: 0/negative`**: defensive — treat `< 1` as `1`. Covered
  by a unit test guard in queue/drain wiring.
- **`dist/cycle.js` staleness**: forgetting `npm run build` before integration
  tests is a recurring engine-stall cause (see cycle 0013 recovery, obs #517).
  *Mitigation*: ensure Task 5 ends with an explicit `npm run build` and a
  reminder in the cycle commit to rebuild the bundle.
```
