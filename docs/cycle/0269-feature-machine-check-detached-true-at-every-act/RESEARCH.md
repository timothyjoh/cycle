# Research: Cycle 0269

## Cycle Context
This cycle extends the build-time structural-invariants gate so that the
process-group reaping contract — every active-child spawn site must pass
`detached: true` — is **machine-checked**, not merely documented. Today
`scripts/structural-invariants.mjs` verifies (via `validateActiveChildRegistration`,
cycle 0267) only that each spawning `src/engine/exec-*.ts` lane pairs
`registerActiveChild`/`unregisterActiveChild`; a lane could register its child
yet omit `detached: true`, pass the build, and silently break both the reaper
group-kill (`killActiveChildren`, `process.kill(-pid, sig)`) and the cycle-0268
group-liveness probe (`anyChildAlive`, `process.kill(-pid, 0)`). The cycle adds a
new exported relational predicate `validateDetachedSpawn(text, file)`, registers
it as one `INVARIANTS` entry per existing exec lane, covers its branches with
in-process tests, and updates CLAUDE.md — **no engine runtime behavior changes**.

## Current Codebase State

### Relevant Components
- Structural-invariants gate: the single module to extend — `scripts/structural-invariants.mjs`
- Existing sibling relational predicate `validateActiveChildRegistration(text, file)` — `scripts/structural-invariants.mjs:97-113`
- Per-lane registration of that predicate (the array-`.map` list mechanism the new entries must mirror) — `scripts/structural-invariants.mjs:287-293`
- Anchored regex probes (`SPAWN_CALL`, `REGISTER_CHILD`, `UNREGISTER_CHILD`) — `scripts/structural-invariants.mjs:36-38`
- Dispatch loop `runInvariants(invariants, cwd)` (exported, import-safe) — `scripts/structural-invariants.mjs:306-359`
- CLI main guard (runs gate only under `import.meta`) — `scripts/structural-invariants.mjs:362-370`
- Tests for the predicates and dispatch — `tests/scripts/structural-invariants.test.ts`

### The three current spawn sites (all already compliant)
- `src/engine/exec-spawn.ts:30` — `const base = { …, detached: true }`; spawned at `src/engine/exec-spawn.ts:43-44` (`spawn(binary, finalArgv, base)` / `{ ...base, stdio: … }`). The `detached: true` lives in the `base` options object, **not** inline on the `spawn(` call line.
- `src/engine/exec-bash.ts:33` — `spawn(shell.path, [abs], { … detached: true … })`; `detached: true` is inline at `src/engine/exec-bash.ts:37`.
- `src/engine/walkthrough.ts:97` — `spawn(shell.path, [hookAbsPath], { … })`; `detached: true` inline at `src/engine/walkthrough.ts:101`.
- The agent lanes `exec-claudecode.ts`, `exec-codex.ts`, `exec-gemini.ts`, `exec-opencode.ts`, `exec-pi.ts`, `exec-auggie.ts` contain **no** `spawn(` (they delegate to `execSpawn`) and `exec-spawn.ts` contains **no** `spawnSync` — so the new predicate passes vacuously for those agent lanes registered in the per-lane list.

> Note: the existing active-child per-lane list (`scripts/structural-invariants.mjs:287-288`) covers exactly `exec-spawn`, `exec-bash`, `exec-auggie`, `exec-claudecode`, `exec-codex`, `exec-gemini`, `exec-opencode`, `exec-pi` — **`walkthrough` is not in that list** (it is not an `exec-*.ts` file). The SPEC scopes the new predicate to `src/engine/exec-*.ts` lanes; the planner must decide whether `walkthrough.ts` is also registered (it spawns + registers a child but is outside the `exec-*` naming the existing list uses).

### Existing Patterns to Follow
- Relational predicate shape: exported `function name(text, file)` returning `{ ok, actual?, message? }`; vacuous pass returns `{ ok: true, actual: 'no spawn( — vacuous' }`; genuine failure returns a named `{ ok: false, message }` that **names the file** and gives actionable remediation; never throws — `scripts/structural-invariants.mjs:97-113`.
- Anchored-regex convention: `/\bspawn\s*\(/` (the `\b` excludes `spawnSync(`); SPEC requires a `detached\s*:\s*true` probe for the option — `scripts/structural-invariants.mjs:36`.
- Co-located JSDoc + `// @ts-check`: each exported predicate carries a `@param`/`@returns` JSDoc block (type-checked via `// @ts-check` at file top + repo-wide `allowJs`), so the test imports the real export with no `.d.mts` mirror — `scripts/structural-invariants.mjs:88-96`, file header line 2.
- Per-lane registration via spread `.map`: `...[lane names].map((name) => ({ file: \`src/engine/${name}.ts\`, validate: <predicate>, reason: '…' }))` — `scripts/structural-invariants.mjs:287-293`. The new entries must use this same mechanism so a new lane is covered by adding one name.
- The `Invariant` typedef (relational kind requires `validate`) — `scripts/structural-invariants.mjs:40-52`.
- Failure handling: a thrown predicate is contained as a FAIL by the dispatch loop (try/catch around `entry.validate(text, file)`), never coerced to a pass — `scripts/structural-invariants.mjs:324-332`. A relational `!res || !res.ok` prints `FAIL <file> -- <reason>: <message>` to `console.error` and increments `failed` — `scripts/structural-invariants.mjs:333-340`. An unreadable target file throws a tagged `exitCode = 2` error → CLI exit 2 — `scripts/structural-invariants.mjs:311-319, 366-369`.
- Observability: results are `console.log`/`console.error` lines (`structural-invariants: ok -- …` / `… FAIL …`); CLI exit codes 0 (all pass) / 1 (any fail) / 2 (unreadable file). No `.cycle/log.jsonl` events — this is a build-time gate, not an engine runtime path.
- Idempotency / retry-safety: not applicable — the gate is a pure read-only file scan with no locks/state; `runInvariants` is deterministic over its input array and cwd.

### Dependencies & Integration Points
- Invoked via `npm run check:invariants`, which runs automatically after `test:coverage` (per CLAUDE.md "Commands" + "Structural-invariants policy") — `scripts/structural-invariants.mjs`.
- `runInvariants` / `INVARIANTS` / `validateActiveChildRegistration` are imported by the test — `tests/scripts/structural-invariants.test.ts:7`. The new predicate must be exported the same way for in-process testing.
- Runtime consumers of the `detached: true` assumption (NOT modified this cycle): `killActiveChildren` (`process.kill(-pid, sig)`) and `anyChildAlive` (`process.kill(-pid, 0)`) in `src/engine/active-child.ts`; the spawn sites listed above.
- Type-checking: `npm run typecheck` (`tsc --noEmit`) covers the `.mjs` via `allowJs` + `// @ts-check`; the new predicate's JSDoc must match its implementation or typecheck fails.

### Test Infrastructure
- Test framework: Node's built-in runner (`node --test`, `node:test` + `node:assert`) — `tests/scripts/structural-invariants.test.ts:1-2`.
- Test conventions: in-process driving of the real exported predicate (the module is import-safe — gate runs only under the `import.meta` guard). Helpers in the file: `run(cwd)` spawns the script via `spawnSync(process.execPath, [SCRIPT], …)` — `tests/scripts/structural-invariants.test.ts:63`; `captureConsoleError()` (used at lines 304, 324) to assert `console.error` lines; `mkdtemp`/`writeFile`/`rm` temp-dir fixtures for synthetic lanes (lines 291-317).
- Existing predicate tests to mirror for `validateDetachedSpawn`:
  - vacuous no-spawn pass — `tests/scripts/structural-invariants.test.ts:253-257`
  - spawn paired (happy) — `:259-263`
  - spawn missing call → fail naming file — `:265-272`
  - `spawnSync(`-only substring trap → vacuous pass — `:284-289`
  - dispatch-level fail via `runInvariants([entry], root)` against a synthetic temp lane — `:291-317`
  - dispatch-level pass against real `exec-spawn.ts` — `:319-332`
  - real-repo exit-0 regression pins — `:334-344`
- Failure-path test coverage: yes — `validateActiveChildRegistration` failure path (`{ ok: false }`, message contents, anchor guards) is covered at lines 265-289, and the dispatch FAIL path at 291-317. The new predicate's failure path should follow the same shape.
- Coverage: `scripts/**` is included in `test:coverage`; CLAUDE.md does not list a per-file floor specific to `structural-invariants.mjs`, so the global floors apply (Line ≥ 95%, Branch ≥ 75%, Function ≥ 90%) — the new predicate's branches (vacuous / pass / fail) must be exercised.

## Code References
- `scripts/structural-invariants.mjs:36` — `const SPAWN_CALL = /\bspawn\s*\(/` (reusable spawn probe; `\b` excludes `spawnSync(`).
- `scripts/structural-invariants.mjs:97-113` — `validateActiveChildRegistration`, the structural template for the new `validateDetachedSpawn`.
- `scripts/structural-invariants.mjs:287-293` — per-lane `.map` registration list to extend with the new entries.
- `scripts/structural-invariants.mjs:321-340` — relational dispatch (throw-containment + FAIL/ok emission).
- `src/engine/exec-spawn.ts:30,43-44` — `detached: true` in `base`, applied at the `spawn(` calls (option not inline on the call line).
- `src/engine/exec-bash.ts:33,37` — inline `detached: true` spawn.
- `src/engine/walkthrough.ts:97,101` — inline `detached: true` spawn (outside the `exec-*` naming).
- `tests/scripts/structural-invariants.test.ts:253-344` — the predicate + dispatch + real-repo test block to extend.

## Open Questions
- Should `src/engine/walkthrough.ts` be added to the new predicate's per-lane list? It spawns a detached, registered child but is **not** an `exec-*.ts` file and is **not** in the existing active-child registration list. SPEC scope text says "each existing `exec-*.ts` lane" and lists "the three current spawning lanes" (which include `walkthrough.ts` in the WHY prose) — the per-lane list mechanism currently omits it. The planner must reconcile whether to mirror the existing 8-entry `exec-*` list verbatim or also cover `walkthrough.ts`.
- The `detached\s*:\s*true` probe operates over whole-file `text` (matching how `validateActiveChildRegistration` scans the full file), so `exec-spawn.ts`'s `detached: true` in the `base` object (not on the `spawn(` line) passes — confirm the planner keeps file-level (not line-adjacency) detection to avoid a false failure on `exec-spawn.ts`.
