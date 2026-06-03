All open questions are now resolved against the actual code. Writing the plan.

```markdown
# Implementation Plan: Cycle 0034

## Overview
Add a marker-gated **no-op / already-satisfied** terminal cycle resolution at the build/fix empty-diff guard in `src/engine/run-cycle.ts`: when a build/fix step exits 0, the `src scripts tests` diff is empty, AND a well-formed `NOOP.md` marker is present, the engine emits `cycle.noop` + `cycle.end { status: "noop" }` and returns a `noop` result; the supervisor routes that result to the `done/` lane without retrying and without touching the consecutive-failure accounting. Marker absent or malformed ⇒ the existing `formatEmptyDiffGuardError` failure is preserved byte-for-byte (anti-slop).

## Current State (from Research)
- **Empty-diff guard** at `src/engine/run-cycle.ts:648-663`: after a `build`/`fix` step exits 0 and its artifact is written, runs `git status --porcelain -- src scripts tests`; empty ⇒ `r.status="failed"`, `r.stderr = formatEmptyDiffGuardError(step.name)`. The completion-proof block (`:603-647`) runs *before* this guard; `build` proof is `"nonempty"` (BUILD.md must be non-empty).
- **`cycle.end` + return shapes** (`:729-735`): only `"failed"` (`{cycleId, artifactDir, status:"failed", failingStep}`) and `"ok"` (`{cycleId, artifactDir, status:"ok"}`) exist today. `step.end` is emitted at `:706-719`, *after* the guard block and *before* the `if (r.status === "failed")` terminal-return handler (`:720-731`).
- **`finally` cleanup** (`:736-763`) runs on every return path including early returns.
- **run-one exit mapping** (`src/cli/run-one.ts:92`): `process.exit(result.status === "ok" ? 0 : 1)`. The supervisor learns the outcome only from the child exit code plus `readCycleEndFailure` (which recognizes only `status:"failed"`, `src/engine/iteration-guard.ts:30-40`).
- **Supervisor** (`src/cli.ts`): main loop (`:557-686`) branches `exitCode === 0` ⇒ commit + `drainSuccess`; else fast-fail/retry/terminal via `recordTerminalFailure`. Resume loop (`runResumeOnce`, `:359-491`) is the parallel path with `ResumeOutcome = "ok"|"retry"|"terminal"|"skipped"` (`:37-43`).
- **Lifecycle helpers**: `terminalDrain` (`src/engine/issue-lifecycle.ts:9-81`) stamps frontmatter (mutate-then-rename, with a tmp+rename fallback when `mutateFrontmatter` throws) and moves todo → `failed/`. `drainSuccess`/`drainOk` (`src/cli.ts:290-305`, `src/engine/queue.ts:228-232`) reach `done/`.
- **Shared emptiness primitive**: `classifyArtifact(path)` (`:181-188`) fails closed (missing/unreadable/0-byte/whitespace ⇒ `"empty"`).
- **Test pattern**: `tests/engine/empty-diff-guard.test.ts` — temp repo, `git init -b main`, fake `claude` binary on a temp PATH whose script body controls stdout + working-tree mutations; cardinality-pinned event assertions via `filter(...).length === 1`.

### Resolved Open Questions
1. **Outcome channel**: add a distinct run-one exit code **3** for `noop`, consumed by both supervisor loops. Add a sibling reader `readCycleNoop` to recover `reason`/`detected_at_step` from the `cycle.noop` log event for the drain stamp. (Both signals used: exit code is the authoritative branch selector; the log read supplies the reason payload.)
2. **Drain plumbing**: add `"noop"` to `ResumeOutcome`, add a `noopDrain` helper in `issue-lifecycle.ts` (mirrors `terminalDrain`'s robust mutate/fallback pattern but lands in `done/`), bypassing `recordTerminalFailure`.
3. **Commit interaction**: a `noop` exit (code 3) **skips `commitCycle` entirely** — the supervisor branches before the `exitCode === 0` commit block and calls `noopDrain` directly. (Mirrors the no-net-code-change reality; consistent with the existing empty-diff path never committing code.)
4. **NOOP.md reconciliation**: `NOOP.md` is **not** added to `STEP_ARTIFACTS` (it breaks the `<step>.md` basename convention and would force every build to emit it). It is read out-of-band at the empty-diff guard. The build/fix agent still emits a **non-empty `BUILD.md`/`FIX.md` summary** alongside `NOOP.md`, so the pre-guard `"nonempty"` completion-proof passes — no spurious `step.completion_check { status: "fail" }`.
5. **Marker schema/parser**: new pure module `src/engine/noop-marker.ts`. Reason category from a `reason: <category>` line (∈ `already-satisfied | duplicate | not-actionable`); evidence = ≥1 line matching a `<path-with-extension>:<line-number>` token. Parser is pure; the async reader fails closed.
6. **`detected_at_step`**: `step.name` at the guard site (`"build"` or `"fix"`).

## Desired End State
- A build/fix step that exits 0, leaves an empty `src scripts tests` diff, and writes a valid `NOOP.md` resolves the cycle as a no-op: `cycle.noop { cycle_id, issue_id, reason, detected_at_step }` emitted exactly once, then `cycle.end { status: "noop" }`; the issue lands in `docs/cycle/issues/done/` with `noop_reason`/`noop_step` frontmatter stamps; `consecutive_failures`/`failedCycles` are **unchanged**; no retry occurs.
- With **no** marker, the empty diff fails with `formatEmptyDiffGuardError` and routes exactly as before (regression-pinned). A **malformed** marker also falls through to that failure.
- `npm test`, `npm run typecheck`, `npm run check:coverage`, and `npm run check:invariants` all pass; `.cycle/` defaults are in sync with `src/defaults/`.
- **Verify**: new `tests/engine/noop-resolution.test.ts` + `tests/engine/noop-marker.test.ts` pass; `tests/engine/empty-diff-guard.test.ts` still passes unchanged.

## What We're NOT Doing
- **Research-phase early-rejection short-circuit** (detecting the moot issue in `research` and skipping plan/build/review) — explicitly deferred to a sibling cycle.
- A new dedicated `obsolete/`/`superseded/` lifecycle lane — this cycle reuses the existing `done/` terminal lane.
- Changing the unmarked empty-diff failure behavior in any way (message, status, routing, event sequence).
- Auto-committing the no-op artifact docs (`NOOP.md`/`BUILD.md`) — consistent with the existing empty-diff path, which commits no code.
- Adding `NOOP.md` to `STEP_ARTIFACTS`/`ARTIFACT_STEPS` or any completion-proof table.

## Implementation Approach
Vertical slices bottom-up: (1) the pure marker parser/reader; (2) the engine guard integration that emits the new events and returns the `noop` result; (3) the run-one exit-code channel; (4) the supervisor routing + drain + reason reader; (5) prompt emission + sync; (6) docs. Each engine slice is exercised by a real-repo + fake-agent test, matching `empty-diff-guard.test.ts`. The guard integration leaves `step.end` firing with `status: "ok"` (the step genuinely succeeded) and performs the `cycle.noop`/`cycle.end`/return *after* `step.end`, so the no-op flows through the unchanged `finally` cleanup and produces a clean `step.start`/`step.end` pairing.

## Failure & Resilience Decisions

**Task 1 — `src/engine/noop-marker.ts` (parser + reader)**
- **Failure modes**: `parseNoopMarker` is pure — malformed/empty/garbage input returns `{ valid: false }` (never throws). `classifyNoopMarker` reads the file; a missing/unreadable marker is caught and returned as `{ valid: false }` (fail-closed, identical posture to `classifyArtifact`).
- **Idempotency**: read-only, pure; safe to re-run.
- **Observability**: returns a discriminated result the caller logs via `cycle.noop` (valid) or the unchanged `formatEmptyDiffGuardError` (invalid). No swallowed error — invalidity is a returned value, not a silent pass.
- **No silent failure**: the only `catch` converts I/O failure into an explicit `{ valid: false }` that drives the *failure* (anti-slop) path, never a spurious success.

**Task 2 — `src/engine/run-cycle.ts` guard integration**
- **Failure modes**: marker read wrapped in `try/catch`; any internal error ⇒ `{ valid: false }` ⇒ existing `formatEmptyDiffGuardError` failure (degrade-to-failure per SPEC). Valid marker ⇒ emit `cycle.noop` + `cycle.end {status:"noop"}` + return.
- **Idempotency**: a no-op produces no commit and no working-tree mutation under `src/scripts/tests`, so re-running (engine retry/resume) re-reads the same `NOOP.md` left in the artifact dir and re-derives the same `noop` outcome — naturally idempotent. The early return flows through `finally` (checkout/base-pull), same as ok/failed.
- **Observability**: `cycle.noop { cycle_id, issue_id, reason, detected_at_step }` exactly once + `cycle.end {status:"noop"}` in `.cycle/log.jsonl`; `step.end {status:"ok"}` for the build/fix step.
- **No silent failure**: the unmarked/malformed/error paths all surface as the loud `formatEmptyDiffGuardError` step failure routed through the existing terminal/retry path.

**Task 3 — `src/cli/run-one.ts` exit code**
- **Failure modes**: a `noop` status maps to exit 3; any other non-ok status keeps exit 1; thrown error keeps exit 2.
- **Idempotency**: pure mapping of an in-memory result to an exit code; no state.
- **Observability**: the exit code is the supervisor's branch signal; `cycle.noop` already recorded the detail in the log.
- **No silent failure**: N/A — pure mapping; no error path added.

**Task 4 — `src/cli.ts` supervisor + `noopDrain` + `readCycleNoop`**
- **Failure modes**: `readCycleNoop` fails closed (missing/unreadable/absent event ⇒ `undefined`); the supervisor still drains to `done/` on exit 3 (exit code is authoritative) and stamps only the reason fields it has, emitting an `engine.warning { reason: "noop_reason_unreadable" }` when the reader returns nothing. `noopDrain` mirrors `terminalDrain`'s tmp+rename fallback when `mutateFrontmatter` throws.
- **Idempotency**: `drainOk` filters the queue row (no-op if already gone); the todo→done rename tolerates an already-moved file (matches `drainSuccess`). Re-running on the same already-drained issue is safe.
- **Observability**: `queue.drained { cycle_id, issue_id, outcome: "noop" }` (+ optional `reason`); accounting left visibly untouched.
- **No silent failure**: a frontmatter-mutate failure degrades through the fallback path and emits `queue.drain_warning`; a missing reason emits `engine.warning`. Nothing swallowed.

**Task 5 — prompt edits + `sync-defaults`**
- **Failure modes**: N/A — prose prompt files. `npm run sync-defaults` copies `src/defaults/` → `.cycle/`; a failed copy surfaces as a non-zero npm exit.
- **Idempotency**: `sync-defaults` is an idempotent overwrite-copy.
- **No silent failure**: covered by the existing `sync-defaults` script behavior; structural-invariant check fails loudly if defaults drift.

**Task 6 — docs (CLAUDE.md, ENGINE.md)** — N/A — pure documentation.

---

## Task 1: No-op marker parser + reader (`src/engine/noop-marker.ts`)

### Overview
A pure parser plus a fail-closed async reader that classify a `NOOP.md` marker as a valid no-op claim or not.

### Changes Required
**File**: `src/engine/noop-marker.ts` (new)
**Changes**:
```ts
import { readFile } from "node:fs/promises";

export const NOOP_REASONS = new Set([
  "already-satisfied",
  "duplicate",
  "not-actionable",
]);

export type NoopClassification =
  | { valid: true; reason: string }
  | { valid: false };

// A `<path>.<ext>:<line>` evidence token (e.g. src/engine/run-cycle.ts:653).
const EVIDENCE_RE = /[\w./-]+\.\w+:\d+\b/;
const REASON_RE = /^\s*reason\s*:\s*([a-z-]+)\s*$/i;

export function parseNoopMarker(content: string): NoopClassification {
  let reason: string | undefined;
  let evidenceCount = 0;
  for (const line of content.split("\n")) {
    const m = REASON_RE.exec(line);
    if (m && reason === undefined) {
      const r = m[1].toLowerCase();
      if (NOOP_REASONS.has(r)) reason = r;
    }
    if (EVIDENCE_RE.test(line)) evidenceCount++;
  }
  if (reason !== undefined && evidenceCount >= 1) return { valid: true, reason };
  return { valid: false };
}

export async function classifyNoopMarker(markerPath: string): Promise<NoopClassification> {
  let content: string;
  try {
    content = await readFile(markerPath, "utf8");
  } catch {
    return { valid: false }; // absent / unreadable ⇒ not a no-op (fail-closed)
  }
  return parseNoopMarker(content);
}
```
Note: an unrecognized `reason:` value yields `reason === undefined` ⇒ invalid; a recognized reason with zero evidence lines ⇒ invalid. The `reason:` line itself never matches `EVIDENCE_RE` (no `.ext:digits` token).

**File**: `scripts/coverage-gate.mjs`
**Changes**: add `"src/engine/noop-marker.ts": { line: 100, branch: 100, function: 100 }` to the `FLOORS` table (pure module, fully testable).

### Success Criteria
- [ ] Compiles/typechecks cleanly.
- [ ] `parseNoopMarker` returns `{valid:true,reason}` for a valid marker; `{valid:false}` for: empty, no `reason:`, unrecognized reason, recognized reason with zero evidence.
- [ ] `classifyNoopMarker` returns `{valid:false}` for a missing file (no throw).
- [ ] Failure paths behave as designed (no throw on bad input / missing file).

---

## Task 2: Engine no-op resolution at the empty-diff guard (`src/engine/run-cycle.ts`)

### Overview
Insert the marker check into the empty-diff guard so a valid marker classifies the cycle as a no-op, emitting the new events and returning a `noop` result; absent/malformed/error preserves the existing failure.

### Changes Required
**File**: `src/engine/run-cycle.ts`
**Changes**:
1. Import the reader: `import { classifyNoopMarker } from "./noop-marker.ts";`
2. Declare a per-step local before the `if (step.agent !== "bash")` artifact block (reset each iteration), e.g. `let noopOutcome: { reason: string; step: string } | null = null;`.
3. In the empty-diff guard (`:648-663`), when the diff is empty, attempt marker classification **before** failing:
```ts
if (r.status === "ok" && (step.name === "build" || step.name === "fix")) {
  const changed = spawnSync("git", ["status", "--porcelain", "--", "src", "scripts", "tests"], {
    cwd: repoRoot, encoding: "utf8", shell: false,
  });
  if (!changed.stdout || !changed.stdout.trim()) {
    let marker: NoopClassification = { valid: false };
    try {
      marker = await classifyNoopMarker(join(artifactDir, "NOOP.md"));
    } catch {
      marker = { valid: false }; // degrade to the existing failure path
    }
    if (marker.valid) {
      noopOutcome = { reason: marker.reason, step: step.name };
      // leave r.status === "ok" — step.end fires "ok"; cycle.noop handled below
    } else {
      r.status = "failed";
      r.exitCode = r.exitCode || 1;
      r.stderr = formatEmptyDiffGuardError(step.name);
    }
  }
}
```
4. After the `step.end` emission (`:706-719`) and **before** the `if (r.status === "failed")` block (`:720`), handle the no-op return:
```ts
if (noopOutcome) {
  await log.emit("cycle.noop", {
    cycle_id: cycleId,
    issue_id: opts.issueId,
    reason: noopOutcome.reason,
    detected_at_step: noopOutcome.step,
  });
  await log.emit("cycle.end", { cycle_id: cycleId, status: "noop" });
  return {
    cycleId, artifactDir, status: "noop" as const,
    reason: noopOutcome.reason, detectedAtStep: noopOutcome.step,
  };
}
```
This return is inside the `try`, so the `finally` checkout/base-pull runs unchanged. `STEP_ARTIFACTS` is **not** modified — the pre-guard `"nonempty"` proof on `BUILD.md`/`FIX.md` still runs and passes given a non-empty summary, so no spurious `step.completion_check { status: "fail" }`.

### Success Criteria
- [ ] Compiles/typechecks; `runCycle`'s return type now includes the `noop` variant.
- [ ] Build exit 0 + empty diff + valid `NOOP.md` ⇒ `cycle.noop` (×1) then `cycle.end {status:"noop"}`; `step.end {status:"ok"}` for build; no `step.completion_check {status:"fail"}`.
- [ ] Absent marker ⇒ `formatEmptyDiffGuardError`, `cycle.end {status:"failed", failing_step:"build"}` — byte-for-byte identical to today.
- [ ] Malformed marker ⇒ falls through to the same failure.
- [ ] `finally` checkout/base-pull events emitted on the no-op return.
- [ ] Failure paths behave as designed (marker-read error ⇒ failure, never a swallowed success).

---

## Task 3: run-one exit-code channel (`src/cli/run-one.ts`)

### Overview
Map the new `noop` status to a distinct child exit code (3) so the supervisor can branch on it.

### Changes Required
**File**: `src/cli/run-one.ts`
**Changes**: replace `process.exit(result.status === "ok" ? 0 : 1);` with:
```ts
process.exit(result.status === "ok" ? 0 : result.status === "noop" ? 3 : 1);
```

### Success Criteria
- [ ] `noop` result ⇒ exit 3; `ok` ⇒ 0; any other ⇒ 1; thrown ⇒ 2 (unchanged).
- [ ] Compiles/typechecks; coverage floor for `run-one.ts` (≥70%) met.

---

## Task 4: Supervisor no-op routing (`src/cli.ts`, `src/engine/issue-lifecycle.ts`, `src/engine/iteration-guard.ts`)

### Overview
Route a child exit code 3 to a `done/` drain that records the reason and leaves the failure accounting unchanged, in both the main loop and the resume loop.

### Changes Required
**File**: `src/engine/iteration-guard.ts`
**Changes**: add a sibling reader:
```ts
export async function readCycleNoop(
  repoRoot: string,
  cycleId: string,
): Promise<{ reason: string | undefined; detectedAtStep: string | undefined } | undefined> {
  try {
    const text = await readFile(join(repoRoot, ".cycle", "log.jsonl"), "utf8");
    const lines = text.split("\n");
    for (let i = lines.length - 1; i >= 0; i--) {
      const line = lines[i].trim();
      if (!line) continue;
      let ev: Record<string, unknown>;
      try { ev = JSON.parse(line); } catch { continue; }
      if (ev.event === "cycle.noop" && ev.cycle_id === cycleId) {
        return {
          reason: typeof ev.reason === "string" ? ev.reason : undefined,
          detectedAtStep: typeof ev.detected_at_step === "string" ? ev.detected_at_step : undefined,
        };
      }
    }
    return undefined;
  } catch {
    return undefined;
  }
}
```

**File**: `src/engine/issue-lifecycle.ts`
**Changes**: add `noopDrain` mirroring `terminalDrain`'s structure but moving todo → `doneDir` and stamping no-op frontmatter:
```ts
export async function noopDrain(
  cwd: string, log: Logger, todoPath: string, doneDir: string,
  cycleId: string, issueId: string, reason: string | undefined, detectedAtStep: string | undefined,
): Promise<void> {
  let mutateErr: Error | null = null;
  try {
    await mutateFrontmatter(todoPath, (fm) => ({
      ...fm,
      noop_at: new Date().toISOString(),
      ...(reason ? { noop_reason: reason } : {}),
      ...(detectedAtStep ? { noop_step: detectedAtStep } : {}),
      last_cycle_id: cycleId,
    }));
  } catch (e) { mutateErr = e as Error; }
  const donePath = join(doneDir, `${issueId}.md`);
  if (mutateErr) {
    // tmp+rename fallback identical in spirit to terminalDrain's, writing to donePath,
    // recording drain_error, unlinking todoPath, emitting queue.drain_warning.
    // ...
  } else {
    try { await rename(todoPath, donePath); }
    catch (e) { if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e; }
  }
  await drainOk(cwd, issueId);
  await log.emit("queue.drained", { cycle_id: cycleId, issue_id: issueId, outcome: "noop", ...(reason ? { reason } : {}) });
}
```
(Reuse the exact tmp+rename fallback shape from `terminalDrain`; import `drainOk` from `./queue.ts`.)

**File**: `src/cli.ts`
**Changes**:
1. Imports: add `noopDrain` from `./engine/issue-lifecycle.ts` and `readCycleNoop` from `./engine/iteration-guard.ts`.
2. Extend `ResumeOutcome` to `"ok" | "retry" | "terminal" | "skipped" | "noop"`.
3. Compute `failure` only for genuine failures: guard the existing `readCycleEndFailure` call with `exitCode !== 0 && exitCode !== 3` (exit 3 is not a failure).
4. **Main loop** — insert a `noop` branch between the `exitCode === 0` and the `else` (failure) branches:
```ts
} else if (exitCode === 3) {
  const noop = await readCycleNoop(cwd, cycleId);
  if (!noop || noop.reason === undefined) {
    await log.emit("engine.warning", { reason: "noop_reason_unreadable", cycle_id: cycleId, issue_id: row.id });
  }
  await noopDrain(cwd, log, todoPath, doneDir, cycleId, row.id, noop?.reason, noop?.detectedAtStep);
  cyclesProcessed++;
  // accounting deliberately untouched: SPEC requires consecutive_failures unchanged
  // (no increment, no append, no reset).
}
```
5. **Resume loop** (`runResumeOnce`) — add the analogous branch before `if (exitCode === 0)`, returning `{ processed: 1, outcome: "noop" }`. In the resume-outcome handler (`:499-512`) add `else if (result.outcome === "noop") { /* counters untouched */ }`.

### Success Criteria
- [ ] Compiles/typechecks.
- [ ] Exit 3 ⇒ issue moved to `docs/cycle/issues/done/` with `noop_reason`/`noop_step` frontmatter; `queue.drained {outcome:"noop"}` emitted; `commitCycle` not called.
- [ ] `consecutiveFailures`/`failedCycles`/`lastHaltContext` unchanged across a no-op (verified before/after).
- [ ] No `drainRetry`/`terminalDrain`/`recordTerminalFailure` invoked for a no-op.
- [ ] Missing `cycle.noop` event ⇒ `engine.warning {reason:"noop_reason_unreadable"}` and the issue still drains to `done/`.
- [ ] `issue-lifecycle.ts` coverage floor (≥95%) met for `noopDrain` incl. the mutate-failure fallback.

---

## Task 5: Build/fix prompt marker emission + sync defaults

### Overview
Instruct the build and fix agents to emit `NOOP.md` (reason + file:line evidence) instead of fabricating edits when the SPEC is already satisfied, while still producing a non-empty summary.

### Changes Required
**File**: `src/defaults/prompts/build.md` (and `src/defaults/prompts/fix.md`)
**Changes**: add an "## If the work is already done (no-op)" section, e.g.:
> If, after analysis, the SPEC's requirements are **already fully satisfied** in the codebase and **no code change is warranted**, do NOT fabricate edits. Instead:
> 1. Write `NOOP.md` into the cycle's artifact dir (`docs/cycle/<cycle_id>-<workflow>-<slug>/NOOP.md`) containing:
>    - a `reason: <category>` line where `<category>` is one of `already-satisfied`, `duplicate`, `not-actionable`;
>    - a `## Evidence` list with at least one `path/to/file.ext:line` reference proving each SPEC requirement is already met.
> 2. Still produce the normal **non-empty** `BUILD.md` summary (this stdout) explaining the no-op conclusion and citing the same evidence. An empty summary fails the completion-proof check before the no-op is recognized.
>
> Do this **only** when genuinely satisfied — an unmarked or malformed marker is treated as a real empty-diff failure (anti-slop).

Mirror the section in `fix.md` (the empty-diff guard applies to the `fix` step too; phrase it for the review/MUST-FIX context).

**Then**: run `npm run sync-defaults` to propagate `src/defaults/` → `.cycle/`.

### Success Criteria
- [ ] `build.md` and `fix.md` contain the no-op marker instructions with the exact category set and the `file.ext:line` evidence format.
- [ ] `npm run sync-defaults` run; `.cycle/prompts/build.md` and `.cycle/prompts/fix.md` match the sources.
- [ ] `npm run check:invariants` (defaults-in-sync) passes.

---

## Task 6: Documentation (CLAUDE.md, docs/ENGINE.md)

### Overview
Document the new event, the marker-gated resolution, the terminal lane, and the anti-slop contract.

### Changes Required
**File**: `CLAUDE.md`
**Changes**: in the `run-cycle.ts` notes, document the `cycle.noop` event and marker-gated no-op resolution at the empty-diff guard, the `NOOP.md` marker schema, the `done/` lane, run-one exit code 3, and "marker absent/malformed ⇒ `formatEmptyDiffGuardError` preserved". Add a Workflow-defaults bullet summarizing the no-retry / `consecutive_failures`-unchanged semantics.

**File**: `docs/ENGINE.md`
**Changes**: add a *No-op / already-satisfied resolution* section: detection condition (build/fix exit 0 + empty `src scripts tests` diff + valid `NOOP.md`), marker schema (reason category + ≥1 file:line evidence), `cycle.noop` payload, `cycle.end {status:"noop"}`, the `done/` lifecycle move + frontmatter stamps, run-one exit-code 3 channel, and the no-retry / no-`consecutive_failures` semantics. Cross-reference the existing *Empty-diff post-condition* and *Completion-proof post-condition* sections.

**File**: `README.md` — no user-facing CLI change; add a one-line note only if a new observable behavior warrants it (none expected).

### Success Criteria
- [ ] CLAUDE.md and ENGINE.md describe the event, schema, lane, exit code, and accounting semantics.
- [ ] Docs match the implemented behavior (event name, payload fields, categories).

---

## Task 7: Tests

### Overview
End-to-end engine tests for the no-op path plus unit tests for the parser and supervisor accounting.

### Changes Required
**File**: `tests/engine/noop-marker.test.ts` (new) — unit tests for `parseNoopMarker`/`classifyNoopMarker`.
**File**: `tests/engine/noop-resolution.test.ts` (new) — extends the `empty-diff-guard.test.ts` harness (temp repo, fake `claude` whose script writes `NOOP.md` + a non-empty `BUILD.md` and makes no `src/scripts/tests` change).
**File**: `tests/engine/iteration-guard.test.ts` (or a new file) — `readCycleNoop` cases.
**File**: supervisor-level test for the noop accounting + `done/` move (extend existing supervisor/cli test harness, or `tests/engine/issue-lifecycle.test.ts` for `noopDrain`).

### Success Criteria
- [ ] All new tests pass; all existing tests pass (`npm test`).
- [ ] Exactly-once `cycle.noop` pinned via `filter(...).length === 1` / `expectExactlyOne`.
- [ ] Coverage floors met (`run-cycle.ts` ≥90%, `noop-marker.ts` 100%, `issue-lifecycle.ts` ≥95%, `run-one.ts` ≥70%).

---

## SPEC Acceptance Traceability

| SPEC Acceptance Bullet (verbatim) | Covering Task | Notes |
|---|---|---|
| `[ ] **(User-observable benefit)** Running a cycle whose build step exits 0, produces an empty `src/scripts/tests` diff, and writes a valid `NOOP.md` results in the issue landing in `docs/cycle/issues/done/` (not `failed/`) and `consecutive_failures` is unchanged from before the cycle.` | Task 2, Task 4, Task 7 | Engine emits noop + returns; supervisor drains to `done/` with accounting untouched; E2E + supervisor test verify. |
| `[ ] A `cycle.noop { cycle_id, issue_id, reason, detected_at_step }` event is emitted exactly once for a no-op cycle (cardinality-pinned via `filter(...).length === 1` / `expectExactlyOne`), followed by `cycle.end { status: "noop" }`.` | Task 2, Task 7 | Emission ordering `step.end → cycle.noop → cycle.end{noop}`; cardinality-pinned in `noop-resolution.test.ts`. |
| `[ ] **(Failure path)** With an empty diff and **no** `NOOP.md` marker, the cycle fails with `formatEmptyDiffGuardError` and routes through the existing retry/terminal-failure path — state and event sequence identical to pre-cycle behavior (regression-pinned).` | Task 2, Task 7 | Guard preserves the existing failure when `classifyNoopMarker` ⇒ `{valid:false}`; regression-pinned test. |
| `[ ] **(Failure path)** A *malformed* `NOOP.md` (no recognized reason category or zero file:line evidence lines) does NOT classify as a no-op — it falls through to the empty-diff failure.` | Task 1, Task 2, Task 7 | `parseNoopMarker` returns `{valid:false}`; guard routes to failure; covered by parser + engine tests. |
| `[ ] A no-op cycle does not trip the build/fix completion-proof / artifact post-condition (no spurious `step.completion_check { status: "fail" }`).` | Task 2, Task 5, Task 7 | `NOOP.md` not in `STEP_ARTIFACTS`; agent emits non-empty `BUILD.md`/`FIX.md`; test asserts no `status:"fail"` completion_check. |
| `[ ] All existing tests still pass.` | Task 7 | `empty-diff-guard.test.ts` and full suite run unchanged. |
| `[ ] No compiler/linter warnings introduced; per-file coverage floors (`src/engine/run-cycle.ts` ≥ 90%, plus any touched module floors) met.` | Task 1, Task 4, Task 7 | `typecheck` clean; floors for `run-cycle.ts`, `noop-marker.ts` (new, 100%), `issue-lifecycle.ts`, `run-one.ts` met. |

---

## Testing Strategy

### Unit Tests
- **`parseNoopMarker`/`classifyNoopMarker`** (`noop-marker.test.ts`): valid marker (each of the three categories) ⇒ `{valid:true,reason}`; empty content; no `reason:` line; unrecognized reason (`reason: bogus`); recognized reason + zero evidence lines; evidence-present + no reason; missing file (reader ⇒ `{valid:false}`, no throw); a `reason:` line alone must not be mis-counted as evidence.
- **`readCycleNoop`** (`iteration-guard.test.ts`): finds the last `cycle.noop` for the cycle id; missing log ⇒ `undefined`; malformed JSON lines skipped; non-string `reason`/`detected_at_step` ⇒ `undefined` fields.
- **`noopDrain`** (`issue-lifecycle.test.ts`): happy move to `done/` with stamps + queue row removed; mutate-failure fallback path (chmod the file read-only or force `mutateFrontmatter` to throw via a malformed frontmatter) ⇒ tmp+rename + `queue.drain_warning`; missing reason ⇒ stamps omitted, still drains.
- **Failure-path tests** (per the decisions above): marker-read I/O error ⇒ engine failure (Task 2); missing `cycle.noop` event ⇒ `engine.warning` + still drains (Task 4); malformed marker ⇒ `formatEmptyDiffGuardError` (Task 2).
- **Mocking strategy**: prefer real implementations — real temp repos, real `git`, real fake-agent shell scripts (per `empty-diff-guard.test.ts`), real filesystem for marker files. Avoid `mock.method` on `node:fs/promises` (non-configurable ESM exports per CLAUDE.md); use real files / `chmod` to drive I/O failures.

### Integration / E2E Tests
- **Happy no-op** (`noop-resolution.test.ts`): fake `claude` for the `build` step writes a valid `NOOP.md` + non-empty `BUILD.md`, makes no `src/scripts/tests` change ⇒ assert `cycle.noop` ×1 with correct `reason`/`detected_at_step`, `cycle.end {status:"noop"}`, `step.end {status:"ok"}` for build, no `step.completion_check {status:"fail"}`, and `cycle.checkout`/`cycle.base_pull` emitted (finally ran). Assert `runCycle` returns `status:"noop"`.
- **Marker absent / malformed**: same harness without a marker / with a `reason:`-less marker ⇒ assert `cycle.end {status:"failed", failing_step:"build"}` with `formatEmptyDiffGuardError` text — regression-pinned against the pre-cycle sequence.
- **Reason propagation**: parametrize the three categories; assert each surfaces verbatim in `cycle.noop.reason`.
- **Supervisor accounting**: drive `spawnRunOne` to exit 3 (fake inner runner / fixture log) ⇒ assert issue in `done/`, `queue.drained {outcome:"noop"}`, and `consecutiveFailures`/`failedCycles` unchanged with no `recordTerminalFailure`/`terminalDrain`/`drainRetry` calls.
- **fix-step no-op**: the same path with `detected_at_step:"fix"`.

## Risk Assessment
- **Skipping `step.end` on the no-op return**: mitigated by performing the `cycle.noop`/`cycle.end`/return *after* the `step.end` emission with `r.status` left `"ok"`, so the no-op produces the same `step.start`/`step.end` pairing as every other terminal path.
- **Log-read race for the reason**: `readCycleNoop` may not yet see `cycle.noop` (POSIX `O_APPEND` makes interleaving safe, but the read could precede a flush) — mitigated by treating exit code 3 as authoritative and degrading missing reason to an `engine.warning` while still draining to `done/`.
- **Over-permissive evidence regex matching unrelated text** ⇒ a slop marker passing validation: mitigated by requiring a `<path>.<ext>:<line>` token (dotted filename + `:digits`) *and* a recognized `reason:` category; an unmarked/no-reason marker always fails. Anti-slop is preserved because both conditions must hold.
- **`NOOP.md`/`BUILD.md` left uncommitted in the working tree** (commit skipped): consistent with the existing empty-diff/no-net-change behavior; out of scope to commit them this cycle. Documented in ENGINE.md.
```
