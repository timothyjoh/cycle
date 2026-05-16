# Research: Cycle 0107

## Cycle Context

SPEC.md requires adding `tests/dogfood/feature-yaml.test.ts` — a pinning test that reads `.cycle/workflows.yml`, finds the `feature` workflow, and asserts both its full step sequence (deepEqual regression guard) and the three local-divergence invariants that distinguish it from `src/defaults/workflows.yml`: `no_branch: true`, a step referencing `commit-trunk.sh`, and no step named `pr`. The test must mirror the structure of `tests/defaults/feature-yaml.test.ts` exactly. The `tests/dogfood/` directory does not yet exist.

## Current Codebase State

### Relevant Components

- **Dogfood workflow config**: `.cycle/workflows.yml` — feature workflow has 8 steps: `spec`, `research`, `plan`, `build`, `review`, `fix`, `verify`, `commit`. Has `no_branch: true`. Commit step: `{ name: commit, agent: bash, command: scripts/commit-trunk.sh }`. No `pr` step. No `reflection` step (as of implementation time). `.cycle/workflows.yml:18–30`
- **Reference test (mirror target)**: `tests/defaults/feature-yaml.test.ts` — single `test()` block, reads `src/defaults/workflows.yml` via `readFile` + `YAML.parse`, asserts step names via `assert.deepEqual`, asserts step count. `tests/defaults/feature-yaml.test.ts:1–12`
- **Defaults workflow** (for contrast only): `src/defaults/workflows.yml` — feature workflow has 10 steps (adds `pr`, `documentation`), no `no_branch` field, uses `commit.sh` not `commit-trunk.sh`. `src/defaults/workflows.yml:11–24`
- **Test directory**: `tests/dogfood/` — does not exist; must be created.

### Existing Patterns to Follow

- **Import pattern** (from `tests/defaults/feature-yaml.test.ts:1–4`):
  ```ts
  import { test } from "node:test";
  import { strict as assert } from "node:assert";
  import { readFile } from "node:fs/promises";
  import YAML from "yaml";
  ```
- **YAML parse pattern**: `YAML.parse(await readFile("<path>", "utf8"))` then `y.workflows.find((w) => w.name === "feature")` — `tests/defaults/feature-yaml.test.ts:6–8`
- **deepEqual step assertion**: `assert.deepEqual(names, [...])` where `names = feature.steps.map((s) => s.name)` — `tests/defaults/feature-yaml.test.ts:9`
- **Two `test()` blocks**: SPEC specifies one for step sequence (deepEqual), one for local-divergence invariants. Reference file uses one block; the planner must split into two per spec.
- **No mocking**: all tests read real files from working directory (CWD = repo root when `npm test` runs).
- **Test file naming**: `*.test.ts` suffix — picked up automatically by `node --test` runner.

### Dependencies & Integration Points

- **`yaml` package**: prod dependency `"yaml": "^2.6.0"` — `package.json:39`. Imported as default `YAML from "yaml"` throughout test suite.
- **Node test runner**: `npm test` runs `node --test --experimental-strip-types --test-reporter=spec` — `package.json:25`. Node's `--test` flag with no explicit path globs recursively discovers all `**/*.test.{ts,...}` files from CWD. `tests/dogfood/feature-yaml.test.ts` will be auto-discovered once the file and directory exist.
- **Node version constraint**: Repo requires Node ≥ 22.6 (`package.json:36`). `--experimental-strip-types` is a Node 22+ flag. System shell shows `v20.9.0`; `npm test` must be invoked via `nvm use 22.22.2` or equivalent. `nvm` binary at `~/.nvm/versions/node/v22.22.2/bin/node` confirmed present.
- **tsconfig.json**: `"include": ["src/**/*.ts", "tests/**/*.ts", ...]` — `tests/dogfood/` is already within the glob. `tsconfig.json:14`
- **Coverage exclusions**: `--test-coverage-exclude='tests/**'` — `package.json:27`. New test file is excluded from coverage measurement; adds no coverage burden and cannot cause coverage regression by itself.

### Test Infrastructure

- **Framework**: `node:test` + `node:assert` (built-in, no Jest/Vitest). Async `test()` at top level.
- **Conventions**: File per concern under `tests/<area>/`. No `describe()` nesting in defaults tests — flat `test()` blocks. Assertions use `assert.ok`, `assert.equal`, `assert.deepEqual` from `node:assert/strict`.
- **No helpers needed**: test reads the real `.cycle/workflows.yml` directly; no temp dirs, no mocking.
- **Coverage of change area**: New file is a test-only addition. `tests/**` excluded from coverage measurement; no `src/` changes → no coverage impact.

## Code References

- `.cycle/workflows.yml:18` — `name: feature` workflow entry start
- `.cycle/workflows.yml:20` — `no_branch: true` field
- `.cycle/workflows.yml:22–29` — full 8-step sequence: spec, research, plan, build, review, fix, verify, commit
- `.cycle/workflows.yml:29` — `{ name: commit, agent: bash, command: scripts/commit-trunk.sh }` — the commit-trunk.sh reference
- `tests/defaults/feature-yaml.test.ts:1–12` — complete reference implementation to mirror
- `package.json:25` — test runner command (no explicit glob; auto-discovers `**/*.test.ts`)
- `package.json:36` — `"node": ">=22.6"` engine constraint
- `tsconfig.json:14` — `"tests/**/*.ts"` already in include

## Open Questions

- **`reflection` step absent**: The current `.cycle/workflows.yml` feature workflow has no `reflection` step (8 steps total). SPEC.md's conditional — "if `reflection` step exists in the file at implementation time" — evaluates to false. The planner must confirm: skip the `indexOf("reflection") < indexOf("commit")` assertion, or pin absence of `reflection` explicitly? SPEC says "if present … test asserts"; if absent, the assertion block is omitted entirely.
- **`readFile` vs `readFileSync`**: Reference test uses async `readFile` (from `node:fs/promises`). SPEC says `fs.readFileSync`. Planner must decide which to follow — the reference file (async) or the SPEC text (sync). The reference mirror instruction ("mirror structure exactly") favors async `readFile`.
- **CWD at test runtime**: `node --test` runs from repo root; relative path `".cycle/workflows.yml"` resolves correctly when CWD is the repo root. Confirmed by how `tests/defaults/feature-yaml.test.ts` uses the relative path `"src/defaults/workflows.yml"` without issue.
