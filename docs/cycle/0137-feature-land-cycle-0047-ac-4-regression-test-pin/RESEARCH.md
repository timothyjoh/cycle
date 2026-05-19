Got everything needed. Writing the research document now.

```markdown
# Research: Cycle 0137

## Cycle Context
Add a single regression-pin test (`tests/defaults/local-workflows-divergence.test.ts`) that reads `.cycle/workflows.yml` from the repo root, parses it as YAML, and asserts three trunk-based invariants: `feature.no_branch === true`, that the feature commit step's script field references `commit-trunk.sh`, and that no step is named `pr`. The goal is to detect future silent drift of the trunk-based dogfood shape without a failing test.

## Current Codebase State

### Relevant Components

- **`.cycle/workflows.yml`** — the live dogfood config, 57 lines. Feature workflow has 8 steps: `spec, research, plan, build, review, fix, verify, documentation`. Does NOT contain a `no_branch` field. Does NOT contain a `commit` step or `pr` step. Does NOT contain a `script:` or `run:` field on any step. Commit config is at `engine.commit.mode: worktree-pr` (top-level, not per-workflow). — `.cycle/workflows.yml:1–57`

- **`src/engine/workflow.ts`** — defines TypeScript types `Step`, `CommitConfig`, `Workflow`, `CycleConfig`, and the parsers `loadConfig()` / `loadWorkflow()`. The `Step` type has fields: `name`, `agent`, `prompt?`, `command?`, `skip_unless?`. **No `script:` or `run:` field exists on Step.** The `Workflow` type has: `name`, `description?`, `max_cycle_attempts`, `steps`. **No `no_branch` field on `Workflow`.** `loadConfig()` applies `CYCLE_TRUNK_BASED=1` env override at line 84–86 to force `commitConfig.mode = "trunk"` at runtime. — `src/engine/workflow.ts:5–96`

- **`tests/dogfood/feature-yaml.test.ts`** — existing test that already reads `.cycle/workflows.yml` and asserts:
  - Feature step sequence matches `["spec", "research", "plan", "build", "review", "fix", "verify", "documentation"]` (8 steps)
  - `!feature.no_branch` — `no_branch` **must be ABSENT** (inverse of SPEC AC-3)
  - No `commit` step exists (engine handles commit)
  - No `pr` step exists
  - `y.engine?.commit?.mode === "worktree-pr"`
  — `tests/dogfood/feature-yaml.test.ts:1–27`

### SPEC vs. Actual State: Critical Conflicts

The SPEC (AC-3, AC-4) was written against an older shape of `.cycle/workflows.yml` that predates the engine-managed commit lifecycle refactor (landed in cycle ~0130). Specifically:

| SPEC Assertion | Current `.cycle/workflows.yml` | Existing dogfood test assertion |
|---|---|---|
| AC-3: `feature.no_branch === true` | Field **does not exist** on feature workflow | Asserts `no_branch` **must be absent** |
| AC-4: commit step script references `commit-trunk.sh` | **No commit step exists** in feature workflow; no `script:` field on any step | Asserts commit step **must not exist** |
| AC-5: no `pr` step | Correct — no `pr` step | Asserts `!hasPrStep` (same) |

If a test is written literally following AC-3 and AC-4, it will **fail on current master** (violating AC-8).

### Existing Patterns to Follow

- **Test file structure**: Node built-in `node:test` + `node:assert` + `yaml` package. All `tests/defaults/*.test.ts` files use `import { test } from "node:test"` and `import { strict as assert } from "node:assert"`. — `tests/defaults/feature-yaml.test.ts:1–4`

- **Reading `.cycle/workflows.yml`**: Direct `readFile(".cycle/workflows.yml", "utf8")` + `YAML.parse(...)`. No shared helper. Used in `tests/dogfood/feature-yaml.test.ts:9` and `tests/defaults/quickfix-yaml.test.ts:17–18`.

- **Failure messages**: `assert.ok(feature, "workflows.yml should contain a feature workflow")` pattern — inline string as second arg. — `tests/dogfood/feature-yaml.test.ts:11`

- **Type annotation style**: Inline types on find/map callbacks: `(w: { name: string })`, `(w: WorkflowEntry)`. — `tests/defaults/feature-yaml.test.ts:8`, `tests/dogfood/feature-yaml.test.ts:6–10`

- **Mixed src/defaults and .cycle in one file**: `tests/defaults/quickfix-yaml.test.ts` has two tests — one reads `src/defaults/workflows.yml`, one reads `.cycle/workflows.yml`. — `tests/defaults/quickfix-yaml.test.ts:7,17`

- **No `no_branch` or `script:` fields on `Step`**: The `Workflow` and `Step` types in `src/engine/workflow.ts` do not include `no_branch` or `script`/`run`. The `Step.command` field holds bash command strings (e.g., `scripts/verify.sh`). Prompt steps use `Step.prompt`. — `src/engine/workflow.ts:5–11,18–23`

### Dependencies & Integration Points

- **`yaml` package**: Already a project dependency, imported as `import YAML from "yaml"`. Used across all existing defaults tests. — `tests/defaults/feature-yaml.test.ts:4`

- **Test runner auto-discovery**: `npm test` runs `node --test --experimental-strip-types` with no explicit glob. Node auto-discovers `**/*.test.{ts,mts}` files, so any new file in `tests/defaults/` is automatically included. — `package.json:25`

- **`CYCLE_TRUNK_BASED=1`**: Trunk-based operation is enforced via `.cycle/.env` at runtime, not via `no_branch` in the YAML. The `loadConfig()` function applies this override post-parse. — `src/engine/workflow.ts:84–86`

### Test Infrastructure

- Test framework: Node.js built-in `node:test` with `--experimental-strip-types` (TypeScript runs directly, no compile step)
- Node requirement: ≥ 22.6 for `--experimental-strip-types` (current env has v20.9.0 — `nvm use 22.22.2` required before `npm test`)
- Test conventions: one `test()` per assertion group, no `describe()` nesting, async tests with `await`
- Coverage: `tests/defaults/` files are excluded from per-file coverage floors (floors apply to `src/engine/` files only)

### Current Coverage of Change Area

- `.cycle/workflows.yml` trunk-based shape already has partial coverage in `tests/dogfood/feature-yaml.test.ts` (covers step order, absent `no_branch`, absent commit/pr steps, `engine.commit.mode`)
- `tests/defaults/quickfix-yaml.test.ts` tests `.cycle/workflows.yml` quickfix shape
- No test currently in `tests/defaults/` reads `.cycle/workflows.yml` for the feature workflow's engine-level commit config

## Code References

- `tests/dogfood/feature-yaml.test.ts:17–27` — existing assertions on `.cycle/workflows.yml` feature workflow; planner must avoid duplicating these
- `tests/defaults/feature-yaml.test.ts:1–13` — canonical single-test-file pattern (14 lines, well within 25-line budget)
- `tests/defaults/quickfix-yaml.test.ts:16–24` — precedent for testing `.cycle/workflows.yml` from within `tests/defaults/`
- `src/engine/workflow.ts:5–23` — `Step` and `Workflow` types; no `script`, `run`, or `no_branch` fields exist
- `.cycle/workflows.yml:3–8` — engine block: `commit.mode: worktree-pr`, `base_branch: master`
- `.cycle/workflows.yml:15–27` — feature workflow: 8 steps, no `no_branch`, no commit/pr steps
- `package.json:25` — `npm test` command; `tests/defaults/` picked up automatically

## Open Questions

1. **AC-3/AC-4 restatement required**: SPEC assertions `feature.no_branch === true` and "commit step references `commit-trunk.sh`" both fail against current master. The planner must determine which invariants actually pin the trunk-based shape today — likely `engine.commit.mode === "worktree-pr"` and absence of `no_branch`/commit/pr steps — and restate the ACs accordingly.

2. **Overlap with `tests/dogfood/feature-yaml.test.ts`**: That file already asserts absent `no_branch`, absent commit step, absent pr step, and `engine.commit.mode === "worktree-pr"` against `.cycle/workflows.yml`. The planner must decide whether the new `tests/defaults/local-workflows-divergence.test.ts` provides additive value or is redundant, and if additive, which invariants to assert that are NOT already covered.

3. **Correct file location**: The issue says `tests/defaults/` but the existing dogfood test for `.cycle/workflows.yml` lives in `tests/dogfood/`. Whether to co-locate with other `.cycle/` tests in `tests/dogfood/` vs. follow the SPEC's `tests/defaults/` placement is a planner decision.
```
