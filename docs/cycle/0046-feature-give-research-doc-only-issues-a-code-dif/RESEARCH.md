# Research: Cycle 0046

## Cycle Context
This cycle delivers a per-issue opt-out (`expects_code: false`, default `true`) parsed from issue frontmatter and plumbed to `runCycle`, so that when a `build`/`fix` step exits 0 with an empty `src scripts tests` diff but a non-empty in-scope `docs/**` deliverable, the existing build-phase empty-diff guard resolves the step to `ok` (committed through the unchanged commit path, issue drains to `done/`) instead of failing. Issues without the opt-out behave exactly as today: an empty `src/scripts/tests` diff still fails with `formatEmptyDiffGuardError`. Out of scope: a dedicated `research`/`spike` workflow, changes to `noop-marker.ts`/`NOOP.md`, auto-detection heuristics, and `STEP_ARTIFACTS` changes. The change reuses the marker-gated guard site (Option B), not a new workflow (Option A).

## Current Codebase State

### Relevant Components
- **Build-phase empty-diff guard**: the single site where the SPEC's new branch lands. Runs after a `build`/`fix` step exits `ok`; runs `git status --porcelain -- src scripts tests`; on empty output it currently checks `NOOP.md` and either resolves to a no-op or fails with `formatEmptyDiffGuardError` — `src/engine/run-cycle.ts:738-772`.
- **`formatEmptyDiffGuardError`**: the anti-slop failure message that must be preserved byte-for-byte for non-opt-out issues — `src/engine/run-cycle.ts:277-279`.
- **`runCycle` / `RunCycleOpts`**: the entry point that already receives `opts.issueId`; the opt-out flag must be resolved here (or before, and passed in `opts`) — `src/engine/run-cycle.ts:321-333` (type), `:335` (function).
- **`run-one.ts`**: constructs the `runCycle` call from CLI args; maps `result.status` to exit codes (`ok⇒0`, `noop⇒3`, else `1`) — `src/cli/run-one.ts:80-94`.
- **Frontmatter parser**: `parseFrontmatter(body)` returns `{ fm, bodyAfter }`; `fm` is `Record<string, string | number | string[]>` — `src/engine/frontmatter.ts:11-17`. (Note: the declared `FrontmatterValue` union does not include `boolean`; YAML parsing of `expects_code: false` yields a JS boolean at runtime regardless of the declared type.)
- **`isDenied(p)`**: the in-scope filter (denylist: `.claude`, `dist`, `node_modules`, `.cycle/cycle.pid`, `*.lock`) reused by commit-cycle and run-cycle; a `docs/**` path is **not** denied — `src/engine/path-utils.ts:4-13`.
- **Issue file location**: the source issue lives at `docs/cycle/issues/todo/<issueId>.md`; the supervisor resolves it as `join(cwd, "docs/cycle/issues/todo", \`${row.id}.md\`)` — `src/cli.ts:176`, `:213` (`todoDir`), `:547`, `:715`.

### Existing Patterns to Follow
- **Empty-diff detection idiom**: `spawnSync("git", ["status", "--porcelain", "--", "src", "scripts", "tests"], { cwd: repoRoot, encoding: "utf8", shell: false })`, emptiness tested via `!changed.stdout || !changed.stdout.trim()` — `src/engine/run-cycle.ts:743-748`. A `docs/**` change check (the SPEC's "non-empty in-scope doc deliverable") would follow the same `git status --porcelain -- docs` shape and `isDenied`-filter the result paths (mirror of `parseSnapshotPaths` + `isDenied` usage at `:144-145`, `:174-175`, `:224`).
- **Frontmatter field-resolution convention (fail-closed defaults)**: other fields normalize defensively — `depends_on` defaults via `Array.isArray` check, `priority` via `normalizePriority(o.priority ?? o.priority_hint)`; non-conforming values fall back to a default rather than throwing — `src/engine/queue.ts:77-80`, `:107`; `src/engine/triage.ts:629`. The SPEC requires the same: absent / non-boolean / malformed `expects_code` ⇒ `true`. A pure resolution helper (e.g. `resolveExpectsCode(fm)` returning a boolean, defaulting `true` unless `fm.expects_code === false`) matches this convention and is directly unit-testable (Testing Strategy calls for one).
- **Reading the issue file from inside the engine**: `parseFrontmatter` is imported in `triage.ts:5` and `issue-lifecycle.ts:3`; both wrap reads in `try/catch` and degrade — e.g. issue-lifecycle: `try { parseFrontmatter(originalBody) } catch { /* no frontmatter; keep raw */ }` — `src/engine/issue-lifecycle.ts:42-46`, `:124-128`. The SPEC requires the same degrade: a missing/unreadable issue file at flag-resolution ⇒ default `true`, never throw out of the guard.
- **Marker-gated guard structure (prior art to extend, not duplicate)**: the existing branch reads `NOOP.md` via `classifyNoopMarker` inside `try/catch`, sets `noopOutcome` on a valid marker (leaving `r.status === "ok"`), else fails — `src/engine/run-cycle.ts:756-770`. The new opt-out branch sits at the same `if (!changed.stdout || !changed.stdout.trim())` block but resolves to a plain `ok` (no `noopOutcome`, no `cycle.noop`), distinct from the no-op path.
- **`noopOutcome` / status return shape**: `runCycle` returns statuses `ok` / `failed` / `noop`; the opt-out relaxed path must return `ok` (the SPEC explicitly forbids routing through `noopDrain`/exit-3). The build `step.end` fires `status: "ok"` and the cycle proceeds to commit — contrast the no-op return handled after `step.end` — `src/engine/run-cycle.ts:762-765`, `:773-795`.
- **Failure handling today**: an empty diff with no valid marker is a *retryable* step failure — `r.status = "failed"`, `r.exitCode = r.exitCode || 1`, `r.stderr = formatEmptyDiffGuardError(step.name)`, routed through the standard `cycle.end { status: "failed", failing_step }` and `max_cycle_attempts` machinery — `src/engine/run-cycle.ts:766-770`; documented at `docs/ENGINE.md:182-184`.
- **Observability**: structured events appended to `.cycle/log.jsonl` via `log.emit(...)`. The nearest precedents emit `step.completion_check { cycle_id, step, artifact, status }` (`run-cycle.ts:720-725`) and `cycle.noop { cycle_id, issue_id, reason, detected_at_step }`. The SPEC does **not** mandate a new event for the relaxed-`ok` path (it is an ordinary `ok` completion); the existing `step.end { status: "ok" }` and `cycle.end { status: "ok" }` carry the outcome.
- **Idempotency / retry-safety**: the guard runs only when `r.status === "ok" && (step.name === "build" || step.name === "fix")` — `run-cycle.ts:738`. The relaxed branch must remain a pure read (two `git status` calls + a frontmatter read) with no state mutation, so retries are safe. Cardinality-pinning of exactly-once events uses `filter(predicate).length === 1` per repo test convention (CLAUDE.md), required by the Acceptance Criteria for the build `step.end`.

### Dependencies & Integration Points
- `src/engine/frontmatter.ts` — `parseFrontmatter`; resolves `expects_code` from YAML frontmatter.
- `src/engine/path-utils.ts` — `isDenied`; in-scope filter for the `docs/**` deliverable check.
- `src/engine/run-cycle.ts` — the guard site (`:738-772`), `RunCycleOpts` (`:321`), `formatEmptyDiffGuardError` (`:277`).
- `src/cli/run-one.ts` — passes `opts.issueId` into `runCycle` (`:80-91`); the path from which the issue file can be located (`docs/cycle/issues/todo/<issueId>.md`).
- `src/cli.ts` — supervisor; resolves `todoPath` and drains `ok` cycles to `done/` via `drainSuccess`/`drainOk` (`:375-385`, `:578`, `:811`). No change required for the SPEC's `ok` outcome — it flows through the unchanged success-drain path.
- `docs/ENGINE.md` — the *Empty-diff post-condition* (`:182-184`) and *No-op / already-satisfied resolution* (`:188-212`) sections are where the opt-out must be documented.
- `CLAUDE.md` "Workflow defaults" section — documents the no-op / empty-diff guard; SPEC asks to note `expects_code` there.

### Test Infrastructure
- **Test framework**: `node:test` (`node --test`, `--experimental-strip-types`, no transpile); assertions via `node:assert/strict`; coverage via `npm run test:coverage` with per-file floors enforced by `scripts/coverage-gate.mjs`. `src/engine/run-cycle.ts` floor is **90%** (CLAUDE.md Coverage policy).
- **Test conventions**: tests live in `tests/engine/*.test.ts`; fixtures build a real git repo in a tmpdir, write `.cycle/workflows.yml` + prompts, and use a fake `claude` shell script on `PATH` to drive `runCycle` end-to-end — `tests/engine/empty-diff-guard.test.ts:9-58` (`git` helper, `workflowYml`, `setupRepo`, `cleanup`). Exactly-once events are cardinality-pinned with `filter(...).length === 1` over parsed `.cycle/log.jsonl` lines — `tests/engine/empty-diff-guard.test.ts:74-80`.
- **Failure-path coverage that exists for the change area**:
  - `tests/engine/empty-diff-guard.test.ts` — build/fix step with no `src/` change ⇒ `failed`, `failingStep === "build"`, and a pinned `step.end { status: "failed" }` (`:64-80`). This is the anti-slop regression suite the SPEC's "no opt-out ⇒ still fails" criterion extends.
  - `tests/engine/noop-resolution.test.ts` — the marker-gated no-op build/research paths (the adjacent branch the opt-out sits beside).
  - `tests/engine/noop-marker.test.ts` — `classifyNoopMarker` validity matrix (fail-closed).
  - `tests/engine/frontmatter.test.ts` — frontmatter parse/round-trip (where a `resolveExpectsCode` helper unit test would naturally live, or in a new `tests/engine/run-cycle.*` file).
- **Mocking note (repo constraint)**: `node:fs/promises` cannot be stubbed via `mock.method` (non-configurable ESM exports); use real temp filesystem manipulation or `node:fs` for `mock.method` — CLAUDE.md "Test conventions". The existing guard tests all use real repos/files, matching this.

## Code References
- `src/engine/run-cycle.ts:277-279` — `formatEmptyDiffGuardError(stepName)`; the message that must stay byte-for-byte for non-opt-out issues.
- `src/engine/run-cycle.ts:321-333` — `RunCycleOpts` type (carries `issueId`); candidate site to thread a resolved `expectsCode` flag.
- `src/engine/run-cycle.ts:738-772` — the `build`/`fix` empty-diff guard block: `git status --porcelain -- src scripts tests`, emptiness test, marker gate, failure routing. The SPEC's relaxed branch lands here.
- `src/engine/run-cycle.ts:743-748` — the `git status` idiom to mirror for a `docs/**` deliverable check.
- `src/engine/run-cycle.ts:756-770` — marker-gated resolution structure (`noopOutcome` set vs. `r.status="failed"`) to parallel for the `ok` opt-out branch.
- `src/engine/frontmatter.ts:11-17` — `parseFrontmatter`; `FrontmatterValue` union currently excludes `boolean`.
- `src/engine/path-utils.ts:4-13` — `isDenied`; `docs/**` is in-scope (not denied).
- `src/cli/run-one.ts:80-94` — `runCycle` invocation and `ok⇒0 / noop⇒3 / else⇒1` exit mapping.
- `src/cli.ts:176,213,547,715` — `docs/cycle/issues/todo/<id>.md` path resolution; `:375-385`,`:578`,`:811` — `drainSuccess`/`drainOk` success path for an `ok` cycle.
- `docs/ENGINE.md:182-184` — *Empty-diff post-condition* doc section to amend.
- `docs/ENGINE.md:188-212` — *No-op / already-satisfied resolution* doc section adjacent to the opt-out.
- `tests/engine/empty-diff-guard.test.ts:64-80` — existing build empty-diff `failed` regression test (anti-slop baseline) with `filter(...).length === 1` pinning.

## Open Questions
- **Where to resolve `expects_code`**: inside `runCycle` (reading `docs/cycle/issues/todo/<issueId>.md` from `repoRoot` + `opts.issueId`) versus resolving in the supervisor/`run-one` and passing a boolean through `RunCycleOpts`. The SPEC says "parsed from issue frontmatter and plumbed to `runCycle`" — the plan must choose, noting that by the time the guard runs the issue file is still in `todo/` (the move to `done/` happens post-cycle in the supervisor), so reading from `todo/` inside `runCycle` is viable.
- **`FrontmatterValue` type**: the declared union (`string | number | string[]`) omits `boolean`; a boolean `expects_code` parses fine at runtime but the resolution helper should treat the value structurally (`=== false`). Whether to widen the union type is a plan decision (typecheck must stay clean).
- **"Non-empty in-scope doc deliverable" precise definition**: the SPEC requires a non-empty `docs/**` change (so an opt-out cycle that produces *nothing* still fails). The plan must define the exact paths checked (`git status --porcelain -- docs`, `isDenied`-filtered) and confirm whether `docs/cycle/**` artifact writes (always present per-cycle) should be excluded so they don't trivially satisfy the deliverable check — note `isEngineOwned` (`failed-residue-guard.ts`) treats the whole `docs/cycle/**` tree as engine-owned, a possible reference for the scoping decision.
- **Interaction with the no-op marker path**: at the same empty-diff block, both a valid `NOOP.md` (⇒ `noop`) and `expects_code: false` + non-empty docs (⇒ `ok`) are now possible. The plan must define precedence/ordering between the two branches.
