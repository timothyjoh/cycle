# Implementation Plan: Cycle 0274

## Overview
Promote the walkthrough degradation signal from a non-blocking flag to a fail-closed blocking gate on the `feature` workflow's `walkthrough_capture` step: in a repo that opts in via `engine.walkthrough_required: true`, a UI-shipping cycle whose present-and-run hook reports degradation (or wrote an unparseable sidecar) fails through the existing fatal step-failure path with a named diagnostic, instead of draining `ok`.

## Current State (from Research)
- The `walkthrough_capture` intercept (`src/engine/run-cycle.ts:499-567`) fully handles the step name-keyed/phase-aware and `continue`s, never reaching generic dispatch. It already has the exact fatal block to reuse (`:529-542`: `step.end { status: "failed" }` → `cycle.end { status: "failed", failing_step }` → early `return`) and the success tail (`:544-565`).
- `WALKTHROUGH_MEDIA_DIRNAME = "walkthrough"` (`src/engine/walkthrough.ts:10`) locates the media subdir; the sidecar `walkthrough-status.json` lives alongside the un-phased media there.
- Pure-classifier model: `src/engine/noop-marker.ts` (`parseNoopMarker` pure + `classifyNoopMarker` fail-closed reader) and `src/engine/verify-counts.ts` (discriminated null-able pure parser). The new module mirrors these — but its fail-closed direction is **inverted** for the absent case: absent sidecar ⇒ not degraded; present-but-unparseable ⇒ degraded.
- Per-issue opt-out: `resolveExpectsCode(fm)` (`src/engine/run-cycle.ts:115-117`) returns `false` only for an explicit boolean; the new `expects_ui` predicate mirrors the `=== false`-only structural check.
- Lazy source-issue read + `try/catch`-degrade pattern: `src/engine/run-cycle.ts:798-807` (reads `docs/cycle/issues/todo/${opts.issueId}.md`, `parseFrontmatter`, degrades to safe default on any error).
- Defensive `=== true` flag coercion convention: `engine.compress_output` (`src/engine/workflow.ts:48-51`); read-site coercion mirror: `walkthrough_hook_timeout_ms` (`src/engine/run-cycle.ts:518-521`).
- Diagnostic formatters home: `src/engine/run-cycle.ts:324-330` (`formatWalkthroughTimeoutError`, `formatVerifyUnverifiedError`). stderr capping: `truncateHeadCapped(s, MAX_STEP_END_STDERR=2000)`.
- `EngineConfig` (`src/engine/workflow.ts:35-77`) is pass-through via `loadConfig` (`:195`); adding `walkthrough_required?: boolean` is a type-only change.
- Integration harness: `tests/engine/run-cycle.walkthrough.test.ts` (single-`walkthrough_capture`-step workflow, `setupRepo`, `writeHook`, `readEvents`/`stepEvents`). Issue IDs like `WT-1` have no `docs/cycle/issues/todo/<id>.md`, so the per-issue read hits `catch` → fail-closed UI-shipping default; exemption-path tests must create a real todo issue file.

## Desired End State
- A new pure module `src/engine/walkthrough-gate.ts` exports `resolveWalkthroughRequired(cfg)`, `resolveExpectsUi(fm)`, `classifyWalkthroughDegradation(text)`, and the async fail-closed reader `readWalkthroughDegradation(sidecarPath)`.
- `EngineConfig.walkthrough_required?: boolean` declared; `loadConfig` unchanged (pass-through).
- The `walkthrough_capture` intercept gains a gate between the existing fatal-exit check (`:529`) and the success `step.end` (`:558`): when the gate is active and the sidecar reports degradation, it emits `walkthrough.degraded` exactly once and routes through the existing fatal block.
- `formatWalkthroughDegradedError` exported alongside the sibling formatters.
- A `FLOORS` entry for `src/engine/walkthrough-gate.ts` at 95% in `scripts/coverage-gate.mjs`.
- CLAUDE.md and `docs/ENGINE.md` document the gate; `npm test` / `npm run typecheck` clean.
- Verify: in a required repo, a fake hook writing `{ degraded: true }` fails the cycle; default-off config is byte-for-byte unchanged.

## What We're NOT Doing
- No engine-side heuristic degradation detection (inferring from media content/filenames). Gate fires only on the explicit hook-owned sidecar.
- No authoring/driving of consumer-repo walkthrough scenarios or hooks.
- No verify/e2e gating (sibling cycles 0272/0273).
- No gating of the `quickfix` `walkthrough_before` / `walkthrough_after` phases — `walkthrough_capture` (phase `undefined`) only.
- No new halt reason; reuse the existing fatal step-failure / `max_cycle_attempts` retry path.
- No README change (engine config knob, documented in CLAUDE.md/ENGINE.md).
- No UI deliverable / Playwright suite in this cycle.

## Implementation Approach
A new pure resolver module isolates all gate logic (config coercion, UI-scope predicate, sidecar classification) behind never-throw functions with discriminated returns, exactly as `verify-counts.ts` / `noop-marker.ts` do — keeping `run-cycle.ts` changes to a thin, guard-ordered wire-in. The wire-in is **short-circuited on the config check first** (`resolveWalkthroughRequired(cfg) !== true` ⇒ zero added I/O, no issue read, no sidecar parse — guaranteeing the default-off path is byte-for-byte unchanged). Only when required do we (a) read the source issue for UI-scope (reusing the lazy-read+degrade pattern), and (b) if UI-shipping, read+classify the sidecar. A degraded verdict flips into the **existing** fatal block (no duplicated `step.end`/`cycle.end`/`return`). The gate sits after the exit-0 success of the hook and before the success-tail media collect, so the non-zero-exit/timeout fatal path and the post-success best-effort degrade are both untouched.

Open questions resolved:
- **`reason` vocabulary**: `classifyWalkthroughDegradation` returns `{ degraded: true, reason }` where `reason` is `"degraded_flag: <hook reason>"` when the sidecar's `degraded === true` (folding in the hook-supplied `reason` string when present, else the bare `"degraded_flag"`), or `"unparseable: <detail>"` when present-but-corrupt. `{ degraded: false }` otherwise.
- **`sidecar` event field**: the sidecar path relative to `repoRoot` (e.g. `docs/cycle/<id>-<slug>/walkthrough/walkthrough-status.json`), computed via `relative(repoRoot, sidecarPath)`.
- **Return type**: discriminated `{ degraded: true; reason: string } | { degraded: false }` — one `reason` channel covering both the hook flag and the parse failure (distinguished by prefix).
- **Guard order**: config check → UI-scope read → sidecar classify, short-circuiting at each negative.
- **Module path / floor**: `src/engine/walkthrough-gate.ts`, registered at 95% in `FLOORS`.

## Failure & Resilience Decisions

- **`resolveWalkthroughRequired(cfg)`** — N/A — pure. `=== true` coercion; any shape ⇒ boolean, never throws.
- **`resolveExpectsUi(fm)`** — N/A — pure. `=== false`-only structural check; non-boolean/absent ⇒ `true`, never throws.
- **`classifyWalkthroughDegradation(text)`** — N/A — pure. `JSON.parse` wrapped in `try/catch`; parse error or non-object ⇒ `{ degraded: true, reason: "unparseable: …" }` (fail-closed); never throws.
- **`readWalkthroughDegradation(sidecarPath)`** — I/O (filesystem read).
  - **Failure modes**: file absent (ENOENT) ⇒ `{ degraded: false }` (the hook ran and did not flag — SPEC-mandated direction); file present but unreadable (EACCES/EISDIR) ⇒ degraded with `reason: "unparseable: <error>"` (a present-but-unreadable proof signal cannot be coerced to "works"); content present-but-corrupt ⇒ `classifyWalkthroughDegradation` ⇒ degraded. Distinguishing absent from other read errors is done by inspecting `err.code === "ENOENT"`.
  - **Idempotency**: pure read, no mutation; safe to re-run on every cycle attempt (last-write-wins sidecar, deterministic `CYCLE_ARTIFACT_DIR` path).
  - **Observability**: the caller emits `walkthrough.degraded { cycle_id, step, reason, sidecar }` exactly once on the degraded path, and the `formatWalkthroughDegradedError` diagnostic flows into `step.end.stderr`. The not-degraded path is silent (unchanged success tail).
  - **No silent failure**: never swallows into a false "works" — only ENOENT (genuine absence, which the SPEC defines as not-degraded) returns `{ degraded: false }`; every other error fails closed to degraded.
- **The `run-cycle.ts` wire-in (UI-scope source-issue read)** — I/O (filesystem read + subprocess-free).
  - **Failure modes**: missing/unreadable issue file or `parseFrontmatter` throw (`"no frontmatter"`) ⇒ `catch` degrades to the fail-closed default (UI-shipping in a required repo). Never throws out of the intercept.
  - **Idempotency**: read-only; re-run safe.
  - **Observability**: a degraded gate trip emits `walkthrough.degraded`; an exempt/clean path proceeds to the unchanged `step.end { status: "ok" }`. No new event on the non-gated paths.
  - **No silent failure**: a read error degrades toward *more* gating (fail-closed UI-shipping), never toward a silent pass; the only relaxation is an explicit `expects_code: false` / `expects_ui: false`.

---

## Task 1: Add `walkthrough_required` to the config type

### Overview
Plumb the optional boolean through the config type so the read site can coerce it. Pass-through only — no parse logic.

### Changes Required
**File**: `src/engine/workflow.ts`
**Changes**: In the `EngineConfig` interface (≈`:35-77`, alongside `compress_output?`, `walkthrough_hook?`, `walkthrough_hook_timeout_ms?`, `verify_min_executed?`):
```ts
  /** Opt-in: a degraded walkthrough on a UI-shipping feature cycle fails the
   *  cycle (cycle 0274). Default false (coerced `=== true` at the read site). */
  walkthrough_required?: boolean;
```
`loadConfig` (`:195` `return parsed as CycleConfig`) is unchanged — the field flows through by pass-through.

### Success Criteria
- [ ] `npm run typecheck` clean.
- [ ] Configs with no `walkthrough_required` load unchanged.
- [ ] Failure paths behave as designed — N/A — pure type addition.

---

## Task 2: New pure resolver module `src/engine/walkthrough-gate.ts`

### Overview
The pure half of the gate: config coercion, the per-issue UI-scope predicate, the sidecar classifier, and the fail-closed async reader.

### Changes Required
**File**: `src/engine/walkthrough-gate.ts` (new)
**Changes**:
```ts
import { readFile } from "node:fs/promises";
import type { CycleConfig } from "./workflow.ts";

export type WalkthroughDegradation =
  | { degraded: true; reason: string }
  | { degraded: false };

/** Defensive `=== true` coercion of engine.walkthrough_required. Absent /
 *  non-boolean / malformed / missing engine ⇒ false. Never throws. */
export function resolveWalkthroughRequired(cfg: CycleConfig): boolean {
  return cfg?.engine?.walkthrough_required === true;
}

/** UI-scope opt-out predicate. Mirrors resolveExpectsCode: returns false ONLY
 *  for an explicit boolean `expects_ui: false`; absent / non-boolean / true
 *  ⇒ true (fail-closed UI-shipping). Never throws. */
export function resolveExpectsUi(fm: Record<string, unknown>): boolean {
  return fm?.expects_ui === false ? false : true;
}

/** Pure classifier over the sidecar's text. Present-but-corrupt ⇒ degraded
 *  (`unparseable`), because a corrupt proof-of-work signal cannot be coerced
 *  to "the app works". A parsed object with `degraded === true` ⇒ degraded
 *  (folding in the hook-supplied reason); otherwise not degraded. Never throws. */
export function classifyWalkthroughDegradation(text: string): WalkthroughDegradation {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    return { degraded: true, reason: `unparseable: ${err instanceof Error ? err.message : String(err)}` };
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return { degraded: true, reason: "unparseable: sidecar is not a JSON object" };
  }
  const rec = parsed as Record<string, unknown>;
  if (rec.degraded === true) {
    const hookReason = typeof rec.reason === "string" && rec.reason.trim() ? rec.reason.trim() : undefined;
    return { degraded: true, reason: hookReason ? `degraded_flag: ${hookReason}` : "degraded_flag" };
  }
  return { degraded: false };
}

/** Fail-closed reader. Absent sidecar (ENOENT) ⇒ not degraded (the hook ran
 *  and did not flag). Present-but-unreadable ⇒ degraded (cannot coerce a
 *  corrupt/unreadable proof to "works"). Otherwise delegate to the pure
 *  classifier. Never throws. */
export async function readWalkthroughDegradation(sidecarPath: string): Promise<WalkthroughDegradation> {
  let text: string;
  try {
    text = await readFile(sidecarPath, "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException)?.code === "ENOENT") return { degraded: false };
    return { degraded: true, reason: `unparseable: ${err instanceof Error ? err.message : String(err)}` };
  }
  return classifyWalkthroughDegradation(text);
}
```

### Success Criteria
- [ ] Compiles cleanly; `npm run typecheck` clean.
- [ ] Unit tests (Task 5) pass over all input shapes.
- [ ] No function throws for any input (string / non-string handled by caller types; filesystem errors caught).
- [ ] Failure paths behave as designed — absent ⇒ not degraded; corrupt/unreadable ⇒ degraded; errors surfaced via the `reason` channel, never swallowed into a false `{ degraded: false }`.

---

## Task 3: Add `formatWalkthroughDegradedError` diagnostic formatter

### Overview
Pure stderr-message builder alongside the sibling formatters.

### Changes Required
**File**: `src/engine/run-cycle.ts` (after `formatWalkthroughTimeoutError`, ≈`:326`)
**Changes**:
```ts
export function formatWalkthroughDegradedError(reason: string): string {
  return `walkthrough did not demonstrate the feature: ${reason} — failing cycle (engine.walkthrough_required)`;
}
```

### Success Criteria
- [ ] Compiles cleanly.
- [ ] Unit test asserts the message contains `walkthrough did not demonstrate the feature` and the passed reason.
- [ ] Failure paths — N/A — pure.

---

## Task 4: Wire the gate into the `walkthrough_capture` intercept

### Overview
Insert the gate between the existing fatal-exit check (`:529-542`) and the success `step.end` (`:558`), short-circuited on the config check, routing a degraded verdict through the existing fatal block.

### Changes Required
**File**: `src/engine/run-cycle.ts`

1. Import the new module (near `:30-31`):
```ts
import {
  resolveWalkthroughRequired,
  resolveExpectsUi,
  readWalkthroughDegradation,
} from "./walkthrough-gate.ts";
```
Ensure `relative` is imported from `node:path` (add to the existing `node:path` import if absent) and `WALKTHROUGH_MEDIA_DIRNAME` is imported from `./walkthrough.ts`.

2. After the `if (wr.status === "failed") { … }` block (`:542`) and **before** `let walkthroughArtifact` (`:544`), insert the gate — only for the un-phased feature step (`phase === undefined`) and only when required:
```ts
        // Cycle 0274 — degradation blocking gate (un-phased feature
        // walkthrough_capture only). Config check FIRST: when the repo has not
        // opted in, no issue read and no sidecar parse run — the default-off
        // path is byte-for-byte unchanged.
        if (phase === undefined && resolveWalkthroughRequired(cfg)) {
          // Per-issue UI-scope. Reuse the lazy source-issue read + degrade-to-
          // fail-closed-default pattern (mirrors the expects_code guard read):
          // any read/parse error ⇒ UI-shipping (gated).
          let uiShipping = true;
          try {
            const issueBody = await readFile(
              join(repoRoot, "docs/cycle/issues/todo", `${opts.issueId}.md`),
              "utf8",
            );
            const fm = parseFrontmatter(issueBody).fm;
            uiShipping = resolveExpectsCode(fm) !== false && resolveExpectsUi(fm) !== false;
          } catch {
            uiShipping = true;
          }
          if (uiShipping) {
            const sidecarPath = join(artifactDir, WALKTHROUGH_MEDIA_DIRNAME, "walkthrough-status.json");
            const verdict = await readWalkthroughDegradation(sidecarPath);
            if (verdict.degraded) {
              await log.emit("walkthrough.degraded", {
                cycle_id: cycleId,
                step: step.name,
                reason: verdict.reason,
                sidecar: relative(repoRoot, sidecarPath),
              });
              await log.emit("step.end", {
                cycle_id: cycleId,
                step: step.name,
                status: "failed",
                exit_code: wr.exitCode,
                duration_ms: Math.max(0, Math.round(nowFn() - stepStart)),
                stderr: truncateHeadCapped(formatWalkthroughDegradedError(verdict.reason), MAX_STEP_END_STDERR),
              });
              await log.emit("cycle.end", { cycle_id: cycleId, status: "failed", failing_step: step.name });
              return { cycleId, artifactDir, status: "failed" as const, failingStep: step.name };
            }
          }
        }
```
The success-tail media collect + `step.end { status: "ok" }` (`:544-565`) is unchanged and runs on the not-gated / not-degraded path.

### Success Criteria
- [ ] Compiles cleanly; `npm run typecheck` clean.
- [ ] Default-off (`walkthrough_required` absent) path emits no `walkthrough.degraded` and is byte-for-byte unchanged.
- [ ] Required + UI + `{ degraded: true }` ⇒ `step.end failed` → `cycle.end failed` → early `return`, one `walkthrough.degraded`.
- [ ] Required + UI + unparseable sidecar ⇒ same fatal path, `reason` names the parse failure.
- [ ] No-hook, exempt (`expects_code: false` / `expects_ui: false`), and clean/absent-sidecar paths reach `step.end { status: "ok" }`.
- [ ] Failure paths behave as designed — issue-read errors degrade to fail-closed UI-shipping; sidecar errors fail closed to degraded; no error swallowed into a silent `ok`.

---

## Task 5: Unit tests for the resolver module

### Overview
Table-driven pure tests mirroring `tests/engine/verify-counts.test.ts` / `tests/engine/noop-marker.test.ts` / `tests/engine/run-cycle-expects-code.test.ts`.

### Changes Required
**File**: `tests/engine/walkthrough-gate.test.ts` (new)
**Changes**:
- `resolveWalkthroughRequired`: `engine.walkthrough_required` = `true` ⇒ `true`; `false`/absent/`"true"` (string)/`null`/`1` (number)/missing `engine` ⇒ `false`.
- `resolveExpectsUi`: `expects_ui: false` ⇒ `false`; `true`/absent/`"false"` (string)/`null`/`[]` ⇒ `true`.
- `classifyWalkthroughDegradation`: `{"degraded":true}` ⇒ degraded `"degraded_flag"`; `{"degraded":true,"reason":"only /login"}` ⇒ `"degraded_flag: only /login"`; `{"degraded":false}` / `{}` ⇒ not degraded; `""` / `"{not json"` ⇒ degraded `"unparseable: …"`; `"[1,2]"` (array) / `"42"` (non-object) ⇒ degraded `"unparseable: …"`.
- `readWalkthroughDegradation` (real filesystem, temp dir): absent file ⇒ not degraded; present `{"degraded":true}` ⇒ degraded; present corrupt text ⇒ degraded `"unparseable"`; a directory at the path (EISDIR, non-ENOENT) ⇒ degraded.

### Success Criteria
- [ ] All cases pass.
- [ ] Coverage for `src/engine/walkthrough-gate.ts` ≥ 95% line / ≥ 90% function / ≥ 75% branch.
- [ ] Failure-path tests (corrupt, non-object, EISDIR, ENOENT) included.
- [ ] Anti-mock — `readWalkthroughDegradation` tested against the real filesystem (temp dir + `mkdtemp`), no `fs` mocking.

---

## Task 6: Integration tests for the gate in the intercept

### Overview
Drive the real `walkthrough_capture` intercept via the existing harness in `tests/engine/run-cycle.walkthrough.test.ts`, with a fake hook that writes a chosen sidecar and the `engine.walkthrough_required: true` config line.

### Changes Required
**File**: `tests/engine/run-cycle.walkthrough.test.ts`
**Changes**: Extend `writeHook` (or add a variant) so the fake `.cycle/walkthrough.sh` writes both media and a chosen `walkthrough/walkthrough-status.json` (`mkdir -p "$CYCLE_ARTIFACT_DIR/walkthrough"`, `cat > … <<'JSON'`). Add the `engine.walkthrough_required: true` line through the existing config slot. For exemption-path tests, create `docs/cycle/issues/todo/<id>.md` with the appropriate frontmatter (the harness's default issue IDs have no todo file). Add scenarios:
- **Block (degraded flag)**: required + UI (default issue, no todo file ⇒ fail-closed UI) + `{ degraded: true }` ⇒ `step.end status:"failed"` → `cycle.end status:"failed", failing_step:"walkthrough_capture"`; exactly one `walkthrough.degraded` (assert via `expectExactlyOne` / `filter(...).length === 1`); `step.end.stderr` contains `walkthrough did not demonstrate the feature`.
- **Happy (clean sidecar)**: required + UI + `{ degraded: false }` ⇒ `step.end ok`, no `walkthrough.degraded`, `cycle.end` not failed.
- **Happy (no sidecar)**: required + UI + hook writes only media ⇒ `step.end ok`, no `walkthrough.degraded`.
- **Inert (no hook)**: no `.cycle/walkthrough.sh` ⇒ one `step.end status:"skipped", reason:"walkthrough_hook_absent"`, no `step.start`, no `walkthrough.degraded`.
- **Exempt `expects_code: false`**: create todo issue with `expects_code: false`; required + `{ degraded: true }` ⇒ `step.end ok`, no `walkthrough.degraded`.
- **Exempt `expects_ui: false`**: create todo issue with `expects_ui: false`; required + `{ degraded: true }` ⇒ `step.end ok`, no `walkthrough.degraded`.
- **Fail-closed unparseable**: required + UI + sidecar with corrupt JSON ⇒ fatal path; `walkthrough.degraded.reason` starts with `unparseable`.
- **Regression (default off)**: `walkthrough_required` absent + `{ degraded: true }` sidecar ⇒ `step.end ok`, no `walkthrough.degraded`.

### Success Criteria
- [ ] All scenarios pass.
- [ ] `walkthrough.degraded` cardinality-pinned with `filter(...).length === 1`.
- [ ] Exemption tests use real todo issue files with frontmatter.
- [ ] No coverage regression in `src/engine/run-cycle.ts` / `src/engine/walkthrough.ts` (≥95%).
- [ ] Failure-path scenario (unparseable ⇒ fail-closed) present.

---

## Task 7: Register the coverage floor

### Overview
Add the new module to the per-file floor table.

### Changes Required
**File**: `scripts/coverage-gate.mjs`
**Changes**: In `FLOORS` (≈`:12`), add:
```js
  "src/engine/walkthrough-gate.ts": 95,
```

### Success Criteria
- [ ] `npm run test:coverage` → `npm run check:coverage` passes with the new entry enforced.
- [ ] Failure paths — N/A — pure config table edit.

---

## Task 8: Documentation

### Overview
Document the gate per the SPEC; docs are part of "done".

### Changes Required
**File**: `CLAUDE.md`
**Changes**: Add `engine.walkthrough_required` to the *Workflow defaults* engine-flag list (default `false`, defensively coerced `=== true`; UI-shipping = required + not `expects_code: false` + not `expects_ui: false`; gate fires on `walkthrough_capture` only, after exit-0, present-and-ran hook; sidecar `walkthrough/walkthrough-status.json`; fail-closed on unparseable; reuses the fatal step-failure path; emits `walkthrough.degraded`). Note the per-issue `expects_ui: false` opt-out alongside `expects_code: false`. Extend the `src/engine/walkthrough.ts` architecture note (or add a `src/engine/walkthrough-gate.ts` note) describing the resolver module and the `walkthrough.degraded` event shape `{ cycle_id, step, reason, sidecar }`.

**File**: `docs/ENGINE.md` → *Walkthrough capture*
**Changes**: Document gate activation conditions, the `walkthrough/walkthrough-status.json` sidecar contract (`{ degraded: boolean, reason?: string }`), absent ⇒ not-degraded vs present-but-unparseable ⇒ fail-closed-degraded, the fatal-path routing (`step.end failed` → `cycle.end failed, failing_step: "walkthrough_capture"`), and the `walkthrough.degraded` event shape. Cross-reference BRIEF.md → *Core thesis* and the verify-gating siblings (cycles 0272/0273).

**File**: `README.md` — no change (no CLI-surface change), per SPEC.

### Success Criteria
- [ ] CLAUDE.md flag list and architecture note updated.
- [ ] `docs/ENGINE.md` *Walkthrough capture* documents the gate + event + sidecar contract + cross-references.
- [ ] Failure paths — N/A — docs.

---

## SPEC Acceptance Traceability

| SPEC Acceptance Bullet (verbatim) | Covering Task | Notes |
|---|---|---|
| [ ] **User-observable benefit**: In a repo with `engine.walkthrough_required: true`, a UI-shipping `feature` cycle whose present-and-run hook wrote `walkthrough/walkthrough-status.json` with `{ degraded: true }` produces `cycle.end { status: "failed", failing_step: "walkthrough_capture" }`, emits `walkthrough.degraded` exactly once, and surfaces a "walkthrough did not demonstrate the feature" diagnostic on the step's `step.end.stderr` — not a silent `ok`. | Task 4, Task 6 | Block scenario |
| [ ] A present-and-run hook with no sidecar, or a sidecar whose `degraded` is absent/falsy, keeps `step.end { status: "ok" }` and the cycle completes normally (hook-clean → ok). | Task 2, Task 4, Task 6 | `readWalkthroughDegradation` ENOENT + `{degraded:false}` → not degraded |
| [ ] No walkthrough hook present ⇒ inert: exactly one `step.end { status: "skipped", reason: "walkthrough_hook_absent" }`, no `step.start`, no `walkthrough.degraded`, no failure — preserving cycle's own repo and any repo without a hook. | Task 4, Task 6 | Gate sits after hook-present check; no-hook path untouched |
| [ ] A doc-only cycle (`expects_code: false`) and a cycle with `expects_ui: false` are not gated even when `engine.walkthrough_required: true` and the sidecar reports `degraded: true` — the step completes `ok`. | Task 2, Task 4, Task 6 | UI-scope predicate + exemption tests with real todo issues |
| [ ] **Failure-path criterion**: With `engine.walkthrough_required: true` on a UI cycle, a present-but-unreadable/unparseable `walkthrough-status.json` fail-closes — the cycle fails via the fatal path with a `walkthrough.degraded` event whose `reason` names the parse failure, and the worktree/cycle outcome is the standard terminal-failure shape (no silent pass). | Task 2, Task 4, Task 6 | `unparseable: …` reason; EISDIR/corrupt cases |
| [ ] With `engine.walkthrough_required` absent or non-boolean (the default), behavior is byte-for-byte identical to today regardless of any sidecar — no `walkthrough.degraded` ever fires. | Task 4, Task 6 | Config check short-circuits first; regression test |
| [ ] `walkthrough.degraded` is cardinality-pinned in tests with `filter(...).length === 1`. | Task 6 | Via `expectExactlyOne` / explicit `filter(...).length === 1` |
| [ ] Coverage holds at/above the per-file floor for `src/engine/walkthrough.ts` (95%) and any new/touched module (the new resolver module carries a ≥95% floor); no coverage regression vs the master baseline. | Task 5, Task 7 | `FLOORS` entry + unit tests |
| [ ] All existing tests still pass. | Task 4, Task 6 | Default-off path unchanged; full `npm test` |
| [ ] No compiler/linter warnings introduced (`npm run typecheck` clean). | Task 1, Task 2, Task 3, Task 4 | Typed-`Record` predicates avoid TS2367 |

---

## Testing Strategy

### Unit Tests
- `resolveWalkthroughRequired`: `true` / `false` / absent / `"true"` string / `null` / number / missing `engine` ⇒ correct boolean (default `false`).
- `resolveExpectsUi`: `false` ⇒ `false`; `true` / absent / `"false"` string / `null` / array ⇒ `true`.
- `classifyWalkthroughDegradation`: `{degraded:true}` / `{degraded:true,reason:…}` / `{degraded:false}` / `{}` / `""` / malformed JSON / array / scalar JSON — degraded-vs-not and `reason` prefix asserted.
- `formatWalkthroughDegradedError`: contains the fixed phrase + the passed reason.
- **Failure-path tests**: `readWalkthroughDegradation` against the real filesystem — absent (ENOENT) ⇒ not degraded; corrupt content ⇒ degraded `unparseable`; directory-at-path (EISDIR) ⇒ degraded; valid `{degraded:true}` ⇒ degraded.
- **Mocking strategy**: none — pure functions called directly; `readWalkthroughDegradation` uses real temp dirs (`mkdtemp`). No `fs` mocking (ESM-unstubbable per CLAUDE.md; real FS is the convention here).

### Integration / E2E Tests
- End-to-end through the real `walkthrough_capture` intercept (Task 6) via the existing `run-cycle.walkthrough.test.ts` harness with a real on-disk fake hook writing media + a chosen sidecar: block / happy-clean / happy-no-sidecar / inert-no-hook / exempt-`expects_code` / exempt-`expects_ui` / fail-closed-unparseable / regression-default-off. Exemption scenarios use real `docs/cycle/issues/todo/<id>.md` frontmatter files. No Playwright/e2e suite added — this cycle is engine-only (the gate that *enforces* UI demonstration in consumer repos).

## Risk Assessment
- **Default-off regression risk**: any added I/O on the default path would break the byte-for-byte guarantee. *Mitigation*: the gate is short-circuited on `resolveWalkthroughRequired(cfg) !== true` before any issue read or sidecar parse; the regression test asserts no `walkthrough.degraded` with a `{degraded:true}` sidecar present.
- **Harness issue-file gap**: default integration issue IDs have no todo file, so the UI-scope read hits `catch` → fail-closed UI-shipping. *Mitigation*: that is the correct gated default for the block test; exemption tests explicitly create todo issue files with the relevant frontmatter (called out in Task 6).
- **Fail-closed direction inversion vs noop-marker**: absent sidecar means not-degraded (opposite of noop's absent ⇒ fail). *Mitigation*: `readWalkthroughDegradation` discriminates ENOENT (not degraded) from all other read errors (degraded), with dedicated unit tests for each.
- **`relative`/`WALKTHROUGH_MEDIA_DIRNAME` import drift**: ensure both are imported in `run-cycle.ts`. *Mitigation*: `npm run typecheck` catches a missing import at build.
