I have everything needed. Writing the research document.

```markdown
# Research: Cycle 0081

## Cycle Context

This cycle applies four concrete edits that cycle 0078 failed to execute due to permission blocks: swap `reflection` before `commit` in `src/defaults/workflows.yml`, swap `reflection` before `commit` in `.cycle/workflows.yml` (preserving the LOCAL DIVERGENCE block), update the step-order assertion in `tests/defaults/feature-yaml.test.ts`, and add an invariant bullet to CLAUDE.md's reflection-step architecture note. The goal is ensuring reflection artifacts land in the commit of the cycle that produced them rather than being scooped by the next cycle's commit step.

## Current Codebase State

### Relevant Components

- **Default feature workflow**: `src/defaults/workflows.yml:14-25`  
  Steps in current order: `spec, research, plan, build, review, fix, verify, commit, pr, reflection, documentation`  
  `reflection` is at index 9 (after `pr`); `commit` is at index 7.

- **Dogfood feature workflow**: `.cycle/workflows.yml:17-30`  
  Steps in current order: `spec, research, plan, build, review, fix, verify, commit, reflection`  
  `reflection` is at index 8 (after `commit`); `commit` is at index 7.  
  Carries LOCAL DIVERGENCE block (lines 11-16): `no_branch: true`, uses `commit-trunk.sh`, no `pr` step. This divergence block must be preserved verbatim.

- **Step-order regression test**: `tests/defaults/feature-yaml.test.ts:11`  
  Asserts: `["spec", "research", "plan", "build", "review", "fix", "verify", "commit", "pr", "reflection", "documentation"]`  
  Step count assertion: `assert.equal(feature.steps.length, 11, ...)` — this count stays 11, only order changes.

- **CLAUDE.md reflection-step bullet**: `CLAUDE.md:73`  
  Current text: "Reflection step: `src/engine/reflection.ts:ingestReflection(...)` runs after a successful terminal `reflection` step of `feature`…". No invariant bullet about step ordering exists. The bullet to add must explain that `reflection` must precede `commit` so artifacts are committed under the producing cycle.

### Existing Patterns to Follow

- **YAML step entry format**: inline single-key objects `{ name: X, agent: Y, prompt: Z }` or `{ name: X, agent: bash, command: Z }`. No block scalars. Preserve column alignment.
- **LOCAL DIVERGENCE block**: `.cycle/workflows.yml:11-16` — a YAML comment block immediately before the `feature` workflow. Must survive the swap untouched.
- **Test framework**: Node native test runner (`node:test` + `node:assert`). No Jest, no Vitest. File at `tests/defaults/feature-yaml.test.ts` uses `YAML.parse` from the `yaml` npm package.
- **CLAUDE.md bullet style**: single long run-on bullet per architecture component, no sub-bullets. The reflection bullet (line 73) continues this pattern.

### Dependencies & Integration Points

- `src/defaults/workflows.yml` is the source-of-truth shipped to downstream consumers; `.cycle/workflows.yml` is the dogfood mirror with intentional divergence.
- `npm run sync-defaults` copies `src/defaults/` → `.cycle/` but respects divergence-guard. The dogfood `workflows.yml` is currently divergent (sha mismatch) — the guard will skip it on any future `sync-defaults`. Manual edits to both files stay independent.
- `tests/defaults/feature-yaml.test.ts` reads `src/defaults/workflows.yml` directly (line 7: `readFile("src/defaults/workflows.yml", "utf8")`). It does NOT read `.cycle/workflows.yml`. The dogfood file is not covered by this test.
- No engine source files (`src/engine/`) need modification — this is a pure YAML + test + doc change.

### Test Infrastructure

- **Framework**: Node native test runner (`node:test`). Run via `npm test` (calls `pretest` to build `dist/` first).
- **Coverage**: `npm run test:coverage` — required ≥95% line, ≥75% branch, ≥90% function. No new source files added here so coverage baseline is unaffected.
- **Relevant test file**: `tests/defaults/feature-yaml.test.ts` — sole test asserting feature workflow step order against `src/defaults/workflows.yml`.
- **Other workflow tests**: `tests/defaults/review-prompt-doc-claim-pass.test.ts`, `tests/defaults/plan-prompt-spec-traceability.test.ts`, `tests/defaults/quickfix-yaml.test.ts` (recently added per git status). None assert feature step order.

## Code References

- `src/defaults/workflows.yml:22` — `commit` step entry (currently before `reflection`)
- `src/defaults/workflows.yml:24` — `reflection` step entry (currently after `commit` and `pr`)
- `.cycle/workflows.yml:11-16` — LOCAL DIVERGENCE comment block (must be preserved)
- `.cycle/workflows.yml:29` — `commit` step entry (currently before `reflection`)
- `.cycle/workflows.yml:30` — `reflection` step entry (currently after `commit`)
- `tests/defaults/feature-yaml.test.ts:11` — `assert.deepEqual(names, [...])` assertion with current wrong order
- `tests/defaults/feature-yaml.test.ts:12` — step count assertion (stays 11, no change needed)
- `CLAUDE.md:73` — reflection-step bullet, end of sentence is the insertion point for invariant

## Open Questions

None. All four edit targets are fully identified with file paths and line numbers. The SPEC is unambiguous and the prior PLAN.md from cycle 0078 is authoritative. No implementation decisions deferred to the planner.
```
