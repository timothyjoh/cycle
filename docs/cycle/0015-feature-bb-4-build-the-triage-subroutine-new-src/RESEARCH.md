```markdown
# Research: Cycle 0015

## Cycle Context
Cycle 0015 (BB-4) introduces an engine-internal **triage subroutine** that turns thin `raw/` drops into enriched, ordered `todo/` work items. New module `src/engine/triage.ts` spawns the agent configured under `workflows.yml > triage`, parses+validates its JSON stdout (`ordering[]`, `children[]`, `decomposed_parents[]`), and applies queue mutations atomically (write `todo/<id>.md`, append `tbd.jsonl` row, move `raw/<id>.md → done/<id>_raw.md`). Per-raw retry up to 3 attempts feed the validator error back into the prompt; whole-pass failure emits `engine.paused` and exits non-zero. Triage is wired into `src/cli.ts` at engine.start and between cycles when `raw/` is non-empty, replacing the raw→todo move currently done by `scanRaw`.

## Current Codebase State

### Relevant Components

- **CLI orchestrator (where triage triggers wire in):** `src/cli.ts:1`. After `await log.emit("engine.start", {})` and freeform materialization (`src/cli.ts:44-49`), `scanRaw(cwd)` is invoked at `src/cli.ts:51`, then the dry-run branch (`src/cli.ts:62-75`) and the pop loop (`src/cli.ts:77-157`). Triage must replace the raw→todo move side of `scanRaw` and gain a second trigger inside the pop loop (BB-4 SPEC §Scope).

- **Current scan/passthrough shim:** `src/engine/scan.ts:11`. `scanRaw(repoRoot)` calls `bootstrapArchiveIfLegacy`, lists `raw/*.md`, parses frontmatter, `rename`s each file to `todo/`, and appends a `QueueRow` with empty `depends_on`/no enrichment. Dedup via `knownIds` set built from `readQueue` — `src/engine/scan.ts:27-49`. SPEC §Acceptance keeps `scanRaw` as a thin guard (legacy archive) or removes it; it must no longer perform the raw→todo move.

- **Queue authority:** `src/engine/queue.ts:1`. Owns `.cycle/tbd.jsonl`. Exports `QueueRow`/`QueueRowStatus` types (`queue.ts:4-15`), `readQueue` (`queue.ts:44`), `writeQueue` atomic tmp-rename (`queue.ts:68-75`), `appendRow` (`queue.ts:77-80`), `bootstrapArchiveIfLegacy` (`queue.ts:100-127`), `popNextPending` (`queue.ts:129-135`), `markInProgress` / `drainOk` / `drainFailedRetry` / `drainFailedTerminal` (`queue.ts:137-173`). Triage will use `readQueue`, `writeQueue` (for `ordering[]` rewrite), and `appendRow` (per-success append before the final reorder).

- **Workflow + triage config loader:** `src/engine/workflow.ts:1`. `loadConfig(repoRoot)` reads `.cycle/workflows.yml`, validates `engine`, `triage`, `workflows`, and returns `CycleConfig` (`workflow.ts:37-64`). `TriageConfig = { agent, prompt, max_turns }` already typed (`workflow.ts:25-29`). `loadWorkflow(repoRoot, name)` picks one workflow by name (`workflow.ts:66-71`). Triage reads `cfg.triage` only; `workflow` field on each child must match a `workflows[].name`.

- **Claudecode executor (template for triage agent spawn):** `src/engine/exec-claudecode.ts:7`. `execClaudecodeStep` runs `spawn("claude", ["-p", prompt], { cwd, env: buildChildEnv(env), shell: false })` and resolves `{status, exitCode, stdout, stderr}`. Triage will follow the same pattern but invoke its own prompt and capture stdout for JSON parsing (SPEC §Requirements: `spawn` with array args, `shell:false`, inherit curated PATH).

- **Curated env builder:** `src/engine/child-env.ts:16`. `buildChildEnv(extra)` prepends parent Node's bin dir to `PATH`. Triage subprocess must reuse it verbatim.

- **Frontmatter parser/serializer:** `src/engine/frontmatter.ts:21`. `parseFrontmatter(body)` returns `{ fm, bodyAfter }`; `serializeFrontmatter` rebuilds the YAML-ish header; `mutateFrontmatter(path, patch)` is the atomic write-via-tmp idiom (`frontmatter.ts:59-70`). Triage uses `parseFrontmatter` to read each `raw/<id>.md` and to compute the `triage_attempts` counter from existing frontmatter; new `todo/<id>.md` files are emitted via the same shape with frontmatter built from `children[]` entries (`id`, `parent`, `workflow`, `title`, `depends_on`, `triaged_at`, `source`). Type is `Record<string, string|number|string[]>` — booleans / nested objects unsupported.

- **Logger:** `src/engine/log.ts:8`. `createLogger(repoRoot, sink?)` appends `.cycle/log.jsonl`. Each call writes `{ts, event, ...fields}`. Triage must emit `triage.start`, `triage.raw.ok`, `triage.raw.failed`, `triage.end`, plus `engine.paused` (SPEC §Requirements).

- **Cycle runner (downstream consumer of pop):** `src/engine/run-cycle.ts:30`. `runCycle` loads workflow from `todo/<id>.md` frontmatter (chosen in `cli.ts:84-93`). Triage decides what goes into that frontmatter — `workflow` field must be valid for `runCycle` to find a workflow.

- **Issue materializer:** `src/issue/materialize.ts:5`. `materializeFreeformIssue` writes a `raw/<id>.md` with `id, source, title, added_at, triage_attempts: 0`. This is the only path that today produces files triage will consume; SPEC §Inputs requires every `*.md` in `raw/` to be processed.

- **Workflow defaults (triage block already present):** `src/defaults/workflows.yml:5-8`. `triage: { agent: claudecode, prompt: prompts/triage.md, max_turns: 10 }` — the prompt file doesn't exist yet (`src/defaults/prompts/` has only spec/research/plan/build/review/fix). New file `src/defaults/prompts/triage.md` is in scope (SPEC §Acceptance).

- **Defaults → consumer sync:** `scripts/sync-defaults.mjs`. Copies `src/defaults/workflows.yml` and `prompts/`, `scripts/` into `.cycle/`. SPEC §Acceptance requires `npm run sync-defaults` to surface `triage.md` under `.cycle/prompts/triage.md`. The script copies the entire `prompts/` directory, so a new file shows up automatically.

- **Init (consumer install):** `src/cli/init.ts:7`. Copies `defaults/workflows.yml`, `defaults/prompts/`, `defaults/scripts/`, and creates `docs/cycle/issues/{raw,todo,done,blocked,failed}`. New `triage.md` rides along via `cp(... prompts ...)`.

- **Blocked propagation (post-failure walk; not in BB-4 scope, but called from cli.ts:151):** `src/engine/blocked.ts:3`. Currently a stub emitting `queue.propagate_blocked` only. BB-6 fills in the real walk; triage does not invoke it.

### Existing Patterns to Follow

- **Subprocess discipline:** every executor uses `spawn(cmd, [args], { cwd, env: buildChildEnv(env), shell: false })` and resolves a Promise on `close`. `src/engine/exec-claudecode.ts:11-28` and `src/engine/exec-bash.ts:12-32` are the templates. No `exec`/`execSync`. `CLAUDE.md` §"Subprocess discipline" enforces this.

- **Atomic file writes:** write-to-tmp-then-rename. `src/engine/queue.ts:71-75` for `tbd.jsonl`; `src/engine/frontmatter.ts:67-69` for frontmatter mutations. Triage's per-raw apply (`todo/<id>.md` write, `tbd.jsonl` append, `raw → done/_raw` rename) should follow this idiom.

- **Defensive directory creation:** `await mkdir(dir, { recursive: true })` before any write — `scan.ts:15-16`, `cli.ts:56-57`, `queue.ts:21-23`, `materialize.ts:8`.

- **Frontmatter typing constraint:** `Frontmatter = Record<string, string | number | string[]>` (`frontmatter.ts:3-4`). `serializeFrontmatter` quotes strings with special chars. Triage frontmatter (`depends_on: string[]`) is supported; nested objects are not, so the child payload must be flattened before being written.

- **Module entry points are `.ts` with `--experimental-strip-types`:** all imports use `.ts` extension (e.g. `src/cli.ts:1-21`). New `src/engine/triage.ts` follows the same shape; tests import from `../../src/engine/triage.ts`.

- **Test layout:** `tests/engine/*.test.ts` mirrors `src/engine/*.ts`. Use `mkdtemp` + `rm({recursive,force:true})` in `try/finally`. Stub external CLIs with a temp bin dir + `chmod 0o755` — pattern in `tests/engine/exec-claudecode.test.ts:11-19`.

- **Integration tests run via `dist/cycle.js` + `spawnSync`:** `tests/cli/queue-drain.test.ts:16-36` and `tests/cli/multi-loop.test.ts:10-14` boot a real `bash`/`git` sandbox and drive the bundled CLI. Build runs automatically via `pretest` / `pretest:coverage` (CLAUDE.md §Commands).

- **CYCLE_BASE-style env injection:** runCycle threads env through to subprocess via `cycleEnv` (`run-cycle.ts:39-45`). Triage subprocess prompt is rendered with raw bodies + tbd.jsonl + todo/ listing concatenated into the `-p` arg, not via env vars — see SPEC §Requirements ("single rendered input block").

### Dependencies & Integration Points

- **`scanRaw` ↔ `cli.ts:51`**: only call site. BB-4 either rewrites the body to be a thin legacy-archive guard, or deletes it and lifts `bootstrapArchiveIfLegacy` into the triage entrypoint. Tests `tests/engine/scan.test.ts:25` cover all 8 existing scan behaviors that BB-4 must either preserve or migrate.

- **`loadConfig` ↔ triage**: `cli.ts:95` already calls `loadConfig` per cycle; triage will call it once (or accept it from caller) to read `cfg.triage`. Existing failure mode: throws on missing/malformed `.cycle/workflows.yml`. SPEC does not specify behavior if `cfg.triage` is malformed beyond what `loadConfig` already enforces (workflow.ts:52-54).

- **`spawn("claude", ...)` ↔ triage agent**: `exec-claudecode.ts:11` calls `claude` directly; same binary will be spawned for triage when `cfg.triage.agent === "claudecode"`. Tests stub by prepending a fake-bin PATH (`tests/engine/exec-claudecode.test.ts:17-20`). SPEC §Out of Scope defers other agents.

- **`materializeFreeformIssue` writes the `triage_attempts: 0` field**: `materialize.ts:16`. Triage updates this counter on each retry via `mutateFrontmatter`.

- **`runCycle` consumes `todo/<id>.md` frontmatter**: `cli.ts:86-90` reads `fm.workflow`. Triage must always write a `workflow` field into each child's frontmatter; missing field would fall back to CLI default `feature` (SPEC §Requirements requires explicit workflow that matches a `workflows[].name`).

- **`tbd.jsonl` ordering**: `popNextPending` does a linear scan from the top (`queue.ts:129-135`). Triage's `ordering[]` rewrite directly determines pop order — the spec wants `in_progress` rows pinned at the top in their existing relative order, then `pending` rows in the agent's `ordering[]`, then any pending rows the agent omitted appended at the end with a `triage.warning`.

- **`queue.drain_warning` logger event pattern**: already used at `cli.ts:144-148` for malformed-frontmatter recovery. Establishes a "non-fatal warning" event class to mirror with `triage.warning`.

- **Defaults sync chain**: any change to `src/defaults/workflows.yml` or new file under `src/defaults/prompts/` needs `npm run sync-defaults` (CLAUDE.md §Commands) to surface inside the dogfooded `.cycle/`. The script clears and re-copies the whole `prompts/` dir (`scripts/sync-defaults.mjs:19-23`).

### Test Infrastructure

- **Framework:** Node native test runner with `--experimental-strip-types` (Node ≥ 22.6) — no transpile step. Spec reporter. `package.json` `pretest` and `pretest:coverage` hooks run `npm run build` before tests so `dist/cycle.js` exists for integration tests (CLAUDE.md §Commands).

- **Naming / layout:** `tests/<module-area>/<file>.test.ts` mirrors `src/`. Unit tests in `tests/engine/`, integration/CLI tests in `tests/cli/`.

- **Conventions:**
  - Each test creates a fresh `mkdtemp` root and cleans it in `finally` with `rm(root, {recursive, force})`.
  - Imports from source use the `.ts` extension.
  - Fixture frontmatter built inline as template strings: `\`---\nid: X\n...\n---\n\nbody\n\`` (e.g. `tests/engine/scan.test.ts:8-10`).
  - Stub external binaries with a temp `bin/` dir, fake script via `writeFile + chmod 0o755`, prepend to `PATH` in `env` (e.g. `tests/engine/exec-claudecode.test.ts:11-20`).
  - Integration tests bootstrap a fresh `git init -b main`, write `.cycle/workflows.yml` inline, and drive `spawnSync("node", [distPath, "run", ...])` (e.g. `tests/cli/queue-drain.test.ts:16-36`).
  - Event log assertions: `events = log.split("\n").map(JSON.parse); events.find(e=>e.event==="...")` (`tests/cli/queue-drain.test.ts:90-94`).

- **Coverage of the change area today:** zero — `src/engine/triage.ts` does not exist. Adjacent coverage: `tests/engine/scan.test.ts` (8 scenarios covering raw→todo move + dedup + legacy archive), `tests/cli/queue-drain.test.ts` (6 scenarios covering pop/drain semantics from BB-3), `tests/engine/queue.test.ts` (queue primitives). Project-wide baseline (CLAUDE.md §Coverage policy as of 2026-05-13): line ≥ 95%, branch ≥ 75%, function ≥ 90%. Must hold for this cycle.

- **Pre-existing TS noise:** `findLast()` calls in `tests/cli/*.test.ts` produce `tsc --noEmit` errors against the current `lib` target. Documented as pre-existing (BB-3 fix cycle observation 538) — not introduced by BB-4.

## Code References

- `src/cli.ts:51` — current single `scanRaw` call site; BB-4 trigger point #1 (engine.start) replaces this.
- `src/cli.ts:77-79` — top of pop loop; BB-4 trigger point #2 (between cycles, when `raw/` non-empty) inserts here before `popNextPending`.
- `src/cli.ts:62-75` — dry-run early exit; triage must run **before** this branch so a dry run after a fresh drop still reflects triage-produced rows (or document the deliberate divergence — SPEC is silent).
- `src/engine/scan.ts:11-51` — body to retire/shrink; only `bootstrapArchiveIfLegacy` (`scan.ts:18`) is a candidate to keep.
- `src/engine/queue.ts:6-15` — `QueueRow` shape that triage writes; `cycle_id` is the only optional field beyond `parent`.
- `src/engine/queue.ts:68-75` — `writeQueue` atomic rewrite; used for the final `ordering[]` reorder pass.
- `src/engine/queue.ts:77-80` — `appendRow`; used for per-success row insertion before the final reorder.
- `src/engine/workflow.ts:25-29` — `TriageConfig` type.
- `src/engine/workflow.ts:37-64` — `loadConfig`; validates `triage` key presence.
- `src/engine/exec-claudecode.ts:7-29` — spawn template to mirror.
- `src/engine/child-env.ts:16-27` — `buildChildEnv`; reuse for triage subprocess.
- `src/engine/frontmatter.ts:21-32` — `parseFrontmatter` for raw bodies.
- `src/engine/frontmatter.ts:50-57` — `serializeFrontmatter` for new `todo/<id>.md`.
- `src/engine/frontmatter.ts:59-70` — `mutateFrontmatter` for `triage_attempts` counter on retry.
- `src/issue/materialize.ts:5-24` — `triage_attempts: 0` seeded in every `raw/<id>.md`.
- `src/defaults/workflows.yml:5-8` — `triage:` block already in defaults.
- `scripts/sync-defaults.mjs:19-23` — copies entire `prompts/` dir; new `triage.md` rides along.
- `src/cli/init.ts:19` — `defaults/prompts` copied into consumer `.cycle/prompts` at init.
- `docs/RFC-001-issue-lifecycle.md:156-226` — authoritative spec for triage subroutine (§5), including JSON output shape and failure handling.
- `docs/RFC-001-issue-lifecycle.md:332-366` — engine lifecycle diagram showing both trigger points (§10).
- `tests/engine/scan.test.ts:25-250` — eight existing scan scenarios; any that document raw→todo behaviour need migration or deletion (deduplication, parent frontmatter propagation, legacy archive).
- `tests/cli/queue-drain.test.ts:38-52` — `workflows.yml` template tests use, including the `triage:` block already present in fixtures.
- `tests/engine/exec-claudecode.test.ts:8-27` — fake-binary PATH-stubbing pattern triage tests can copy.

## Open Questions

- **`scanRaw` retention vs deletion.** SPEC says "kept only as a thin guard around legacy archive, or deleted if redundant." `bootstrapArchiveIfLegacy` is currently called from inside `scanRaw`; triage will need to either invoke it directly or keep `scanRaw` as a one-liner that does only that. The plan step picks one.
- **Where to place the `engine.paused` exit.** SPEC §Requirements says `cli.ts` exits non-zero, but `triage.ts` is the failure detector. The natural shape is `runTriage → { status: "paused", ... }` and `cli.ts` branches on it before `process.exit`. Plan step pins the exact wiring.
- **Atomic-apply rollback semantics on partial failure.** SPEC says "If any step fails, leave the raw file in place and surface the error to the caller." Concretely: if `appendRow` succeeds but `rename(raw→done)` fails, the row already exists in `tbd.jsonl` but the raw file is still in `raw/`. Spec wording suggests the apply order (todo-write → append-row → raw-move) and that a mid-apply failure leaves a queue row pointing at a `todo/<id>.md` that exists, with the original raw still in `raw/`. Plan should confirm and test the exact partial-failure invariants.
- **Test stub seam for the triage subprocess.** SPEC §Testing Strategy proposes an `execTriageAgent` boundary "function arg or module-local override." Plan picks the boundary shape (dependency-injected function arg vs `vi`-style module mock vs PATH-prepend fake binary as elsewhere) — last option matches existing test patterns most cleanly.
- **`ordering[]` validation strictness.** SPEC requires `id` uniqueness in batch and "against existing queue ids" — but `decomposed_parents[]` removes the parent so a new child can share a base. Plan should pin the exact uniqueness predicate (against `pending` rows after removing decomposed parents? Against all rows including `in_progress`?).
- **What counts as "every raw failed" for the whole-pass halt.** If `raw/` is empty when triage runs, is that `status: ok` (zero processed) or treated specially? SPEC implies ok-zero; plan should make this explicit so the between-cycle trigger doesn't `engine.paused` on empty `raw/`.
- **Dry-run interaction.** Should `--dry-run` skip triage entirely (the agent spawn is expensive and side-effectful), or run triage but skip the cycle loop? `cli.ts:62-75` currently runs `scanRaw` before the dry-run check; SPEC is silent.
```
