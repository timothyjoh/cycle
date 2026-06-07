# Implementation Plan: Cycle 0269

## Overview
Add a build-time structural invariant that machine-checks the process-group reaping contract: every `src/engine/exec-*.ts` lane that calls `spawn(` must also pass `detached: true`. This closes the gap between the documented invariant and what `npm run check:invariants` actually verifies — no engine runtime behavior changes.

## Current State (from Research)
- `scripts/structural-invariants.mjs` is import-safe (gate runs only under the `import.meta` CLI main guard); it exports `INVARIANTS`, `runInvariants(invariants, cwd)`, and the relational predicate `validateActiveChildRegistration(text, file)`.
- The cycle-0267 predicate verifies only the `registerActiveChild`/`unregisterActiveChild` pairing. A lane could register its child yet omit `detached: true`, pass the build, and silently break `killActiveChildren` (`process.kill(-pid, sig)`) and `anyChildAlive` (`process.kill(-pid, 0)`).
- Anchored regex convention exists: `const SPAWN_CALL = /\bspawn\s*\(/;` at `scripts/structural-invariants.mjs:36` — the `\b` excludes `spawnSync(`.
- The per-lane registration list is a spread `.map` over 8 names at `scripts/structural-invariants.mjs:287-293`: `exec-spawn`, `exec-bash`, `exec-auggie`, `exec-claudecode`, `exec-codex`, `exec-gemini`, `exec-opencode`, `exec-pi`.
- Relational predicate shape: exported `function name(text, file)` returning `{ ok, actual?, message? }`; vacuous pass `{ ok: true, actual: 'no spawn( — vacuous' }`; genuine failure `{ ok: false, message }` naming the file; never throws. Co-located JSDoc (`@param`/`@returns`) type-checked via `// @ts-check` + repo-wide `allowJs`.
- Dispatch (`scripts/structural-invariants.mjs:321-340`) contains any predicate throw as a FAIL, emits `FAIL <file> -- <reason>: <message>` on failure and `ok -- <file> <reason>: <actual>` on pass; unreadable file ⇒ tagged `exitCode = 2`.
- The three current spawn sites all comply: `exec-spawn.ts` (`detached: true` in the `base` options object, not on the `spawn(` line), `exec-bash.ts` (inline), `walkthrough.ts` (inline). The 6 agent lanes contain no `spawn(` and pass vacuously.
- Tests live in `tests/scripts/structural-invariants.test.ts` (`node --test`, `node:test` + `node:assert`); the predicate + dispatch + real-repo block is at lines 253-344, importing the real exports in-process.

### Open Questions Resolved
1. **Should `walkthrough.ts` be added to the new predicate's per-lane list?** **No.** The SPEC scopes the predicate to "each existing `exec-*.ts` lane" and Acceptance Criterion 2 ties it to "the same per-lane list that carries `validateActiveChildRegistration`" — the existing 8-entry `exec-*` list. `walkthrough.ts` is not an `exec-*.ts` file and is not in that list. Mirroring the 8-entry list verbatim keeps the two relational entry-sets in lockstep and respects scope. (`walkthrough.ts`'s `detached: true` is already correct; covering it would be a separate scope-creep change and is explicitly out of scope per "the existing fixed-file-per-entry dispatch is preserved.")
2. **File-level vs line-adjacency detection?** **File-level**, matching `validateActiveChildRegistration` which scans whole-file `text`. This is required: `exec-spawn.ts` places `detached: true` in the `base` object (not on the `spawn(` call line), so line-adjacency detection would false-fail it. The `detached\s*:\s*true` probe runs over the full file text.

## Desired End State
`scripts/structural-invariants.mjs` exports a new `validateDetachedSpawn(text, file)` predicate, registered as one `INVARIANTS` entry per the same 8 `exec-*` lanes. `npm run check:invariants` exits 0 against the current tree (all spawning lanes compliant) and prints 8 additional `ok` lines; introducing a `spawn(` without `detached: true` in a registered lane makes it exit non-zero with a message naming the offending file. `npm run typecheck`, `npm test`, and coverage gates all pass.

Verify: `npm run check:invariants` (exit 0, new `ok` lines present), `npm run typecheck` (clean), `npm test` (all pass including new predicate tests).

## What We're NOT Doing
- No change to runtime reaper behavior (`killActiveChildren`, `anyChildAlive`, `active-child.ts`) or any spawn site — they already comply.
- Not adding `walkthrough.ts` to the per-lane list (outside `exec-*` scope; see resolved open question 1).
- Not collapsing the per-lane list into glob/auto-discovery — the fixed-file-per-entry dispatch is preserved.
- Not asserting `detached: true` on `spawnSync(` call sites — only group-reaped async `spawn(` children require it.
- No user-facing CLI change, no README change.

## Implementation Approach
Add one new anchored regex (`DETACHED_TRUE = /detached\s*:\s*true/`) and one new exported relational predicate `validateDetachedSpawn` immediately after `validateActiveChildRegistration`, mirroring its exact shape (vacuous no-spawn pass / spawn-with-detached pass / spawn-without-detached named failure, never throws). Register it via a second spread `.map` over the same 8 lane names directly after the existing active-child `.map`. Extend the test block to cover the three predicate branches plus the `spawnSync(` substring trap and a dispatch-level fail against a synthetic temp lane, following the existing test fixtures verbatim. Update CLAUDE.md's two relevant paragraphs. This is a single-file source change plus tests plus docs — one vertical slice broken into three tasks for clarity.

## Failure & Resilience Decisions

**Task 1 (predicate + registration)** — operates on in-memory file text passed by the dispatch loop.
- **Failure modes**: A malformed regex or logic error would mis-classify a lane. Mitigated by the predicate being a pure function over `(text, file)` with explicit branch returns and full branch-test coverage. A predicate throw (defensive) is contained by the existing dispatch try/catch as a FAIL — never coerced to a pass.
- **Idempotency**: N/A — pure function, deterministic over its input; the gate is a read-only file scan with no state/locks. Safe to re-run (the engine retries build steps; re-running the gate is byte-for-byte identical).
- **Observability**: On failure the dispatch emits `structural-invariants: FAIL <file> -- <reason>: <message>` to `console.error` and the CLI exits non-zero; on pass, `ok -- <file> <reason>: <actual>` to `console.log`. The predicate's `message` names the offending file and the `detached: true` remediation.
- **No silent failure**: The predicate returns a named `{ ok: false, message }` for the genuine missing-`detached` case (surfaces to dispatch → `console.error` → exit 1); a throw is contained as a FAIL, not swallowed.

**Task 2 (tests)** — N/A — test code; failure surfaces as a failing assertion / non-zero `node --test` exit.

**Task 3 (docs)** — N/A — pure documentation edit, no failure surface.

---

## Task 1: Add `validateDetachedSpawn` predicate and register it per exec lane

### Overview
Add the new anchored option probe, the exported predicate, and its per-lane `INVARIANTS` registration.

### Changes Required

**File**: `scripts/structural-invariants.mjs`

**Change 1 — add the option probe** near the existing `SPAWN_CALL` declaration (after line 38):
```js
// detached: true is the process-group-leader flag that makes -pid (the negated
// pid) name the child's own group, so killActiveChildren's process.kill(-pid,sig)
// and anyChildAlive's process.kill(-pid,0) reap/probe the whole subtree (cycle
// 0265/0268). Scanned file-level (not line-adjacent) because exec-spawn.ts puts
// detached: true in a shared `base` options object, not on the spawn( call line.
const DETACHED_TRUE = /detached\s*:\s*true/;
```

**Change 2 — add the exported predicate** immediately after `validateActiveChildRegistration` (after line 113), with co-located JSDoc:
```js
/**
 * Every src/engine/exec-*.ts lane that calls spawn( must also pass detached:true
 * so the spawned child is its own process-group leader and the reaper's -pid
 * group-kill/-probe reaches the whole subtree (cycle 0265/0268). A lane with no
 * spawn( passes vacuously. Returns a named { ok:false, message } (does not throw)
 * for the genuine missing-detached case so the operator sees file + remediation.
 * Scanned file-level: detached:true may live in a shared options object, not on
 * the spawn( call line (exec-spawn.ts).
 * @param {string} text
 * @param {string} file
 * @returns {{ ok: boolean, actual?: string, message?: string }}
 */
export function validateDetachedSpawn(text, file) {
  if (!SPAWN_CALL.test(text)) return { ok: true, actual: 'no spawn( — vacuous' };
  if (!DETACHED_TRUE.test(text)) {
    return {
      ok: false,
      message:
        `${file} calls spawn( but does not pass detached: true — every ` +
        'active-child spawn site must be its own process-group leader so the ' +
        'reaper\'s process.kill(-pid, …) group-kill/-probe reaches the whole ' +
        'subtree on suspend (cycle 0265/0268). Add detached: true to the spawn ' +
        'options.',
    };
  }
  return { ok: true, actual: 'spawn( with detached: true' };
}
```

**Change 3 — register one entry per lane** directly after the existing active-child `.map` block (after line 293, before the closing `];`):
```js
  // --- Exec-lane detached-spawn (cycle 0269) ---
  // Any src/engine/exec-*.ts lane that calls spawn( must pass detached:true so
  // the child is its own process-group leader and the reaper's -pid group-kill
  // (killActiveChildren) and group-probe (anyChildAlive) reach the whole subtree
  // on suspend (cycle 0265/0268). One relational entry per current lane sharing
  // validateDetachedSpawn; non-spawning lanes pass vacuously. Mirrors the
  // active-child list above — when adding a new exec lane, register its entry here.
  ...['exec-spawn', 'exec-bash', 'exec-auggie', 'exec-claudecode',
    'exec-codex', 'exec-gemini', 'exec-opencode', 'exec-pi'].map((name) => ({
    file: `src/engine/${name}.ts`,
    validate: validateDetachedSpawn,
    reason:
      'detached-spawn: a spawn( lane must pass detached: true so the reaper can group-kill/-probe the subtree on suspend (cycle 0265/0268)',
  })),
```

### Success Criteria
- [ ] `npm run check:invariants` exits 0 with 8 new `ok -- src/engine/<lane>.ts … detached-spawn …` lines (`exec-spawn`/`exec-bash` report `spawn( with detached: true`; the 6 agent lanes report `no spawn( — vacuous`).
- [ ] `npm run typecheck` passes (JSDoc matches implementation).
- [ ] `validateDetachedSpawn` is exported alongside `validateActiveChildRegistration`.
- [ ] Failure paths behave as designed: a `spawn(`-without-`detached` lane yields a named `{ ok: false, message }`, surfaced by dispatch as a `FAIL` line + exit 1; no error swallowed.

---

## Task 2: Cover the predicate's branches with in-process tests

### Overview
Add tests mirroring the existing `validateActiveChildRegistration` block, driving the real exported predicate and the dispatch.

### Changes Required

**File**: `tests/scripts/structural-invariants.test.ts`

**Change 1 — import the new predicate** (extend the import at line 7):
```ts
import { runInvariants, INVARIANTS, validateActiveChildRegistration, validateDetachedSpawn } from "../../scripts/structural-invariants.mjs";
```

**Change 2 — add tests** after the existing `validateActiveChildRegistration` block (~line 344), mirroring those fixtures:
- **Happy path**: `validateDetachedSpawn("spawn(bin, argv, { detached: true })", "f.ts")` ⇒ `{ ok: true }`, `actual === "spawn( with detached: true"`.
- **Vacuous (no spawn)**: `validateDetachedSpawn("const x = 1;", "f.ts")` ⇒ `{ ok: true, actual: "no spawn( — vacuous" }`.
- **Failure path**: `validateDetachedSpawn("spawn(bin, argv, { stdio: 'inherit' })", "src/engine/exec-x.ts")` ⇒ `{ ok: false }`; assert `message` includes the file name `"src/engine/exec-x.ts"` and `"detached: true"`; assert the call **does not throw** (wrap in `assert.doesNotThrow` or assert directly on the returned object).
- **Substring trap**: `validateDetachedSpawn("spawnSync(bin, argv, { stdio: 'inherit' })", "f.ts")` ⇒ `{ ok: true, actual: "no spawn( — vacuous" }` (the `\b` anchor excludes `spawnSync(`).
- **Whitespace tolerance** (optional but cheap): `validateDetachedSpawn("spawn ( bin ); detached : true", "f.ts")` ⇒ `{ ok: true }` (confirms `\s*` in both probes).
- **Dispatch-level fail**: in a `mkdtemp` temp dir write a synthetic `src/engine/exec-x.ts` containing `spawn(` without `detached`, run `runInvariants([{ file: "src/engine/exec-x.ts", validate: validateDetachedSpawn, reason: "detached-spawn" }], root)`, assert returns `1` and (via `captureConsoleError()`) a `FAIL … src/engine/exec-x.ts` line is emitted.
- **Dispatch-level pass**: run the same single-entry `runInvariants` against the real repo root for `src/engine/exec-spawn.ts`, assert returns `0` (confirms file-level detection finds `detached: true` in the `base` object).
- **Real-repo regression**: confirm the existing full-suite `runInvariants(INVARIANTS, repoRoot)` exit-0 pin still passes (the 8 new entries are all compliant) — extend/rely on the existing assertion at `tests/scripts/structural-invariants.test.ts:334-344`.

### Success Criteria
- [ ] `npm test` passes including all new cases.
- [ ] Each predicate branch (vacuous / pass / fail) and the `spawnSync(` trap is exercised, satisfying global coverage floors (Line ≥ 95%, Branch ≥ 75%, Function ≥ 90%).
- [ ] The failure-path test asserts both the `{ ok: false }` shape and that the predicate does not throw.

---

## Task 3: Update CLAUDE.md structural-invariants notes

### Overview
Record the new `detached: true` machine-check alongside the cycle-0265/0267 active-child-registration entry.

### Changes Required

**File**: `CLAUDE.md`

**Change 1 — structural-invariants policy paragraph**: after the sentence describing exec-lane active-child registration ("Exec-lane **active-child registration** is likewise machine-checked (cycle 0267)…"), add that each spawning `exec-*.ts` lane is now also machine-checked (cycle 0269) for `detached: true` via the shared `validateDetachedSpawn` predicate, registered as one relational entry per lane (mirroring the active-child list); non-spawning lanes pass vacuously, and a new lane is covered by adding its per-lane entry.

**Change 2 — "adding an agent / if the new exec lane spawns a child process" note** (the `> **Note:**` block, item (c)): extend item (c) to state that a spawning lane must also pass `detached: true` and that this is machine-checked by `validateDetachedSpawn` — register its per-lane entry (cycle 0269) alongside the active-child-registration entry.

> **Note**: `AGENTS.md` — verify whether the file exists in-repo; if it mirrors CLAUDE.md's structural-invariants section, apply the same two edits. If absent, no action (do not create it). No `npm run sync-defaults` needed (no `src/defaults/` change).

### Success Criteria
- [ ] CLAUDE.md's structural-invariants policy paragraph and the adding-an-agent note both record the cycle-0269 `detached: true` check and the per-lane-entry extension rule.
- [ ] No source/test change in this task; docs accurately describe Task 1's behavior.

---

## SPEC Acceptance Traceability

| SPEC Acceptance Bullet (verbatim) | Covering Task | Notes |
|---|---|---|
| `[ ] A new exported predicate in scripts/structural-invariants.mjs returns { ok: false } for source text containing spawn( without detached: true, and { ok: true } both for text containing spawn( with detached: true and for text containing no spawn(.` | Task 1 (predicate), Task 2 (tests) | Predicate's three branches |
| `[ ] The predicate is registered as one INVARIANTS entry for each existing exec-*.ts lane (the same per-lane list that carries validateActiveChildRegistration).` | Task 1 | 8-entry `.map` mirroring the active-child list; `walkthrough.ts` excluded per resolved open question 1 |
| `[ ] (user-observable benefit) Running npm run check:invariants against the current tree exits 0; introducing a spawn( without detached: true in a registered-child lane makes it exit non-zero with a message naming the offending file — verified by an in-process test feeding such text to the predicate and asserting the failure.` | Task 1, Task 2 | Real-repo exit-0 pin + dispatch-level fail test |
| `[ ] (failure-path) A test asserts the predicate returns { ok: false, message } (and does not throw) for spawn(-without-detached text, and the message names the file and the detached: true remediation.` | Task 2 | Failure-path test asserts shape, no-throw, file name, remediation text |
| `[ ] npm run typecheck passes (the co-located JSDoc matches the new predicate's implementation).` | Task 1 | JSDoc `@param`/`@returns` block on `validateDetachedSpawn` |
| `[ ] All existing tests still pass (npm test).` | Task 1, Task 2, Task 3 | Regression pin; 8 new compliant entries |
| `[ ] No compiler/linter warnings introduced.` | Task 1, Task 2, Task 3 | typecheck clean, anchored regexes, no unused symbols |

## Testing Strategy

### Unit Tests
- **`validateDetachedSpawn` branches**: happy path (`spawn(` + `detached: true` ⇒ `{ ok: true, actual: "spawn( with detached: true" }`); vacuous (no `spawn(` ⇒ `{ ok: true, actual: "no spawn( — vacuous" }`); failure (`spawn(` without `detached` ⇒ `{ ok: false }` naming file + remediation).
- **Failure-path tests** (per named failure modes): synthetic `spawn(`-without-`detached` text exercises the missing-`detached` branch and asserts no throw + message contents; `spawnSync(`-only text exercises the `\b` anchor (substring trap stays vacuous); optional whitespace-variant text exercises the `\s*` tolerance.
- **Mocking strategy**: none — drive the real exported predicate directly (anti-mock); use real `mkdtemp`/`writeFile`/`rm` temp-dir fixtures and the real `runInvariants` for dispatch-level cases, exactly as the existing block does.

### Integration / E2E Tests
- **Dispatch-level fail**: synthetic temp lane + single-entry `runInvariants` returns `1` and emits the `FAIL` line (via `captureConsoleError()`).
- **Dispatch-level pass**: single-entry `runInvariants` against the real `src/engine/exec-spawn.ts` returns `0` (file-level detection finds `detached: true` in `base`).
- **Real-repo regression**: full `runInvariants(INVARIANTS, repoRoot)` exit-0 pin (existing assertion) confirms all 8 new entries pass with the current tree.
- No UI changes — no browser/E2E required.

## Risk Assessment
- **False failure on `exec-spawn.ts`** (its `detached: true` is in the `base` object, not on the `spawn(` line): mitigated by file-level detection over whole-file `text` (resolved open question 2) and a dedicated dispatch-level pass test against the real file.
- **`spawnSync(` false trip**: mitigated by reusing the existing `\bspawn\s*\(` anchor and an explicit substring-trap test.
- **Scope ambiguity on `walkthrough.ts`**: resolved to mirror the existing 8-entry `exec-*` list (open question 1); `walkthrough.ts` already complies and covering it is explicitly out of scope.
- **Coverage floor regression**: mitigated by exercising every predicate branch; no per-file floor is declared for `structural-invariants.mjs`, so global floors apply and are met by the new tests.
