# Implementation Plan: Cycle 0026

## Overview
Add `walkthrough_before` and `walkthrough_after` `agent: bash` steps to the `quickfix` workflow, and generalize the existing `run-cycle.ts` `walkthrough_capture` intercept into a phase-aware branch that reuses all existing walkthrough discovery/spawn/timeout/degrade machinery while passing `CYCLE_WALKTHROUGH_PHASE` to the hook and collecting media into phase-scoped subdirectories and per-phase manifests.

## Current State (from Research)
- All walkthrough logic lives in `src/engine/walkthrough.ts:1-143`: `resolveWalkthroughHook` (repo-agnostic discovery), `execWalkthroughHook` (detached spawn + SIGTERM→SIGKILL bounded-kill), `collectWalkthroughMedia` (lists `<artifactDir>/walkthrough/`, ENOENT⇒`[]`, other errors throw), `writeWalkthroughManifest` (writes `walkthrough-artifacts.json`).
- The name-keyed intercept in `runCycle` is gated on the literal `step.name === "walkthrough_capture"` at `src/engine/run-cycle.ts:358`, body at `:359-424`. It sits after the retry-skip and `skip_unless` gates and before reset-eligible/generic-exec logic, and `continue`s — bypassing `execBashStep`, completion-proof, and the shared `step.end` tail.
- Env is built at `src/engine/run-cycle.ts:289-295` (`cycleEnv`) and passed as `{ ...cycleEnv, CYCLE_ARTIFACT_DIR: artifactDir }` at `:383`; `buildChildEnv` strips all `CYCLE_*` then re-overlays `extra`, so any `CYCLE_*` var the hook needs must be in that object.
- Timeout is defensively coerced at `:376-379`; fatal routing at `:386-399`; best-effort degrade at `:401-414`; ok `step.end` at `:415-422`.
- `quickfix` workflow: `plan_fix → quick_fix → test_fix → verify(bash)` at `src/defaults/workflows.yml:53-60`; `.cycle/workflows.yml:53-60` is the synced copy that must match post-`npm run sync-defaults`.
- Test patterns: `node:test` via `node --experimental-strip-types`; integration tests drive `runCycle` over a temp git repo with an inline `.cycle/workflows.yml` and a `chmod 0o755` `.cycle/walkthrough.sh`, parsing `.cycle/log.jsonl`. Cardinality-pinned `filter(...).length === 1` for exactly-once events. `node:fs/promises` cannot be `mock.method`-stubbed — failure paths use real filesystem manipulation (e.g. pre-create the manifest path as a directory to force `EISDIR`).

### Open Questions — Resolved
- **Helper signatures**: Add an optional trailing `phase?: string` parameter to the existing `collectWalkthroughMedia` and `writeWalkthroughManifest`. When `phase` is `undefined`, behavior is byte-for-byte identical to today; when set, they target `<artifactDir>/walkthrough/<phase>/` and write `walkthrough-<phase>-artifacts.json`. No new dedicated functions — the optional parameter keeps the un-phased path untouched and avoids duplication.
- **Manifest `media[]` shape**: Collected paths stay relative to `artifactDir`, yielding `walkthrough/before/shot.png` (not relative to the phase subdir). This is a natural extension of the existing `relative(artifactDir, …)` mapping — only the scanned root changes.
- **`step.walkthrough_capture_failed` artifact field**: For phase steps it points at the phase manifest path (`join(artifactDir, "walkthrough-<phase>-artifacts.json")`); for `walkthrough_capture` it stays `join(artifactDir, WALKTHROUGH_MANIFEST)`. A new exported `walkthroughManifestName(phase?)` helper computes the basename and is used both inside `writeWalkthroughManifest` and at the error-event site.
- **Phase-map placement**: A small declarative `const WALKTHROUGH_PHASES` map lives in `run-cycle.ts` alongside the intercept (`walkthrough_capture → undefined`, `walkthrough_before → "before"`, `walkthrough_after → "after"`); the intercept condition becomes membership in this map.

## Desired End State
- `quickfix` runs `plan_fix → walkthrough_before → quick_fix → test_fix → verify → walkthrough_after`, both new steps `agent: bash` with no `command`, in both `src/defaults/workflows.yml` and `.cycle/workflows.yml` (no diff after sync).
- With a configured hook, a `quickfix` run writes `<artifactDir>/walkthrough/before/…` + `walkthrough-before-artifacts.json` and `<artifactDir>/walkthrough/after/…` + `walkthrough-after-artifacts.json`, each surfaced via `walkthrough_artifacts` on the respective `step.end`. The hook receives `CYCLE_WALKTHROUGH_PHASE=before|after`.
- With no hook, each phase step emits exactly one `step.end { status: "skipped", reason: "walkthrough_hook_absent" }`, no `step.start`, no failure.
- The `feature` `walkthrough_capture` path is byte-for-byte unchanged; existing tests pass without modification.
- Verify: `npm test`, `npm run typecheck`, `npm run sync-defaults && git diff --exit-code .cycle/workflows.yml`, coverage floors met (`src/engine/walkthrough.ts` ≥ 95%, `src/engine/run-cycle.ts` ≥ 90%, globals).

## What We're NOT Doing
- No change to the `feature` workflow's `walkthrough_capture` step, its env, or its artifact paths.
- No walkthrough capture added to `document` or `e2e-tests` workflows.
- No `.cycle/walkthrough.sh` authored for cycle's own repo (it configures none; the steps skip clean here).
- No change to `engine.walkthrough_hook_timeout_ms`, `WALKTHROUGH_KILL_GRACE_MS`, `resolveWalkthroughHook` discovery rules, or `execWalkthroughHook` spawn/kill logic.
- No new config keys. The only new env is the engine-provided `CYCLE_WALKTHROUGH_PHASE`.
- No new `Step` type fields (`Step.name` is an open `string` union).

## Implementation Approach
Three thin, additive layers built bottom-up:
1. **Helpers** (`walkthrough.ts`): make `collectWalkthroughMedia` / `writeWalkthroughManifest` phase-parameterized via an optional `phase` argument plus an exported `walkthroughManifestName(phase?)`. Un-phased calls are unchanged.
2. **Intercept** (`run-cycle.ts`): replace the literal `step.name === "walkthrough_capture"` guard with a lookup in a declarative `WALKTHROUGH_PHASES` map; thread the resolved `phase` through the env (`CYCLE_WALKTHROUGH_PHASE`), the collect/manifest calls, and the degrade-event `artifact` path. `walkthrough_capture` resolves to `undefined` phase, so its entire path stays identical.
3. **Workflow + sync** (`workflows.yml`): add the two steps and run `sync-defaults`.
Then documentation. Each layer is independently testable; the intercept layer reuses the helper layer.

## Failure & Resilience Decisions

### Task 1 — phase-aware helpers (`walkthrough.ts`)
- **Failure modes**: `collectWalkthroughMedia` — missing phase subdir ⇒ `readdir` `ENOENT` ⇒ returns `[]` (clean: hook produced nothing for that phase); any other `readdir` error (e.g. `ENOTDIR`) ⇒ throws to the caller (the collect-failure degrade surface). `writeWalkthroughManifest` — write failure (e.g. `EISDIR` when the manifest path is a directory) ⇒ throws to the caller. `walkthroughManifestName` is pure string construction — no failure surface.
- **Idempotency**: Both are safe to re-run. `collectWalkthroughMedia` is read-only. `writeWalkthroughManifest` is last-write-wins to a deterministic path; re-running overwrites with identical content for identical media.
- **Observability**: These functions surface failures by throwing (no logging here); the caller in `run-cycle.ts` converts a throw into `step.walkthrough_capture_failed`. No swallowing.
- **No silent failure**: Only `ENOENT` is intentionally mapped to `[]` (documented "clean" semantics, preserved from current code); every other error propagates.

### Task 2 — phase-aware intercept (`run-cycle.ts`)
- **Failure modes**: Hook non-zero exit or timeout ⇒ fatal step-failure path (`step.end { status: "failed" }` → `cycle.end { status: "failed", failing_step }` → early return; `finally` cleanup still runs). A `walkthrough_before` failure halts the cycle before `quick_fix` runs — consistent with the existing fatal contract. Post-success collect/manifest throw ⇒ best-effort degrade: emit `step.walkthrough_capture_failed`, omit the pointer, end `ok`. No hook ⇒ inert skipped success.
- **Idempotency**: The intercept sits after the retry-skip and `skip_unless` gates and `continue`s before reset-eligible logic, so the new steps are never reset-eligible. The hook is re-invoked on every cycle attempt with deterministic `CYCLE_ARTIFACT_DIR`/`CYCLE_WALKTHROUGH_PHASE`; media is last-write-wins, and re-run safety of side effects is the hook author's responsibility (unchanged contract). `quickfix` `max_cycle_attempts` is `3`.
- **Observability**: `step.start`, `step.end` (with `status`/`reason`/`exit_code`/`duration_ms`/`stderr`/`walkthrough_artifacts`), `step.walkthrough_capture_failed { cycle_id, step, artifact, error }`, `cycle.end`. Timeout wording via `formatWalkthroughTimeoutError`. `duration_ms = Math.max(0, Math.round(nowFn() - stepStart))`.
- **No silent failure**: Fatal exits route to a failed cycle; degrade failures emit a named event; the no-hook path is an explicit skipped `step.end`. No error is swallowed.

### Task 3 — workflow definition + sync
- **Failure modes**: `npm run sync-defaults` is a file copy; a copy failure surfaces as a non-zero script exit and a visible diff in `.cycle/workflows.yml`.
- **Idempotency**: Re-running `sync-defaults` is idempotent (overwrite copy).
- **Observability**: `git diff --exit-code .cycle/workflows.yml` in verification proves sync.
- **No silent failure**: A malformed `quickfix` step (missing `agent`) would throw `workflows.yml malformed: …` at config load; the acceptance test exercises load + run.

### Task 4 — documentation
- N/A — pure (Markdown edits, no runtime surface).

---

## Task 1: Phase-parameterize the walkthrough helpers

### Overview
Add an optional `phase?: string` parameter to `collectWalkthroughMedia` and `writeWalkthroughManifest`, and export a `walkthroughManifestName(phase?)` helper. When `phase` is omitted, behavior is byte-for-byte identical to today.

### Changes Required
**File**: `src/engine/walkthrough.ts`

Add the manifest-name helper near the constants:
```ts
/** Manifest basename for a walkthrough phase. Un-phased (feature
 * walkthrough_capture) keeps WALKTHROUGH_MANIFEST; phased quickfix steps use
 * walkthrough-<phase>-artifacts.json. */
export function walkthroughManifestName(phase?: string): string {
  return phase ? `walkthrough-${phase}-artifacts.json` : WALKTHROUGH_MANIFEST;
}
```

Make collection phase-scoped (only the scanned root changes; paths stay relative to `artifactDir`):
```ts
export async function collectWalkthroughMedia(
  artifactDir: string,
  phase?: string,
): Promise<string[]> {
  const mediaDir = phase
    ? join(artifactDir, WALKTHROUGH_MEDIA_DIRNAME, phase)
    : join(artifactDir, WALKTHROUGH_MEDIA_DIRNAME);
  let entries;
  try {
    entries = await readdir(mediaDir, { recursive: true, withFileTypes: true });
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw err;
  }
  return entries
    .filter(e => e.isFile())
    .map(e => relative(artifactDir, join(e.parentPath ?? mediaDir, e.name)))
    .sort();
}
```

Make manifest writing phase-scoped via the helper:
```ts
export async function writeWalkthroughManifest(
  artifactDir: string,
  media: string[],
  phase?: string,
): Promise<string> {
  const manifestPath = join(artifactDir, walkthroughManifestName(phase));
  await writeFile(manifestPath, JSON.stringify({ media, count: media.length }, null, 2), "utf8");
  return manifestPath;
}
```
Update the doc-comments on both functions to note the phase-scoped subdir/name.

### Success Criteria
- [ ] Compiles/builds cleanly (`npm run typecheck`).
- [ ] Existing un-phased helper unit tests pass unchanged.
- [ ] `collectWalkthroughMedia(dir, "before")` lists `<dir>/walkthrough/before/` and returns paths like `walkthrough/before/shot.png`; missing subdir ⇒ `[]`.
- [ ] `writeWalkthroughManifest(dir, media, "after")` writes `walkthrough-after-artifacts.json`; `walkthroughManifestName("before") === "walkthrough-before-artifacts.json"` and `walkthroughManifestName() === WALKTHROUGH_MANIFEST`.
- [ ] Failure paths behave as designed (non-ENOENT readdir error and write `EISDIR` still throw).

---

## Task 2: Make the run-cycle intercept phase-aware

### Overview
Generalize the `walkthrough_capture` intercept to handle all three walkthrough steps via a declarative name→phase map, threading the phase through the hook env, media collection, manifest writing, and the degrade-event artifact path. `walkthrough_capture` maps to `undefined`, preserving its path exactly.

### Changes Required
**File**: `src/engine/run-cycle.ts`

Import the new helper (extend the existing `./walkthrough.ts` import block at `:28-34`):
```ts
import {
  resolveWalkthroughHook,
  execWalkthroughHook,
  collectWalkthroughMedia,
  writeWalkthroughManifest,
  walkthroughManifestName,
  WALKTHROUGH_MANIFEST,
} from "./walkthrough.ts";
```

Add the declarative phase map near `RESET_ELIGIBLE_STEPS` (`:36`):
```ts
/** Walkthrough steps and the phase label each scopes media/manifest under.
 * undefined = un-phased (feature walkthrough_capture, byte-for-byte legacy
 * behavior). before/after = quickfix phases. Membership in this map is the
 * intercept condition. */
const WALKTHROUGH_PHASES = new Map<string, string | undefined>([
  ["walkthrough_capture", undefined],
  ["walkthrough_before", "before"],
  ["walkthrough_after", "after"],
]);
```

Replace the guard at `:358`:
```ts
if (WALKTHROUGH_PHASES.has(step.name)) {
  const phase = WALKTHROUGH_PHASES.get(step.name);
  ...
}
```

Inside the branch, thread `phase`:
- Env (the `:383` object): `{ ...cycleEnv, CYCLE_ARTIFACT_DIR: artifactDir, ...(phase ? { CYCLE_WALKTHROUGH_PHASE: phase } : {}) }`. (Spreading conditionally keeps the un-phased `walkthrough_capture` env identical — no `CYCLE_WALKTHROUGH_PHASE` key when phase is `undefined`.)
- Collect: `collectWalkthroughMedia(artifactDir, phase)`.
- Manifest: `writeWalkthroughManifest(artifactDir, media, phase)`.
- Degrade-event artifact (`:411`): `artifact: join(artifactDir, walkthroughManifestName(phase))`.

The skip-clean, `step.start`, timeout-coercion, fatal routing, and ok `step.end` blocks are otherwise unchanged (they already reference `step.name` for event payloads, which now carries the phase step name). `WALKTHROUGH_MANIFEST` import is retained only if still referenced; if all references move to `walkthroughManifestName`, drop it from the import to keep typecheck clean.

Update the intercept doc-comment (`:347-357`) to describe the phase map, `CYCLE_WALKTHROUGH_PHASE`, the phase-scoped media subdir, and per-phase manifests.

### Success Criteria
- [ ] Compiles/builds cleanly; `npm run typecheck` clean (no unused-import warning).
- [ ] `walkthrough_capture` integration tests in `tests/engine/run-cycle.walkthrough.test.ts` pass unmodified (no `CYCLE_WALKTHROUGH_PHASE`, manifest `walkthrough-artifacts.json`, media under `walkthrough/`).
- [ ] A phase step with a hook writes phase-scoped media + per-phase manifest + pointer, and the hook env contains `CYCLE_WALKTHROUGH_PHASE`.
- [ ] No-hook phase step ⇒ exactly one `step.end { status: "skipped" }`, no `step.start`.
- [ ] Non-zero `before`-hook exit ⇒ `step.end { failed }` for `walkthrough_before` → `cycle.end { failing_step: "walkthrough_before" }`; `quick_fix` not reached.
- [ ] Forced collect/manifest failure ⇒ exactly one `step.walkthrough_capture_failed` (artifact = phase manifest path), step ends `ok`, no pointer.

---

## Task 3: Add `walkthrough_before` / `walkthrough_after` to the `quickfix` workflow

### Overview
Insert the two `agent: bash` steps into `quickfix` and sync to `.cycle/`.

### Changes Required
**File**: `src/defaults/workflows.yml` (`quickfix`, `:53-60`)
```yaml
  - name: quickfix
    description: Surgical fix for a well-scoped issue. Plan to fix to test. No spec, no research, no PR review.
    max_cycle_attempts: 3
    steps:
      - { name: plan_fix,            prompt: prompts/plan_fix.md }
      - { name: walkthrough_before,  agent: bash }
      - { name: quick_fix,           prompt: prompts/quick_fix.md }
      - { name: test_fix,            prompt: prompts/test_fix.md }
      - { name: verify,              agent: bash, command: scripts/verify.sh }
      - { name: walkthrough_after,   agent: bash }
```

**Then**: `npm run sync-defaults` to update `.cycle/workflows.yml`.

### Success Criteria
- [ ] `quickfix` step order is `plan_fix → walkthrough_before → quick_fix → test_fix → verify → walkthrough_after`.
- [ ] Both new steps are `agent: bash` with no `command`.
- [ ] `npm run sync-defaults && git diff --exit-code .cycle/workflows.yml` shows no diff.
- [ ] Config loads without `workflows.yml malformed` error (covered by the integration test driving `runCycle` over `quickfix`).

---

## Task 4: Documentation

### Overview
Update the architecture/engine/readme docs to describe phase-aware capture per SPEC "Documentation Updates".

### Changes Required
**File**: `CLAUDE.md` — extend the `src/engine/walkthrough.ts` and `src/engine/run-cycle.ts` notes: the phase-aware intercept via the `WALKTHROUGH_PHASES` map, the `walkthrough_before`/`walkthrough_after` quickfix steps, the `CYCLE_WALKTHROUGH_PHASE` env contract (passed via `extra`/`buildChildEnv`), and per-phase manifest naming (`walkthrough-<phase>-artifacts.json`) + phase-scoped media subdir (`walkthrough/<phase>/`).

**File**: `docs/ENGINE.md` (*Walkthrough capture*, `:201-215`; workflow-sequence note `:119`) — describe the quickfix before/after phases, phase-scoped subdirs, per-phase manifests, the `CYCLE_WALKTHROUGH_PHASE` hook contract, and that the feature `walkthrough_capture` path is unchanged.

**File**: `README.md` — note that an opt-in `.cycle/walkthrough.sh` hook can branch on `CYCLE_WALKTHROUGH_PHASE` for quickfix before/after capture (no CLI surface change).

### Success Criteria
- [ ] All three docs mention `CYCLE_WALKTHROUGH_PHASE`, the two quickfix steps, and per-phase manifest naming.
- [ ] No stale claim that `walkthrough_capture` is the only walkthrough step.
- [ ] Docs match the implemented behavior (manifest names, subdir paths).

---

## SPEC Acceptance Traceability

| SPEC Acceptance Bullet (verbatim) | Covering Task | Notes |
|---|---|---|
| [ ] `src/defaults/workflows.yml` `quickfix` workflow contains `walkthrough_before` (between `plan_fix` and `quick_fix`) and `walkthrough_after` (final step after `verify`), both `agent: bash` with no `command`, and `.cycle/workflows.yml` matches after `npm run sync-defaults` (no diff). | Task 3 | |
| [ ] With a configured hook that writes media keyed on `CYCLE_WALKTHROUGH_PHASE`, a `quickfix` run produces `<artifactDir>/walkthrough/before/…` and `<artifactDir>/walkthrough/after/…` media plus `walkthrough-before-artifacts.json` and `walkthrough-after-artifacts.json`, each referenced by a `walkthrough_artifacts` pointer on the respective step's `step.end`. | Task 1, Task 2 | Happy-path integration test |
| [ ] With no hook configured, a `quickfix` run emits exactly one `step.end { status: "skipped", reason: "walkthrough_hook_absent" }` for each of `walkthrough_before` and `walkthrough_after`, with zero `step.start` and zero `failed` step.end for those steps. | Task 2 | Skip-clean integration test, cardinality-pinned |
| [ ] Failure-path: a hook that exits non-zero on the `before` phase produces `step.end { status: "failed" }` for `walkthrough_before` followed by `cycle.end { status: "failed", failing_step: "walkthrough_before" }`, and `quick_fix` does not run. | Task 2 | Fatal-routing integration test |
| [ ] Failure-path: a post-success collect/manifest failure on a phase step emits exactly one `step.walkthrough_capture_failed` event for that step, the step still ends `ok`, and no `walkthrough_artifacts` pointer is attached. | Task 1, Task 2 | Degrade integration test (force `EISDIR` on phase manifest) |
| [ ] The existing `feature` `walkthrough_capture` behavior and artifact paths are unchanged (existing `tests/engine/run-cycle.walkthrough.test.ts` scenarios still pass without modification). | Task 1, Task 2 | `undefined` phase ⇒ legacy path; conditional env spread keeps env identical |
| [ ] All existing tests still pass. | Task 1, Task 2, Task 3 | `npm test` |
| [ ] No compiler/linter warnings introduced (`npm run typecheck` clean). | Task 1, Task 2 | |

---

## Testing Strategy

### Unit Tests
**File**: `tests/engine/walkthrough.test.ts` (extend)
- `walkthroughManifestName`: `undefined ⇒ "walkthrough-artifacts.json"`, `"before" ⇒ "walkthrough-before-artifacts.json"`, `"after" ⇒ "walkthrough-after-artifacts.json"`.
- `collectWalkthroughMedia(dir, "before")`: returns sorted `walkthrough/before/…` paths (relative to `artifactDir`) for nested files; missing `walkthrough/before/` subdir ⇒ `[]` (ENOENT clean); a non-directory at the phase media path ⇒ throws (non-ENOENT readdir error — failure-path, via making the path a regular file).
- `writeWalkthroughManifest(dir, media, "after")`: writes `walkthrough-after-artifacts.json` with `{ media, count }`; manifest-path-is-a-directory ⇒ throws `EISDIR` (failure-path).
- Regression: existing un-phased `collectWalkthroughMedia`/`writeWalkthroughManifest` cases unchanged.
- Mocking strategy: real filesystem in temp dirs (`mkdtemp` + `chmod`/pre-created directories); no `mock.method` on `node:fs/promises` (non-configurable ESM exports).

### Integration / E2E Tests
**File**: `tests/engine/run-cycle.walkthrough.test.ts` (extend) — drive `runCycle` over an inline `quickfix`-shaped `.cycle/workflows.yml` in a temp git repo, with a `chmod 0o755` `.cycle/walkthrough.sh` that branches on `$CYCLE_WALKTHROUGH_PHASE` (writing into `"$CYCLE_ARTIFACT_DIR/walkthrough/$CYCLE_WALKTHROUGH_PHASE/"`):
- **Happy path**: both phases produce labeled media under `walkthrough/before/` and `walkthrough/after/`, per-phase manifests, and `walkthrough_artifacts` pointers on each `step.end`.
- **Phase-env**: the hook records `$CYCLE_WALKTHROUGH_PHASE` (e.g. into the media filename or a sentinel file); assert it is `before` for the first step and `after` for the last.
- **Skip-clean**: no hook ⇒ each phase step emits exactly one `step.end { status: "skipped", reason: "walkthrough_hook_absent" }` (cardinality-pinned `filter(...).length === 1`), zero `step.start`, zero `failed`.
- **Fatal on `before`**: hook exits non-zero when `CYCLE_WALKTHROUGH_PHASE=before` ⇒ `step.end { failed }` for `walkthrough_before` → `cycle.end { failing_step: "walkthrough_before" }`; assert no `step.start`/`step.end` for `quick_fix`.
- **Degrade**: pre-create `walkthrough-after-artifacts.json` as a directory (force `EISDIR` on the phase manifest write) with the after-hook producing media ⇒ exactly one `step.walkthrough_capture_failed` for `walkthrough_after` (artifact = phase manifest path), step ends `ok`, no pointer.
- **Regression**: the existing `feature` `walkthrough_capture` scenarios run unmodified and pass.

To keep the integration tests fast and avoid running real agent steps (`plan_fix`, `quick_fix`, etc.), the inline test workflow uses trivial `agent: bash` placeholder steps around the walkthrough steps (mirroring how existing walkthrough tests use a minimal one-step workflow), preserving the relative ordering needed to assert "`quick_fix` does not run after a `before` failure."

### Risk Assessment
- **Unused `WALKTHROUGH_MANIFEST` import after refactor**: If all `run-cycle.ts` references move to `walkthroughManifestName`, the named import becomes unused and `typecheck` may flag it. Mitigation: drop it from the import block, or keep it only if still referenced; verify with `npm run typecheck`.
- **Accidental env drift on `walkthrough_capture`**: Adding `CYCLE_WALKTHROUGH_PHASE` unconditionally would change the feature hook's env and break the byte-for-byte guarantee. Mitigation: conditional spread (`...(phase ? { CYCLE_WALKTHROUGH_PHASE: phase } : {})`); covered by the unchanged-feature regression test.
- **Coverage floor regression**: New phase branches in `walkthrough.ts`/`run-cycle.ts` add lines/branches. Mitigation: the unit + integration tests above exercise both phased and un-phased branches and both degrade/fatal paths; report numbers in `BUILD.md`/`FIX.md`.
- **`.cycle/workflows.yml` drift**: Forgetting `sync-defaults` fails the no-diff acceptance criterion. Mitigation: run `npm run sync-defaults` in Task 3 and verify with `git diff --exit-code`.
