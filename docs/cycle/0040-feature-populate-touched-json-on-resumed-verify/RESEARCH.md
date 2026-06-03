I have what I need. Writing the research document.

```markdown
# Research: Cycle 0040

## Cycle Context
SPEC 0040 requires populating `touched.json` on the resume / verify-only build paths. Today `touched.json` (the cycle's footprint record consumed by `commitCycle` to emit `commit.scope_warning`) is written **only** as a side-effect of a `build`/`fix`/`final_fix`/`quick_fix`/`test_fix`/`test_build` step executing in-process (`accumulateTouchedFiles`, called under `if (r.status === "ok" && RESET_ELIGIBLE_STEPS.has(step.name))`). When a cycle resumes at a step index past the build (`opts.resume.startStepIndex` via `--resume-from-step`), that loop iteration is skipped, `accumulateTouchedFiles` never runs, and `touched.json` is left empty/absent, so the scope warning compares staged files against an empty set (noise or silent degradation). The cycle adds a best-effort, observable recovery helper that reconstructs the touched set from `BUILD.md`'s `## Touched Files` section (unioned with current in-scope `git status --porcelain` paths and any existing `touched.json`), wired into the resume path, emitting `touched.recovered` on success and `engine.warning { reason: "touched_recovery_empty" | "touched_recovery_write_failed" }` on the degrade paths, never clobbering an already-populated footprint.

## Current Codebase State

### Relevant Components
- `RESET_ELIGIBLE_STEPS` set (the six mutation step names) — `src/engine/run-cycle.ts:39`
- `parseSnapshotPaths(snapshot)` — porcelain parser; for untracked (`??`) only keeps `src/`/`scripts/` paths, all tracked changes kept; strips quotes, resolves rename/copy targets — `src/engine/run-cycle.ts:86-105`
- `appendDocumentationPaths(...)` — contains the canonical `## Touched Files` parse logic: finds `lines.findIndex(l => l.trim() === "## Touched Files")`, then reads `- <path>` bullet lines via `/^\s*-\s+(.+)/` until the next `##` header — `src/engine/run-cycle.ts:107-150` (header find `:116-117`, bullet parse loop `:119-124`)
- `accumulateTouchedFiles(repoRoot, artifactDir, preSnapshot)` — the normal-build footprint writer: diffs pre/post `git status --porcelain`, filters via `isDenied` and `prePaths`, merges with existing `touched.json`, writes `{ files: merged.sort() }` schema — `src/engine/run-cycle.ts:152-177`
- `runCycle` step loop & invocation of `accumulateTouchedFiles` — `src/engine/run-cycle.ts:273-806`; the accumulation call site is `:729-733` (gated `r.status === "ok" && RESET_ELIGIBLE_STEPS.has(step.name)`, inside the non-bash `else` branch, wrapped in best-effort try/catch)
- `RunCycleOpts.resume.startStepIndex` type — `src/engine/run-cycle.ts:265`; `startIdx = opts.resume?.startStepIndex ?? 0` — `:317`; loop `for (let i = startIdx; i < wf.steps.length; i++)` — `:320`
- `commitCycle` touched.json consumer — reads `touched.json` from `opts.artifactDir` (empty set on absent/corrupt/no artifactDir), then warns on staged `src/`/`scripts/` files absent from the set via `commit.scope_warning` — `src/engine/commit-cycle.ts:142-193` (read `:164-172`, warn loop `:174-193`)
- `isDenied(p)` denylist helper — `src/engine/path-utils.ts` (imported `src/engine/run-cycle.ts:29`)
- `pre-snapshot` capture for documentation/reset-eligible steps — `src/engine/run-cycle.ts:477-481`

### Existing Patterns to Follow
- **`## Touched Files` parse**: header match on exact trimmed `## Touched Files`, bullet capture via `/^\s*-\s+(.+)/`, stop at next `##` — `src/engine/run-cycle.ts:116-124`. The SPEC directs reuse of this logic.
- **Footprint schema write**: `JSON.stringify({ files: merged }, null, 2) + "\n"`, `merged` = `Array.from(new Set([...existing, ...newFiles])).sort()` — `src/engine/run-cycle.ts:175-176`. Existing `touched.json` is read/merged with the same `try { JSON.parse } catch {}` tolerant pattern — `:168-173`.
- **Best-effort side-effects never fail the cycle**: footprint accumulation and documentation append are each wrapped in `try { … } catch { /* never fail the cycle */ }` — `src/engine/run-cycle.ts:724-733`. Mirror this for recovery.
- **Subprocess discipline**: all git calls use `spawnSync("git", [...], { cwd, encoding: "utf8", shell: false })` with array args, never a shell — `src/engine/run-cycle.ts:128-132`, `:159-163`, `:479`.
- **Failure handling**: `appendDocumentationPaths` returns silently on unreadable `BUILD.md` (`try readFile … catch { return }`) and on absent header (`headerIdx === -1 → return`) — `src/engine/run-cycle.ts:108-117`. The SPEC's recovery degrade paths (missing/unreadable `BUILD.md`, absent `## Touched Files`, non-zero `git status`) map onto this same silent-return shape but additionally emit an observability warning.
- **Observability**: events are emitted via `await log.emit(eventName, { cycle_id: cycleId, … })`; logger type `Logger.emit(event, fields)` — `src/engine/log.ts:4-12`. Existing analogous events: `documentation.paths_appended { cycle_id, appended }` (`run-cycle.ts:149`), `commit.scope_warning { cycle_id, files }` (`commit-cycle.ts:192`), `step.warning`, `engine.warning { reason, … }` (resume path uses `engine.warning { reason }` at `cli.ts:468`, `:482`, `:507`). New events per SPEC: `touched.recovered { cycle_id, source, count }`, `engine.warning { reason: "touched_recovery_empty" | "touched_recovery_write_failed", cycle_id }`.
- **Exactly-once event pinning** (per CLAUDE.md test conventions): assert `events.filter(predicate).length === 1`, or use `expectExactlyOne(events, eventName)` from `tests/helpers.ts:3` — required for the `touched.recovered` cardinality acceptance criterion.
- **Idempotency / retry-safety**: footprint write is union-merge (never destructive within a cycle), and `accumulateTouchedFiles` reads-merges-writes — recovery must additionally guard "only when `touched.json` is absent or its `files` array is empty" so it never clobbers a populated footprint (SPEC requirement; the normal-build write wins).

### Dependencies & Integration Points
- `RESET_ELIGIBLE_STEPS`, `RunCycleOpts.resume.startStepIndex` — `src/engine/run-cycle.ts:39,265`
- `appendDocumentationPaths` `## Touched Files` parser, `parseSnapshotPaths`, `accumulateTouchedFiles` — `src/engine/run-cycle.ts:86-177`
- `isDenied` — `src/engine/path-utils.ts`
- `commitCycle` consumes `touched.json` after `runCycle` returns exit 0 — invoked in the supervisor at `src/cli.ts:561-569` (resume path inside `runResumeOnce`) and `src/cli.ts:778-786` (normal path); `runResumeOnce` computes `startStepIndex` from `completedSteps` at `src/cli.ts:514-521` and passes it via `spawnRunOne({ … resumeFromStep: startStepIndex })` at `:534-542`.
- `--resume-from-step` CLI plumbing → `runCycle({ resume: { startStepIndex } })` — `src/cli/run-one.ts:51-54`, `:88-89` (validated integer)
- Build prompt that authors the recovery source `## Touched Files` block — `src/defaults/prompts/build.md:146-152`
- `feature` workflow step order (build is index 3) — `src/defaults/workflows.yml:31-42`: `spec, research, plan, build, review, fix, verify, reflection, final_fix, final_verify, documentation, walkthrough_capture`
- `runCycle` return shape: `{ cycleId, artifactDir, status }` — `src/engine/run-cycle.ts:806`; artifactDir resolved at `:282-303` (resume reuses `prepareTrunkArtifactDir`/`checkoutCycleBranch`)

### Test Infrastructure
- **Test framework**: `node:test` + `node:assert/strict`; tests under `tests/engine/`, helpers in `tests/helpers.ts`.
- **Test conventions**: real temp git repos via `mkdtemp` + `spawnSync("git", …)`; fake agent binaries written as `#!/bin/bash` scripts placed on a temp `PATH`; `runCycle` driven directly with `{ issueId, title, workflow, env: { PATH, CYCLE_BASE } }`. Touched.json located via `readdir(docs/cycle)` + dir prefix match. Pattern established in `tests/engine/run-cycle.touched-json.test.ts:9-90`.
- **Existing touched.json coverage**: `tests/engine/run-cycle.touched-json.test.ts` covers single-build accumulation, pre-existing-dirty exclusion, union across steps. No resume / verify-only / recovery test exists yet.
- **Resume coverage**: `tests/cli/resume.test.ts` exercises `runResumeOnce`/`startStepIndex` derivation at the supervisor level; `tests/engine/run-cycle.skip-completed.test.ts` exercises the `attempt`/`skipCompletedOnRetry` skip gate.
- **Mocking note** (CLAUDE.md): `node:fs/promises` cannot be `mock.method`-stubbed (non-configurable ESM exports); use real fs manipulation (`chmod`, temp dirs) or `node:fs`. Relevant for testing the `touched_recovery_write_failed` branch (use an unwritable path / chmod).
- **Failure-path tests**: existing degrade-branch tests in `run-cycle.touched-json.test.ts` and the broader `run-cycle.*.test.ts` suite follow the "seed condition, run, assert file state + emitted event" shape — the SPEC's failure-path tests (no `BUILD.md`, no `## Touched Files` header, already-populated no-clobber) follow this.
- **Coverage**: `src/engine/run-cycle.ts` per-file floor is 90% (CLAUDE.md). Global floors Line ≥ 95%, Branch ≥ 75%, Function ≥ 90%. New recovery branches (success + each degrade) must be exercised and numbers reported in `BUILD.md` via `npm run test:coverage`.

## Code References
- `src/engine/run-cycle.ts:39` — `RESET_ELIGIBLE_STEPS` (the six mutation step names the resume index is compared against)
- `src/engine/run-cycle.ts:86-105` — `parseSnapshotPaths` porcelain parser
- `src/engine/run-cycle.ts:107-150` — `appendDocumentationPaths`; `## Touched Files` parse at `:116-124` (the reusable parser)
- `src/engine/run-cycle.ts:152-177` — `accumulateTouchedFiles` (normal-build footprint writer + merge/schema)
- `src/engine/run-cycle.ts:265,317,320` — `resume.startStepIndex` type, `startIdx`, step loop start
- `src/engine/run-cycle.ts:477-481` — pre-snapshot capture for reset-eligible/documentation steps
- `src/engine/run-cycle.ts:729-733` — the gated `accumulateTouchedFiles` call (the path that is skipped on resume-past-build)
- `src/engine/run-cycle.ts:806` — `runCycle` return shape
- `src/engine/commit-cycle.ts:164-193` — touched.json read + `commit.scope_warning` consumer
- `src/cli.ts:514-542` — resume `startStepIndex` derivation + `spawnRunOne({ resumeFromStep })`
- `src/cli.ts:561-569` — `commitCycle` invocation on the resume exit-0 path
- `src/cli/run-one.ts:51-54,88-89` — `--resume-from-step` → `resume.startStepIndex`
- `src/defaults/prompts/build.md:146-152` — `## Touched Files` authoring contract (recovery source)
- `src/defaults/workflows.yml:31-42` — `feature` workflow step order
- `docs/ENGINE.md:212-230` — *touched.json footprint* section to extend per SPEC documentation requirement
- `tests/engine/run-cycle.touched-json.test.ts:1-90` — existing touched.json test harness pattern
- `tests/helpers.ts:3` — `expectExactlyOne` for the exactly-once `touched.recovered` assertion

## Open Questions
- **Where the recovery is invoked relative to the step loop**: the SPEC says "On entering `runCycle` with a resume start index past any executed `RESET_ELIGIBLE_STEPS` step … before the cycle reaches commit." `runCycle` returns before `commitCycle` runs (commit is in the supervisor `src/cli.ts`, not inside `runCycle`). The plan must decide whether recovery runs once before/early in the resume step loop or just before `runCycle`'s `return { status: "ok" }` at `:805`, while still ensuring it lands before the supervisor's `commitCycle` read at `cli.ts:561`. (Both options keep it inside `runCycle`, which owns `artifactDir`.)
- **"Past every `RESET_ELIGIBLE_STEPS` step" computation**: the predicate needs the workflow step list to determine whether `startStepIndex` sits past all reset-eligible step indices (`wf.steps`, available in `runCycle`). The plan should confirm the exact index comparison (e.g. `startStepIndex > max(index of any RESET_ELIGIBLE step)`), and behavior when the workflow has no reset-eligible step.
- **Module placement**: SPEC permits `recoverTouchedFiles` in `run-cycle.ts` or a sibling module; this affects how the `## Touched Files` parser and `isDenied`/`parseSnapshotPaths` are shared (currently module-private in `run-cycle.ts`). The plan resolves whether to extract the parser or keep recovery co-located.
- **`source` field value** for `touched.recovered`: SPEC names the source as `BUILD.md`'s `## Touched Files` but does not fix the exact string token for the `source` field — plan to define it.
```
