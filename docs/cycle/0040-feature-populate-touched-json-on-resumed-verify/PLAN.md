# Implementation Plan: Cycle 0040

## Overview
Reconstruct `touched.json` on the resume / verify-only path so the cycle footprint record (consumed by `commitCycle` to emit `commit.scope_warning`) stays meaningful when the build step does not re-execute in the current process. Recovery reads the build's already-declared footprint from `BUILD.md`'s `## Touched Files` section, unions it with current in-scope `git status --porcelain` paths, and writes `touched.json` before the supervisor's commit consumes it — best-effort and observable, never clobbering a populated footprint.

## Current State (from Research)
- `touched.json` is written **only** as a side-effect of a `RESET_ELIGIBLE_STEPS` step (`build`/`fix`/`final_fix`/`quick_fix`/`test_fix`/`test_build`) executing in-process, via `accumulateTouchedFiles` gated at `src/engine/run-cycle.ts:729-733` (`r.status === "ok" && RESET_ELIGIBLE_STEPS.has(step.name)`).
- On `--resume-from-step <index past build>` (`opts.resume.startStepIndex`, `runCycle` loop `for (let i = startIdx; …)` at `:317-320`), the build iteration is skipped, `accumulateTouchedFiles` never runs, and `touched.json` is left empty/absent. `commitCycle` (`src/engine/commit-cycle.ts:164-193`) then compares staged `src/`/`scripts/` files against an empty set — noise or silent degradation.
- The canonical recovery source is `BUILD.md`'s `## Touched Files` section. The parse logic already exists inline in `appendDocumentationPaths` (`run-cycle.ts:116-124`): exact-trim header match `## Touched Files`, bullet capture `/^\s*-\s+(.+)/`, stop at next `##`.
- Reusable helpers: `parseSnapshotPaths` (`:86-105`, exported), `isDenied` (`src/engine/path-utils.ts`), the union/merge/schema write pattern from `accumulateTouchedFiles` (`:152-177`: `Array.from(new Set([...])).sort()`, `JSON.stringify({ files }, null, 2) + "\n"`, tolerant `try { JSON.parse } catch {}` existing-file read).
- Best-effort side-effects are wrapped in `try { … } catch { /* never fail the cycle */ }` (`:724-733`). Events are emitted via `await log.emit(event, { cycle_id, … })` (`src/engine/log.ts:4-12`). `engine.warning { reason }` is an established shape (`cli.ts` resume path). Exactly-once events are pinned with `filter(...).length === 1` / `expectExactlyOne` (`tests/helpers.ts:3`).
- `artifactDir` is resolved inside `runCycle` (`:282-303`) and on resume reuses the existing dir via `prepareTrunkArtifactDir` (trunk mode). `runCycle` owns `artifactDir`; the supervisor reads `touched.json` from it at `cli.ts:561` (resume) after exit 0.

### Open questions resolved
- **Invocation point**: recovery runs **once inside `runCycle`, immediately before the step loop** (right after `const startIdx = …`, inside the existing `try`), guaranteed to land before any step and before the supervisor's `commitCycle` read. It does not depend on a step executing, so it survives a resume that skips every remaining mutation step.
- **"Past every `RESET_ELIGIBLE_STEPS` step" predicate**: compute `maxResetIdx = reduce over wf.steps → highest index whose name ∈ RESET_ELIGIBLE_STEPS`, else `-1`. Recovery triggers iff `opts.resume && maxResetIdx >= 0 && startIdx > maxResetIdx`. A workflow with **no** reset-eligible step (`maxResetIdx === -1`) never triggers recovery (nothing to recover, no spurious warning).
- **Module placement**: extract the `## Touched Files` parse into a small exported helper `parseTouchedFilesSection(text): Set<string>` in `run-cycle.ts`; `appendDocumentationPaths` is refactored to call it (behavior unchanged). `recoverTouchedFiles` is **co-located and exported** in `run-cycle.ts`, reusing `parseTouchedFilesSection`, `parseSnapshotPaths`, and `isDenied` directly — no cross-module export churn.
- **`source` field value**: the constant string `"BUILD.md"`.

## Desired End State
- A new exported `recoverTouchedFiles(repoRoot, artifactDir, log, cycleId)` in `src/engine/run-cycle.ts`, invoked once before the step loop on the qualifying resume path.
- Resuming past the build with a recoverable `BUILD.md` → `touched.json` populated with the in-scope recovered set + a single `touched.recovered { cycle_id, source: "BUILD.md", count }` event.
- No recoverable footprint → file untouched + single `engine.warning { reason: "touched_recovery_empty", cycle_id }`. Write failure → `engine.warning { reason: "touched_recovery_write_failed", cycle_id }`. Already-populated `touched.json` → silent no-op (no event, no clobber).
- Normal (non-resume) build path byte-for-byte unchanged. `npm test`, `npm run typecheck`, `npm run test:coverage` (run-cycle.ts ≥ 90%) all green.
- Verify via the new test file, and by inspecting that `accumulateTouchedFiles` and `appendDocumentationPaths` behavior is preserved.

## What We're NOT Doing
- No change to `commit.scope_warning` semantics, format, or commit behavior in `commit-cycle.ts`.
- No base-branch `git diff --name-only <base>...HEAD` recovery (workflow-mode-dependent; deferred).
- No change to the documented bash-build-step exclusion or the hardcoded-`RESET_ELIGIBLE_STEPS` limitation (`docs/ENGINE.md`).
- No change to the normal (non-resumed) build path or `accumulateTouchedFiles` write behavior.
- No new env vars, config keys, CLI flags, or external services.

## Implementation Approach
1. Extract `parseTouchedFilesSection(text)` from `appendDocumentationPaths` (pure, exported); repoint `appendDocumentationPaths` to it (no behavior change).
2. Add `recoverTouchedFiles(repoRoot, artifactDir, log, cycleId)`: guard-skip if `touched.json` already non-empty → read `BUILD.md` (declared set) → `git status --porcelain` (current in-scope set) → filter both via `isDenied` → union/sort/dedupe → write + `touched.recovered`, or warn `touched_recovery_empty`, or warn `touched_recovery_write_failed`. Fully self-contained: never throws into the caller; every degrade emits exactly one warning.
3. Wire the qualifying-resume predicate before the step loop in `runCycle`.
4. Tests: unit-test `recoverTouchedFiles` across all branches (real temp git repo + fake logger), one integration test through `runCycle` for the resume wiring, and a regression test that the normal path emits no new event.
5. Docs: `docs/ENGINE.md` *touched.json footprint* + `CLAUDE.md` `run-cycle.ts` note.

## Failure & Resilience Decisions

### Task 1 — `parseTouchedFilesSection`
N/A — pure (string in, `Set<string>` out; no I/O).

### Task 2 — `recoverTouchedFiles`
- **Failure modes**:
  - `BUILD.md` missing/unreadable → `readFile` `catch` ⇒ declared set empty (degrade).
  - No `## Touched Files` header → `parseTouchedFilesSection` returns empty ⇒ declared set empty (degrade).
  - `git status --porcelain` non-zero (`status !== 0`) ⇒ current set treated as empty (contribute nothing; do **not** abort — preserves any `BUILD.md` data on the verify-only path). The spawn itself never throws (`spawnSync`, `shell:false`).
  - Merged result empty (none of the above produced any in-scope path) ⇒ leave `touched.json` unchanged, emit `engine.warning { reason: "touched_recovery_empty", cycle_id }`, return.
  - `writeFile(touched.json)` throws (read-only dir, ENOSPC) ⇒ `catch` ⇒ emit `engine.warning { reason: "touched_recovery_write_failed", cycle_id }`, return; cycle outcome unmasked.
- **Idempotency**: safe to re-run. The first action reads `touched.json`; a non-empty `files` array ⇒ immediate return (no event, no clobber). After a successful recovery the file is non-empty, so a retry/restart is a no-op. The write fully overwrites with a deterministic sorted/deduped set.
- **Observability**: success ⇒ `touched.recovered { cycle_id, source, count }`; no-footprint ⇒ `touched_recovery_empty`; write error ⇒ `touched_recovery_write_failed`. Every exit other than the already-populated skip emits exactly one event.
- **No silent failure**: the only event-less exit is the deliberate already-populated guard (documented no-op per SPEC). All genuine degrade/error paths emit a warning. The function does not throw; the caller is additionally wrapped (Task 3) as belt-and-suspenders.

### Task 3 — `runCycle` wiring
- **Failure modes**: predicate computation is pure. The `recoverTouchedFiles` call is wrapped in `try { … } catch { /* never fail the cycle */ }` mirroring `:724-733`, so even an unforeseen internal throw cannot fail the cycle. Normal path: predicate is false (`opts.resume` unset) ⇒ no call, no new spawn.
- **Idempotency**: invoked once per `runCycle`; the helper's own guard makes a re-entered `runCycle` (engine restart at the same resume index) a no-op once the file is populated.
- **Observability**: events come from the helper.
- **No silent failure**: the outer `catch` is the last-resort guard only; the helper already surfaces every degrade as a warning before it could throw.

---

## Task 1: Extract `parseTouchedFilesSection` and repoint `appendDocumentationPaths`

### Overview
Lift the inline `## Touched Files` parse (`run-cycle.ts:116-124`) into a small exported pure helper so both `appendDocumentationPaths` and the new `recoverTouchedFiles` share one parser.

### Changes Required
**File**: `src/engine/run-cycle.ts`
**Changes**: Add above `appendDocumentationPaths`:
```ts
/** Parse the `## Touched Files` bullet block of a BUILD.md body.
 * Exact-trim header match; `- <path>` bullets via /^\s*-\s+(.+)/; stops at the
 * next `##` header. Returns an empty set when the header is absent. */
export function parseTouchedFilesSection(text: string): Set<string> {
  const lines = text.split("\n");
  const headerIdx = lines.findIndex((l) => l.trim() === "## Touched Files");
  if (headerIdx === -1) return new Set();
  const out = new Set<string>();
  for (let i = headerIdx + 1; i < lines.length; i++) {
    if (lines[i].startsWith("##")) break;
    const m = /^\s*-\s+(.+)/.exec(lines[i]);
    if (m) out.add(m[1].trim());
  }
  return out;
}
```
Refactor `appendDocumentationPaths` to use it: keep the `readFile`/`catch { return }`, then `const touchedSet = parseTouchedFilesSection(text); if (touchedSet.size === 0) return;` — preserving the existing absent-header early return (the prior `headerIdx === -1` guard). The header-index lookup for insertion (`:139-142`) still recomputes `headerIdx` locally; leave that insertion logic byte-for-byte.

### Success Criteria
- [ ] Compiles/builds cleanly; `npm run typecheck` clean.
- [ ] Existing `appendDocumentationPaths` tests still pass (behavior preserved — absent header still returns without writing, `documentation.paths_appended` still emitted on append).
- [ ] `parseTouchedFilesSection` is exported and unit-tested.
- [ ] Failure paths behave as designed (no header ⇒ empty set, no throw).

---

## Task 2: Add `recoverTouchedFiles`

### Overview
The best-effort recovery helper that reconstructs `touched.json` from `BUILD.md` + current in-scope working-tree paths.

### Changes Required
**File**: `src/engine/run-cycle.ts` (co-located, after `accumulateTouchedFiles`)
**Changes**:
```ts
const TOUCHED_RECOVERY_SOURCE = "BUILD.md";

/** Best-effort resume/verify-only footprint recovery. Reconstructs touched.json
 * from BUILD.md's `## Touched Files` declared set unioned with current in-scope
 * `git status --porcelain` paths (both isDenied-filtered). Never throws; never
 * clobbers an already-populated footprint. Emits exactly one event on every
 * path except the already-populated guard. */
export async function recoverTouchedFiles(
  repoRoot: string,
  artifactDir: string,
  log: Logger,
  cycleId: string,
): Promise<void> {
  const touchedPath = join(artifactDir, "touched.json");

  // Guard: never clobber a populated footprint (the normal-build write wins).
  let existing: string[] = [];
  try {
    const raw = await readFile(touchedPath, "utf8");
    const parsed = JSON.parse(raw) as { files?: unknown };
    if (Array.isArray(parsed.files)) existing = parsed.files as string[];
  } catch { /* absent or corrupt — proceed with recovery */ }
  if (existing.length > 0) return; // already populated — silent no-op

  // Source 1: BUILD.md declared footprint.
  let declared = new Set<string>();
  try {
    declared = parseTouchedFilesSection(await readFile(join(artifactDir, "BUILD.md"), "utf8"));
  } catch { /* missing/unreadable BUILD.md — declared stays empty */ }

  // Source 2: current in-scope working-tree paths (best-effort; non-zero ⇒ none).
  const status = spawnSync("git", ["status", "--porcelain"], { cwd: repoRoot, encoding: "utf8", shell: false });
  const current = status.status === 0 ? parseSnapshotPaths(status.stdout ?? "") : new Set<string>();

  const merged = Array.from(new Set([...declared, ...current]))
    .filter((p) => !isDenied(p))
    .sort();

  if (merged.length === 0) {
    await log.emit("engine.warning", { reason: "touched_recovery_empty", cycle_id: cycleId });
    return;
  }

  try {
    await writeFile(touchedPath, JSON.stringify({ files: merged }, null, 2) + "\n", "utf8");
  } catch {
    await log.emit("engine.warning", { reason: "touched_recovery_write_failed", cycle_id: cycleId });
    return;
  }
  await log.emit("touched.recovered", { cycle_id: cycleId, source: TOUCHED_RECOVERY_SOURCE, count: merged.length });
}
```
Notes: `parseSnapshotPaths` already restricts untracked (`??`) entries to `src/`/`scripts/`; `isDenied` filters the rest. Declared `BUILD.md` paths are filtered through `isDenied` as well (per SPEC). The schema and merge idiom mirror `accumulateTouchedFiles`.

### Success Criteria
- [ ] Compiles/builds cleanly; `npm run typecheck` clean.
- [ ] Happy path writes `{ files: [...] }` sorted/deduped and emits `touched.recovered` exactly once.
- [ ] Already-populated `touched.json` ⇒ early return, no event, no write.
- [ ] No recoverable footprint ⇒ `touched_recovery_empty` warning, file untouched.
- [ ] Write failure ⇒ `touched_recovery_write_failed` warning, no throw.
- [ ] Failure paths behave as designed (errors surfaced as events, never swallowed silently except the documented populated-guard no-op).

---

## Task 3: Wire recovery into the qualifying resume path

### Overview
Invoke `recoverTouchedFiles` once before the step loop when the resume start index sits past every reset-eligible step.

### Changes Required
**File**: `src/engine/run-cycle.ts` (inside the `try`, immediately after `const startIdx = opts.resume?.startStepIndex ?? 0;` at `:317`)
**Changes**:
```ts
// Resume/verify-only footprint recovery: when this process resumes past every
// build/fix step (so accumulateTouchedFiles will not run), reconstruct
// touched.json from BUILD.md before commitCycle (in the supervisor) reads it.
if (opts.resume) {
  const maxResetIdx = wf.steps.reduce(
    (max, s, idx) => (RESET_ELIGIBLE_STEPS.has(s.name) ? idx : max),
    -1,
  );
  if (maxResetIdx >= 0 && startIdx > maxResetIdx) {
    try {
      await recoverTouchedFiles(repoRoot, artifactDir, log, cycleId);
    } catch { /* best-effort; never fail the cycle */ }
  }
}
```

### Success Criteria
- [ ] Compiles/builds cleanly; `npm run typecheck` clean.
- [ ] Resume past build triggers recovery; resume before/at build (`startIdx <= maxResetIdx`) does not.
- [ ] Workflow with no reset-eligible step (`maxResetIdx === -1`) never triggers recovery.
- [ ] Non-resume run never calls `recoverTouchedFiles` (no new `git status` spawn on the normal path).
- [ ] Failure paths behave as designed (outer `catch` guards an unforeseen throw without failing the cycle; the helper still emits its own warnings on real degrades).

---

## Task 4: Tests

### Overview
Unit tests for `recoverTouchedFiles` across every branch, one integration test for the `runCycle` wiring, and a regression test for the normal path.

### Changes Required
**File**: `tests/engine/run-cycle.touched-recovery.test.ts` (new)
**Changes**: Use the `tests/engine/` conventions — real temp git repo via `mkdtemp` + `spawnSync("git", …)`, an in-memory fake logger `{ emit: async (event, fields) => events.push({ event, ...fields }) }` typed to `Logger` for the unit tests, and `expectExactlyOne` (`tests/helpers.ts`) for the `touched.recovered` cardinality assertion.

Unit tests for `recoverTouchedFiles`:
- **Happy path**: temp repo, `artifactDir` with `BUILD.md` containing a `## Touched Files` block listing `src/a.ts`, `src/b.ts`; create those files (untracked) so `git status` lists them. Assert `touched.json.files === ["src/a.ts","src/b.ts"]` (sorted) and `expectExactlyOne(events, "touched.recovered")` with `source === "BUILD.md"`, `count === 2`.
- **Verify-only path**: same `BUILD.md`, but the files are committed (clean tree → `git status --porcelain` empty). Assert `touched.json` still populated from the declared `BUILD.md` set; `touched.recovered` emitted once.
- **No `BUILD.md`**: assert `touched.json` absent/unchanged and exactly one `engine.warning { reason: "touched_recovery_empty" }`.
- **`BUILD.md` present, no `## Touched Files` header**: same `touched_recovery_empty` assertion.
- **Already-populated `touched.json`**: seed `touched.json` with `{ files: ["src/x.ts"] }`; run; assert file unchanged and **no** `touched.recovered`/`engine.warning` event (no clobber).
- **Write failure**: write `BUILD.md` with a valid block, then `chmod(artifactDir, 0o555)` (restore in `finally`); assert exactly one `engine.warning { reason: "touched_recovery_write_failed" }` and no throw. (Per CLAUDE.md, real fs/`chmod` manipulation — `node:fs/promises` is not stubbable.)
- **isDenied filtering**: include a denied path in the `BUILD.md` block; assert it is excluded from the written set.

Integration test through `runCycle` (reuse the `run-cycle.touched-json.test.ts:9-90` fake-agent + temp-repo harness):
- Seed a `feature` cycle's `artifactDir` with a `BUILD.md` `## Touched Files` block; pre-create `touched.json` absent. Run `runCycle` with `resume: { startStepIndex }` set past the build index (build is index 3 in `feature`), with fake agents for the remaining steps. Assert the resulting `touched.json` is non-empty and `expectExactlyOne(events, "touched.recovered")`. (AC #1, #2 user-observable benefit.)

Regression test:
- A normal (non-resume) single-build run writes `touched.json` via `accumulateTouchedFiles` and emits **no** `touched.recovered` event (`events.filter(e => e.event === "touched.recovered").length === 0`). (AC #6.)

**File**: `tests/engine/run-cycle.*.test.ts` (existing `appendDocumentationPaths` coverage)
**Changes**: confirm existing tests still pass after the `parseTouchedFilesSection` extraction; add a direct `parseTouchedFilesSection` unit test (header present → set; absent → empty; stops at next `##`).

### Success Criteria
- [ ] All new tests pass; `npm test` green.
- [ ] `npm run test:coverage` — `src/engine/run-cycle.ts` ≥ 90% per-file floor held; every `recoverTouchedFiles` branch (success, populated-skip, empty-warning, write-failed, git-status-nonzero) exercised. Report Line/Branch/Function in `BUILD.md`.
- [ ] `touched.recovered` assertions are cardinality-pinned (`filter(...).length === 1` / `expectExactlyOne`).
- [ ] Failure paths behave as designed (each degrade test asserts the exact warning reason; no swallowed errors).

---

## Task 5: Documentation

### Overview
Document the recovery path per the SPEC documentation requirement.

### Changes Required
**File**: `docs/ENGINE.md` (*touched.json footprint* section, ~`:212-230`)
**Changes**: Add a paragraph describing the resume/verify-only recovery: trigger condition (resume whose `startStepIndex > max(RESET_ELIGIBLE_STEPS index)`, and `touched.json` absent/empty), source (`BUILD.md`'s `## Touched Files`, unioned with current in-scope `git status --porcelain`, `isDenied`-filtered), the `touched.recovered { cycle_id, source, count }` / `engine.warning { reason: "touched_recovery_empty" | "touched_recovery_write_failed" }` events, the never-clobber-populated invariant, and best-effort (never fails the cycle).

**File**: `CLAUDE.md`
**Changes**: Extend the `src/engine/run-cycle.ts` architecture note to mention resume-path footprint recovery (`recoverTouchedFiles`) alongside the existing `accumulateTouchedFiles` description — trigger, source, events, no-clobber.

**File**: `README.md` — no change (no user-facing CLI surface change), per SPEC.

### Success Criteria
- [ ] `docs/ENGINE.md` and `CLAUDE.md` updated with the recovery trigger, source, events, and no-clobber invariant.
- [ ] No stale references introduced; line/section anchors consistent.

---

## SPEC Acceptance Traceability

| SPEC Acceptance Bullet (verbatim) | Covering Task | Notes |
|---|---|---|
| `[ ] Resuming a cycle with --resume-from-step at an index past the build step produces a non-empty touched.json whose files array equals the in-scope paths recovered from BUILD.md's ## Touched Files section (the user-observable benefit: footprint survives the resume).` | Task 2, Task 3, Task 4 | Helper + wiring + integration test asserting populated file. |
| `[ ] On the verify-only path (build already committed, git status --porcelain clean), touched.json is still populated from the recovered footprint rather than left empty.` | Task 2, Task 4 | Verify-only unit test (clean tree → declared set wins). |
| `[ ] A touched.recovered { cycle_id, source, count } event is emitted exactly once on a successful recovery (cardinality-pinned with filter(...).length === 1).` | Task 2, Task 4 | `expectExactlyOne(events, "touched.recovered")`. |
| `[ ] Failure path: when the build step never ran in-process AND no footprint is recoverable (no BUILD.md / no ## Touched Files header), touched.json is left unchanged and exactly one engine.warning { reason: "touched_recovery_empty" } is emitted — no crash, the cycle proceeds.` | Task 2, Task 4 | No-`BUILD.md` and no-header unit tests. |
| `[ ] Recovery does not overwrite an already-non-empty touched.json (running it against a populated file is a no-op that emits no recovery event).` | Task 2, Task 4 | Populated-guard early return; no-event assertion. |
| `[ ] The normal (non-resumed) build path emits no new event and writes touched.json exactly as before.` | Task 3, Task 4 | Predicate gated on `opts.resume`; regression test asserts no `touched.recovered`. |
| `[ ] All existing tests still pass.` | Task 1, Task 4 | `parseTouchedFilesSection` extraction preserves `appendDocumentationPaths`; full suite run. |
| `[ ] No compiler/linter warnings introduced; npm run typecheck clean.` | Task 1–5 | `npm run typecheck` in success criteria of each code task. |

---

## Testing Strategy

### Unit Tests
- `parseTouchedFilesSection`: header present → bullet set; absent header → empty set; stops at next `##`; whitespace/indented bullets trimmed.
- `recoverTouchedFiles` (real temp git repo + fake `Logger`):
  - happy path (BUILD.md + untracked files) → populated `touched.json` + one `touched.recovered`.
  - verify-only (clean tree) → populated from declared set.
  - no `BUILD.md` → `touched_recovery_empty`, file untouched.
  - `BUILD.md` without `## Touched Files` → `touched_recovery_empty`.
  - already-populated `touched.json` → no event, no clobber.
  - write failure (`chmod 0o555` on artifactDir) → `touched_recovery_write_failed`, no throw.
  - `git status` non-zero (simulate by running against a non-repo cwd or a corrupted index) → contributes empty current set; recovers from `BUILD.md` if present, else `touched_recovery_empty`.
  - `isDenied`-listed path in `BUILD.md` excluded from output.
- Mocking strategy: **no mocks** — real temp git repos and real fs; a thin in-memory fake logger that records `emit` calls (the only injected seam). `node:fs/promises` is not stubbable (CLAUDE.md), so the write-failure case uses real `chmod`.

### Integration / E2E Tests
- `runCycle` with `resume.startStepIndex` past the `feature` build index, fake agents for remaining steps, `BUILD.md` seeded with a `## Touched Files` block: assert resulting `touched.json` non-empty and `touched.recovered` emitted exactly once. (Reuses the `run-cycle.touched-json.test.ts` harness.)
- Regression: a normal single-build `feature` run still writes `touched.json` via `accumulateTouchedFiles` and emits no `touched.recovered`.

## Risk Assessment
- **`git status` non-zero swallowing data on the verify-only path**: mitigated — a non-zero status contributes an empty current set but does **not** abort, so a recoverable `BUILD.md` still populates the file; the `touched_recovery_empty` warning only fires when the merged result is truly empty.
- **Coverage floor (run-cycle.ts ≥ 90%)**: every new branch (populated-guard, empty-warning, write-failed, git-status-nonzero) has a dedicated test; report numbers in `BUILD.md`.
- **Parser extraction regressing `appendDocumentationPaths`**: mitigated — the extraction is a literal lift; the insertion-index logic is left untouched and existing tests must pass before commit.
- **Predicate misfire on workflows without a build step**: mitigated — `maxResetIdx === -1` short-circuits recovery (no spurious `git status` spawn, no warning).
