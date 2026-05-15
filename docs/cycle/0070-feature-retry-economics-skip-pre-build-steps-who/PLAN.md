# Implementation Plan: Cycle 0070

## Overview
On `tbd.jsonl` retry pops (`attempt > 0`), skip pre-build workflow steps (`spec`, `research`, `plan`) whose artifact under `<artifactDir>/<STEP>.md` exists with `> 0` bytes. Emit one `step.skipped {cycle_id, step, reason: "artifact_present", artifact_path}` event per skipped step in lieu of `step.start`/`step.end`. Opt-out via CLI flag `--no-skip-completed` (wins) or workflow YAML `engine.skip_completed_on_retry: false` (default `true`). Log-tail resume math treats `step.skipped` as a terminal completion event so `startStepIndex` calculations stay correct.

## Current State (from Research)
- Workflow-step loop lives in `src/engine/run-cycle.ts:111-194`; the agent-branch artifact write seam is at `:156-168` (`join(artifactDir, ${step.name.toUpperCase()}.md)`).
- `RunCycleOpts` at `src/engine/run-cycle.ts:63-70` carries `{issueId, title, workflow, cycleId?, env?, resume?}` — needs two new fields.
- Reset-policy precedent at `:114-134` (build/fix only, `RESET_ELIGIBLE_STEPS`) shows the per-step-name gating pattern.
- Non-fatal terminal step precedent at `:182-190` (`reflection.skipped` / `documentation.skipped`) is the shape template for `step.skipped`.
- Resume math: `parseLogTail` accumulates `completedSteps` at `src/engine/log-tail.ts:47-57`, consumed at `src/cli.ts:287-294`. Must additionally count `step.skipped` to keep `startStepIndex` correct on a re-resume.
- CLI argparse at `src/cli/parse-args.ts:54-72` uses `node:util.parseArgs` — add `--no-skip-completed` (boolean) to the `run` option set.
- YAML loader at `src/engine/workflow.ts:38-65` validates structure; defaults are applied at CLI seams (`?? true` pattern at `src/cli.ts:119,393`).
- Both `runCycle` call sites in `src/cli.ts` (resume at `:307-313`, fresh-pop at `:399-404`) have `row!.attempt` / `row.attempt` in scope.
- Tests follow temp-repo + fake-`claude`-on-PATH pattern (`tests/engine/run-cycle.test.ts:30-77`); log-tail tests use a synthetic-JSONL `ev()` helper (`tests/engine/log-tail.test.ts:8-50`).
- ARCHITECTURE.md owns retry semantics (`docs/ARCHITECTURE.md:316-329, 707-730`); CLAUDE.md has the "Architecture quick reference" retry bullet.

## Desired End State
- `runCycle({attempt: N, skipCompletedOnRetry: true})`, on `N > 0` and `step ∈ {spec, research, plan}` with a `> 0`-byte `<artifactDir>/<STEP>.md`, emits exactly `{event: "step.skipped", ts, cycle_id, step, reason: "artifact_present", artifact_path}` and `continue`s the loop without invoking the agent and without emitting `step.start`/`step.end`.
- `parseLogTail` recognizes `step.skipped` as terminal-equivalent: a log with `step.start spec → step.end ok → step.skipped research → step.start plan` returns `completedSteps: ["spec", "research"]` so `startStepIndex` advances to `plan`.
- CLI `cycle run --no-skip-completed` forces re-derivation. YAML `engine.skip_completed_on_retry: false` does too; CLI flag wins.
- `npm test` and `npm run test:coverage` green; coverage gate passes (global line ≥ 95%, branch ≥ 75%, function ≥ 90%; per-file triage floor untouched).
- ARCHITECTURE.md retry section, CLAUDE.md retry bullet, and a README line all describe the new behavior.

Verification:
- Anchored grep against the dogfood log: `grep -E '"event":"step.skipped".*"reason":"artifact_present".*"step":"(spec|research|plan)"' .cycle/log.jsonl` returns the expected lines under the retry fixture in the new unit tests' synthetic log.
- `grep -E '^id: refl-0028-engine-retries-redo-spec-research-plan-w-retry-economics' docs/cycle/issues/todo/refl-0028-engine-retries-redo-spec-research-plan-w-retry-economics.md` still resolves the source issue (frontmatter unmodified by this cycle).

## What We're NOT Doing
- No per-step partial-restart logic for `build`/`fix`/`verify`/`commit` — that's a separate `step-restart-tolerance-audit-*` cluster. Reset policy at `:114-134` is untouched.
- No cross-`issue_id` artifact reuse. The skip key is the current cycle's `artifactDir` only.
- No skip semantics for `reflection` / `documentation` (already non-fatal terminal steps).
- No companion stderr-on-bash-failure work (separate `refl-0028-stderr-dropped-on-failed-bash-step` cycle).
- No new integration test fixture; the unit matrix is sufficient.
- No `npm run sync-defaults` invocation (preserves dogfood `.cycle/workflows.yml` divergence per CLAUDE.md).
- No `agent` field on the `step.skipped` payload (SPEC fixes the exact shape).
- No defaults-applied-inside-`loadConfig` change — defaults live at the CLI resolution seam per existing precedent.

## Implementation Approach
Threading + gate + resume-math, vertically sliced:

1. **Type plumbing** — extend `RunCycleOpts`, `EngineConfig`, `RunArgs`. Type-only; no behavior change.
2. **CLI resolution + threading** — parse `--no-skip-completed`, merge with YAML, pass `attempt` + `skipCompletedOnRetry` into both `runCycle` call sites.
3. **Skip gate inside `runCycle`** — `shouldSkipForArtifact(...)` pure helper; loop emits `step.skipped` and `continue`s when gate fires.
4. **Resume math** — `parseLogTail` treats `step.skipped` as terminal.
5. **Docs** — ARCHITECTURE.md + CLAUDE.md + README.md updates (documentation step still owns this, but we land the prose updates here so reviewers see them in `BUILD.md`).

Resolved open questions from RESEARCH:
- **Attempt on resume**: `runCycle` receives `attempt` unconditionally from both call sites; the skip gate self-suppresses when `opts.resume` is truthy (one extra clause on the gate predicate). Rationale: matches the existing `isResumeEntry` precedent; one less branch at the call site.
- **Single resolved boolean**: CLI resolves `--no-skip-completed`/`cfg.engine.skip_completed_on_retry` into one `skipCompletedOnRetry: boolean` on `RunCycleOpts`. Logged once at `engine.start` for observability.
- **`fs/promises.stat`**: stay async — matches the rest of `run-cycle.ts`.
- **`step.skipped` shape**: no `agent` field; payload is exactly the SPEC contract.

---

## Task 1: Extend type signatures and CLI args

### Overview
Land the wire types first so subsequent tasks can implement against a stable shape. No runtime behavior change.

### Changes Required

**File**: `src/engine/run-cycle.ts`
**Changes**: extend `RunCycleOpts`:
```ts
export type RunCycleOpts = {
  issueId: string;
  title: string;
  workflow: string;
  cycleId?: string;
  env?: Record<string, string>;
  resume?: { startStepIndex: number };
  attempt?: number;                 // default 0
  skipCompletedOnRetry?: boolean;   // default true
};
```

**File**: `src/engine/workflow.ts`
**Changes**: extend `EngineConfig`:
```ts
export type EngineConfig = {
  max_consecutive_failures: number;
  base_branch: string;
  skip_completed_on_retry?: boolean;
};
```
No new validation in `loadConfig` — absent field reads as `undefined`, default applied at the CLI seam.

**File**: `src/cli/parse-args.ts`
**Changes**: extend the `run` branch's option set + `RunArgs` shape:
```ts
export type RunArgs = {
  command: "run";
  text: string | null;
  workflow: string;
  dryRun: boolean;
  noSkipCompleted: boolean;
};
// ... inside parseArgs:
options: {
  workflow: { type: "string", default: "feature" },
  "dry-run": { type: "boolean", default: false },
  "no-skip-completed": { type: "boolean", default: false },
},
// ... return:
return {
  command: "run",
  text: text === "" ? null : text,
  workflow: String(values.workflow),
  dryRun: Boolean(values["dry-run"]),
  noSkipCompleted: Boolean(values["no-skip-completed"]),
};
```

### Success Criteria
- [ ] `npm run typecheck` clean.
- [ ] Existing test suite still passes (no behavior change yet).
- [ ] No new `--no-skip-completed`-aware behavior in `runCycle` yet (Task 3).

---

## Task 2: CLI resolution + threading into `runCycle`

### Overview
Compute one resolved `skipCompletedOnRetry: boolean` at CLI startup (CLI flag wins over YAML, YAML defaults to `true`). Pass it plus `attempt` into both `runCycle` call sites. Surface the resolved value in the existing `engine.start` event for observability.

### Changes Required

**File**: `src/cli.ts`
**Changes**:
1. After `cfg = await loadConfig(cwd)` at `~:89`, compute:
   ```ts
   const skipCompletedOnRetry =
     args.noSkipCompleted ? false : (cfg?.engine?.skip_completed_on_retry ?? true);
   ```
2. Include in the existing `engine.start` payload (find the `log.emit("engine.start", ...)` near the top of CLI bootstrap) as `skip_completed_on_retry: skipCompletedOnRetry`.
3. Fresh-pop call site at `:399-404`:
   ```ts
   const r = await runCycle(cwd, {
     cycleId,
     issueId: row.id,
     title: row.title,
     workflow: workflowName,
     attempt: row.attempt,
     skipCompletedOnRetry,
   });
   ```
4. Resume call site at `:307-313`:
   ```ts
   const rr = await runCycle(cwd, {
     cycleId: tail.cycleId,
     issueId: tail.issueId,
     title: tail.title,
     workflow: workflowName,
     resume: { startStepIndex },
     attempt: row!.attempt,
     skipCompletedOnRetry,
   });
   ```
   (Skip gate self-suppresses on `opts.resume` — Task 3.)

### Success Criteria
- [ ] `npm run typecheck` clean.
- [ ] Both call sites pass `attempt` and `skipCompletedOnRetry`.
- [ ] `engine.start` event carries `skip_completed_on_retry: <bool>`.
- [ ] No behavior change yet (skip gate not implemented).

---

## Task 3: Skip gate in `runCycle`

### Overview
Add `shouldSkipForArtifact(...)` pure helper plus the gate inside the workflow-step loop. On hit, emit `step.skipped` and `continue` — no `step.start`, no `step.end`, no agent invocation.

### Changes Required

**File**: `src/engine/run-cycle.ts`

1. Top-of-file constants/helpers (near `RESET_ELIGIBLE_STEPS`):
```ts
const SKIP_ELIGIBLE_STEPS = new Set(["spec", "research", "plan"]);

export async function shouldSkipForArtifact(
  artifactDir: string,
  stepName: string,
): Promise<{ skip: false } | { skip: true; artifactPath: string }> {
  if (!SKIP_ELIGIBLE_STEPS.has(stepName)) return { skip: false };
  const artifactPath = join(artifactDir, `${stepName.toUpperCase()}.md`);
  try {
    const st = await stat(artifactPath);
    if (st.isFile() && st.size > 0) return { skip: true, artifactPath };
  } catch {
    // ENOENT or unreadable — fall through
  }
  return { skip: false };
}
```
   Import: `import { writeFile, readFile, stat } from "node:fs/promises";`.

2. Inside the workflow-step loop (between `i = startIdx` and the `RESET_ELIGIBLE_STEPS` block, ~ line 113):
```ts
const attempt = opts.attempt ?? 0;
const skipEnabled = opts.skipCompletedOnRetry !== false;
const isResumeEntry = !!opts.resume && i === startIdx;

if (attempt > 0 && skipEnabled && !isResumeEntry && step.agent !== "bash") {
  const gate = await shouldSkipForArtifact(artifactDir, step.name);
  if (gate.skip) {
    await log.emit("step.skipped", {
      cycle_id: cycleId,
      step: step.name,
      reason: "artifact_present",
      artifact_path: gate.artifactPath,
    });
    continue;
  }
}
```
   Order: the gate runs BEFORE the existing `headSha` capture so a skipped step never records a pre-step SHA. (Pre-build steps aren't reset-eligible anyway, so this is conservative correctness.)

3. Move the existing `const isResumeEntry = !!opts.resume && i === startIdx;` declaration so it's not shadowed; if simpler, hoist it above the skip gate and reuse for the reset block.

Rationale for `step.agent !== "bash"`: SPEC ties the skip set to the agent-branch artifact write seam (which produces `<STEP>.md`); a hypothetical bash `spec` step doesn't go through that seam and shouldn't be skipped on this contract.

### Success Criteria
- [ ] Unit test: `attempt=0` with all three artifacts present runs all three steps (no skips).
- [ ] Unit test: `attempt=1` with SPEC.md / RESEARCH.md / PLAN.md all `> 0` bytes emits three `step.skipped` events and zero `step.start` events for those step names.
- [ ] Unit test: `attempt=1` with only SPEC.md present skips spec, runs research+plan normally (research and plan emit `step.start` / `step.end`).
- [ ] Unit test: `attempt=1` with `skipCompletedOnRetry: false` runs all three (no skips).
- [ ] Unit test: zero-byte artifact (`writeFile(..., "")`) does NOT trigger skip (strict `> 0`).
- [ ] Unit test: resume entry (`resume: {startStepIndex: 0}`) at `attempt=1` does NOT skip the first step (skip gate self-suppresses on `isResumeEntry`).
- [ ] All existing `run-cycle.test.ts` cases still pass.
- [ ] `step.skipped` payload contains exactly the SPEC-fixed fields (no `agent`).

---

## Task 4: `parseLogTail` recognizes `step.skipped` as terminal

### Overview
Extend `completedSteps` accumulator so a skipped step counts as completed for resume-index math.

### Changes Required

**File**: `src/engine/log-tail.ts`
**Changes**: in the loop at `:47-57`, accept `step.skipped` alongside `step.end status:"ok"`:
```ts
for (let i = lastStartIdx + 1; i < events.length; i++) {
  const e = events[i];
  if (e.cycle_id !== cycleId) continue;
  let name: string | undefined;
  if (e.event === "step.end" && (e as { status?: string }).status === "ok") {
    name = (e as { step?: string }).step;
  } else if (e.event === "step.skipped") {
    name = (e as { step?: string }).step;
  } else {
    continue;
  }
  if (typeof name === "string" && !completedSteps.includes(name)) {
    completedSteps.push(name);
  }
}
```

`lastStepStarted` logic (at `:58-81`) is unaffected — `step.skipped` never has a paired `step.start`, so an unpaired `step.start` heuristic stays accurate.

### Success Criteria
- [ ] Unit test (in `tests/engine/log-tail.test.ts`): a log with `cycle.start → step.start spec → step.end ok spec → step.skipped research → step.start plan` returns `completedSteps: ["spec", "research"]` and `lastStepStarted: "plan"`.
- [ ] Unit test: a log with only `step.skipped` events for spec/research/plan returns `completedSteps: ["spec", "research", "plan"]`.
- [ ] Existing log-tail tests still pass (the `step.end status:"failed"` skip behavior is unchanged).
- [ ] Resume integration: a synthetic log feeding `parseLogTail` → `startStepIndex` math (`src/cli.ts:287-294`) correctly advances past skipped steps. Verified via the unit assertion on `completedSteps` (the CLI loop is a pure-function consumer).

---

## Task 5: Documentation updates

### Overview
Land the prose now so the build's `BUILD.md` reflects final docs and the dogfood `documentation` step has nothing more to do.

### Changes Required

**File**: `CLAUDE.md`
**Changes**: extend the existing Architecture quick reference paragraph about retry / `head_sha` policy with a new paragraph:
> Retry skip policy (pre-build only): on `tbd.jsonl` retry pops with `attempt > 0`, the engine skips each of `{spec, research, plan}` whose `<artifactDir>/<STEP>.md` already exists with `> 0` bytes, emitting one `step.skipped {cycle_id, step, reason: "artifact_present", artifact_path}` per skipped step in lieu of `step.start`/`step.end`. Opt-out is the `cycle run --no-skip-completed` flag (wins) or workflow YAML `engine.skip_completed_on_retry: false` (default `true`). The gate self-suppresses on resume entry; build/fix/verify/commit still use the pre-step `head_sha` reset policy unchanged.

**File**: `README.md`
**Changes**: add a one-liner near the existing retry / `cycle status` mentions:
> On retry, the engine skips pre-build steps (`spec`, `research`, `plan`) whose artifact files already exist non-empty; pass `--no-skip-completed` to force re-derivation.

**File**: `docs/ARCHITECTURE.md`
**Changes**: in the retry section (the cluster around `:707-730` "Two layers of retry"), add a third bullet/subsection after step-level + cycle-level:
> - **Pre-build skip on retry**: on the second and later attempts of the same `(issue_id, cycle_id)` pair, the engine skips `{spec, research, plan}` if the corresponding `<artifactDir>/<STEP>.md` is present with `> 0` bytes. Event shape: `{event: "step.skipped", ts, cycle_id, step, reason: "artifact_present", artifact_path}`. Opt-out via `cycle run --no-skip-completed` or `engine.skip_completed_on_retry: false` in `workflows.yml`; CLI wins. The gate is bounded to pre-build steps because `build`/`fix`/`verify`/`commit` already mutate the working tree and must re-run against `head_sha` resets.

Also extend the events table around `:240-278` with `step.skipped` example:
```
{"ts":"…","event":"step.skipped","cycle_id":"0042","step":"spec","reason":"artifact_present","artifact_path":"docs/cycle/0042-feature-x/SPEC.md"}
```

### Success Criteria
- [ ] All three files updated; anchored greps in the next cycle's tests would find the new text.
- [ ] No mention of the old "always re-derive on retry" semantics remains in any of the three files.
- [ ] No edits under `docs/cycle/*` (per documentation prompt exclusion).

---

## Testing Strategy

### Unit Tests

New file: `tests/engine/run-cycle.skip-completed.test.ts` — follows the `tests/engine/run-cycle.test.ts:30-77` pattern (temp repo, fake `claude` on PATH, write `.cycle/workflows.yml` + `.cycle/prompts/*` + `.cycle/scripts/*`). For each case, seed `<artifactDir>/<STEP>.md` BEFORE calling `runCycle` (the `prepareTrunkArtifactDir` / `createCycleBranch` is deterministic; create the artifact dir manually if needed, or call `runCycle` once at `attempt=0` to seed). Then re-invoke `runCycle` with `attempt=1` and assert.

Cases (one test each):

1. **attempt=0, artifacts present → no skips**: pre-seed all three artifact files; call `runCycle({attempt: 0})`; assert log contains zero `step.skipped` events, all three steps emit `step.start`.
2. **attempt=1, all three artifacts > 0 bytes → all three skipped**: pre-seed; call `runCycle({attempt: 1})`; assert exactly three `step.skipped` events with the expected `step` values and `reason: "artifact_present"`; assert zero `step.start` for spec/research/plan; assert subsequent steps (e.g., `build`) still run normally.
3. **attempt=1, only SPEC.md present → skip spec, run research+plan**: pre-seed only SPEC.md; assert one `step.skipped` (spec), and `step.start`/`step.end` for research+plan.
4. **`--no-skip-completed` / `skipCompletedOnRetry: false` → no skips**: call `runCycle({attempt: 1, skipCompletedOnRetry: false})`; assert zero `step.skipped`, all three steps run.
5. **Zero-byte SPEC.md → no skip for spec**: `writeFile(specPath, "")`; call `runCycle({attempt: 1})`; assert `step.skipped` for spec NOT emitted; spec runs normally.
6. **Resume entry at attempt=1 → skip gate self-suppresses at startStepIndex**: pre-seed all three; call `runCycle({attempt: 1, resume: {startStepIndex: 0}})`; assert that step at index 0 (spec) does NOT emit `step.skipped` (resume governance wins). The remaining loop iterations may skip if the gate applies.

New file: `tests/engine/log-tail.skip.test.ts` (or extend `log-tail.test.ts`):

7. **`step.skipped` counted as completed**: synthetic JSONL with `cycle.start → step.start spec → step.end ok spec → step.skipped research → step.start plan` (no `step.end` for plan). Assert `completedSteps === ["spec", "research"]` and `lastStepStarted === "plan"`.
8. **Pure-skip log → all three counted**: `cycle.start → step.skipped spec → step.skipped research → step.skipped plan`. Assert `completedSteps === ["spec", "research", "plan"]`.

New file: `tests/cli/parse-args.skip-flag.test.ts` (or extend the existing parse-args test):

9. **`--no-skip-completed` parses**: `parseArgs(["run", "--no-skip-completed"])` returns `noSkipCompleted: true`.
10. **Default is `false`**: `parseArgs(["run"])` returns `noSkipCompleted: false`.

Mocking strategy:
- Real implementations everywhere — temp git repos, real `node:fs/promises` writes, real `parseLogTail` on synthetic strings.
- Only stub: the `claude` binary itself (existing pattern: shell script on PATH). For "agent NOT invoked when skipped," stub `claude` to write a sentinel file or `exit 1` — if the gate works, the agent never runs and the sentinel doesn't appear / exit code doesn't fail the step. Existing tests already use this pattern.

### Integration / E2E Tests
No new integration fixture this cycle. The unit matrix above plus a manual dogfood pass on the next failed retry (the next time a cycle retries, we'll observe `step.skipped` in `.cycle/log.jsonl` in real time) provides empirical confirmation.

## Risk Assessment

- **Risk**: `parseLogTail` change could regress an existing resume path that relied on `step.skipped` not being terminal.
  **Mitigation**: no current callers emit `step.skipped`, so the new path is dead code before this cycle. The full existing `log-tail.test.ts` suite must still pass.

- **Risk**: A partial / corrupt artifact file (>0 bytes but garbage) bypasses re-derivation and breaks downstream `build`.
  **Mitigation**: SPEC explicitly accepts this. The next-step `SPEC_MIN_BYTES` guard at `run-cycle.ts:160-166` already catches under-200-byte SPECs, and `build` is the natural backstop for any deeper corruption. The skip gate's contract is "did we generate something here?", not "is it good enough?".

- **Risk**: A bash `spec` step in a custom workflow would now NOT be skipped while `claudecode spec` is — surprise for adopters.
  **Mitigation**: SPEC pins the skip to the agent-branch seam (which only the non-bash dispatch path uses). Documented in ARCHITECTURE.md addition. No bash `spec` steps exist in the current default workflows.

- **Risk**: Resume entry that lands directly on a pre-build step (`startStepIndex` points at `spec`) on a retry could double-act with the skip gate.
  **Mitigation**: `isResumeEntry` in the skip-gate predicate suppresses the gate at exactly `i === startIdx`. Subsequent iterations of the same `runCycle` invocation (mid-cycle) shouldn't ever see a pre-build step anyway, but the gate stays consistent regardless.

- **Risk**: Coverage regression from new branches in `run-cycle.ts`.
  **Mitigation**: The 5+1 unit-test case matrix in Task 3 hits every branch: skip-on / skip-off / artifact-missing / zero-bytes / bash-agent / resume-entry. Run `npm run test:coverage` locally before commit.

- **Risk**: A future migration adds a non-pre-build step that produces an `<artifactDir>/<STEP>.md` artifact and we add it to `SKIP_ELIGIBLE_STEPS` without realising it mutates the working tree.
  **Mitigation**: `SKIP_ELIGIBLE_STEPS` is a hard-coded `Set` colocated with `RESET_ELIGIBLE_STEPS`, with a comment pointing at the contract: "skip set must be disjoint from any step that mutates the working tree." Reviewer-visible at code-review time.

- **Risk**: Dogfood `.cycle/workflows.yml` divergence accidentally re-clobbered if someone runs `npm run sync-defaults` after editing `src/defaults/workflows.yml`.
  **Mitigation**: The sync-defaults divergence guard (CLAUDE.md `sync-defaults divergence guard`) already exists. This cycle does not invoke `sync-defaults` (per AC).
