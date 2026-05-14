Now I have enough context to draft the research document.

```markdown
# Research: Cycle 0049

## Cycle Context
SPEC.md asks to close the per-file line-coverage gap on `src/engine/triage.ts` by exercising its five fault-handling `catch` clauses with assertion-bearing tests (event + on-disk queue/file state, not "does not throw"), and to install a per-file line-coverage floor (≥ 95%) for that single file so future regressions surface immediately instead of hiding behind the aggregate `src/` line average. PLAN must choose between (a) a new `scripts/coverage-gate.mjs` parsing Node's coverage output, or (b) extending `src/defaults/prompts/build.md` + `src/defaults/prompts/fix.md` to treat per-file regressions as must-fix. The floor is documented in `CLAUDE.md`.

## Current Codebase State

### Relevant Components

- **Triage engine (sole writer that mutates `raw/` and `tbd.jsonl`)** — `src/engine/triage.ts`. Top-level orchestrator `runTriage` (`src/engine/triage.ts:157`) iterates raws → calls `processRawWithRetry` (`src/engine/triage.ts:90`) → on terminal failure calls `moveToFailed` (`src/engine/triage.ts:649`) → after the loop calls `rewriteOrdering` (`src/engine/triage.ts:669`).
- **Five SPEC-named catch clauses** (each is "best-effort": swallow + continue):
  - `loadRaws` (`src/engine/triage.ts:303-321`) — `try { readdir(...) } catch { return []; }` at line 307-308 (returns empty list when `rawDir` ENOENT). The per-file `readFile` + `parseFrontmatter` inside the `for` loop at line 311-319 has **no per-file try/catch**: a parse failure throws out of `loadRaws` and surfaces as an unhandled `runTriage` rejection.
  - `bumpAttempts` (`src/engine/triage.ts:638-647`) — catch on lines 644-646 around `mutateFrontmatter`. Comment: "raw file may already have been moved or is unwritable." **Currently uncovered** (`triage.ts:645-646` per coverage report).
  - `moveToFailed` (`src/engine/triage.ts:649-667`) — two sibling catches:
    - lines 659-661 around the `mutateFrontmatter` stamp pass ("proceed with rename anyway"). **Currently uncovered.**
    - lines 664-666 around the `rename(raw.srcPath → failed/<id>.md)` ("raw file may have been removed mid-flight"). **Currently uncovered.**
  - `rewriteOrdering` (`src/engine/triage.ts:669-694`) — function body has **no try/catch**; `readQueue` / `writeQueue` errors propagate. SPEC requires a fault test asserting `tbd.jsonl` is byte-for-byte unchanged on failure (atomic tmp-rename invariant guaranteed by `queue.ts:writeQueue` at `src/engine/queue.ts:68-75`).
  - `runClaudecodeAgent` — actually the dispatch wrapper `runAgentViaDispatch` (`src/engine/triage.ts:702-719`). Synchronous `UnknownAgentError` from `resolveAgent` and async `writeFile`/`unlink` failures are caught by `processRawWithRetry`'s try at lines 113-119 and become `lastError = "agent failed: ..."`. Process-spawn ENOENT now surfaces as `{exitCode: -1}` from the underlying agent (per comment at lines 696-701), routed through the non-zero-exit branch at lines 121-125.
- **Inner "best-effort" catches inside `applyRaw` rollback** (not SPEC-named, but in the same file and currently uncovered): `triage.ts:601-606` (unlink-todo rollback catch) and `triage.ts:608-616` (writeQueue rollback catch). Also uncovered: `atomicWrite`'s tmp-cleanup catch at `triage.ts:629-633`.

### Existing Patterns to Follow

- **tmp-repo harness** — `tests/engine/triage.test.ts:49-62` (`setupRepo`): `mkdtemp(join(tmpdir(), "cycle-triage-"))`, creates `.cycle/prompts/`, `docs/cycle/issues/{raw,todo,done,failed}/`, writes a minimal `triage.md` template with `{{RAWS_BLOCK}}` / `{{TBD_JSONL}}` / `{{TODO_LISTING}}` / `{{RETRY_FEEDBACK}}` placeholders. Cleanup in `finally` via `rm(root, { recursive: true, force: true })`.
- **Logger capture** — `makeLog()` at `tests/engine/triage.test.ts:39-47` returns `{ log, events }` where `log.emit(event, fields)` pushes `{ event, fields }` into an array. Tests then assert against `events.find(e => e.event === "...")`.
- **Agent injection (no real spawn)** — `TriageDeps.runAgent` (`src/engine/triage.ts:23-31`) is exported. Tests pass `runTriage(root, cfg, log, { runAgent: async () => ({ exitCode, stdout, stderr }) })`. Throwing from `runAgent` exercises the `processRawWithRetry` try/catch (see `tests/engine/triage.test.ts:854-875` "agent that throws").
- **Filesystem-fault injection via `chmod` + pre-existing directories** — already used in three places:
  - `tests/engine/triage.test.ts:686-687` makes `tbd.jsonl` read-only (`chmod 0o400`) to force `appendRow` failure → exercises `applyRaw` rollback path.
  - `tests/engine/triage.test.ts:727` makes `docs/cycle/issues/done/` unwritable (`chmod 0o500`) to force `rename(raw → done/)` failure → exercises `applyRaw` outer catch.
  - `tests/engine/triage.test.ts:771-774` pre-creates `todo/<id>.md` as a non-empty directory to force `rename(tmp → target)` failure inside `atomicWrite`.
- **No `node:test` `mock.method` usage anywhere in the suite today.** Despite SPEC saying "`node:test` `mock.method` API (already in use elsewhere — see `tests/engine/exec-claudecode.test.ts`)", `grep -rE 'mock\.|t\.mock' tests/` returns zero matches. `tests/engine/exec-claudecode.test.ts:29-47` uses a fake binary on a scoped `PATH` (or `PATH: "/nonexistent"`), not `mock.method`. PLAN should pick one approach and resolve this SPEC inconsistency.
- **Persisted `triage_attempts` retry budget** — `loadRaws` reads `fm.triage_attempts` (`src/engine/triage.ts:316-317`) so `rawBody("id", "title", 2)` in tests (`triage.test.ts:64-77`) starts a raw with 2 prior attempts, leaving only 1 retry left this run. This is the cleanest way to force a single-attempt failure path.

### Dependencies & Integration Points

- **Coverage runner** — `package.json:27` `npm run test:coverage` invokes `node --test --experimental-strip-types --experimental-test-coverage --test-coverage-exclude='dist/**' --test-coverage-exclude='tests/**' --test-coverage-exclude='scripts/**' --test-reporter=spec`. Node 22.22.2 (per `node --version` and project floor `>=22.6` at `package.json:34`).
- **Available coverage knobs on this Node version** (verified via `node --help`):
  - `--test-coverage-lines=`, `--test-coverage-branches=`, `--test-coverage-functions=` — **aggregate-only**, no per-file gate.
  - `--test-coverage-include=...` / `--test-coverage-exclude=...` — pattern filters.
  - `--test-reporter=lcov` — produces standard LCOV (`LF:`/`LH:`/`BRF:`/`BRH:`/`FNF:`/`FNH:` per `SF:` block). Verified per-file emission for `src/engine/triage.ts` works (LCOV section starts with `SF:src/engine/triage.ts`).
  - `NODE_V8_COVERAGE=dir` — v8 raw coverage JSON output.
  - `--test-reporter-destination=...` — supports multiple reporters in one run (so a spec reporter to stdout AND lcov to a file is supported).
- **No `scripts/coverage-gate.mjs` exists today.** `ls scripts/` shows only `build.mjs` and `sync-defaults.mjs`. A new gate script would be net-new.
- **Default-prompt sync mechanism** — option (b) edits go in `src/defaults/prompts/build.md` (`src/defaults/prompts/build.md:30-49`, "Check coverage before declaring done" + "Quality Gates" checklist) and `src/defaults/prompts/fix.md` (`src/defaults/prompts/fix.md:26-31`). After editing, `npm run sync-defaults` (per `CLAUDE.md:25`) copies into `.cycle/prompts/`. The repo's `.cycle/workflows.yml` is intentionally divergent (trunk-based, see `CLAUDE.md:43-46`), but prompt files under `.cycle/prompts/` are not in the divergent set; `sync-defaults` will copy them.
- **`mutateFrontmatter`** (`src/engine/frontmatter.ts:60-71`) — used by `bumpAttempts` and `moveToFailed`. Atomic write via `writeFile(tmp)` + `rename(tmp, path)`. A fault test wanting to force this to throw can either delete the raw file pre-flight (so `readFile` ENOENTs) or `chmod 0o400` the raw file (so the inner `writeFile(tmp)` succeeds but rename will conflict only if the parent is locked — easier path: remove the raw file).
- **`writeQueue` atomicity** (`src/engine/queue.ts:68-75`) — `tmp` write + `rename` to `tbd.jsonl`. Failing the `writeFile(tmp)` (e.g., `chmod 0o500` on `.cycle/`) means `tbd.jsonl` is byte-for-byte untouched — the invariant `rewriteOrdering` faults need to assert.

### Test Infrastructure

- **Test framework**: Node native test runner (`node:test`), spec reporter, strict assert (`node:assert/strict`).
- **Discovery**: default — `node --test` auto-discovers `tests/**/*.test.ts` (no explicit glob in `package.json:25`).
- **File naming**: `<feature>.test.ts` under `tests/engine/` for engine tests, `tests/cli/` for CLI. Multi-file split is the existing convention: `tests/engine/triage.test.ts` (happy + retry), `tests/engine/triage-validator.test.ts`, `tests/engine/triage-dry-run.test.ts`. A new fault-isolation file `tests/engine/triage.faults.test.ts` would match this pattern.
- **Mocking approach**: dependency-injection (`TriageDeps.runAgent`) preferred; otherwise filesystem-fault injection via `chmod` / pre-created-directory tricks; no `node:test` `mock.method` usage in the repo today.
- **Cleanup**: every test has its own `mkdtemp` + `finally { rm(root, { recursive: true, force: true }) }`; `chmod` restores in `finally` before `rm` (see `triage.test.ts:710-716`, `:754-758`).
- **Current coverage of `src/engine/triage.ts`** (just measured, `npm run test:coverage`): **line 98.33% / branch 94.92% / function 97.56%**. Already above the 95% line floor SPEC asks to install — the historical 93.50% baseline cited in SPEC has been improved by intervening cycles. Uncovered lines today: `605-606, 615-616, 632-633, 645-646, 660-661, 665-666` (the six "best-effort" inner-catch line pairs detailed above). Aggregate `src/` is **line 98.61 / branch 92.01 / function 96.32** (`npm run test:coverage` tail).

## Code References

- `src/engine/triage.ts:90-155` — `processRawWithRetry`: holds the three outer try/catches that already capture agent throw (line 113-119), non-zero exit (line 121-125), validator failure (line 135-139), and `apply` throw (line 141-149). All four feed `onAttemptFailed`, which calls `bumpAttempts` + emits `triage.raw.failed`.
- `src/engine/triage.ts:163` — `runAgent = deps.runAgent ?? runAgentViaDispatch` is the DI seam.
- `src/engine/triage.ts:303-321` — `loadRaws`: the `readdir` catch returns `[]` on ENOENT (line 307-308); per-file body parse inside the loop has no isolation.
- `src/engine/triage.ts:600-619` — `applyRaw` outer catch + two inner best-effort catches (uncovered lines 605-606, 615-616).
- `src/engine/triage.ts:622-636` — `atomicWrite`: rename catch with inner unlink catch (uncovered line 632-633). Already exercised by the "atomicWrite cleans up .tmp when rename fails" test at `tests/engine/triage.test.ts:763-797`, but only the outer path — the inner unlink catch (632-633) fires only when the unlink itself throws (e.g., tmp already removed).
- `src/engine/triage.ts:638-647` — `bumpAttempts` with full-body catch (uncovered 645-646).
- `src/engine/triage.ts:649-667` — `moveToFailed` with two sibling catches (uncovered 660-661, 665-666).
- `src/engine/triage.ts:669-694` — `rewriteOrdering`: no try/catch; `writeQueue` failure propagates out of `runTriage`.
- `src/engine/triage.ts:702-719` — `runAgentViaDispatch` (synchronous `resolveAgent` throw covered by `triage.test.ts:799-825`).
- `src/engine/queue.ts:68-75` — `writeQueue`'s tmp-rename atomicity invariant for the `rewriteOrdering` fault assertion.
- `src/engine/frontmatter.ts:60-71` — `mutateFrontmatter`: `readFile → patch → writeFile(tmp) → rename`. Removing the raw file pre-flight makes `readFile` ENOENT and throws — clean way to fault `bumpAttempts` / `moveToFailed`'s stamp pass.
- `package.json:25-27` — test + coverage scripts; `pretest` / `pretest:coverage` auto-build `dist/`.
- `package.json:34` — `engines: node >=22.6`.
- `src/defaults/prompts/build.md:30-49` — coverage gate language ("Check coverage before declaring done", "Quality Gates" checklist). Per-file mention absent.
- `src/defaults/prompts/fix.md:26-31` — coverage gate language. Per-file mention absent.
- `CLAUDE.md:48-56` — "Coverage policy" section: line ≥ 95 / branch ≥ 75 / function ≥ 90 aggregate baseline, no per-file entry today.
- `tests/engine/triage.test.ts:49-62` — `setupRepo()` harness.
- `tests/engine/triage.test.ts:676-717` — `chmod 0o400` on `tbd.jsonl` as fault-injection pattern.
- `tests/engine/triage.test.ts:719-761` — `chmod 0o500` on `done/` directory as fault-injection pattern.
- `tests/engine/triage.test.ts:763-797` — pre-create target-as-directory pattern for forcing `rename` failure.
- `tests/engine/triage.test.ts:854-875` — `runAgent: async () => { throw new Error(...) }` pattern.
- `tests/engine/triage.test.ts:1249-1299` — fake-binary-on-PATH dispatch pattern.

## Open Questions

- **Per-file gate mechanism — script vs prompt (SPEC §Scope item 2)**: PLAN must pick (a) `scripts/coverage-gate.mjs` reading Node's coverage output, or (b) extend `build.md` + `fix.md` to treat per-file regressions in `triage.ts` as must-fix. Resolved-in-PLAN constraints to weigh:
  - Option (a) needs a stable parse target. `--test-reporter=spec`'s coverage table is human-formatted (ANSI colors, fixed columns, see the report tail above) and not contract-stable. The contract-stable surface is `--test-reporter=lcov` (`LF:`/`LH:` lines per `SF:` block). The PLAN should commit to `lcov` for parsing if option (a) is chosen.
  - Option (a) must integrate with `pretest:coverage` or a new `npm run check:coverage` and have a non-zero exit on per-file regression — the existing `test:coverage` script's reporter is `spec` only, so adding `--test-reporter=lcov --test-reporter-destination=.cycle/coverage.lcov` alongside is required.
  - Option (b) has no enforcement teeth — the agent has to read `triage.ts < 95%` off the coverage table and self-flag. The "deliberate red test proof" requirement in SPEC §Acceptance reads more naturally against an exit-code-bearing gate (option a).
- **fault-injection mechanism — `mock.method` vs `chmod`/DI (SPEC §Requirements first bullet)**: SPEC says "dependency-injection where production code already accepts a shim, otherwise scoped `mock.method` on `node:fs/promises`". DI exists for `runAgent` only. The remaining four catches (`loadRaws` per-file failure, `bumpAttempts`, `moveToFailed`, `rewriteOrdering`) have no DI seam — they all use `node:fs/promises` directly. SPEC also says `mock.method` is "already in use elsewhere — see `tests/engine/exec-claudecode.test.ts`", but `grep` confirms the suite has zero `mock.method` calls; `exec-claudecode.test.ts` uses fake binaries on PATH. PLAN should explicitly choose: (i) introduce `t.mock.method(fs, "rename", …)` as a new pattern, or (ii) stay with the existing `chmod` / pre-create-as-directory pattern that already covers two analogous catches in `triage.test.ts:676-797`.
- **`rewriteOrdering` fault assertion target**: SPEC requires "`tbd.jsonl` byte-for-byte unchanged after failure". The atomicity guarantee comes from `queue.ts:writeQueue`'s tmp + rename (`src/engine/queue.ts:68-75`). To force failure inside `writeQueue` deterministically requires either chmod'ing `.cycle/` (blocks `writeFile(tmp)`) or `mock.method`ing `fs.rename`. PLAN should pick one and document the failure injection point.
- **Scope of the per-file floor (option (a))**: SPEC §Out-of-Scope says option (a) must "still ship configured only for `triage.ts`" — PLAN must decide whether the script accepts a config file / cmd args / hard-coded constant for `{ "src/engine/triage.ts": { line: 95 } }`, and whether this lives in `scripts/coverage-gate.mjs` or a sibling JSON.
- **Whether the inner `applyRaw` / `atomicWrite` catches (`triage.ts:601-619`, `:629-633`) are in scope**: SPEC §Scope lists five named catches and excludes refactoring. The three "best-effort inner" catches are currently uncovered and contribute to the per-file gap, but they are not in SPEC's named-five list. PLAN should decide whether to cover them opportunistically (cheap — same fault-injection harness) or defer them as "dead-catch deletion follow-up" per SPEC §In-Scope third bullet.
```
