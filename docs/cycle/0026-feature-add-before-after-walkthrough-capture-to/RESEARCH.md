# Research: Cycle 0026

## Cycle Context
Cycle 0026 adds before/after walkthrough capture to the `quickfix` workflow. Two `agent: bash` steps — `walkthrough_before` (inserted after `plan_fix`, before `quick_fix`) and `walkthrough_after` (final step, after `verify`) — are added to the `quickfix` workflow in `src/defaults/workflows.yml` (then synced to `.cycle/workflows.yml`). The existing name-keyed `walkthrough_capture` intercept in `run-cycle.ts` must become *phase-aware*: a declarative map of walkthrough step name → phase label (`walkthrough_capture` → none, `walkthrough_before` → `before`, `walkthrough_after` → `after`) that reuses the existing `resolveWalkthroughHook` / `execWalkthroughHook` / bounded-kill / degrade machinery unchanged, while (a) passing a new `CYCLE_WALKTHROUGH_PHASE` env var to the hook, and (b) collecting media from a phase-scoped subdirectory (`<artifactDir>/walkthrough/<phase>/`) into a phase-labeled manifest (`walkthrough-<phase>-artifacts.json`). The un-phased `walkthrough_capture` behavior must be preserved byte-for-byte, and no `feature`/`document`/`e2e-tests` behavior may change. No new config surface is introduced — only the engine-provided `CYCLE_WALKTHROUGH_PHASE` env var.

## Current Codebase State

### Relevant Components
- Walkthrough orchestration module (all discovery/exec/collect/manifest logic): `src/engine/walkthrough.ts:1-143`
  - `WALKTHROUGH_MEDIA_DIRNAME = "walkthrough"` — `src/engine/walkthrough.ts:8`
  - `WALKTHROUGH_MANIFEST = "walkthrough-artifacts.json"` — `src/engine/walkthrough.ts:9`
  - `WALKTHROUGH_KILL_GRACE_MS = 5000` — `src/engine/walkthrough.ts:12`
  - `DEFAULT_WALKTHROUGH_HOOK_TIMEOUT_MS = 600000` (documented, not auto-applied) — `src/engine/walkthrough.ts:16`
  - `WalkthroughTimer` type + injectable `defaultTimer` — `src/engine/walkthrough.ts:22-27`
  - `resolveWalkthroughHook(repoRoot, cfg): Promise<string | null>` — `src/engine/walkthrough.ts:34-50`
  - `execWalkthroughHook(repoRoot, hookAbsPath, env, opts)` — `src/engine/walkthrough.ts:64-113`
  - `collectWalkthroughMedia(artifactDir): Promise<string[]>` — `src/engine/walkthrough.ts:118-131`
  - `writeWalkthroughManifest(artifactDir, media): Promise<string>` — `src/engine/walkthrough.ts:135-142`
- The name-keyed walkthrough intercept inside `runCycle`'s step loop — `src/engine/run-cycle.ts:347-424` (guarded by `if (step.name === "walkthrough_capture")` at `src/engine/run-cycle.ts:358`)
- Workflow definitions (`feature`, `document`, `quickfix`, `e2e-tests`) — `src/defaults/workflows.yml:27-71`; `quickfix` specifically — `src/defaults/workflows.yml:53-60`
- Synced runtime copy — `.cycle/workflows.yml:53-60` (currently identical to defaults; no `walkthrough_*` steps in `quickfix`)
- `Step` / `EngineConfig` types — `src/engine/workflow.ts:6-60`

### Existing Patterns to Follow

- **Name-keyed step intercept**: The walkthrough step is fully handled by a named branch in the step loop that `continue`s, bypassing the generic exec dispatch, `execBashStep`, the completion-proof machinery, and the shared `step.end` tail. The branch sits *after* the retry-skip and `skip_unless` gates (`src/engine/run-cycle.ts:310-345`) and *before* the reset-eligible / generic-exec logic (`src/engine/run-cycle.ts:426+`). The intercept condition to generalize is the literal `step.name === "walkthrough_capture"` — `src/engine/run-cycle.ts:358`.

- **Inert / skip-clean path** (no active hook): emit a single `step.end { status: "skipped", reason: "walkthrough_hook_absent", duration_ms }`, *no* `step.start`, then `continue` — `src/engine/run-cycle.ts:359-369`.

- **Active path**: emit `step.start { cycle_id, step, agent: "bash" }` (`src/engine/run-cycle.ts:370`); defensively coerce the timeout (`src/engine/run-cycle.ts:376-379`); call `execWalkthroughHook(repoRoot, hook, { ...cycleEnv, CYCLE_ARTIFACT_DIR: artifactDir }, { timeoutMs })` (`src/engine/run-cycle.ts:380-385`). On `wr.status === "failed"`, route fatal (see below). Otherwise `collectWalkthroughMedia(artifactDir)` and, if non-empty, `writeWalkthroughManifest(artifactDir, media)`, then `step.end { status: "ok", exit_code, duration_ms, ...(artifact ? { walkthrough_artifacts } : {}) }` — `src/engine/run-cycle.ts:401-423`.

- **Hook discovery** (`resolveWalkthroughHook`): tries explicit `engine.walkthrough_hook` first (relative→repoRoot via `join`, else absolute; blank/whitespace/non-string ignored), then the `.cycle/walkthrough.sh` convention. "Active" = path exists, `isFile()`, and `mode & 0o111 !== 0`. Any `stat` error ⇒ `null` (never throws) — `src/engine/walkthrough.ts:34-50`. This is repo-agnostic and phase-independent; the SPEC reuses it unchanged.

- **Env strip/re-inject contract**: `buildChildEnv(extra)` strips all `CYCLE_*` vars by prefix, prepends the parent Node bin dir to PATH, then overlays `extra`. `execWalkthroughHook` wraps the passed `env` through `buildChildEnv(env)` at spawn (`src/engine/walkthrough.ts:75`). The intercept therefore must pass any `CYCLE_*` var the hook needs explicitly in the `env` argument — today it passes `{ ...cycleEnv, CYCLE_ARTIFACT_DIR: artifactDir }` (`src/engine/run-cycle.ts:383`). `CYCLE_WALKTHROUGH_PHASE` must be added to this same object per the contract. `cycleEnv` is built at `src/engine/run-cycle.ts:289-295` (`CYCLE_ID`, `CYCLE_TITLE`, `CYCLE_BASE`, optional `CYCLE_ISSUE_ID`, plus `opts.env`).

- **Bounded-kill timeout / spawn discipline**: `execWalkthroughHook` spawns `/bin/bash [hookAbsPath]` with `cwd: repoRoot`, `shell: false`, `detached: true` (own process group). On timer expiry: `timedOut = true`, `killTree("SIGTERM")`, then arm a `WALKTHROUGH_KILL_GRACE_MS` grace timer firing `killTree("SIGKILL")`. `killTree` signals `-child.pid` (whole group), falling back to `child.kill(sig)`, swallowing errors. A `settled` single-resolve guard prevents timeout + `close`/`error` double-resolution — `src/engine/walkthrough.ts:64-113`. Timeout is read & coerced at `src/engine/run-cycle.ts:376-379` (valid positive integer arms; `0`/negative/non-integer/`NaN`/`Infinity`/non-number/absent ⇒ `0` = disabled). This whole surface is reused unchanged by the SPEC.

- **Failure handling (fatal path)**: a `wr.status === "failed"` result (non-zero exit *or* timeout) builds `failStderr` — timeout wording via `formatWalkthroughTimeoutError(step.name, wr.exitCode)` prepended when `wr.timedOut`, else raw `wr.stderr` — both head-capped via `truncateHeadCapped(…, MAX_STEP_END_STDERR)` (`MAX_STEP_END_STDERR = 2000`, `src/engine/run-cycle.ts:189`). Then emits `step.end { status: "failed", exit_code, duration_ms, stderr }` → `cycle.end { status: "failed", failing_step: step.name }` → `return { cycleId, artifactDir, status: "failed", failingStep: step.name }` (early return; the surrounding `finally` checkout/base-pull cleanup at `src/engine/run-cycle.ts:721-740` still runs) — `src/engine/run-cycle.ts:386-399`. `formatWalkthroughTimeoutError` — `src/engine/run-cycle.ts:211-213`.

- **Failure handling (best-effort degrade)**: collect/manifest-write wrapped in `try/catch`; on throw, emit `step.walkthrough_capture_failed { cycle_id, step, artifact, error }` (artifact = `join(artifactDir, WALKTHROUGH_MANIFEST)`), omit the pointer, and proceed to a normal `step.end { status: "ok" }` — never masks the cycle outcome — `src/engine/run-cycle.ts:401-414`. `collectWalkthroughMedia` returns `[]` on ENOENT (missing media dir = clean) and throws on any other `readdir` error (`src/engine/walkthrough.ts:118-131`); `writeWalkthroughManifest` throws on write failure (e.g. EISDIR) (`src/engine/walkthrough.ts:135-142`).

- **Observability / event conventions**: all events emitted via `log.emit("<event>", payload)`. Events in the change area: `step.start { cycle_id, step, agent }`, `step.end { cycle_id, step, status, [reason], [exit_code], duration_ms, [stderr], [walkthrough_artifacts] }`, `step.walkthrough_capture_failed { cycle_id, step, artifact, error }`, `cycle.end { cycle_id, status, [failing_step] }`. `duration_ms` is computed `Math.max(0, Math.round(nowFn() - stepStart))` (`stepStart = nowFn()` at `src/engine/run-cycle.ts:306`). The `walkthrough_artifacts` pointer mirrors the failed-bash `stdout_artifact` surfacing convention.

- **Idempotency / retry-safety**: the walkthrough intercept sits after the retry-skip gate (`skipEnabled`, `src/engine/run-cycle.ts:303`) and `skip_unless` gate. Bash steps are re-invoked on every cycle attempt with the same deterministic `CYCLE_ARTIFACT_DIR` paths (media is last-write-wins; re-run safety is the hook author's responsibility). Note: `quick_fix` is in `RESET_ELIGIBLE_STEPS` (`src/engine/run-cycle.ts:36`); the new `walkthrough_*` steps would not be reset-eligible (they `continue` before that logic). `max_cycle_attempts` for `quickfix` is `3` (`src/defaults/workflows.yml:55`).

- **Defaults sync convention**: edits to `src/defaults/` require `npm run sync-defaults` (copies `src/defaults/` → `.cycle/`). The SPEC acceptance criterion requires `.cycle/workflows.yml` to match after sync (no diff). Documented in `CLAUDE.md` → Commands, and `docs/sync-defaults.md`.

- **bash step declaration**: bash steps must declare `agent: bash` explicitly with no `command` for the intercept to apply (e.g. `{ name: walkthrough_capture, agent: bash }` — `src/defaults/workflows.yml:42`). `defaults.agent` never coerces a step into bash.

### Dependencies & Integration Points
- `src/engine/walkthrough.ts` ← imported by `src/engine/run-cycle.ts:28-34` (`resolveWalkthroughHook`, `execWalkthroughHook`, `collectWalkthroughMedia`, `writeWalkthroughManifest`, `WALKTHROUGH_MANIFEST`). Note: `WALKTHROUGH_MEDIA_DIRNAME` is currently *not* imported into `run-cycle.ts` — the manifest constant is, but the media dirname is encapsulated inside `collectWalkthroughMedia`. Phase-scoped collection will need a way to target `<artifactDir>/walkthrough/<phase>/` and name `walkthrough-<phase>-artifacts.json`.
- `src/engine/child-env.ts` → `buildChildEnv` used inside `execWalkthroughHook` (`src/engine/walkthrough.ts:4,75`).
- `src/engine/exec-types.ts` → `StepResult` type (the result shape `execWalkthroughHook` returns; fields `status`, `exitCode`, `stdout`, `stderr`, optional `timedOut`) — imported at `src/engine/walkthrough.ts:5`.
- `src/engine/workflow.ts` → `CycleConfig`/`EngineConfig`/`Step` types; `Step.name` union is open (`name: string`), so new step names need no type change. `walkthrough_hook` / `walkthrough_hook_timeout_ms` config fields — `src/engine/workflow.ts:49-59`.
- `cycleEnv` construction — `src/engine/run-cycle.ts:289-295`; `artifactDir` — passed into the intercept's env at `src/engine/run-cycle.ts:383`.
- `truncateHeadCapped` (head-cap helper) from `src/engine/log-fmt.ts`, used for `stderr` capping — `src/engine/run-cycle.ts:24`.
- Documentation that must be kept in sync (per SPEC "Documentation Updates"): `CLAUDE.md` (the `walkthrough.ts` / `run-cycle.ts` architecture notes), `docs/ENGINE.md` *Walkthrough capture* section (`docs/ENGINE.md:201-215`) and the workflow-sequence note (`docs/ENGINE.md:119`), and `README.md`.

### Test Infrastructure
- **Test framework**: `node:test` run via `node --experimental-strip-types` (no transpile). Assertions via `node:assert` (`strict`). Helpers from `tests/helpers.ts` (`expectExactlyOne`).
- **Test conventions**:
  - Cardinality-pinned exactly-once assertions: `filter(predicate).length === 1`, or `expectExactlyOne(events, eventName)` when the payload is needed (CLAUDE.md → Test conventions). Used in `tests/engine/run-cycle.walkthrough.test.ts:187`.
  - Integration tests drive `runCycle` over a temp git repo created with `mkdtemp` + `git init -b main`, a `.cycle/workflows.yml` written inline, and an executable `.cycle/walkthrough.sh` (`chmod 0o755`). Events are read by parsing `.cycle/log.jsonl` line-by-line (`readEvents`/`stepEvents` helpers) — `tests/engine/run-cycle.walkthrough.test.ts:10-60`.
  - `node:fs/promises` cannot be stubbed via `mock.method` (non-configurable ESM exports); failure paths use real filesystem manipulation — e.g. pre-creating the manifest path as a directory to force `EISDIR` (`tests/engine/run-cycle.walkthrough.test.ts:153-198`), making a media path a regular file to force `ENOTDIR` (`tests/engine/walkthrough.test.ts:321-333`).
  - Timeout tests inject a synchronous fake `WalkthroughTimer` (`recordingTimer`) to drive SIGTERM→SIGKILL escalation deterministically, plus one small real-timeout integration test — `tests/engine/walkthrough.test.ts:167-237`, `tests/engine/run-cycle.walkthrough.test.ts:228-267`.
- **Existing integration scenarios** (`tests/engine/run-cycle.walkthrough.test.ts`, all for the `feature` `walkthrough_capture` step): skip-clean / no-hook (1), media+pointer (2), no-media-no-pointer (2b), manifest-write degrade EISDIR (3), non-zero-exit fatal (4), real-timeout fatal (4b), slow-hook-no-timeout (4c), non-integer-timeout-disabled (4d), explicit-config-path hook (5). These exercise a minimal one-step `feature` workflow whose only step is `walkthrough_capture`.
- **Existing unit scenarios** (`tests/engine/walkthrough.test.ts`): `resolveWalkthroughHook` (7 cases), `execWalkthroughHook` ok/fail/spawn-error + 4 timer cases, `DEFAULT_WALKTHROUGH_HOOK_TIMEOUT_MS` constant, `collectWalkthroughMedia` empty/sorted-nested/non-ENOENT-throw, `writeWalkthroughManifest` ok/EISDIR.
- **Current coverage of the change area / failure-path coverage**: extensive failure-path coverage already exists (non-zero exit, timeout, spawn error, manifest EISDIR, non-ENOENT readdir). Per-file coverage floors enforced by `scripts/coverage-gate.mjs`: `src/engine/run-cycle.ts` 90% (`scripts/coverage-gate.mjs:30`), `src/engine/walkthrough.ts` 95% (`scripts/coverage-gate.mjs:31`). Global floors: Line ≥ 95%, Branch ≥ 75%, Function ≥ 90% (CLAUDE.md → Coverage policy).

## Code References
- `src/defaults/workflows.yml:53-60` — `quickfix` workflow: `plan_fix → quick_fix → test_fix → verify (bash)`; the insertion points for `walkthrough_before` (after `plan_fix`) and `walkthrough_after` (after `verify`).
- `.cycle/workflows.yml:53-60` — synced runtime copy of `quickfix` (must match defaults post-sync).
- `src/defaults/workflows.yml:42` — the existing `{ name: walkthrough_capture, agent: bash }` step shape to mirror.
- `src/engine/run-cycle.ts:358` — the `if (step.name === "walkthrough_capture")` guard to generalize into a phase-aware name→phase map.
- `src/engine/run-cycle.ts:359-424` — full intercept body (skip-clean, active spawn, fatal routing, degrade, ok step.end).
- `src/engine/run-cycle.ts:383` — env object `{ ...cycleEnv, CYCLE_ARTIFACT_DIR: artifactDir }` where `CYCLE_WALKTHROUGH_PHASE` must be added.
- `src/engine/run-cycle.ts:401-406` — `collectWalkthroughMedia` + `writeWalkthroughManifest` call site to make phase-scoped.
- `src/engine/run-cycle.ts:211-213` — `formatWalkthroughTimeoutError`.
- `src/engine/walkthrough.ts:8-9` — `WALKTHROUGH_MEDIA_DIRNAME` / `WALKTHROUGH_MANIFEST` constants (un-phased names that must be preserved for `walkthrough_capture`).
- `src/engine/walkthrough.ts:118-131` — `collectWalkthroughMedia` (currently hard-codes `WALKTHROUGH_MEDIA_DIRNAME`; phase scoping must target a subdir).
- `src/engine/walkthrough.ts:135-142` — `writeWalkthroughManifest` (currently hard-codes `WALKTHROUGH_MANIFEST`; phase manifests need a distinct name).
- `src/engine/workflow.ts:6-14` — `Step` type (`name: string`, open union — no change needed for new step names).
- `docs/ENGINE.md:201-215` — *Walkthrough capture* section to extend with phase semantics.
- `docs/ENGINE.md:119` — workflow-sequence note referencing `walkthrough_capture`.
- `scripts/coverage-gate.mjs:30-31` — per-file coverage floors for the two touched files.

## Open Questions
- **Phase-scoped helper signatures**: `collectWalkthroughMedia(artifactDir)` and `writeWalkthroughManifest(artifactDir, media)` currently hard-code the `walkthrough/` dirname and `walkthrough-artifacts.json` name. The SPEC requires phase-scoped variants (`walkthrough/<phase>/` and `walkthrough-<phase>-artifacts.json`) while preserving the un-phased behavior byte-for-byte. Whether this is done by adding an optional `phase`/`subdir` parameter to the existing functions, or by new dedicated helpers, is a planning decision (the SPEC says "phase-aware helper added to `src/engine/walkthrough.ts`" but does not fix the signature).
- **Relative-path base in collected manifest media**: `collectWalkthroughMedia` returns paths `relative(artifactDir, …)` (so currently `walkthrough/shot.png`). For phase scoping, whether collected paths should be relative to `artifactDir` (yielding `walkthrough/before/shot.png`) or to the phase subdir is unspecified; the planner should confirm the desired manifest `media[]` shape and update tests accordingly.
- **`step.walkthrough_capture_failed` event name for phase steps**: the SPEC reuses the existing `step.walkthrough_capture_failed` event name verbatim for the degrade path on `walkthrough_before`/`walkthrough_after` (Acceptance Criteria and Failure behavior both name it). The `artifact` field currently points at `join(artifactDir, WALKTHROUGH_MANIFEST)` — for phase steps it should presumably point at the phase manifest path; the planner should confirm.
- **Phase-map placement**: whether the name→phase map lives in `run-cycle.ts` (alongside the intercept) or is exported from `walkthrough.ts` is unspecified; SPEC describes it as a "small declarative map" in the `run-cycle.ts` intercept.
