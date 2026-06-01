Based on my analysis of SPEC.md, RESEARCH.md, and the current engine code, all four open questions are now resolved. Writing the plan.

# Implementation Plan: Cycle 0024

## Overview
Append an engine-orchestrated `walkthrough_capture` step to the end of the `feature` workflow that runs an optional, project-provided walkthrough hook, collects the screenshot/video media the hook emits into the cycle artifact dir, and references it from the cycle completion record — skipping cleanly as a silent success on repos (including cycle's own) that configure no hook.

## Current State (from Research)
- The `feature` workflow in `src/defaults/workflows.yml:30-41` ends with `documentation`; `.cycle/workflows.yml` is its synced twin (must stay byte-identical after `npm run sync-defaults`).
- `src/engine/run-cycle.ts:293-622` is a single step loop with two pre-exec gates (retry-skip at `:301`, `skip_unless` file-presence skip at `:314-334`), generic exec dispatch (`:413-481`), artifact/completion-proof machinery for agent steps (`:488-571`), failed-bash `.out` capture + `stdout_artifact` pointer with best-effort degrade via `step.output_capture_failed` (`:579-609`), `step.end` emission (`:596-609`), and terminal-failure routing where `reflection`/`documentation` are non-fatal and every other failed step is fatal (`:610-621`).
- `execBashStep` (`src/engine/exec-bash.ts:8-29`) spawns `/bin/bash <abs>` (`shell:false`, array args) with `buildChildEnv(env)`.
- `buildChildEnv` (`src/engine/child-env.ts:16-33`) strips all `CYCLE_*` vars and re-overlays only what callers pass in `extra`; `cycleEnv` (`src/engine/run-cycle.ts:278-284`) carries `CYCLE_ID`/`CYCLE_TITLE`/`CYCLE_BASE` but **not** the artifact dir.
- `EngineConfig` (`src/engine/workflow.ts:28-49`) is where new `engine.*` fields are typed; defensive read-at-site is the convention (`compress_output === true` at `:384`, rate-limit cap coercion at `:410-412`).
- Test templates: `tests/engine/run-cycle.step-end-stdout.test.ts` (repo-setup harness, write-failure-degrade via make-path-a-directory `EISDIR`), `tests/engine/run-cycle.skip-unless.test.ts` (fake-CLI setup, skip-clean assertions), `tests/helpers.ts:3-10` (`expectExactlyOne`).

## Desired End State
- `feature` workflow's last step is `walkthrough_capture` (`agent: bash`, no command), in both `src/defaults/workflows.yml` and a byte-identical `.cycle/workflows.yml`.
- A new `src/engine/walkthrough.ts` owns hook discovery, hook execution, and media collection; `run-cycle.ts` contains a thin name-keyed intercept block that delegates to it.
- On cycle's own repo: the step skips clean (one `step.end{status:"skipped", reason:"walkthrough_hook_absent"}`, no `step.start`, no failure), and `npm test` / `npm run typecheck` stay green.
- With a hook present: the engine spawns it (array args, curated env, `CYCLE_ARTIFACT_DIR` re-injected), collects media from `<artifactDir>/walkthrough/`, writes a `walkthrough-artifacts.json` manifest, and attaches a `walkthrough_artifacts` pointer to the step's `step.end`.
- Hook non-zero exit routes through the normal fatal step-failure path; a post-success collect/write failure degrades via `step.walkthrough_capture_failed` without masking the cycle outcome.
- Verify: new engine tests cover skip-clean, configured-hook-produces-media, write-failure-degrade, and hook-non-zero-exit; `docs/ENGINE.md`, `CLAUDE.md`, and `README.md` document the step.

## What We're NOT Doing
- No built-in Playwright/headless-shell/web-driving capture implementation — the engine only orchestrates a repo-provided hook. App boot/drive logic lives entirely in the hook, which this cycle does not author.
- Not adding the step to any workflow other than `feature` (`document`, `quickfix`, `e2e-tests` are untouched).
- Not configuring a walkthrough hook for cycle's own repo — it stays a CLI with no hook; the step is always inert here.
- Not changing `SPEC`/`PLAN`/`BUILD`/`documentation` step semantics, the completion-proof machinery, `STEP_ARTIFACTS`/`ARTIFACT_STEPS`, or non-`feature` completion records.
- Not adding a new step *agent* (the step is `agent: bash`); no change to `exec.ts` `REGISTRY`, the `Step.agent` union, or `exec-*.ts` agent lanes.
- Not threading `CYCLE_ARTIFACT_DIR` into `cycleEnv` globally — it is injected only for the walkthrough spawn to keep blast radius minimal.

## Implementation Approach
Resolving the four RESEARCH open questions:

1. **Dispatch mechanism** — *Engine-orchestrated, name-keyed intercept.* `skip_unless` keys only on artifact-dir files and cannot detect a repo-root executable, so we add a dedicated `if (step.name === "walkthrough_capture")` block in the step loop (after the existing gates, before reset-eligible logic) that fully handles the step and `continue`s. The step is declared `agent: bash` with **no** `command`, so `execBashStep` is never reached for it. Hook discovery (config command or `.cycle/walkthrough.sh` convention) lives in `walkthrough.ts`.
2. **Completion-record target** — *`step.end` of the walkthrough step.* A `walkthrough_artifacts` pointer is attached to the walkthrough step's `step.end`, mirroring the existing `stdout_artifact` surfacing convention exactly (`cycle.end` keeps its current `{cycle_id, status}` shape).
3. **Artifact-dir env exposure** — *`CYCLE_ARTIFACT_DIR`,* set to the absolute `artifactDir` and re-injected via the `extra` argument of `buildChildEnv` (through the walkthrough spawn's env), honoring the strip/re-inject contract.
4. **Hook non-zero exit policy** — *Fatal, normal routing.* SPEC requires the failure surface "through the normal step-failure routing (non-zero exit, captured stderr)." The walkthrough step is **not** added to the non-fatal `reflection`/`documentation` allowlist, so a non-zero hook exit emits `step.end{status:"failed"}` then `cycle.end{status:"failed", failing_step}` and returns — identical to `verify`.
5. **Media collection semantics** — *Hook writes into `<artifactDir>/walkthrough/`; engine references existing files.* The hook is responsible for writing media into the `walkthrough/` subdir of `CYCLE_ARTIFACT_DIR`. After a clean hook exit, the engine lists that subdir; if non-empty it writes a `walkthrough-artifacts.json` manifest (`{ media: string[], count }`, paths relative to `artifactDir`) into `artifactDir` and sets the pointer to the manifest's absolute path. The collect-list/manifest-write is the surface guarded by `step.walkthrough_capture_failed`.

Logic is concentrated in `src/engine/walkthrough.ts` (directly unit-testable) so `run-cycle.ts` gains only thin orchestration, protecting its 90% per-file floor.

## Failure & Resilience Decisions

**Task 1 — `walkthrough_hook` config field (workflow.ts):** N/A — pure (a typed optional field + defensive read-at-site coercion; no I/O of its own).

**Task 2 — `walkthrough.ts` helpers:**
- `resolveWalkthroughHook(repoRoot, cfg)` (fs `stat`):
  - *Failure modes:* `stat` ENOENT/EACCES/any error ⇒ hook treated as **absent** (returns `null`), the clean-skip path — discovery never throws and never fails the cycle. A configured but missing/non-executable hook also resolves to `null` (inert), matching "active only when a hook is present and executable."
  - *Idempotency:* read-only; safe to re-run.
  - *Observability:* the caller (Task 3) emits the skip event; resolution itself is silent by design (absence is normal, not an error).
  - *No silent failure:* absence is a defined outcome (`null`), not a swallowed error; genuine inability to run a *present* hook surfaces later via the spawn's non-zero exit.
- `execWalkthroughHook(repoRoot, hookAbsPath, env)` (spawn `/bin/bash <hookAbsPath>`, `shell:false`, array args, `buildChildEnv(env)`):
  - *Failure modes:* non-zero exit ⇒ `StepResult{status:"failed", exitCode, stderr}` propagated to the caller for fatal routing. Spawn-level error (e.g. bash missing) resolves to a failed `StepResult` with the error in `stderr` (never an unhandled rejection).
  - *Idempotency:* re-runs on every cycle attempt (bash steps are excluded from the retry-skip gate); the hook is invoked with the same deterministic `CYCLE_ARTIFACT_DIR`, so media is last-write-wins. Re-run safety is the hook author's responsibility, documented in the convention.
  - *Observability:* exit code + head-capped stderr surface on `step.end`.
  - *No silent failure:* exit code drives status; nothing swallowed.
- `collectWalkthroughMedia(artifactDir)` (readdir of `<artifactDir>/walkthrough/`, recursive):
  - *Failure modes:* `readdir` ENOENT ⇒ returns `{media:[]}` (hook produced nothing — a clean, pointer-less success, not a failure). Any **other** readdir error (EACCES, etc.) ⇒ **throws**, caught by the caller and routed to `step.walkthrough_capture_failed`.
  - *Idempotency:* read-only; safe to re-run.
  - *Observability:* the throw carries the underlying error message into the diagnostic event.
  - *No silent failure:* ENOENT is an explicit empty-result branch; all other errors propagate to the degrade event.

**Task 3 — run-cycle intercept block (manifest write + degrade + routing):**
- *Failure modes:* (a) hook absent ⇒ single `step.end{status:"skipped"}`, continue. (b) hook non-zero exit ⇒ `step.end{status:"failed", stderr}` → fatal `cycle.end{status:"failed", failing_step}` → return. (c) hook ok but `collectWalkthroughMedia`/manifest `writeFile` throws ⇒ `step.walkthrough_capture_failed{cycle_id, step, artifact, error}`, pointer omitted, `step.end{status:"ok"}` unchanged, cycle outcome unchanged, no crash (try/catch mirrors `step.output_capture_failed` at `run-cycle.ts:584-594`). (d) hook ok, no media ⇒ `step.end{status:"ok"}`, no pointer.
- *Idempotency:* manifest path `<artifactDir>/walkthrough-artifacts.json` is deterministic; re-writes are last-write-wins. The block `continue`s/returns and never partially mutates engine state.
- *Observability:* `step.start` (active path only), `step.end` (skipped/failed/ok), `step.walkthrough_capture_failed` (degrade), `cycle.end` (fatal hook exit) — all structured JSONL with `cycle_id` first.
- *No silent failure:* every branch ends in an emitted event or a non-zero-exit-driven return; the only `catch` is the named degrade event, which never masks the hook's own exit code or the cycle outcome.

**Task 4 — `workflows.yml` edit + `sync-defaults`:**
- *Failure modes:* `npm run sync-defaults` has a sha-based divergence guard (`scripts/sync-defaults.mjs:7-12`); if the synced copy diverges it fails loudly (non-zero exit), surfaced by the test asserting byte-identity.
- *Idempotency:* re-running `sync-defaults` is a deterministic copy (last-write-wins).
- *Observability:* divergence ⇒ non-zero exit + the acceptance test's diff.
- *No silent failure:* byte-identity is asserted in a test.

**Task 5 — docs + coverage-floor registration:** N/A — pure (Markdown + a `FLOORS` table entry; no runtime I/O).

---

## Task 1: Add `walkthrough_hook` config field to `EngineConfig`

### Overview
Type the optional `engine.walkthrough_hook` field so config can carry a project-supplied hook path; reads remain defensive at the use site.

### Changes Required
**File**: `src/engine/workflow.ts`
**Changes**: Add to `EngineConfig` (after `max_rate_limit_retries`, `:48`):
```ts
  /** Optional project walkthrough-capture hook: a script path (relative to repo
   * root, else absolute) run via /bin/bash at the end of the feature workflow.
   * Absent/empty/non-string ⇒ falls back to the `.cycle/walkthrough.sh`
   * convention, else the step is inert. Resolved defensively at the read site. */
  walkthrough_hook?: string;
```
No change to `loadConfig` validation logic — the field is optional and unvalidated beyond type (consistent with `compress_output`/`rate_limit_backoff_ms`). Coercion to a usable string happens in `walkthrough.ts` (Task 2).

### Success Criteria
- [ ] `npm run typecheck` clean.
- [ ] `loadConfig` parses a `workflows.yml` both with and without `engine.walkthrough_hook` (test).
- [ ] Failure paths behave as designed (N/A — pure; no failure surface).

---

## Task 2: Create `src/engine/walkthrough.ts` (discovery, exec, collection)

### Overview
Concentrate all walkthrough logic in a directly-testable module: hook resolution, hook execution, and media collection/manifest building.

### Changes Required
**File**: `src/engine/walkthrough.ts` (new)
**Changes**:
```ts
import { spawn } from "node:child_process";
import { stat, readdir, writeFile } from "node:fs/promises";
import { join, isAbsolute, relative } from "node:path";
import { buildChildEnv } from "./child-env.ts";
import type { StepResult } from "./exec-types.ts";
import type { CycleConfig } from "./workflow.ts";

export const WALKTHROUGH_MEDIA_DIRNAME = "walkthrough";
export const WALKTHROUGH_MANIFEST = "walkthrough-artifacts.json";

/** Resolve the active walkthrough hook to an absolute path, or null if none.
 * Order: explicit engine.walkthrough_hook (relative→repoRoot), then the
 * `.cycle/walkthrough.sh` convention. A hook is "active" only when the resolved
 * path exists, is a regular file, and is executable. Any stat error ⇒ null
 * (inert), never throws. */
export async function resolveWalkthroughHook(
  repoRoot: string,
  cfg: CycleConfig,
): Promise<string | null> {
  const raw = cfg.engine.walkthrough_hook;
  const configured = typeof raw === "string" && raw.trim() ? raw.trim() : undefined;
  const candidate = configured
    ? (isAbsolute(configured) ? configured : join(repoRoot, configured))
    : join(repoRoot, ".cycle", "walkthrough.sh");
  try {
    const st = await stat(candidate);
    if (st.isFile() && (st.mode & 0o111) !== 0) return candidate;
  } catch { /* absent/unreadable ⇒ inert */ }
  return null;
}

/** Spawn the hook via /bin/bash (array args, shell:false). Non-zero exit /
 * spawn error resolve to a failed StepResult — never an unhandled rejection. */
export function execWalkthroughHook(
  repoRoot: string,
  hookAbsPath: string,
  env: Record<string, string>,
): Promise<StepResult> {
  return new Promise(resolve => {
    const child = spawn("/bin/bash", [hookAbsPath], {
      cwd: repoRoot, env: buildChildEnv(env), shell: false,
    });
    let stdout = "", stderr = "";
    child.stdout.on("data", d => { stdout += d.toString(); });
    child.stderr.on("data", d => { stderr += d.toString(); });
    child.on("error", err => resolve({ status: "failed", exitCode: -1, stdout, stderr: stderr + String(err) }));
    child.on("close", code => resolve({
      status: code === 0 ? "ok" : "failed", exitCode: code ?? -1, stdout, stderr,
    }));
  });
}

/** List media the hook wrote under <artifactDir>/walkthrough/. Missing dir ⇒
 * [] (hook produced nothing — clean). Any other readdir error throws (the
 * collect-failure degrade surface). Paths are relative to artifactDir. */
export async function collectWalkthroughMedia(artifactDir: string): Promise<string[]> {
  const mediaDir = join(artifactDir, WALKTHROUGH_MEDIA_DIRNAME);
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

/** Write the manifest into artifactDir; return its absolute path. Throws on
 * write failure (caller routes to step.walkthrough_capture_failed). */
export async function writeWalkthroughManifest(
  artifactDir: string,
  media: string[],
): Promise<string> {
  const manifestPath = join(artifactDir, WALKTHROUGH_MANIFEST);
  await writeFile(manifestPath, JSON.stringify({ media, count: media.length }, null, 2), "utf8");
  return manifestPath;
}
```
(`StepResult` imported from `./exec-types.ts` per the canonical-home rule. `entry.parentPath` is the Node ≥ 22 recursive-readdir field.)

### Success Criteria
- [ ] `npm run typecheck` clean.
- [ ] `resolveWalkthroughHook` returns: `null` when neither hook exists; the convention path when `.cycle/walkthrough.sh` is an executable file; the configured path (relative + absolute) when set; `null` for a present-but-non-executable file (tested via real temp files + `chmod`).
- [ ] `execWalkthroughHook` returns `status:"ok"` for an exit-0 script and `status:"failed"` with stderr for an exit-1 script (real temp scripts, array args).
- [ ] `collectWalkthroughMedia` returns `[]` for a missing dir, the sorted relative file list (including nested) for a populated dir, and **throws** for a non-ENOENT readdir error (e.g. path-is-a-file).
- [ ] `writeWalkthroughManifest` writes valid JSON and throws on write failure (target made a directory → `EISDIR`).
- [ ] Failure paths behave as designed (ENOENT→`[]`, other errors propagate, spawn errors → failed result).

---

## Task 3: Wire the name-keyed `walkthrough_capture` intercept into `run-cycle.ts`

### Overview
Add a thin intercept block in the step loop that delegates to `walkthrough.ts`: skip-clean when no hook, spawn + collect + pointer when present, fatal routing on non-zero exit, degrade on collect/write failure.

### Changes Required
**File**: `src/engine/run-cycle.ts`
**Changes**:
1. Import the helpers:
```ts
import {
  resolveWalkthroughHook, execWalkthroughHook,
  collectWalkthroughMedia, writeWalkthroughManifest,
} from "./walkthrough.ts";
```
2. Insert immediately after the `skip_unless` block (after `:334`), before the reset-eligible logic:
```ts
if (step.name === "walkthrough_capture") {
  const hook = await resolveWalkthroughHook(repoRoot, cfg);
  if (!hook) {
    await log.emit("step.end", {
      cycle_id: cycleId, step: step.name, status: "skipped",
      reason: "walkthrough_hook_absent",
      duration_ms: Math.max(0, Math.round(nowFn() - stepStart)),
    });
    continue;
  }
  await log.emit("step.start", { cycle_id: cycleId, step: step.name, agent: "bash" });
  const wr = await execWalkthroughHook(repoRoot, hook, {
    ...cycleEnv, CYCLE_ARTIFACT_DIR: artifactDir,
  });
  if (wr.status === "failed") {
    await log.emit("step.end", {
      cycle_id: cycleId, step: step.name, status: "failed",
      exit_code: wr.exitCode,
      duration_ms: Math.max(0, Math.round(nowFn() - stepStart)),
      stderr: truncateHeadCapped(wr.stderr, MAX_STEP_END_STDERR),
    });
    await log.emit("cycle.end", { cycle_id: cycleId, status: "failed", failing_step: step.name });
    return { cycleId, artifactDir, status: "failed" as const, failingStep: step.name };
  }
  let walkthroughArtifact: string | undefined;
  try {
    const media = await collectWalkthroughMedia(artifactDir);
    if (media.length > 0) {
      walkthroughArtifact = await writeWalkthroughManifest(artifactDir, media);
    }
  } catch (err) {
    await log.emit("step.walkthrough_capture_failed", {
      cycle_id: cycleId, step: step.name,
      artifact: join(artifactDir, "walkthrough-artifacts.json"),
      error: err instanceof Error ? err.message : String(err),
    });
  }
  await log.emit("step.end", {
    cycle_id: cycleId, step: step.name, status: "ok", exit_code: wr.exitCode,
    duration_ms: Math.max(0, Math.round(nowFn() - stepStart)),
    ...(walkthroughArtifact ? { walkthrough_artifacts: walkthroughArtifact } : {}),
  });
  continue;
}
```
The block sits after both pre-exec gates and `continue`s, so the walkthrough step never reaches the generic exec dispatch, `execBashStep`, completion-proof machinery, or the shared `step.end`/terminal-routing tail.

### Success Criteria
- [ ] `npm run typecheck` clean.
- [ ] Skip-clean: with no hook, exactly one `step.end{status:"skipped", reason:"walkthrough_hook_absent"}`, no `step.start` for the step, no `step.end{status:"failed"}`, `result.status === "ok"`.
- [ ] Configured hook writing media into `$CYCLE_ARTIFACT_DIR/walkthrough/`: media files present under the artifact dir, `walkthrough-artifacts.json` written, and `step.end` carries a `walkthrough_artifacts` pointer to it.
- [ ] Hook exit 1: `step.end{status:"failed"}` then `cycle.end{status:"failed", failing_step:"walkthrough_capture"}`, `result.status === "failed"`.
- [ ] Write-failure degrade: hook succeeds + emits media but manifest write fails (manifest path pre-created as a directory) → exactly one `step.walkthrough_capture_failed`, no `walkthrough_artifacts` pointer, `step.end{status:"ok"}`, `result.status === "ok"`, no crash.
- [ ] Failure paths behave as designed (errors surfaced via events/exit, no swallowed `catch` beyond the named degrade event).

---

## Task 4: Add the step to the `feature` workflow defaults + sync, with integration coverage

### Overview
Register `walkthrough_capture` as the final `feature` step and propagate to `.cycle/`, plus the cycle-on-cycle skip-clean acceptance test.

### Changes Required
**File**: `src/defaults/workflows.yml`
**Changes**: Append after `documentation` (`:41`):
```yaml
      - { name: walkthrough_capture, agent: bash }
```
(No `command`: the engine intercepts by name; `agent: bash` is declared explicitly per the bash-step rule and keeps it out of `defaults.agent: claudecode`.)

**File**: `.cycle/workflows.yml`
**Changes**: Regenerated by `npm run sync-defaults` (must be byte-identical to the source).

**File**: `tests/engine/run-cycle.walkthrough.test.ts` (new) — integration tests via the `run-cycle.step-end-stdout.test.ts` harness (temp repo, `git init`, custom `workflows.yml` whose `feature` workflow ends with `walkthrough_capture`, `runCycle(...)`, parse `.cycle/log.jsonl`):
- **skip-clean** (no `.cycle/walkthrough.sh`, no `engine.walkthrough_hook`),
- **configured hook produces media** (write an executable `.cycle/walkthrough.sh` that `mkdir -p "$CYCLE_ARTIFACT_DIR/walkthrough"` and writes a file),
- **write-failure degrade** (pre-create the manifest path as a directory),
- **hook non-zero exit** (`exit 1` hook).

Use `expectExactlyOne`/`filter(...).length === 1` for `step.walkthrough_capture_failed` and `step.start`/`step.end`.

### Success Criteria
- [ ] `walkthrough_capture` is the last `feature` step in `src/defaults/workflows.yml`.
- [ ] `.cycle/workflows.yml` is byte-identical after `npm run sync-defaults` (test asserts; `scripts/sync-defaults.mjs` divergence guard passes).
- [ ] All four integration scenarios pass.
- [ ] Failure paths behave as designed (degrade + fatal-exit scenarios assert the documented events).

---

## Task 5: Documentation + coverage-floor registration

### Overview
Document the new step, the hook convention, the pointer/diagnostic event, and register a per-file coverage floor for `walkthrough.ts`.

### Changes Required
**File**: `scripts/coverage-gate.mjs`
**Changes**: Add `src/engine/walkthrough.ts` to the `FLOORS` table at `95%` (mirrors sibling engine helpers).

**File**: `CLAUDE.md`
**Changes**: (a) In the per-file floors list, add `src/engine/walkthrough.ts (95%)`. (b) Add a run-cycle architecture note describing the `walkthrough_capture` step: name-keyed intercept, `.cycle/walkthrough.sh` / `engine.walkthrough_hook` discovery, `CYCLE_ARTIFACT_DIR` injection, `<artifactDir>/walkthrough/` media convention, `walkthrough_artifacts` pointer on `step.end`, fatal non-zero-exit routing, and `step.walkthrough_capture_failed` best-effort degrade — mirroring the failed-bash `stdout_artifact` note.

**File**: `docs/ENGINE.md`
**Changes**: Add a *Walkthrough capture* subsection (sibling to *Failed bash-step stdout capture* at `:192-199` and *Feature workflow step sequence* at `:117-123`): hook discovery order, orchestration/spawn contract, media collection from `walkthrough/`, the skip-clean-when-absent path, fatal hook-exit routing, and the best-effort manifest-write degrade. Update the feature step-sequence narrative to end with `walkthrough_capture`.

**File**: `README.md`
**Changes**: Note that delivered features can emit optional screenshot/video walkthrough artifacts via a project-provided hook (`.cycle/walkthrough.sh` or `engine.walkthrough_hook`), and that repos without a hook are unaffected.

### Success Criteria
- [ ] `npm run check:coverage` passes with `walkthrough.ts` ≥ 95%.
- [ ] Docs name the step, the convention, the env var, the pointer field, and the diagnostic event.
- [ ] Failure paths behave as designed (N/A — pure docs/config).

---

## SPEC Acceptance Traceability

| SPEC Acceptance Bullet (verbatim) | Covering Task | Notes |
|---|---|---|
| [ ] `src/defaults/workflows.yml` contains a `walkthrough_capture` step as the last step of the `feature` workflow, and `.cycle/workflows.yml` is byte-identical after `npm run sync-defaults`. | Task 4 | |
| [ ] On cycle's own repo (no walkthrough hook configured), running the `feature` workflow reaches the `walkthrough_capture` step and it skips clean: no artifact is written, no failure is recorded, and the cycle completes green. | Task 3, Task 4 | Engine skip-clean branch (Task 3) + real-defaults step (Task 4) |
| [ ] When a walkthrough hook is configured and emits media into the cycle artifact dir, the produced files are present under `docs/cycle/<cycle_id>-feature-<slug>/` and the cycle completion record carries a pointer referencing them. | Task 2, Task 3 | Media under `walkthrough/`; `walkthrough_artifacts` manifest pointer on `step.end` |
| [ ] **Failure-path:** when the hook succeeds but the artifact/pointer write fails, the engine emits a `step.walkthrough_capture_failed`-style diagnostic event, omits the pointer, leaves the original cycle outcome unchanged, and does not crash. | Task 3 | try/catch degrade mirrors `step.output_capture_failed` |
| [ ] **Failure-path:** when no hook is configured, the step produces no `step.end { status: "failed" }` and the cycle outcome is unaffected by the step's presence. | Task 3 | Skip-clean emits `status:"skipped"` only |
| [ ] All existing tests still pass (`npm test` green). | Task 4, Task 5 | Verified after all tasks; see Risk on step-count assertions |
| [ ] No compiler/linter warnings introduced (`npm run typecheck` clean). | Task 1, Task 2, Task 3 | |

---

## Testing Strategy

### Unit Tests
**`tests/engine/walkthrough.test.ts`** (new, exercises `walkthrough.ts` directly):
- `resolveWalkthroughHook`: returns `null` with no hook; convention path when `.cycle/walkthrough.sh` exists + is executable (`chmod 0o755`); configured relative and absolute paths; `null` for a present-but-non-executable file; `null` on stat error.
- `execWalkthroughHook`: exit-0 script ⇒ `status:"ok"`; exit-1 script ⇒ `status:"failed"` with stderr captured; verify `CYCLE_ARTIFACT_DIR` reaches the child by having the script echo it.
- `collectWalkthroughMedia`: missing dir ⇒ `[]`; populated dir (incl. a nested file) ⇒ sorted relative paths; non-ENOENT error (point `walkthrough/` at a file) ⇒ **throws**.
- `writeWalkthroughManifest`: writes valid JSON with `media`/`count`; throws `EISDIR` when the manifest path is a directory.
- **Failure-path tests** (one per named failure mode): readdir non-ENOENT throw, manifest-write `EISDIR`, spawn of an exit-1 hook, non-executable hook → inert.
- **Mocking strategy:** real implementations only — temp dirs, real scripts, `chmod`, make-path-a-directory for forced errors (no `mock.method` on `node:fs/promises`, per CLAUDE.md).

**`tests/engine/workflow.*` (extend or new):** `loadConfig` parses `engine.walkthrough_hook` present and absent.

### Integration / E2E Tests
**`tests/engine/run-cycle.walkthrough.test.ts`** (new, full `runCycle` via the temp-repo harness):
- **Skip-clean:** custom `feature` workflow ending in `walkthrough_capture`, no hook → exactly one `step.end{status:"skipped", reason:"walkthrough_hook_absent"}`, no matching `step.start`, no `step.end{status:"failed"}`, `result.status === "ok"`.
- **Configured-hook produces media:** executable `.cycle/walkthrough.sh` that writes into `$CYCLE_ARTIFACT_DIR/walkthrough/` → media file present under the artifact dir, `walkthrough-artifacts.json` present, `step.end` carries `walkthrough_artifacts`; cardinality-pinned `step.start`/`step.end`.
- **Write-failure degrade:** hook emits media but the manifest path is pre-created as a directory → exactly one `step.walkthrough_capture_failed` (`expectExactlyOne`), no pointer, `step.end{status:"ok"}`, `result.status === "ok"`.
- **Hook non-zero exit:** `exit 1` hook → `step.end{status:"failed"}` then `cycle.end{status:"failed", failing_step:"walkthrough_capture"}`, `result.status === "failed"`.

No E2E/Playwright tests — this cycle adds orchestration only and introduces no UI. All subprocess invocations use array-arg `spawn`/`/bin/bash <path>`, never `shell:true`.

## Risk Assessment
- **Existing tests asserting the `feature` workflow's step count/last step** may break when the new step lands. *Mitigation:* grep `tests/` for `documentation`-as-last-step or feature step-count assertions before committing; update them. The no-args integration test was decoupled from JSONL format in cycle 0023, lowering this risk.
- **Fall-through to `execBashStep` if the name-intercept regresses** (the step has no `command`, so `step.command!` would be `undefined`). *Mitigation:* the intercept block `continue`s unconditionally and is covered by the skip-clean integration test; a regression fails that test loudly.
- **`entry.parentPath` availability** (Node ≥ 22 recursive readdir field). *Mitigation:* the project floor is Node ≥ 22.6 (CLAUDE.md Runtime); `parentPath` is present. Fallback `?? mediaDir` guards the one-level case.
- **Coverage floor pressure on `run-cycle.ts` (90%).** *Mitigation:* logic lives in `walkthrough.ts` (own 95% floor); the run-cycle additions are thin and every branch (skip / failed-exit / degrade / ok-with-pointer / ok-no-media) is exercised by the integration tests.
- **Hook-author re-run safety** (the engine re-invokes bash steps on every attempt). *Mitigation:* deterministic `CYCLE_ARTIFACT_DIR`/`walkthrough/` paths give last-write-wins; documented as the hook author's responsibility in `docs/ENGINE.md`.
