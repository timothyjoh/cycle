Now write research doc to stdout (engine captures it).

```markdown
# Research: Cycle 0013

## Cycle Context
SPEC.md asks to collapse the split config — `src/defaults/workflows/feature.yaml` plus engine defaults that currently live implicitly in code — into one `src/defaults/workflows.yml` file with three top-level sections (`engine:`, `triage:`, `workflows[]`). The engine's workflow loader (`src/engine/workflow.ts`) must read the new shape, pick a workflow from the `workflows[]` array by name, and return the existing `Workflow` type unchanged for downstream callers. Engine and triage config are parsed and exposed via a new loader API for BB-3/BB-4/BB-6/BB-7 to consume later, but no consumer code uses them yet. The `src/defaults/workflows/` subdirectory is deleted, and `scripts/sync-defaults.mjs` is updated to copy the single file and tear down the stale `.cycle/workflows/` directory.

## Current Codebase State

### Relevant Components
- Workflow loader (the file BB-2 rewrites): `src/engine/workflow.ts:1-25`. Exports `Step`, `Workflow` types and `loadWorkflow(repoRoot, name)`. Reads `${repoRoot}/.cycle/workflows/${name}.yaml`, parses with `YAML.parse`, validates `parsed?.name` and `Array.isArray(parsed.steps)`, throws `malformed workflow: <path>` otherwise.
- Default feature workflow (content moves into `workflows.yml`): `src/defaults/workflows/feature.yaml:1-31`. Nine steps in this order: `spec, research, plan, build, review, fix (skip_unless: MUST-FIX.md), verify, commit, pr`. Steps `spec…fix` use `agent: claudecode` with a `prompt:` path; `verify, commit, pr` use `agent: bash` with a `command:` path.
- Engine entrypoint that consumes the loader: `src/engine/run-cycle.ts:33`. Calls `loadWorkflow(repoRoot, opts.workflow)` and iterates `wf.steps` at `src/engine/run-cycle.ts:47-65`. Dispatches `bash` → `execBashStep` (line 51), `claudecode` → `execClaudecodeStep` (line 53). Throws `unknown agent: …` (line 58) if anything else is seen. The only `Step` fields it reads are `name`, `agent`, `prompt`, `command`.
- Sync-defaults helper (updated to copy the file, not the dir): `scripts/sync-defaults.mjs:1-19`. Three-pair loop currently `rm -rf` + `cp -r` for `workflows`, `prompts`, `scripts` (`scripts/sync-defaults.mjs:9-19`).
- CLI init scaffolder (still copies `defaults/prompts` and `defaults/scripts`; the `workflows` copy line becomes a single-file copy): `src/cli/init.ts:17-19`. Today: `cp(join(defaults, "workflows"), join(t, ".cycle/workflows"), { recursive: true })`.
- Build/bundle staging that ships defaults alongside `dist/cycle.js`: `scripts/build.mjs:29-31` (`cp src/defaults → dist/defaults`). Picks up whatever shape `src/defaults/` has; no per-file knowledge.
- Dogfood `.cycle/` (must be re-synced as part of this cycle): currently has `bin/`, `prompts/`, `scripts/`, `workflows/` plus `log.jsonl` and `tbd.jsonl`. The stale `.cycle/workflows/feature.yaml` is the file `sync-defaults` removes.

### Existing Patterns to Follow
- YAML parsing: import `YAML from "yaml"` (already a dep — `package.json:25` `"yaml": "^2.6.0"`); parse with `YAML.parse(body)`. Follow `src/engine/workflow.ts:3,21`. No alternative parser anywhere in the repo.
- Error style for loader: throw `new Error("…: <path>")` with the offending path/name in the message. Example: `src/engine/workflow.ts:22` `throw new Error(\`malformed workflow: ${path}\`)`.
- File IO: `readFile` from `node:fs/promises`, UTF-8, async. `src/engine/workflow.ts:1,20`.
- Type exports: re-export the `Step` and `Workflow` shapes from `src/engine/workflow.ts` (lines 5-16); `run-cycle.ts` reads `step.name | agent | prompt | command` from the returned object. Keep these field names byte-identical.
- Step preservation: `skip_unless: MUST-FIX.md` lives in the YAML on the `fix` step (`src/defaults/workflows/feature.yaml:22`). No engine code branches on it today (`grep skip_unless src tests` returns only the YAML and the prompt doc `src/defaults/prompts/fix.md:19`) — but it must round-trip through the loader as data so the eventual implementer of skip-logic has the field.
- Test fixtures: each engine/loader test mints a tmp `repoRoot` via `mkdtemp(join(tmpdir(), "cycle-test-"))` and writes a synthetic `.cycle/workflows/<name>.yaml` inline (`tests/engine/workflow.test.ts:9-14`, `tests/engine/run-cycle.test.ts:28-29`). Tear down with `rm({ recursive: true, force: true })` in `finally`. Use the same pattern for the new `workflows.yml` fixtures.
- Defaults round-trip test pattern: copy `src/defaults/...` into a tmp `.cycle/...`, then exercise the loader. See `tests/defaults/feature-loadable.test.ts:11-13`. The migrated version will `copyFile("src/defaults/workflows.yml", join(root, ".cycle/workflows.yml"))`.
- Static YAML shape test: parse the on-disk default and assert step name sequence. `tests/defaults/feature-yaml.test.ts:7-9`. New version walks `y.workflows.find(w => w.name === "feature").steps` to assert the same nine-name sequence.

### Dependencies & Integration Points
- `loadWorkflow` is called exactly once in `src` — `src/engine/run-cycle.ts:33`. The return shape must continue to satisfy that call site: `wf.steps[]` with each step exposing `name, agent, prompt | command`.
- `RunCycleOpts.workflow` (`src/engine/run-cycle.ts:25`) still drives which workflow is picked. BB-3 is what changes the source of `workflow` (issue frontmatter); BB-2 only changes how the YAML is shaped on disk.
- Direct callers of the workflow loader in `tests/`: `tests/engine/workflow.test.ts:16`, `tests/defaults/feature-loadable.test.ts:13`. Both pass the literal `"feature"` workflow name and must migrate to the new shape.
- Engine run-cycle tests write `.cycle/workflows/feature.yaml` directly to fake repoRoots at: `tests/engine/run-cycle.test.ts:28, 71, 117, 166, 201, 229, 277, 332, 369` (nine fixture writes). All nine need to become writes of `.cycle/workflows.yml` carrying the new top-level shape — `runCycle` is exercised here end-to-end and the loader is what bridges to it.
- CLI init scaffolder copies defaults into a target repo: `src/cli/init.ts:16-19`. Currently copies the directory `defaults/workflows` → `.cycle/workflows`. Must switch to copying the single file `defaults/workflows.yml` → `.cycle/workflows.yml` (no `mkdir` needed for a file, but a `cp` works fine for both since this is a flat file).
- Init test asserts the scaffolded path: `tests/cli/init.test.ts:17` `stat(join(root, ".cycle/workflows/feature.yaml"))`. Must become `stat(join(root, ".cycle/workflows.yml"))`.
- Build script `scripts/build.mjs:31` copies `src/defaults → dist/defaults` recursively, so the new file is staged for the bundled CLI automatically — no edit needed there.
- Dogfood sync target: `npm run sync-defaults` is the dogfood-only path that re-materializes `.cycle/` from `src/defaults/`. The new `sync-defaults.mjs` needs to (a) copy the single `workflows.yml`, (b) `rm -rf .cycle/workflows` so the stale dir doesn't linger, and (c) still copy `prompts/` and `scripts/` recursively (unchanged).
- The `yaml` dependency is already in `package.json:25`. Nothing else to add.

### Test Infrastructure
- Test framework: Node's built-in `node:test` runner (`package.json:14`), invoked with `node --test --experimental-strip-types --test-reporter=spec`. Assertions via `node:assert/strict`. TypeScript runs directly (no transpile) via `--experimental-strip-types`.
- Coverage: `npm run test:coverage` uses `--experimental-test-coverage` and excludes `dist/`, `tests/`, `scripts/`. Baseline (CLAUDE.md, 2026-05-13): line ≥ 95%, branch ≥ 75%, function ≥ 90%. Cycle 0012 left it at 98.44 / 82.54 / 91.11 (obs 500).
- Test layout: tests for engine modules live in `tests/engine/<module>.test.ts`; tests for defaults live in `tests/defaults/<topic>.test.ts`; CLI tests in `tests/cli/`. New tests for loader expansion belong in `tests/engine/workflow.test.ts`; the existing defaults tests (`feature-yaml.test.ts`, `feature-loadable.test.ts`) are renamed/rewritten in-place per SPEC §Testing Strategy.
- Test naming: lowercase prose sentence — `test("parses a workflow with claudecode and bash steps", …)` (`tests/engine/workflow.test.ts:8`). Match this style.
- No mocks / no test doubles for YAML parsing or filesystem in this area; tests write real files into `mkdtemp` roots and read them back via the real loader.
- Current coverage of the change area: `src/engine/workflow.ts` is exercised by two tests today (`tests/engine/workflow.test.ts:8`, `tests/defaults/feature-loadable.test.ts:8`) plus the nine `run-cycle.test.ts` fixtures that go through `loadWorkflow` transitively. With only one happy path and no error-branch coverage, the new error-path tests required by SPEC will raise branch coverage rather than risk dropping it.

## Code References
- `src/engine/workflow.ts:1-25` — loader and types; entire file is rewritten to the new shape with `loadWorkflow` plus `loadEngineConfig`/`loadTriageConfig` (or combined `loadConfig`) exposed.
- `src/engine/workflow.ts:18-24` — `loadWorkflow` signature `(repoRoot: string, name: string) => Promise<Workflow>` is the load-bearing contract for `runCycle`. Preserve.
- `src/engine/run-cycle.ts:33` — the single in-repo consumer of `loadWorkflow`. Its expectations (`wf.steps[]` of `{name, agent, prompt|command}`) are the bar for "byte-equivalent" output of the new loader.
- `src/defaults/workflows/feature.yaml:1-31` — content that's inlined under `workflows[0].steps` in the new file. Step order, names, agents, prompt/command paths, and `skip_unless: MUST-FIX.md` on `fix` must all survive verbatim.
- `scripts/sync-defaults.mjs:9-19` — pair loop; mutate to handle the workflows.yml file plus stale-dir teardown.
- `src/cli/init.ts:17` — workflow copy line in `runInit`; becomes a file copy.
- `tests/engine/workflow.test.ts:9-26` — single happy-path test for the loader; rewritten plus expanded with the array-pick + error-throw cases SPEC enumerates.
- `tests/defaults/feature-yaml.test.ts:6-10` — on-disk shape test; rewritten to traverse `workflows[]`.
- `tests/defaults/feature-loadable.test.ts:8-18` — copy-and-load test; rewritten to copy a single file.
- `tests/cli/init.test.ts:17` — asserts scaffolded `.cycle/workflows/feature.yaml`; must move to `.cycle/workflows.yml`.
- `tests/engine/run-cycle.test.ts:28, 71, 117, 166, 201, 229, 277, 332, 369` — nine `.cycle/workflows/feature.yaml` fixture writes that must migrate to `.cycle/workflows.yml` with the new top-level shape.
- `docs/RFC-001-issue-lifecycle.md:111-150` — authoritative shape for the new file, including the `engine:` and `triage:` defaults to seed (e.g. `engine.max_consecutive_failures: 2`, `engine.base_branch: master`, `triage.agent: claudecode`, `triage.prompt: prompts/triage.md`, `triage.max_turns: 10`).
- `docs/RFC-001-issue-lifecycle.md:139` shows a `reflection` step in the RFC's illustrative workflow; SPEC §Out of Scope (line 20) explicitly says BB-7 adds that step later — do not include `reflection` in BB-2's workflow.
- `CLAUDE.md` Architecture quick reference (5th bullet under that heading) — one-line documentation edit per SPEC §Documentation Updates.
- `package.json:25` — `yaml` dependency already present; no install step needed.

## Open Questions
- **Loader API surface.** SPEC §Requirements offers two valid choices (`loadEngineConfig`/`loadTriageConfig` as two named exports vs a single `loadConfig` returning `{ engine, triage, workflows }`). Either is acceptable; the plan step picks one and documents the choice.
- **Caching.** SPEC says caching parsed YAML "per `repoRoot` call site" or re-reading on each call is fine. Plan step decides whether the new loader memoizes — currently `loadWorkflow` re-reads on every call (`src/engine/workflow.ts:19-21`), so the simplest preservation is to keep one read per call and let `runCycle` invoke each loader at most once.
- **`max_cycle_attempts` default and exposure.** SPEC §Requirements lists it as required on workflow entries, but no current code reads it (BB-6 will). The loader can either expose it as a typed field on `Workflow` or leave it as `unknown` on the parsed object. Plan step should pick a typed field, since the SPEC also wants this validated.
- **Error wording.** SPEC requires "clear error" messages for: missing file, malformed top-level shape, unknown workflow name, missing `name`/`steps` on an entry. Specific wording (and whether each path throws a typed `Error` subclass or a plain `Error` with a discriminating prefix) is a plan-step call.
- **Field name on disk: `.yml` vs `.yaml`.** SPEC and RFC-001 §4 both spell the new file as `workflows.yml`. Existing defaults file is `feature.yaml`. The new file follows SPEC's `.yml` spelling; tests and loader paths must match.
