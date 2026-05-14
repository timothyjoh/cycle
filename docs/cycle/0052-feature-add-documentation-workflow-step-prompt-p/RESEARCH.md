Have enough context. Now writing RESEARCH.md to stdout.

```markdown
# Research: Cycle 0052

## Cycle Context

SPEC requires appending a non-fatal `documentation` step to the `feature` workflow that runs AFTER `reflection`, captures stdout to `<artifactDir>/DOCUMENTATION.md`, and lets failures emit `documentation.skipped {reason, exit_code}` without flipping `cycle.end` to `failed`. Touches both `src/defaults/workflows.yml` and the locally-divergent `.cycle/workflows.yml`, adds `src/defaults/prompts/documentation.md` (synced to `.cycle/prompts/documentation.md`), extends the non-fatal-step branch in `run-cycle.ts`, adds tests, and updates `CLAUDE.md`.

## Current Codebase State

### Relevant Components

- **Engine loop / non-fatal-step branch** — `src/engine/run-cycle.ts:100-161`. The for-loop runs each `wf.steps[i]`. Generic stdout capture: `src/engine/run-cycle.ts:145-147` (`writeFile(join(artifactDir, ${step.name.toUpperCase()}.md), r.stdout)` runs for any non-bash `r.status === "ok"`). Reflection-only ingest hook: `src/engine/run-cycle.ts:148-150`. Non-fatal branch (the only one today): `src/engine/run-cycle.ts:153-159` — `if (r.status === "failed") { if (step.name === "reflection") { log.emit("reflection.skipped", { cycle_id, reason: "exec_failed", exit_code }); continue; } … return failed; }`.
- **Workflow loader / Step type** — `src/engine/workflow.ts:5-19`. `Step.agent: "claudecode" | "bash"`, `prompt?: string`, `command?: string`, `skip_unless?: string`. `loadConfig` parses `.cycle/workflows.yml`; `loadWorkflow(repoRoot, name)` returns the named workflow (`workflow.ts:67-72`). No special-casing per step name.
- **Agent registry** — `src/engine/exec.ts:22-32`. `claudecode` is registered (`exec-claudecode.ts`). `resolveAgent("claudecode")` already works; no registry change needed for `documentation`.
- **Reflection ingest (regression-guard reference)** — `src/engine/reflection.ts:14-127`. Called only when `step.name === "reflection"` and `r.status === "ok"` (`run-cycle.ts:148`). Documentation step does NOT need an analogous ingest — generic stdout capture handles `DOCUMENTATION.md`.
- **Shipped default workflow** — `src/defaults/workflows.yml:11-24`. `feature` workflow with 10 steps ending in `reflection`. Has `pr` step (consumer-side, branch-based). Lacks `no_branch: true`.
- **Locally-divergent dogfood workflow** — `.cycle/workflows.yml:10-30`. `feature` is `no_branch: true`, ends in `reflection`, no `pr` step, uses `commit-trunk.sh`. Lines 11-16 contain the divergence comment that MUST be preserved when editing. Both files share the e2e-tests workflow definition (`.cycle/workflows.yml:32-43`, `src/defaults/workflows.yml:26-37`).
- **Reflection prompt (shape template for `documentation.md`)** — `src/defaults/prompts/reflection.md`. Demonstrates the stdout-only contract, the "reject prose preamble/fences" framing, and the input-file enumeration pattern. Documentation prompt differs: emits plain-paragraph text (no JSON wrapper), allows in-place doc edits, restricts write scope.
- **`sync-defaults` divergence guard** — `scripts/sync-defaults.mjs:13-22` (entry + force resolution); recorded sha map at `.cycle/.sync-state.json`. The guard skips `.cycle/workflows.yml` because its sha matches neither the prior `dst_sha256` nor current `src_sha256`. New `prompts/documentation.md` will be a fresh path with no prior entry — the standard copy path runs and `.sync-state.json` records the new sha.

### Existing Patterns to Follow

- **Generic artifact write** — `src/engine/run-cycle.ts:145-147`. New step gets `DOCUMENTATION.md` for free because the capture key is `step.name.toUpperCase()`. No special-case write.
- **Non-fatal terminal step shape** — `src/engine/run-cycle.ts:153-157` (`reflection` branch). Extension pattern per SPEC requirement #4 / Dependencies note: replace `if (step.name === "reflection")` with a set/inclusion check (e.g. `if (step.name === "reflection" || step.name === "documentation")`). Reason string MUST be distinct (`documentation.skipped` not `reflection.skipped`) per SPEC Acceptance Criterion 5 and the "Keep the reason-string distinct" note in SPEC Dependencies.
- **Workflow yaml step entry** — single-line braces preferred for terminal entries (see `reflection` line `.cycle/workflows.yml:30`). Keep the same column alignment so a quick visual scan reads.
- **Sync-after-defaults-edit** — `CLAUDE.md > Commands` row for `npm run sync-defaults` plus the `sync-defaults divergence guard` subsection. New `src/defaults/prompts/documentation.md` flows through `sync-defaults` (no divergence). `.cycle/workflows.yml` MUST be edited by hand and the divergence preserved.
- **`step.name.toUpperCase()` artifact convention** — appears throughout: `SPEC.md`, `RESEARCH.md`, `PLAN.md`, `BUILD.md`, `REVIEW.md`, `FIX.md`, `MUST-FIX.md`, `REFLECTION.md`. `DOCUMENTATION.md` slots in identically.

### Dependencies & Integration Points

- **`runCycle` opts contract** — `src/engine/run-cycle.ts:52-59`. No new field needed for this cycle; the change is internal to the step loop.
- **Logger** — `src/engine/log.ts` (`createLogger`). All step events go through `log.emit(event, payload)`. New event name: `documentation.skipped`.
- **Frontmatter / slugify** — only needed if documentation step ingests stdout into the issue tree; SPEC explicitly does NOT do that, so no `frontmatter.ts` or `issue/id.ts` involvement.
- **Issue tree** — `docs/cycle/issues/raw/` is untouched by this step.
- **Coverage gate** — `scripts/coverage-gate.mjs` enforces `src/engine/triage.ts ≥ 95%` line. Triage is not in this cycle's blast radius, so the per-file floor is not at risk. Aggregate line ≥ 95% / branch ≥ 75% / func ≥ 90% must hold; new `run-cycle.ts` branch needs explicit tests to avoid a small branch-coverage dip.

### Test Infrastructure

- **Framework**: Node native test runner — `import { test } from "node:test"`; assertions via `node:assert/strict`. Spec reporter. No mocha/jest. Auto-build pretest produces `dist/cycle.js`.
- **Pattern for engine tests**: `tests/engine/*.test.ts`. Each test uses `mkdtemp` to set up an isolated repo root + fake `bin/claude` shim. The `claudecode` agent ultimately spawns `claude` binary — tests prepend a `bin` dir to `PATH` containing a shell-script `claude` that emits the desired stdout/exit code.
- **Closest analog** — `tests/engine/run-cycle.reflection.test.ts:1-219`. Four tests cover the reflection step: happy-path ingest, empty array, exit-non-zero non-fatal (`run-cycle.reflection.test.ts:143-182`), parse-error non-fatal (`run-cycle.reflection.test.ts:184-219`). Workflow-yml helper at lines 16-29 inlines a one-step workflow. `setupGitRepo` at lines 40-45 stands up `-b main`. The non-fatal test asserts `cycle.end status:ok`, presence of `reflection.skipped reason:exec_failed`, and absence of any `raw/refl-*.md` files.
- **Coverage of the change area**: documentation step does not exist yet, so 0% coverage on the new branch. Existing `reflection` non-fatal branch is covered by `run-cycle.reflection.test.ts:143-182`. Aggregate baseline as of cycle 0050: line 99.05% / branch 92.78% / function 96.30% (per session observation 876 / cycle 0050 REVIEW.md).

## Code References

- `src/engine/run-cycle.ts:100-161` — main step loop; sites for `documentation` non-fatal branch and unchanged generic stdout capture.
- `src/engine/run-cycle.ts:145-147` — generic `<STEP_NAME_UPPER>.md` artifact write; covers `DOCUMENTATION.md` automatically.
- `src/engine/run-cycle.ts:148-150` — reflection-only post-success hook; documentation does NOT need a sibling here.
- `src/engine/run-cycle.ts:153-159` — non-fatal-step branch to extend.
- `src/engine/workflow.ts:5-11` — `Step` type already permits arbitrary `name` + `prompt`; no schema change required.
- `src/engine/exec.ts:22` — `claudecode` registered.
- `src/defaults/workflows.yml:11-24` — append `documentation` as the 10th-and-final step of `feature` (after `reflection`).
- `.cycle/workflows.yml:17-30` — append `documentation` as the 9th-and-final step of trunk-based `feature` (preserve lines 11-16 divergence comment).
- `src/defaults/prompts/reflection.md` — analogous prompt structure (input list, stdout contract, output discipline).
- `tests/engine/run-cycle.reflection.test.ts:143-182` — template for the documentation non-fatal-failure test.
- `tests/engine/run-cycle.reflection.test.ts:47-101` — template for the documentation happy-path test (adapt stdout assertion to `DOCUMENTATION.md` artifact instead of `raw/refl-*.md`).
- `scripts/sync-defaults.mjs` — runs after `src/defaults/prompts/documentation.md` is created; will copy to `.cycle/prompts/documentation.md` (no divergence on new path).
- `CLAUDE.md` — Architecture quick reference paragraph for `Reflection step:` is the insertion anchor; new `Documentation step:` paragraph follows it per SPEC §Documentation Updates.

## Open Questions

- Should the non-fatal-step detection live as a module-level constant (`const NON_FATAL_STEPS = new Set(["reflection", "documentation"])`) or stay as an inline `||` check next to the existing `step.name === "reflection"` guard? Plan step to pick — both satisfy SPEC. The constant scales better if a third post-PR non-fatal step ever lands (SPEC explicitly defers that generalization to "Out of Scope").
- The reflection ingest hook at `run-cycle.ts:148-150` runs only on `status: "ok"`. SPEC says documentation needs NO equivalent — but plan should confirm whether the prompt should explicitly forbid the agent from emitting JSON-wrapped output (parallel risk to `reflection.md`'s parse-error path). Likely yes per SPEC Requirements ("No markdown fences, no JSON wrapper, no preamble").
- The `documentation` step's `exit_code` in the `documentation.skipped` event — SPEC §Requirements item 4 says `exit_code` is included. Confirm field naming matches the existing `reflection.skipped` shape (`exit_code` per `run-cycle.ts:155`). Plan step to confirm.
- `e2e-tests` workflow explicitly excluded from this cycle (SPEC §Out of Scope). Plan to confirm no test inadvertently asserts step-count parity across workflows.
```
