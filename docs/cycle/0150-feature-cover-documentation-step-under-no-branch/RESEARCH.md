All context gathered. Writing RESEARCH.md.

```markdown
# Research: Cycle 0150

## Cycle Context

Add two new test cases to `tests/engine/run-cycle.documentation.test.ts` covering the `documentation` step inside a trunk-based (`no_branch: true`) workflow with no `pr` step: (1) a happy-path sub-test asserting `DOCUMENTATION.md` written, `step.end status:ok`, `cycle.end status:ok`, and `step.start` for `documentation` has **no `head_sha` field**; (2) a non-fatal-failure sub-test asserting `documentation.skipped {reason: "exec_failed"}` is emitted and `cycle.end status:ok`. Both must use `expectExactlyOne` from `tests/helpers.ts` for cardinality-pinned event assertions.

## Current Codebase State

### Relevant Components

- **Existing documentation test file**: 2 tests, both use the local `workflowYml()` helper with `engine.commit.mode: trunk` and a single-step feature workflow (`documentation` only). Neither test asserts `head_sha` absence on `step.start`, and neither imports from `tests/helpers.ts`. — `tests/engine/run-cycle.documentation.test.ts:1–126`

- **`workflowYml()` local helper**: Produces a YAML string with `engine.commit.mode: trunk`, `push: false`, `base_branch: main`, and inlines a step body param. Same helper pattern exists verbatim in `run-cycle.reflection.test.ts`. — `tests/engine/run-cycle.documentation.test.ts:15–31`

- **`setupGitRepo()` local helper**: Inits a bare git repo on branch `main`, sets user config, makes empty initial commit. Duplicated across several test files. — `tests/engine/run-cycle.documentation.test.ts:37–42`

- **`fileExists()` local helper**: Wraps `stat()` in a try/catch. — `tests/engine/run-cycle.documentation.test.ts:33–35`

- **`runCycle()` — trunk path**: When `cfg.engine.commit.mode !== "worktree-pr"`, calls `prepareTrunkArtifactDir()` (never checks out a branch, just creates the artifact dir). Logs `cycle.checkout {status: "skipped", reason: "trunk"}` in `finally`. — `src/engine/run-cycle.ts:119–123`, `265–267`

- **`RESET_ELIGIBLE_STEPS`**: `new Set(["build", "fix"])`. Documentation is NOT in this set. This is the only gate that sets `headSha` before `step.start`. — `src/engine/run-cycle.ts:25`

- **`headSha` capture logic**: `headSha` is only non-null when `isResetEligible && cfg.engine.commit.mode === "worktree-pr"` (lines 179–198). Since `documentation` is not in `RESET_ELIGIBLE_STEPS`, `headSha` is always `null` for documentation regardless of commit mode. The spread `...(headSha ? { head_sha: headSha } : {})` on the `step.start` emit means `head_sha` is never emitted for `documentation`. — `src/engine/run-cycle.ts:141–205`

- **`documentation` non-fatal path**: When `step.name === "documentation"` and `r.status === "failed"`, emits `documentation.skipped {cycle_id, reason: "exec_failed", exit_code}` then `continue`s — does NOT emit `cycle.end {status: "failed"}`. — `src/engine/run-cycle.ts:251–254`

- **`expectExactlyOne` helper**: Exported from `tests/helpers.ts`. Takes `events: T[]` and `eventName: string`, filters by `e.event === eventName`, asserts `length === 1`, returns the single matched event. Requires the caller to parse the log as JSON objects before calling. — `tests/helpers.ts:3–10`

- **`prepareTrunkArtifactDir()`**: Creates `docs/cycle/<cycleId>-<workflow>-<slug>/` and returns `{ artifactDir }`. No branch ops. — `src/engine/branch.ts:58–62`

- **`Workflow` type**: Has `name`, `description?`, `max_cycle_attempts`, `steps: Step[]`. **No `no_branch` field.** Any `no_branch: true` in a `workflows.yml` fixture is parsed by `YAML.parse` but silently ignored — it has no effect on engine behavior. — `src/engine/workflow.ts:18–23`

- **Trunk mode activation**: `cfg.engine.commit.mode` is set by `engine.commit.mode` in `workflows.yml`. Additionally, if `CYCLE_TRUNK_BASED=1` env var is set, `loadConfig()` overrides mode to `"trunk"` regardless of YAML. The `no_branch: true` workflow-level field has no code path. — `src/engine/workflow.ts:84–86`

- **Dogfood `.cycle/workflows.yml`**: Uses `engine.commit.mode: worktree-pr` + `CYCLE_TRUNK_BASED=1` env override. The `feature` workflow does NOT have a `no_branch: true` field and does NOT have a `pr` step. Steps: `spec`, `research`, `plan`, `build`, `review`, `fix`, `verify`, `documentation`. — `.cycle/workflows.yml:1–57`

### Existing Patterns to Follow

- **Fake `claude` binary pattern**: Write a shell script to `join(bin, "claude")`, `chmod 0o755`. For success: `printf '%s' '<output>'`. For failure: `echo <msg> 1>&2; exit <code>`. — `tests/engine/run-cycle.documentation.test.ts:61–63`, `104`

- **Log parsing for `expectExactlyOne`**: Other tests (e.g., `run-cycle.reflection.test.ts`) read the log as a string and parse with `JSON.parse` per line. To use `expectExactlyOne`, the test must parse the log into an array of event objects: `log.trim().split("\n").map(l => JSON.parse(l))`. — `tests/engine/run-cycle.reflection.test.ts:91–98`

- **`assert.match` for regex assertions**: Used by existing documentation tests for pattern-based log assertions on `documentation.skipped` and `cycle.end`. — `tests/engine/run-cycle.documentation.test.ts:116–117`

- **Temp dir lifecycle**: `mkdtemp` for both `root` and `bin`, `rm(root/bin, { recursive: true, force: true })` in `finally`. — `tests/engine/run-cycle.documentation.test.ts:45–84`

- **`CYCLE_BASE` env passthrough**: All `runCycle` calls in test files pass `CYCLE_BASE: "main"` in `env` to prevent it resolving from process env. — `tests/engine/run-cycle.documentation.test.ts:69`

- **`artifactDir` construction**: `join(root, "docs/cycle", `${r.cycleId}-feature-<slug>`)`. Slug is derived from `slugify(opts.title)`. — `tests/engine/run-cycle.documentation.test.ts:73`

### Dependencies & Integration Points

- `tests/helpers.ts` exports `expectExactlyOne` — must be imported in the test file for new tests. Not currently imported by `run-cycle.documentation.test.ts`. — `tests/helpers.ts:3`

- `runCycle()` reads `workflows.yml` from `join(root, ".cycle/workflows.yml")`. Tests must write this file before calling `runCycle`. — `src/engine/workflow.ts:44–47`

- `runCycle()` resolves `CYCLE_BASE` from `opts.env.CYCLE_BASE ?? process.env.CYCLE_BASE ?? cfg.engine.base_branch`. Tests pass `CYCLE_BASE: "main"` in opts.env to pin it. — `src/engine/run-cycle.ts:128–131`

- `sanitizeArtifactStdout()` is called on `r.stdout` before writing `DOCUMENTATION.md`. For a fake binary that writes plain text, the sanitized output equals the input with a trailing newline appended. — `src/engine/run-cycle.ts:221–222`

### Test Infrastructure

- **Framework**: Node built-in `node:test`, `node:assert/strict`. No external test library.
- **Directory**: `tests/engine/` for engine integration tests.
- **Naming convention**: `run-cycle.<area>.test.ts` for run-cycle sub-areas.
- **Coverage**: `npm run test:coverage` with LCOV. Per-file floor for `src/engine/run-cycle.ts` not listed explicitly in CLAUDE.md; overall floors: Line ≥ 95%, Branch ≥ 75%, Function ≥ 90%.
- **No shared helper module** for these tests yet — `git()`, `workflowYml()`, `setupGitRepo()`, `fileExists()` are all duplicated inline across `run-cycle.documentation.test.ts`, `run-cycle.reflection.test.ts`, etc. The `_helpers` directory exists but is empty.

## Code References

- `tests/engine/run-cycle.documentation.test.ts:1–126` — Full file; 2 existing tests; `workflowYml()` uses `mode: trunk` already
- `tests/engine/run-cycle.documentation.test.ts:15–31` — `workflowYml()` helper (no `no_branch` field on workflow entry)
- `tests/engine/run-cycle.documentation.test.ts:37–42` — `setupGitRepo()` helper
- `tests/helpers.ts:3–10` — `expectExactlyOne` (needs new import in test file)
- `src/engine/run-cycle.ts:25` — `RESET_ELIGIBLE_STEPS = new Set(["build", "fix"])`
- `src/engine/run-cycle.ts:141–205` — `headSha` assignment gate; `step.start` emit with conditional `head_sha`
- `src/engine/run-cycle.ts:200–205` — `step.start` emit; `head_sha` absent when `headSha` is null/falsy
- `src/engine/run-cycle.ts:251–254` — `documentation` non-fatal failure path: emits `documentation.skipped`, continues
- `src/engine/run-cycle.ts:260–261` — `cycle.end {status: "ok"}` on loop exhaustion
- `src/engine/run-cycle.ts:265–267` — Trunk `finally` path: `cycle.checkout {status: "skipped"}`
- `src/engine/workflow.ts:18–23` — `Workflow` type: no `no_branch` field
- `src/engine/workflow.ts:44–89` — `loadConfig()`: parses YAML, validates, applies `CYCLE_TRUNK_BASED` env override
- `src/engine/branch.ts:58–62` — `prepareTrunkArtifactDir()`: no branch ops, just mkdir
- `.cycle/workflows.yml:16–28` — Dogfood feature workflow shape (no `pr` step, no `no_branch` field)

## Open Questions

1. **`no_branch: true` in fixture YAML**: The SPEC requires `no_branch: true` on the feature workflow entry, but this field is not in the `Workflow` type and is silently ignored by `loadConfig()`. The planner must decide: (a) add `no_branch: true` to the fixture YAML as a no-op documentation marker only, relying on `engine.commit.mode: trunk` for actual behavior; or (b) determine whether the SPEC intends this field to become a real behavioral toggle (which would require changes to `workflow.ts` and `run-cycle.ts` — out of scope per SPEC).

2. **`workflowYml()` variant vs reuse**: The existing `workflowYml()` already produces `mode: trunk`. The new tests may reuse it (optionally adding `no_branch: true` to the step body if the field is treated as a YAML comment/marker), or define a new helper. The planner must decide whether a second `workflowYmlNoBranch()` variant is necessary or if a single helper with `no_branch: true` inline suffices.

3. **Log parsing approach for `expectExactlyOne`**: Existing tests use raw regex on the log string. New tests using `expectExactlyOne` must parse log lines as JSON objects. Planner must decide whether to add a local `parseLog(logStr: string)` helper in the file or inline the parsing.
```
