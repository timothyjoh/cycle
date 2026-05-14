```markdown
# Research: Cycle 0053

## Cycle Context

SPEC asks: add pure helper `sanitizeArtifactStdout(stdout: string): string` at `src/engine/sanitize-artifact.ts` (strip leading whitespace → drop leading `^(Now|Next|Here is|Output)\b.*$` lines → unwrap single top-level ``` fence covering the entire remaining payload → trim trailing whitespace + ensure single trailing newline → idempotent). Wire it at the single engine seam where captured agent stdout becomes `docs/cycle/<cycle_id>/<STEP_NAME>.md`. `log.jsonl` payloads stay untouched. Unit tests + one `runCycle` integration test required. No prompt edits in this cycle, no retroactive artifact rewrites.

## Current Codebase State

### Relevant Components

- **Engine artifact-write seam** (the single chokepoint): `src/engine/run-cycle.ts:145-147` — inside the `for` over `wf.steps`, after non-bash agent step returns `r.status === "ok"`, the engine writes `r.stdout` verbatim to `${step.name.toUpperCase()}.md` under `artifactDir`. Bash steps (`step.agent === "bash"`) on `run-cycle.ts:132-133` do NOT write `<STEP>.md` artifacts — bash output is left for the script to manage and is therefore out of scope.
- **Reflection stdout consumer** (separate, NOT an artifact write): `src/engine/run-cycle.ts:148-150` — for `step.name === "reflection"`, `r.stdout` is also passed to `ingestReflection(repoRoot, cycleId, slug, r.stdout, log)`. `ingestReflection` (`src/engine/reflection.ts:14-127`) already runs its own `stdout.trim()` + `FENCE_RE` unwrap at lines 36-38 against `^```(?:json)?\s*\n([\s\S]*?)\n```\s*$`.
- **Step result shape**: `src/engine/exec-bash.ts:5-10` — `StepResult = { status: "ok" | "failed"; exitCode: number; stdout: string; stderr: string }`. Same shape returned by every agent in the registry.
- **Agent registry / capture layers** (each accumulates raw stdout into a string and returns `{stdout, …}`):
  - `src/engine/exec-claudecode.ts:18-29` — `child.stdout.on("data", d => { stdout += d.toString(); })` and resolves `StepResult` on close.
  - `src/engine/exec-codex.ts` and `src/engine/exec-gemini.ts` — same shape (parallel modules registered in `src/engine/exec.ts:22-26`).
  - `src/engine/exec.ts:6-12` — `ExecModule.runStep` interface contract.
- **Logger**: `src/engine/log.ts:8-18` — `appendLog` only emits the JSON event payload built from the supplied `fields` record; `step.end` and other events in `run-cycle.ts` pass status / exit_code / head_sha etc. but never include `stdout`. So sanitizing prior to the `writeFile` call has zero effect on log payloads — the wiring requirement is already trivially satisfied IF sanitization is local to the write site. The integration-test "log differs from artifact" assertion is therefore a wiring witness, not a behavior change.
- **Step name → filename mapping** (`run-cycle.ts:146`): every non-bash step with `step.name` set produces `<STEP_NAME.toUpperCase()>.md`. Active step names in shipped workflow: `spec`, `research`, `plan`, `build`, `review`, `fix`, `verify` (bash, no artifact), `commit`/`commit-trunk` (bash), `pr` (bash), `reflection`, `documentation`. So sanitization applies uniformly across SPEC.md, RESEARCH.md, PLAN.md, BUILD.md, REVIEW.md, FIX.md, REFLECTION.md, DOCUMENTATION.md.

### Existing Patterns to Follow

- **Pure-function module shape** (no I/O, no fs, no path): closest analog is `src/engine/frontmatter.ts` (and the inner `trimToLastBalancedClose` / `truncateUtf8` / `validateEntry` helpers in `src/engine/reflection.ts:145-225`) — small focused string-in/string-out functions, no constructor, named export.
- **Existing fence-unwrap regex prior art**: `src/engine/reflection.ts:10` — `const FENCE_RE = /^```(?:json)?\s*\n([\s\S]*?)\n```\s*$/`. SPEC asks for the broader pattern `^```(\w+)?\n[\s\S]*\n```\s*$`; reflection's is `(?:json)?` only. The two patterns are intentionally different (reflection wants JSON-only; sanitize wants any language tag or none) — do not consolidate.
- **TypeScript import discipline**: every `.ts` file in `src/engine/` imports peer modules with explicit `.ts` extension and Node built-ins with `node:` prefix (`node:fs/promises`, `node:path`, `node:child_process`). `tsconfig.json` enforces ES2023; ES2023 string + array methods (`replaceAll`, `at`, `findLast`) are usable without polyfill.
- **Module export style**: named `export function …` or `export const … =`; no default exports anywhere in `src/engine/`.
- **Engine-seam wiring convention**: minimal, in-place — see `src/engine/run-cycle.ts:148-150` (`ingestReflection`) and `run-cycle.ts:146` (`writeFile`). Both are single-line calls inside the step loop. The sanitize wiring should match: a single `await writeFile(…, sanitizeArtifactStdout(r.stdout), "utf8");` substitution.

### Dependencies & Integration Points

- **Caller of artifact write**: `runCycle` → `writeFile` at `src/engine/run-cycle.ts:146`. The `<STEP>.md` file is the sole on-disk artifact produced by every non-bash step.
- **Downstream readers of `<STEP>.md`** (all consume the artifact verbatim, none rely on the current leading-narration bytes):
  - `src/defaults/prompts/research.md` reads `docs/cycle/<id>/SPEC.md`.
  - `src/defaults/prompts/plan.md` reads SPEC.md + RESEARCH.md.
  - `src/defaults/prompts/build.md` reads SPEC.md + RESEARCH.md + PLAN.md.
  - `src/defaults/prompts/review.md`, `fix.md`, `reflection.md`, `documentation.md` chain through earlier artifacts in the same dir.
  - `git diff "${CYCLE_BASE}"...HEAD` (commit / pr / commit-trunk shell scripts) — content-agnostic.
- **`ingestReflection` raw-stdout consumer** (`run-cycle.ts:149`): currently receives `r.stdout` (unsanitized). SPEC requirement "sanitization is artifact-only" can be read either way — sanitizing in a local variable used only for `writeFile` leaves this caller on raw stdout; sanitizing in place (mutating `r.stdout`) would also feed sanitized into `ingestReflection`. See Open Questions.
- **`log.emit("step.end", …)`** at `run-cycle.ts:152`: never carries `stdout`, so artifact-vs-log divergence is structural in the current code. The integration-test "log payload differs from artifact" requirement is satisfied by virtue of the log shape; the test phrasing in SPEC implies asserting `log.jsonl` does NOT contain the leading `Now …` line (trivially true today since logs don't contain stdout at all).
- **No external dependencies** — pure TypeScript, no `package.json` changes needed.

### Test Infrastructure

- **Framework**: Node native `node:test` + `node:assert` strict. Run under `--experimental-strip-types` (no transpile).
- **Test layout**: `tests/engine/<module>.test.ts` per source module. Convention is one test file per `src/engine/<module>.ts`. Expected new file: `tests/engine/sanitize-artifact.test.ts`.
- **Test patterns observed**:
  - Pure-function tests: per-case `test("<scenario>", async () => { … })` with `assert.equal` / `assert.deepEqual` / `assert.match` on the function output (see `tests/engine/frontmatter.test.ts`, `tests/engine/cycle-id.test.ts`, the inner-helper tests in `tests/engine/reflection.test.ts`).
  - Integration via `runCycle`: see `tests/engine/run-cycle.documentation.test.ts:41-82` — `mkdtemp` root + bin dirs, `setupGitRepo` helper that does `git init -b main` + identity + empty commit, writes `.cycle/workflows.yml` via the `workflowYml(stepsBody)` helper, writes prompt file, writes a fake `claude` shell script under `bin/` that `printf '%s' '<stdout>'`, invokes `runCycle` with `env: { PATH: bin + ':' + process.env.PATH, CYCLE_BASE: "main" }`, then asserts on the on-disk artifact via `readFile`.
  - The `documentation` test pattern is the closest template for the new integration test — single agent step, no bash, asserts on `<artifactDir>/<STEP>.md` content and on `log.jsonl` shape.
- **Per-file coverage floor**: `scripts/coverage-gate.mjs` enforces `src/engine/triage.ts ≥ 95%`. No floor on new `sanitize-artifact.ts`; SPEC asks for "parity or above the global floor" (line ≥ 95%, branch ≥ 75%, function ≥ 90%) which a pure function with the listed test cases hits easily.
- **Current coverage baseline** (per CLAUDE.md, 2026-05-13): line ≥ 95%, branch ≥ 75%, function ≥ 90%. Cycle 0050 reported aggregate 99.05% line / 92.78% branch / 96.30% function.
- **Test runner discovery glob**: `package.json > scripts.test` runs `node --test tests/**/*.test.ts` (via pretest-built `dist/`). New `tests/engine/sanitize-artifact.test.ts` is auto-discovered.
- **No mocking framework** — agent stdout is supplied via fake shell scripts on `PATH`. The new unit tests don't need any setup beyond importing the helper.

## Code References

- `src/engine/run-cycle.ts:22` — `RESET_ELIGIBLE_STEPS = new Set(["build", "fix"])` (orthogonal; sanitize applies to ALL non-bash artifact-producing steps).
- `src/engine/run-cycle.ts:131-151` — the agent-step block; `writeFile` at L146 is the seam to wire.
- `src/engine/run-cycle.ts:149` — `ingestReflection(repoRoot, cycleId, slug, r.stdout, log)` — second consumer of `r.stdout`; design decision needed.
- `src/engine/exec-bash.ts:5-10` — `StepResult` type definition (no change required).
- `src/engine/exec-claudecode.ts:18-29` — agent stdout capture (no change required; sanitize is post-capture).
- `src/engine/exec.ts:6-12` — `ExecModule` interface (no change required).
- `src/engine/log.ts:11-17` — `emit` does not carry stdout; supports SPEC's wiring claim trivially.
- `src/engine/reflection.ts:10` — existing `FENCE_RE` for reference (distinct from the broader regex SPEC requests).
- `src/engine/reflection.ts:145-184` — `trimToLastBalancedClose`, a parallel pure string-manipulation helper for style reference.
- `tests/engine/run-cycle.documentation.test.ts:41-82` — template for the integration test asserting on-disk artifact contents under a fake-agent stdout fixture.
- `tests/engine/reflection.test.ts` — closest parallel for unit-testing a pure helper that operates on stdout-shaped strings.
- `docs/cycle/0049-feature-cover-triage-ts-fault-handling-catches-e/REVIEW.md:1-3` — real-world golden of the leak pattern: line 1 `Verified. Now write review to stdout.` then ` ```markdown ` fence on the body. Note: this leading line is NOT pure narration — it starts with `Verified.`, which the SPEC's `^(Now|Next|Here is|Output)\b` regex will NOT strip. Only a same-line `Now ` mid-line is not stripped either. See Open Questions.
- `src/defaults/prompts/build.md`, `src/defaults/prompts/review.md`, `src/defaults/prompts/fix.md`, `src/defaults/prompts/reflection.md`, `src/defaults/prompts/documentation.md` — prompt templates that produce the leaky payloads; out of scope for this cycle per SPEC §Out of Scope.

## Open Questions

1. **Should `ingestReflection` receive raw or sanitized stdout?** SPEC requirement reads "sanitization happens at the single point where captured stdout becomes the `<step>.md` write payload" and "`appendLog` / `log.jsonl` events MUST receive unsanitized stdout (or no stdout at all, matching current behavior)". `ingestReflection` is neither — it's a side-effect ingestion that parses JSON. Today it does its own trim+fence-unwrap. Two implementable choices: (a) sanitize only in a local variable used for `writeFile`, leave `ingestReflection` on raw `r.stdout` — most literal reading of SPEC, lowest risk; (b) mutate `r.stdout` to the sanitized form once and let both `writeFile` and `ingestReflection` consume it — simpler call site, but couples ingestion behavior to the new helper. Planner to decide; choice (a) is the conservative default and matches the seam description.
2. **Real-world golden line shape**: `docs/cycle/0049-…/REVIEW.md` opens with `Verified. Now write review to stdout.` (single line, narration verb mid-line). SPEC's regex `^(Now|Next|Here is|Output)\b` will NOT strip this. Is the regex scope intentionally narrow (only lines that *begin* with the narration verb, deferring `Verified. Now …`-shape leaks to a follow-up cycle) or is the SPEC under-specified? Planner should pick a golden whose leading line is `Now …` exactly (per the SPEC's stated In-Scope cases, BUILD-shaped `Now sync defaults…` is the canonical input). The 0049 REVIEW.md is useful only for the fence-unwrap half of the compound case.
3. **Where does the leading-whitespace trim happen relative to narration strip?** SPEC pipeline reads "Trim leading whitespace → drop leading narration lines …". If the payload starts with `"\n\nNow …\n…"`, step 1 strips the leading `\n\n`, then step 2 strips `Now …`. Confirmed unambiguous from SPEC.
4. **Does "blank lines between" narration lines mean only blank, or also whitespace-only, lines?** SPEC says "one or more, blank lines between OK". Reasonable interpretation: `/^\s*$/` matches between consecutive narration lines. Planner to lock this in the helper's contract + unit tests.
5. **Idempotence boundary on trailing newline**: SPEC says "Empty / whitespace-only input returns `""` (no trailing newline)" and otherwise "ensure exactly one trailing newline". The `f(f(""))` case is satisfied (both return `""`); the `f(f("hello"))` case yields `"hello\n"` then `"hello\n"`. Confirmed idempotent under SPEC.
```
