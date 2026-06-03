# Implementation Plan: Cycle 0046

## Overview
Add a per-issue `expects_code: false` frontmatter opt-out that exempts a cycle from the build-phase empty-diff guard when its only deliverable is a non-`docs/cycle/` documentation change, so research/doc-only issues complete `ok` and drain to `done/` instead of burning retries on a false empty-diff failure.

## Current State (from Research)
- The build/fix empty-diff guard lives at `src/engine/run-cycle.ts:738-772`: after a `build`/`fix` step exits `ok`, it runs `git status --porcelain -- src scripts tests`; on empty output it either resolves to a no-op (valid `NOOP.md`) or fails with `formatEmptyDiffGuardError` (`src/engine/run-cycle.ts:277-279`).
- `runCycle` already receives `opts.issueId` (`RunCycleOpts`, `src/engine/run-cycle.ts:321-333`). The source issue file is still in `docs/cycle/issues/todo/<issueId>.md` while the cycle runs — the move to `done/` happens post-cycle in the supervisor.
- `parseFrontmatter(body)` (`src/engine/frontmatter.ts:11-17`) returns `{ fm, bodyAfter }`. A YAML `expects_code: false` parses to a JS boolean at runtime even though `FrontmatterValue` (declared `string | number | string[]`) omits `boolean`.
- `isDenied(p)` (`src/engine/path-utils.ts:4-13`) does not deny `docs/**`. `parseSnapshotPaths` (`run-cycle.ts:86`) is `src/`/`scripts/`-filtered and is therefore **not** reusable for a docs scan.
- Fail-closed field-resolution convention: `depends_on`/`priority` normalize defensively and fall back to a default rather than throwing (`src/engine/queue.ts:77-80`, `:107`). Issue reads degrade in `try/catch` (`src/engine/issue-lifecycle.ts:42-46`).
- Test harness: `tests/engine/empty-diff-guard.test.ts` builds a real git repo in a tmpdir, drives `runCycle` end-to-end via a fake `claude` on PATH, and cardinality-pins events with `filter(...).length === 1` over parsed `.cycle/log.jsonl`. `src/engine/run-cycle.ts` coverage floor is 90%.

## Desired End State
- A pure exported `resolveExpectsCode(fm)` helper returns `false` only when `fm.expects_code === false`; everything else (absent / non-boolean / malformed / `true`) ⇒ `true`.
- At the empty-diff guard, when the resolved flag is `false`, the `src scripts tests` diff is empty, and a non-empty in-scope doc deliverable (a `docs/**` path that is not denied and not under `docs/cycle/`) exists, the build step keeps `status: "ok"`, the cycle completes `ok`, the docs change is committed by the unchanged `commitCycle` path, and the issue drains to `done/`.
- Issues without the opt-out, opt-out cycles with no deliverable at all, and unreadable-issue cases all still fail with the byte-for-byte `formatEmptyDiffGuardError`.
- Verify: `npm run test:coverage` (floors hold), `npm run typecheck` clean, new integration + unit tests green.

## What We're NOT Doing
- No dedicated `research`/`spike` workflow, new prompts, or `sync-defaults` changes (Option A is explicitly out).
- No changes to `src/engine/noop-marker.ts` or the `NOOP.md` schema.
- No title/body auto-detection heuristics — the opt-out is an explicit frontmatter declaration only.
- No new `STEP_ARTIFACTS` entries or completion-proof artifacts.
- No new `RunCycleOpts` field or `run-one.ts`/`cli.ts` signature change — the flag is resolved inside `runCycle` from `opts.issueId`.
- No new log event for the relaxed path — it is an ordinary `ok` completion carried by the existing `step.end`/`cycle.end`.
- No widening of the `FrontmatterValue` union (the helper reads the value structurally as `unknown`).

## Implementation Approach
Resolve `expects_code` **inside `runCycle`**, lazily, at the point the empty-diff guard fires (the only place the flag matters): read `docs/cycle/issues/todo/<issueId>.md`, `parseFrontmatter`, and `resolveExpectsCode(fm)`, all wrapped in `try/catch` that degrades to the safe `true` default. Add a pure doc-deliverable detector that parses `git status --porcelain -- docs` and keeps paths that are `!isDenied(p) && !p.startsWith("docs/cycle/")` — excluding the always-present per-cycle artifact tree so a no-deliverable opt-out cycle still fails. Insert a new first branch inside the existing `if (!changed.stdout || !changed.stdout.trim())` block with precedence: **(1)** opt-out + non-empty doc deliverable ⇒ leave `r.status = "ok"`; **(2)** else valid `NOOP.md` ⇒ no-op (unchanged); **(3)** else ⇒ `formatEmptyDiffGuardError` failure (unchanged). Keep the helper signature param typed `Record<string, unknown>` so `=== false` does not trip TS2367.

## Failure & Resilience Decisions

**`resolveExpectsCode(fm)` (Task 1)** — N/A — pure. In-memory structural check, no I/O.

**`parseDocDeliverablePaths(stdout)` (Task 1)** — N/A — pure. String parsing of porcelain output, no I/O.

**`hasDocDeliverable(repoRoot)` spawn wrapper (Task 2)** —
- *Failure modes*: `git status` non-zero / spawn error ⇒ treat as **no deliverable** (returns `false`). This is the safe direction: a failed scan must not fabricate a deliverable that relaxes the guard; the empty-diff failure (or no-op) path then proceeds as today. `spawnSync` already used repo-wide with `shell:false`, array args.
- *Idempotency*: pure read (`git status --porcelain`), no mutation — safe under engine step retry/restart.
- *Observability*: the guard outcome is already visible via `step.end`/`cycle.end`; a `false` from a failed scan routes through the existing `formatEmptyDiffGuardError` (or no-op), so the failure surfaces as the normal terminal path. No error is swallowed into a false `ok`.
- *No silent failure*: a scan error never yields `ok`; it can only withhold the relaxation, surfacing the existing guard failure.

**Issue-flag resolution inside `runCycle` (Task 2)** —
- *Failure modes*: missing/unreadable issue file or unparseable frontmatter ⇒ `catch` → default `true` (issue treated as a normal code issue; guard fires as today). A malformed/non-boolean `expects_code` value ⇒ `resolveExpectsCode` returns `true`. The read/parse is wrapped so it **never throws out of the guard**.
- *Idempotency*: single `readFile` of a file that is still in `todo/` for the cycle's duration; pure read, retry-safe. Resolution happens only when the diff is empty, so the common (code-bearing) path performs no extra read.
- *Observability*: degrade-to-default needs no event per SPEC (an unreadable issue behaves identically to a normal code issue); the resulting empty-diff failure is logged by the existing `step.end { status: "failed" }`. No `engine.warning` required.
- *No silent failure*: the only way the guard relaxes is an explicit `expects_code === false` **and** a confirmed non-empty doc deliverable; every error path falls back to the stricter behavior, so an error can never become a silent `ok`.

## Task 1: Pure resolution + doc-deliverable parsing helpers

### Overview
Add two pure, exported, unit-testable helpers to `src/engine/run-cycle.ts` (alongside the existing `format*`/`parseSnapshotPaths` exports): the flag resolver and a porcelain doc-path parser.

### Changes Required
**File**: `src/engine/run-cycle.ts`
**Changes**: Add near the other exported helpers:

```ts
/** Per-issue opt-out: only an explicit `expects_code: false` relaxes the
 * empty-diff guard. Absent / non-boolean / malformed ⇒ true (fail-closed). */
export function resolveExpectsCode(fm: Record<string, unknown>): boolean {
  return fm?.expects_code === false ? false : true;
}

/** Parse `git status --porcelain -- docs` output into the in-scope doc
 * deliverable paths: not denied and not under the per-cycle artifact tree
 * (docs/cycle/**), which is always present and must not trivially satisfy
 * the deliverable check. */
export function parseDocDeliverablePaths(stdout: string): string[] {
  const out: string[] = [];
  for (const raw of (stdout ?? "").split("\n")) {
    if (!raw.trim()) continue;
    const xy = raw.slice(0, 2);
    let p = raw.slice(3);
    if (xy[0] === "R" || xy[0] === "C") {
      const arrow = p.lastIndexOf(" -> ");
      if (arrow !== -1) p = p.slice(arrow + 4);
    }
    p = p.replace(/^"/, "").replace(/"$/, "");
    if (!p.startsWith("docs/")) continue;
    if (isDenied(p) || p.startsWith("docs/cycle/")) continue;
    out.push(p);
  }
  return out;
}
```

### Success Criteria
- [ ] Compiles/builds cleanly; `npm run typecheck` clean (the `Record<string, unknown>` param keeps `=== false` legal — no TS2367).
- [ ] `resolveExpectsCode`: `false`→`false`; `true`/absent/`"maybe"`/`0`/`"false"` (string)/`[]`→`true`.
- [ ] `parseDocDeliverablePaths`: includes `docs/RFC-003.md`, a rename target `docs/x.md`; excludes `docs/cycle/0046-.../PLAN.md`, `src/x.ts`, denied paths, blank lines.
- [ ] Failure paths behave as designed (pure — no failure surface).

---

## Task 2: Wire the opt-out into the empty-diff guard

### Overview
Resolve the flag inside the guard block and add the relaxed branch with explicit precedence over the no-op and failure branches.

### Changes Required
**File**: `src/engine/run-cycle.ts` (inside the `if (!changed.stdout || !changed.stdout.trim())` block, `:748`)
**Changes**: Before the existing `NOOP.md` marker logic, resolve the flag and check for a doc deliverable:

```ts
// Per-issue opt-out: a research/doc-only issue (expects_code: false) whose
// deliverable is a non-empty in-scope docs/** change (outside the per-cycle
// docs/cycle/** artifact tree) is a legitimate ok completion, not an
// empty-diff failure. Read the still-in-todo issue file; any read/parse
// error degrades to the safe default (expects_code: true) — never throws
// out of the guard, never coerces to a silent ok.
let expectsCode = true;
try {
  const issueBody = await readFile(
    join(repoRoot, "docs/cycle/issues/todo", `${opts.issueId}.md`), "utf8");
  expectsCode = resolveExpectsCode(parseFrontmatter(issueBody).fm);
} catch { expectsCode = true; }

let docDeliverable = false;
if (!expectsCode) {
  const docs = spawnSync("git", ["status", "--porcelain", "--", "docs"],
    { cwd: repoRoot, encoding: "utf8", shell: false });
  docDeliverable = docs.status === 0
    && parseDocDeliverablePaths(docs.stdout ?? "").length > 0;
}

if (!expectsCode && docDeliverable) {
  // Relaxed: leave r.status === "ok". step.end fires ok; the cycle proceeds
  // to a normal ok completion that commits the docs change. NOT a no-op.
} else {
  // ...existing NOOP.md marker gate + formatEmptyDiffGuardError failure,
  //    byte-for-byte unchanged...
}
```

The existing marker block (`:756-770`) moves verbatim into the `else`. `parseFrontmatter` is added to the existing `frontmatter.ts` import; `readFile`/`join`/`spawnSync`/`isDenied` are already imported.

### Success Criteria
- [ ] Compiles/builds cleanly; `npm run typecheck` clean.
- [ ] Opt-out + empty code diff + non-empty `docs/**` deliverable ⇒ build `step.end { status: "ok" }`, `cycle.end { status: "ok" }`, no `cycle.noop`.
- [ ] No opt-out + empty diff ⇒ existing `formatEmptyDiffGuardError` failure preserved byte-for-byte.
- [ ] Opt-out + empty diff + no deliverable ⇒ `formatEmptyDiffGuardError` failure.
- [ ] Unreadable/missing issue file ⇒ defaults to `true`, guard fires.
- [ ] Precedence: opt-out doc deliverable wins over the no-op marker; opt-out with no docs but a valid `NOOP.md` still resolves no-op; failure paths surface errors (no silent catch into `ok`).

---

## Task 3: Tests

### Overview
Add a unit test for the helpers and integration tests driving the guard end-to-end, extending the existing `empty-diff-guard.test.ts` harness.

### Changes Required
**File**: `tests/engine/run-cycle-expects-code.test.ts` (new) — unit tests for `resolveExpectsCode` and `parseDocDeliverablePaths` (table-driven, per Task 1 criteria).

**File**: `tests/engine/empty-diff-guard.test.ts` (extend) — integration cases reusing the repo/fake-`claude` harness:
- **Happy path**: write a `todo/` issue with `expects_code: false`; fake build step writes a non-empty `docs/RFC-x.md` and touches nothing under `src/scripts/tests` ⇒ assert build `step.end { status: "ok" }` pinned with `filter(...).length === 1`, `cycle.end { status: "ok" }`, and **no** `cycle.noop` line.
- **Anti-slop regression**: existing test (no opt-out, empty diff) still fails with `formatEmptyDiffGuardError`.
- **Failure — opt-out, no deliverable**: `expects_code: false`, empty `src/scripts/tests` diff, no `docs/**` change (only the per-cycle `docs/cycle/**` artifacts) ⇒ build `step.end { status: "failed" }`, `failingStep === "build"`.
- **Failure — unreadable issue**: `expects_code: false` issue file absent at resolution (or remove it before the build step) + empty diff ⇒ defaults to `true`, guard fires.

### Success Criteria
- [ ] All new tests pass; `npm run test:coverage` green with `src/engine/run-cycle.ts` ≥ 90%.
- [ ] Build `step.end` cardinality-pinned with `filter(...).length === 1` in the happy-path and failure cases.
- [ ] Real repos/files used (no `mock.method` on `node:fs/promises`); fake `claude` on PATH drives the cycle.
- [ ] Relaxed path asserted to emit **no** `cycle.noop`.

---

## Task 4: Documentation

### Overview
Document the opt-out where the empty-diff/no-op guard is described.

### Changes Required
**File**: `docs/ENGINE.md` — in the *Empty-diff post-condition* / *No-op resolution* section (`:182-212`): document `expects_code` (field, default `true`), the relaxed-guard condition (opt-out + empty `src/scripts/tests` diff + non-empty in-scope `docs/**` change outside `docs/cycle/**` ⇒ `ok`, committed by the unchanged commit path, drained to `done/`, not routed through `noopDrain`), the no-deliverable failure case, the precedence over the no-op marker, and the byte-for-byte anti-slop guarantee for non-opt-out issues.

**File**: `CLAUDE.md` — in *Workflow defaults*, note the `expects_code: false` issue-frontmatter opt-out alongside the no-op / empty-diff guard description.

**File**: `README.md` — add `expects_code` only if the README enumerates issue frontmatter fields; otherwise no change.

### Success Criteria
- [ ] `docs/ENGINE.md` documents field, default, relaxed condition, no-deliverable failure, precedence, and anti-slop guarantee.
- [ ] `CLAUDE.md` Workflow defaults references the opt-out.
- [ ] N/A — pure (documentation; no failure surface).

---

## SPEC Acceptance Traceability

| SPEC Acceptance Bullet (verbatim) | Covering Task | Notes |
|---|---|---|
| [ ] A fixture issue with `expects_code: false` whose `build` step exits 0, leaves an empty `src scripts tests` diff, and writes a non-empty `docs/**` file completes with `cycle.end { status: "ok" }` — the doc deliverable is committed and the issue drains to `done/` (user-observable benefit: a doc-only issue finishes successfully). | Task 2, Task 3 | Happy-path integration test |
| [ ] The same fixture does **not** emit a `step.end { status: "failed" }` for the build step, does not re-run the build step, and triggers no failed-residue halt. | Task 2, Task 3 | Build `step.end` pinned `filter(...).length === 1`; `ok` outcome leaves no residue |
| [ ] A fixture issue **without** `expects_code: false` and an empty `src scripts tests` diff still fails the build step with the existing `formatEmptyDiffGuardError` message (anti-slop regression guard). | Task 2, Task 3 | Existing `empty-diff-guard.test.ts` case preserved |
| [ ] **Failure-path:** an `expects_code: false` cycle whose build step produces an empty `src scripts tests` diff **and** no `docs/**` change still fails the empty-diff guard (an empty opt-out cycle is not coerced to "ok"). | Task 1, Task 2, Task 3 | `parseDocDeliverablePaths` excludes `docs/cycle/**`; no-deliverable integration test |
| [ ] **Failure-path:** a malformed/non-boolean `expects_code` value (e.g. `expects_code: maybe`) resolves to the `true` default and the guard fires as today — verified by a unit test of the field-resolution helper. | Task 1, Task 3 | `resolveExpectsCode` unit table |
| [ ] `docs/ENGINE.md` documents the `expects_code` opt-out under the empty-diff/no-op section. | Task 4 | |
| [ ] All existing tests still pass. | Task 3 | Full `npm run test:coverage` |
| [ ] No compiler/linter warnings introduced (`npm run typecheck` clean). | Task 1, Task 2 | `Record<string, unknown>` param avoids TS2367 |

## Testing Strategy

### Unit Tests
- `resolveExpectsCode`: `expects_code: false` → `false`; `true`, absent, `"maybe"`, `0`, string `"false"`, `[]`, `null` → `true`.
- `parseDocDeliverablePaths`: includes plain `docs/*.md`, rename-target `docs/*.md`; excludes `docs/cycle/**`, non-`docs/` paths, denied paths, and blank lines.
- Failure-path tests: malformed `expects_code` (→ default), empty/whitespace porcelain stdout (→ `[]`).
- Mocking: none — both helpers are pure; integration uses real repos/files (no `node:fs/promises` stubbing, per repo constraint).

### Integration / E2E Tests
- Happy path — opt-out + empty code diff + non-empty `docs/**` ⇒ `cycle.end { status: "ok" }`, build `step.end { status: "ok" }` (pinned single execution), no `cycle.noop`.
- Anti-slop regression — no opt-out + empty diff ⇒ existing failure preserved.
- Failure — opt-out + empty diff + no doc deliverable ⇒ `formatEmptyDiffGuardError`, `failingStep === "build"`.
- Failure — unreadable/missing issue file at flag resolution ⇒ defaults to `true`, guard fires.

## Risk Assessment
- **Per-cycle `docs/cycle/**` artifacts trivially satisfying the deliverable check**: mitigated by excluding `docs/cycle/` in `parseDocDeliverablePaths`, so only a real out-of-tree doc change counts — and the no-deliverable failure test guards this.
- **TS2367 on `=== false`**: mitigated by typing the helper param `Record<string, unknown>` (value is `unknown`, comparison legal).
- **Reading the issue from `todo/` could race a post-cycle move**: the move to `done/` happens in the supervisor after `runCycle` returns, so the file is present for the guard's duration; an absent file degrades to the safe `true` default, exercised by the unreadable-issue test.
- **Precedence ambiguity between opt-out and `NOOP.md`**: resolved deterministically — opt-out doc deliverable is checked first; with no deliverable the unchanged no-op/failure branches run, so existing no-op behavior is unaffected.
