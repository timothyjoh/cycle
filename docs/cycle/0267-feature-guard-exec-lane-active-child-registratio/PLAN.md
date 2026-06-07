# Implementation Plan: Cycle 0267

## Overview
Add a relational `validate`-style invariant to `scripts/structural-invariants.mjs` — a shared predicate `validateActiveChildRegistration`, registered as one entry per `src/engine/exec-*.ts` lane — that fails the build when any lane calling `spawn(` omits `registerActiveChild` or `unregisterActiveChild`, machine-enforcing the cycle-0265 orphan-reap convention.

## Current State (from Research)
- `scripts/structural-invariants.mjs` is the single source of truth: `INVARIANTS` array, `runInvariants(invariants, cwd)` dispatch (reads exactly **one file per entry**), `import.meta` CLI main guard. Two entry kinds: count-based and relational (`{ file, validate, reason }`).
- The canonical relational predicate to mirror is `validateResidueArmPersist` (`scripts/structural-invariants.mjs:48-76`): module-level regex constants → line/text scan → `{ ok:false, message }` or `{ ok:true, actual }`. It is a plain `function` (not exported); tests drive it through `runInvariants`.
- Dispatch contract (`:269-304`): a relational predicate that throws is contained as a FAIL (`predicate threw:`); a `!ok` result emits `structural-invariants: FAIL <file> -- <reason>: <message>`; an unreadable target file throws a tagged `exitCode = 2`; a malformed entry (no `pattern`/`validate`) is a FAIL.
- Spawning lanes (must pass): `src/engine/exec-spawn.ts` and `src/engine/exec-bash.ts` — both `import { spawn }`, call `spawn(...)`, and call `registerActiveChild`/`unregisterActiveChild`. Verified by grep: only these two `exec-*.ts` files contain `spawn(`.
- Non-spawning lanes (must pass vacuously): `exec-auggie.ts`, `exec-claudecode.ts`, `exec-codex.ts`, `exec-gemini.ts`, `exec-opencode.ts`, `exec-pi.ts`. `exec-types.ts` is type-only (no entry needed).
- Registry contract: `registerActiveChild`/`unregisterActiveChild` in `src/engine/active-child.ts`.
- The `.mjs` carries `// @ts-check` + an `Invariant` typedef whose `validate` field is `(text: string, file: string) => { ok: boolean, actual?: string, message?: string }`; the repo-wide `allowJs` type-checks it.
- Test harness `tests/scripts/structural-invariants.test.ts`: a `setup(cwd, content, cliContent)` helper materializes a synthetic repo tree and writes `src/engine/exec-<agent>.ts` stubs for the **6 agent lanes** (claudecode/codex/gemini/opencode/auggie/pi) — but **not** `exec-spawn.ts` / `exec-bash.ts`. Subprocess driver `run(cwd)` runs the full `INVARIANTS` table; in-process driver `runInvariants([entry], cwd)` + `captureConsoleError()` drives single entries. Real-repo regression pins at `:242-252` assert exit 0 / empty stderr / specific ok lines.

### Resolved Open Questions
- **Entry granularity vs. "one entry"** (RESEARCH `:61`): The dispatch reads one fixed file per entry and does not glob; a single entry therefore cannot span the file set, and a directory `file` would throw `EISDIR`/exit 2. Reading the directory *inside* the predicate is rejected — it contradicts the SPEC's "minimal and structural (string/regex presence)" requirement and the `(text, file)` typedef. **Decision:** define **one shared named predicate** and register it as **one relational entry per current `src/engine/exec-*.ts` lane** (all 8, excluding type-only `exec-types.ts`). This is the option-(a) reconciliation RESEARCH flagged, is uniform with the existing per-lane hermeticity block, and makes the spawning lanes genuinely checked while non-spawners pass vacuously as live production paths. A new lane is covered by adding its entry — captured as a CLAUDE.md agent-add checklist line (same manual-mirror posture already documented for the agent fleet).
- **`setup` helper impact** (RESEARCH `:62`): The new entries for `exec-spawn.ts` / `exec-bash.ts` would throw `cannot read` (exit 2) against the synthetic tree because `setup` does not write them. **Decision:** extend `setup` to write passing stubs for both (containing `spawn(` + `registerActiveChild(` + `unregisterActiveChild(`). The 6 agent stubs already written have no `spawn(` and pass vacuously — no change. This addition is required identically regardless of granularity, so it imposes no extra cost.
- **`detached: true` enforcement** (RESEARCH `:63`): Out of scope per SPEC `:27`. Not checked.

## Desired End State
`npm run check:invariants` (and `npm test`) emits one `ok -- src/engine/exec-*.ts active-child registration …` line per exec lane and exits 0 against the current tree. Editing (or adding) any `exec-*.ts` lane to call `spawn(` without both registry calls produces `structural-invariants: FAIL <file> -- … : <file> calls spawn( but is missing …` and a non-zero exit. Verify: `npm run check:invariants && echo OK`; `npm test`; `npm run typecheck`.

## What We're NOT Doing
- No change to any `exec-*.ts` runtime behavior (`exec-spawn.ts`, `exec-bash.ts`, or any lane).
- No `detached: true` enforcement.
- No new dispatch machinery — `runInvariants` is reused as-is.
- No directory-globbing / fs access inside the predicate.
- No agent-fleet-consistency invariant (REGISTRY ↔ `Step.agent` ↔ `exec-*.ts`) — separate concern.
- No README change (build-time developer guard only).
- No entry for `exec-types.ts` (type-only, no spawn surface).

## Implementation Approach
Follow `validateResidueArmPersist` exactly: declare module-level non-global regex constants, a pure named predicate matching the `Invariant.validate` signature, then register it across per-lane entries. The predicate is a three-branch pure function — vacuous-pass (no `spawn(`), paired-pass (`spawn(` + both calls), fail (`spawn(` + a missing call, returning a named `{ ok:false, message }` rather than throwing). Export the predicate so tests can drive it directly (RESEARCH test-infra notes "drive the real exported predicate") in addition to driving through `runInvariants`. Extend `setup` minimally to keep subprocess fixtures green, then add in-process tests covering all three branches plus dispatch-level integration. Update CLAUDE.md.

## Failure & Resilience Decisions
- **Task 1 (predicate + registration)** — N/A — pure. The predicate is an in-memory string/regex function with no I/O, subprocess, network, or filesystem writes. Resilience properties it must preserve: (a) **No silent failure / no throw on the real case** — the genuine missing-call case **returns** `{ ok:false, message }` (naming the file + missing call), surfaced by the dispatch as a `FAIL` line + non-zero count; (b) **dispatch throw-containment intact** — the predicate must not defeat the existing `try/catch` (any unexpected throw on malformed input is still contained as a `FAIL`, never coerced to a pass); (c) **non-global regexes** so `.test()` carries no `lastIndex` state across the per-lane reuse (idempotent across entries). All file I/O remains in the unchanged `runInvariants` read loop, where an unreadable lane already throws the tagged `exitCode = 2` (no silent pass).
- **Task 2 (tests)** — N/A — pure test code. Synthetic in-memory text + temp-dir fixtures with `rm(..., { recursive:true, force:true })` in `finally`; deterministic, re-runnable.
- **Task 3 (docs)** — N/A — pure. Markdown edit only.

The whole gate is read-only and deterministic against the tree; re-running (which the engine may do) is idempotent — no state mutation, no locks, no subprocess spawned by the new code.

---

## Task 1: Add the shared predicate and register it per exec lane

### Overview
Define `validateActiveChildRegistration` and register it as a relational `INVARIANTS` entry for each current `src/engine/exec-*.ts` lane.

### Changes Required
**File**: `scripts/structural-invariants.mjs`

**Changes**:

1. Add module-level regex constants near the existing residue constants (`:24-28`). Use word-boundary anchors so `unregisterActiveChild` does not satisfy the `registerActiveChild` probe, and so `spawnSync(` does not satisfy the `spawn(` probe:
```js
// Relational invariant: every exec lane that calls spawn( must reap its child
// by registering and unregistering its PID with the active-child registry
// (cycle 0265), so run-one's suspend handler can kill the detached subtree.
// \b anchors prevent `unregisterActiveChild` from matching the register probe
// and `spawnSync(` from matching the spawn probe.
const SPAWN_CALL = /\bspawn\s*\(/;
const REGISTER_CHILD = /\bregisterActiveChild\s*\(/;
const UNREGISTER_CHILD = /\bunregisterActiveChild\s*\(/;
```

2. Add the exported predicate (mirroring `validateResidueArmPersist`'s JSDoc + shape):
```js
/**
 * Every src/engine/exec-*.ts lane that calls spawn( must also call both
 * registerActiveChild and unregisterActiveChild. A lane with no spawn( passes
 * vacuously. Returns a named { ok:false, message } (does not throw) for the
 * genuine missing-call case so the operator sees the actionable file + call.
 * @param {string} text
 * @param {string} file
 * @returns {{ ok: boolean, actual?: string, message?: string }}
 */
export function validateActiveChildRegistration(text, file) {
  if (!SPAWN_CALL.test(text)) return { ok: true, actual: 'no spawn( — vacuous' };
  const missing = [];
  if (!REGISTER_CHILD.test(text)) missing.push('registerActiveChild');
  if (!UNREGISTER_CHILD.test(text)) missing.push('unregisterActiveChild');
  if (missing.length > 0) {
    return {
      ok: false,
      message:
        `${file} calls spawn( but is missing ${missing.join(' and ')} — ` +
        'every spawning exec lane must register and unregister its child PID ' +
        'with the active-child registry (cycle 0265) so run-one can reap the ' +
        'detached subtree on suspend',
    };
  }
  return { ok: true, actual: 'spawn( paired with register/unregister' };
}
```

3. Register one relational entry per current exec lane in `INVARIANTS` (append a clearly-commented block; all share the predicate and a common `reason`). Cover all 8 lanes — `exec-spawn.ts`, `exec-bash.ts` (the spawners) and `exec-auggie.ts`, `exec-claudecode.ts`, `exec-codex.ts`, `exec-gemini.ts`, `exec-opencode.ts`, `exec-pi.ts` (vacuous), excluding type-only `exec-types.ts`:
```js
// --- Exec-lane active-child registration (cycle 0267) ---
// Any exec-*.ts lane that calls spawn( must register + unregister its child PID
// (cycle 0265). One entry per lane; non-spawning lanes pass vacuously. When
// adding a new exec lane, register its entry here.
...['exec-spawn', 'exec-bash', 'exec-auggie', 'exec-claudecode',
    'exec-codex', 'exec-gemini', 'exec-opencode', 'exec-pi'].map((name) => ({
  file: `src/engine/${name}.ts`,
  validate: validateActiveChildRegistration,
  reason: 'active-child registration: a spawn( lane must call registerActiveChild + unregisterActiveChild (cycle 0265 orphan-reap contract)',
})),
```
(Inline the spread inside the `INVARIANTS` array literal, or push explicit entries — match the surrounding code style; the spread keeps it to one maintained list.)

### Success Criteria
- [ ] `npm run typecheck` clean (predicate matches the `validate` typedef; `// @ts-check` + `allowJs` hold).
- [ ] `npm run check:invariants` exits 0 against the real repo; emits an `ok -- src/engine/exec-spawn.ts active-child registration …` line (and one per lane).
- [ ] Editing real `src/engine/exec-bash.ts` to drop `unregisterActiveChild` would fail the gate (verified via the Task-2 synthetic test, not by mutating the real file).
- [ ] Failure path: missing call returns `{ ok:false }` with a message naming the file + missing call; an unexpected throw is still contained by the dispatch as a `FAIL`.

---

## Task 2: Extend `setup` and add predicate + dispatch tests

### Overview
Keep the subprocess fixtures green by writing the two spawning-lane stubs, then cover the predicate's three branches and the dispatch-level integration in-process.

### Changes Required
**File**: `tests/scripts/structural-invariants.test.ts`

**Changes**:

1. Import the exported predicate alongside the existing imports:
```ts
import { runInvariants, INVARIANTS, validateActiveChildRegistration } from "../../scripts/structural-invariants.mjs";
```

2. Extend `setup` to write passing stubs for the two spawning lanes (so the new entries don't throw `cannot read` against the synthetic tree). Add after the agent-lane loop (`:39-45`):
```ts
// Exec-lane active-child-registration invariant targets: spawning lanes must
// carry spawn( + both registry calls so the new relational entries pass.
for (const f of ["exec-spawn", "exec-bash"]) {
  await writeFile(
    join(cwd, `src/engine/${f}.ts`),
    `const child = spawn(bin, args);\nregisterActiveChild(child.pid);\nunregisterActiveChild(child.pid);\n`,
  );
}
```
(The 6 agent stubs already written contain no `spawn(` and pass vacuously — no change to them.)

3. Add in-process tests (mirroring `:200-240` patterns):
   - **Vacuous pass**: `validateActiveChildRegistration('const binary = "x";\n', 'src/engine/exec-codex.ts')` → `{ ok: true }`.
   - **Paired pass**: text with `spawn(` + both calls → `{ ok: true }`.
   - **Fail (user-observable benefit)**: text with `spawn(` but no `unregisterActiveChild` → `{ ok: false }` whose `message` includes the passed file name and `unregisterActiveChild`. Also assert the inverse-substring guard: a text containing only `unregisterActiveChild(` (no `registerActiveChild(`) + `spawn(` returns `{ ok:false }` listing `registerActiveChild` (proves `\b` anchoring).
   - **`spawnSync` is not `spawn(`**: text with only `spawnSync(` (+ no registry calls) → `{ ok: true }` (vacuous), proving the anchor excludes `spawnSync`.
   - **Dispatch integration (failure-path)**: write a synthetic `src/engine/exec-spawn.ts` to a temp dir containing `spawn(` but missing a registry call; build an entry from `INVARIANTS.find(i => i.file === "src/engine/exec-spawn.ts" && i.reason.includes("active-child"))`; assert `runInvariants([entry], root)` returns `>= 1` and `captureConsoleError()` captured a line including `src/engine/exec-spawn.ts` and `FAIL`.
   - **Registered + passes against real repo**: `runInvariants([entry], process.cwd())` for the real `exec-spawn.ts` entry → `failed === 0`.

4. The existing real-repo pins (`:242-252`, exit 0 / empty stderr) and the clean-fixture pin (`:115-128`, empty stderr) must remain green — confirmed by the `setup` extension (new entries pass in the synthetic tree) and the real lanes already being paired.

### Success Criteria
- [ ] `npm test` passes (new tests + all existing, including the subprocess `setup`-based and real-repo-pin tests).
- [ ] Branch coverage: vacuous-pass, paired-pass, and fail branches of the predicate each exercised (holds the global Branch ≥ 75% floor; `scripts/**` is in `test:coverage`).
- [ ] Failure-path test asserts non-zero failure count + a `FAIL` line naming the offending lane, with no other invariant's result altered.

---

## Task 3: Update CLAUDE.md

### Overview
Record that exec-lane active-child registration is now machine-checked, and add the new entry to the agent-add checklist.

### Changes Required
**File**: `CLAUDE.md`

**Changes**:
1. In the *Structural-invariants policy* section, append a sentence noting that exec-lane active-child registration (`registerActiveChild`/`unregisterActiveChild` pairing for any `spawn(`-ing `src/engine/exec-*.ts` lane) is enforced by a relational `INVARIANTS` entry per lane (cycle 0267).
2. In the agent-fleet consistency caveat note ("When adding an agent, also:"), add: register an **active-child-registration** invariant entry for the new exec lane if it spawns a child (and ensure the `register`/`unregister` pairing).

### Success Criteria
- [ ] CLAUDE.md states the new invariant exists and where (Structural-invariants policy + agent-add checklist).
- [ ] No stale claim that exec-lane active-child registration is unguarded.

---

## SPEC Acceptance Traceability

| SPEC Acceptance Bullet (verbatim) | Covering Task | Notes |
|---|---|---|
| [ ] With the current repo tree, `npm run check:invariants` exits 0 (both spawning lanes are correctly paired, so the new invariant passes). | Task 1 | Real `exec-spawn.ts`/`exec-bash.ts` already paired; Task 2 real-repo pins assert it. |
| [ ] **(User-observable benefit)** A test feeds the new predicate a synthetic lane containing `spawn(` but missing `unregisterActiveChild` and asserts the predicate returns `{ ok: false }` with a `message` naming the file and the missing call — demonstrating the build now catches the regression a maintainer would otherwise ship silently. | Task 2 | "Fail (user-observable benefit)" test. |
| [ ] **(Failure-path)** A test asserts that when the predicate is driven through `runInvariants` against a fixture/synthetic lane missing a registry call, `runInvariants` returns a non-zero failure count and emits the `structural-invariants: FAIL <file> -- <reason>` line, leaving no other invariant's result altered. | Task 2 | "Dispatch integration (failure-path)" test, single-entry `runInvariants` call. |
| [ ] A test asserts a lane with no `spawn(` call (and no registry calls) passes the predicate vacuously (`{ ok: true }`). | Task 2 | "Vacuous pass" test. |
| [ ] All existing tests still pass (`npm test`). | Task 2 | `setup` extension keeps subprocess fixtures green; real-repo pins hold. |
| [ ] No compiler/linter warnings introduced (`npm run typecheck` clean; the `.mjs` JSDoc remains type-checked under `// @ts-check` + `allowJs`). | Task 1 | Predicate matches the `Invariant.validate` typedef. |

---

## Testing Strategy

### Unit Tests
- Predicate `validateActiveChildRegistration` driven directly (real export):
  - vacuous pass — no `spawn(` → `{ ok:true, actual:'no spawn( — vacuous' }`.
  - paired pass — `spawn(` + both calls → `{ ok:true }`.
  - fail (missing `unregisterActiveChild`) → `{ ok:false }`, message includes file + `unregisterActiveChild`.
  - anchor guard — only `unregisterActiveChild(` present (+ `spawn(`) → fail listing `registerActiveChild` (proves `\b` excludes the substring match).
  - `spawnSync(`-only text → vacuous pass (proves `spawn(` anchor excludes `spawnSync`).
- Failure-path: synthetic temp-dir `exec-spawn.ts` missing a registry call → `runInvariants([entry], root) >= 1` + `captureConsoleError` line names the lane and `FAIL`.
- Mocking strategy: none for the predicate (pure, called directly). Filesystem fixtures use real temp dirs (`mkdtemp` + `finally rm`) — no fs mocking, consistent with existing tests and the project's anti-mock bias.

### Integration / E2E Tests
- Subprocess `run(cwd)` over the full `INVARIANTS` table against the `setup`-materialized synthetic tree: must still exit 0 / empty stderr (clean fixture) and exit 1 with the existing residue/triage diagnostics (violation fixtures) — confirming the new per-lane entries pass and don't perturb other invariants.
- Real-repo pins (`run(process.cwd())`): exit 0, empty stderr, expected ok lines — confirming the live exec lanes satisfy the new invariant.

## Risk Assessment
- **Substring false-match (`unregisterActiveChild` ⊃ `registerActiveChild`; `spawnSync` ⊃ `spawn`)**: mitigated by `\b`-anchored regexes and explicit anchor-guard unit tests.
- **Subprocess fixture exit 2 (`cannot read exec-spawn.ts`)**: mitigated by extending `setup` to write both spawning-lane stubs; covered by the existing clean-fixture exit-0/empty-stderr pin.
- **Branch-coverage floor**: all three predicate branches exercised by direct unit tests plus the live vacuous (agent lanes) and paired (spawner lanes) production paths run by the real-repo subprocess pin.
- **New future lane not auto-covered** (one-file-per-entry dispatch): accepted and out of scope for auto-globbing; mitigated by the CLAUDE.md agent-add checklist line and the uniform per-lane entry pattern that makes the omission visible in review.
