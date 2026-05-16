# Research: Cycle 0101

## Cycle Context

Cycle 0101 delivers four surgical edits: insert a `reflection` step (at index 7, before `commit`) into both `src/defaults/workflows.yml` and `.cycle/workflows.yml`, update the `tests/defaults/feature-yaml.test.ts` step-order assertion to match, and add an ordering-invariant sentence to the `CLAUDE.md` Architecture section. Three prior cycles (0078, 0081, 0082) each committed with titles claiming this shipped but delivered zero code changes (the missing empty-diff post-condition guard allowed placeholder artifacts to drain cycles to `done/`). The empty-diff guard now exists (cycle 0100). The `reflection` step is currently **entirely absent** from both workflow files — not merely in the wrong position.

---

## Current Codebase State

### Relevant Components

**`src/defaults/workflows.yml`** — `src/defaults/workflows.yml:14-24`
Feature workflow currently has 10 steps (no `reflection` step):
```
spec, research, plan, build, review, fix, verify, commit, pr, documentation
```
`reflection` is absent. PLAN.md from cycle 0081 described it as being at index 9 (after `pr`), but a subsequent regression (obs 1068, obs 1079) deleted it entirely.

**`.cycle/workflows.yml`** — `.cycle/workflows.yml:17-29`
Dogfood feature workflow currently has 8 steps (no `reflection` step):
```
spec, research, plan, build, review, fix, verify, commit
```
`reflection` is absent. LOCAL DIVERGENCE comment block occupies lines 11–16 and must be preserved byte-identical.

**`tests/defaults/feature-yaml.test.ts`** — `tests/defaults/feature-yaml.test.ts:1-13`
Single test, single assertion: reads `src/defaults/workflows.yml`, extracts step names, asserts exact array. Currently expects 10 steps with no `reflection`:
```ts
assert.deepEqual(names, ["spec", "research", "plan", "build", "review", "fix", "verify", "commit", "pr", "documentation"]);
assert.equal(feature.steps.length, 10, "regression guard: step count should be 10");
```

**`CLAUDE.md`** — `CLAUDE.md:36-44` (Architecture section)
60 lines total. No reflection-specific bullet exists anywhere. The Architecture section (lines 36–44) lists `reflection` in the key-modules list (`src/engine/` includes `reflection`) and in the ENGINE.md reference, but contains no ordering invariant. The `## Workflow defaults` section (lines 51–55) similarly has no reflection mention. PLAN.md from cycle 0081 referenced "line 73" and a "reflection-step bullet" — that bullet does not exist in the current file; the file is only 60 lines.

**`src/defaults/prompts/reflection.md`** — confirmed present in `src/defaults/prompts/`

### Existing Patterns to Follow

**YAML step entry format** — `src/defaults/workflows.yml:15-24`
Each step is an inline YAML object on one line. Two forms:
- ClaudeCode agent: `{ name: <step>, agent: claudecode, prompt: prompts/<file>.md }`
- Bash agent: `{ name: <step>, agent: bash, command: scripts/<file>.sh }`
Reflection uses claudecode: `{ name: reflection, agent: claudecode, prompt: prompts/reflection.md }`

**`.cycle/workflows.yml` LOCAL DIVERGENCE block** — `.cycle/workflows.yml:11-16`
Verbatim (must survive byte-identical):
```yaml
  # LOCAL DIVERGENCE FROM src/defaults/workflows.yml
  # This repo is trunk-based (see CLAUDE.md). feature here runs no_branch:true
  # and commits directly to master via commit-trunk.sh; the pr step is dropped.
  # src/defaults/workflows.yml still ships branch+PR for downstream consumers.
  # `npm run sync-defaults` will overwrite this file — do not run it without
  # restoring this divergence afterward.
```

**`.cycle/workflows.yml` trunk-based divergences** — `.cycle/workflows.yml:19-20`
Feature workflow has `no_branch: true` and uses `scripts/commit-trunk.sh` instead of `scripts/commit.sh`. No `pr` step. No `documentation` step. These divergences must be maintained.

**CLAUDE.md single-line bullet style** — `CLAUDE.md` throughout
All bullets are single unbroken lines. No sub-bullets in any section. The ordering invariant sentence should be appended inline to an existing or new bullet — not as a new sub-bullet.

**sync-defaults** — `npm run sync-defaults`
Copies `src/defaults/` → `.cycle/`. Running it during this cycle would clobber `.cycle/workflows.yml`. Do not run `sync-defaults` as part of this cycle's build.

### Dependencies & Integration Points

**`src/engine/reflection.ts`** — unchanged. Engine already knows how to execute the reflection step when it appears in a workflow. No engine source changes needed.

**`src/engine/run-cycle.ts`** — unchanged. Step dispatch picks up the `reflection` entry from the parsed workflow YAML at runtime. Adding the step to the YAML is sufficient to activate it.

**`tests/defaults/feature-yaml.test.ts`** — primary regression guard. Reads `src/defaults/workflows.yml` directly (no mocking). Fails if step array or count doesn't match the assertion. Must be updated in the same cycle as the YAML edit or `npm test` will fail.

### Test Infrastructure

- Framework: `node:test` with `node:assert` (strict mode)
- Test file: `tests/defaults/feature-yaml.test.ts` (13 lines, single test case)
- Test reads `src/defaults/workflows.yml` via `readFile`, parses with the `yaml` package, and asserts step names and count
- No mocking; the test is purely file-driven
- Current assertion (line 11): `["spec", "research", "plan", "build", "review", "fix", "verify", "commit", "pr", "documentation"]`
- Current count assertion (line 12): `10`
- After this cycle both must change to 11 steps with `reflection` at index 7

---

## Code References

- `src/defaults/workflows.yml:14-24` — feature workflow steps block; `reflection` currently absent; insert at line 22 (between `verify` and `commit`)
- `src/defaults/workflows.yml:22` — current `verify` line; reflection insert goes immediately after it
- `.cycle/workflows.yml:11-16` — LOCAL DIVERGENCE comment block; byte-identical preservation required
- `.cycle/workflows.yml:28-29` — current `verify` and `commit` lines; reflection insert goes between them
- `tests/defaults/feature-yaml.test.ts:11` — `assert.deepEqual` line; update step array
- `tests/defaults/feature-yaml.test.ts:12` — `assert.equal(length, 10, ...)` → must update to `11`
- `CLAUDE.md:36-44` — Architecture section; ordering invariant sentence goes here
- `CLAUDE.md:51-55` — Workflow defaults section; mentioned in issue as an alternate location
- `src/defaults/prompts/reflection.md` — reflection prompt file; exists; no changes needed

---

## Open Questions

1. **CLAUDE.md insertion location**: SPEC says "Architecture section" (lines 36–44); PLAN.md from 0081 referenced a "reflection-step bullet at line 73" that does not exist. The planner must decide exactly which line in the Architecture section gets the invariant sentence — appended to the key-modules line, added as a new bullet, or appended inline somewhere else.

2. **PLAN.md from 0081 accuracy gap**: That plan described `reflection` as present but misplaced. Actual current state is `reflection` entirely absent. The insert operation (not a move) is slightly different — the planner should confirm the exact insert syntax targets are correct given the current file state.
