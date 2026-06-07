# Implementation Plan: Cycle 0275

## Overview

Add one build-time structural invariant to `scripts/structural-invariants.mjs` that asserts every default workflow's terminal verification bash step (a `agent: bash` step invoking `scripts/verify.sh`) is named one of the degenerate-verification gate's recognized literals (`verify` / `final_verify`), with the recognized set **derived from the gate's own source** (`src/engine/run-cycle.ts`) rather than re-declared — so renaming a verify step out of lockstep fails `npm run check:invariants` loudly instead of silently disabling the no-false-greens gate.

## Current State (from Research)

- **The gate being pinned**: `src/engine/run-cycle.ts:957-961` — the degenerate-verification gate fires only when `step.agent === "bash" && r.status === "ok" && (step.name === "verify" || step.name === "final_verify")`. Line 960 holds the two literals (`"verify"`, `"final_verify"`) that are the single source of truth. The gate is preceded by the stable comment `// Degenerate-verification gate (no false greens): …` (`:949`).
- **The checker to extend**: `scripts/structural-invariants.mjs`. Relational entries are `{ file, validate, reason }` where `validate(text, file)` is **synchronous** and receives only `entry.file`'s text plus its path — no `cwd`. The dispatch `runInvariants(invariants, cwd)` (`:356-409`) reads one file per entry relative to `cwd`, contains a thrown predicate as a FAIL (`:377-382`), treats a falsy/`ok:false` result as a FAIL (`:383-387`), and throws `exitCode=2` on a read failure (`:362-369`). The CLI main guard runs `runInvariants(INVARIANTS, process.cwd())` only under the `import.meta` guard (`:412-420`); importing is side-effect-free.
- **Existing predicate templates**: `validateActiveChildRegistration` (`:104-120`) and `validateDetachedSpawn` (`:134-148`) — both exported, both return a named `{ ok:false, message }` for the genuine violation and `{ ok:true, actual }` on pass; vacuous-pass on no match. Module-level `RegExp` constants are the convention (`:24-45`). No existing predicate reads a **second** file — this plan introduces that sub-pattern.
- **The target**: `src/defaults/workflows.yml`. Five `scripts/verify.sh` bash steps across four workflows — `feature` (`verify` `:37`, `final_verify` `:40`), `document` (`verify` `:51`), `quickfix` (`verify` `:61`), `e2e-tests` (`verify` `:73`). Each is a single inline-flow YAML line `{ name: <step>, agent: bash, command: scripts/verify.sh }`. Top-level workflows are `- name: <wf>` entries under `workflows:`. The `walkthrough_*` bash steps have no `command` and are not verify-script steps.
- **Tests**: `tests/scripts/structural-invariants.test.ts` drives the real `.mjs` two ways — in-process via `runInvariants([entry], root)` + `captureConsoleError()` (`:161-168`), and end-to-end via `run()` = `spawnSync(node, [SCRIPT], { cwd })` against a `setup()` synthetic tree (`:14-61`). Whole-tree spawn tests (`"violation fixture -> exit 1"` `:67-81`, `"clean fixture -> exit 0"` `:83+`, `"real repo root -> exit 0"` `:416-420`) run the **full** `INVARIANTS` set, so `setup()` must be extended to satisfy the new entry. Coverage floor for `scripts/structural-invariants.mjs` is **90%** (`scripts/coverage-gate.mjs`).

### Resolved Open Questions (from RESEARCH)

1. **Entry granularity** → **one** relational entry against `src/defaults/workflows.yml` whose predicate iterates all workflow blocks internally and names the offending workflow + step in the FAIL message. All verify steps live in one file; a single walking predicate is the natural fit and satisfies "names the workflow and the offending step name."
2. **How the predicate reaches the gate literals** → the predicate reads `src/engine/run-cycle.ts` itself via `readFileSync(join(process.cwd(), "src/engine/run-cycle.ts"))`, but accepts an **optional injected gate source** as a third parameter (`opts.gateText`) defaulting to that read. In the real CLI and the whole-tree spawn tests, `process.cwd()` equals the dispatch `cwd` (the CLI calls `runInvariants(INVARIANTS, process.cwd())`; spawn tests set the subprocess `cwd`), so the read resolves correctly. In-process narrow tests inject `gateText`/`workflowsText` directly, bypassing `process.cwd()` — this makes the drift-coupling assertion testable. `readFileSync` from `node:fs` (a CJS module) is added to the imports (`readFile` from `node:fs/promises` cannot do a sync read inside the sync `validate`).
3. **Regex for extracting gate literals** → anchor on the `Degenerate-verification gate` comment, then collect `step.name === "…"` string literals from the window between the anchor and the first `{` that opens the `if` block. "No recognizable gate literals" = anchor not found, OR zero `step.name === "…"` literals captured in the window → fail-closed FAIL. This windowing excludes the unrelated `step.name === "build"/"fix"/"research"/…` comparisons elsewhere in the file (`:649,829,907,931,938,1042,1046`).
4. **`setup()` extension scope** → `setup()` must additionally write (a) a passing `src/defaults/workflows.yml` containing at least one `verify.sh` bash step named `verify`/`final_verify` under a `workflows:` block, and (b) a `src/engine/run-cycle.ts` carrying the gate comment + `step.name === "verify" || step.name === "final_verify"` literals, so the new entry passes against the synthetic tree in every whole-tree spawn test.

## Desired End State

- `scripts/structural-invariants.mjs` exports a new predicate (and its two helper functions) and registers one relational `INVARIANTS` entry targeting `src/defaults/workflows.yml`.
- `npm run check:invariants` passes against the current repo (all five verify steps are `verify`/`final_verify`).
- Renaming any verify-script step in `workflows.yml` to e.g. `verify_app` → `npm run check:invariants` exits non-zero, naming the workflow and the offending step.
- Unparseable input (gate source with no recognizable literals, or workflows text with no resolvable workflow/verify step where expected) → FAIL, never a silent pass.
- The recognized-name set is provably derived from `run-cycle.ts` (a fixture changing the gate literals changes the accepted set).
- `tests/scripts/structural-invariants.test.ts` exercises pass / rename-fail / unparseable-fail / containment / drift-coupling in-process; coverage floor stays ≥90%.
- `CLAUDE.md`'s structural-invariants section gains one descriptive line.

**Verify**: `npm run typecheck`, `npm test`, `npm run check:invariants`, and the coverage gate all pass; a manual temporary rename of `workflows.yml:37` `verify` → `verify_app` makes `npm run check:invariants` exit 1 with a message naming `feature` and `verify_app` (revert after).

## What We're NOT Doing

- **No change to the gate logic** at `run-cycle.ts:957-983` or to the recognized-name set itself (no new accepted step names).
- **No change to any workflow step name** in `workflows.yml`.
- **No change** to `scripts/verify.sh`, `verify-counts.ts`, or the runtime degenerate-verification gate behavior.
- **No new YAML-parse dependency** — extraction is regex/text-based, consistent with `validateResidueArmPersist`.
- **No second hand-maintained mirror** of the recognized names — the invariant derives them from `run-cycle.ts`.
- **No targeting of `.cycle/workflows.yml`** (the synced copy) — only `src/defaults/workflows.yml`.

## Implementation Approach

A single relational invariant entry whose predicate does three things, all synchronously and fail-closed:

1. **Derive the recognized set** from the gate's literals (`deriveGateVerifyNames`): read `run-cycle.ts` (injected or from `process.cwd()`), find the `Degenerate-verification gate` anchor, capture `step.name === "…"` literals in the windowed `if` condition. Empty/unfound ⇒ `{ ok:false, message }`.
2. **Extract verify-script steps** from the `workflows.yml` text (`extractVerifyStepNames`): walk lines, track the current `- name: <wf>` workflow, and for each line containing `command: scripts/verify.sh` pull its `name:`. A `verify.sh` line whose name or enclosing workflow can't be resolved ⇒ a parse failure; no `workflows:` structure at all ⇒ a parse failure.
3. **Compare**: every extracted step name must be in the derived set; the first out-of-set step yields `{ ok:false, message }` naming workflow + step. All in-set ⇒ `{ ok:true, actual }`. Workflows with no verify-script step contribute nothing (vacuous). Any internal read/parse failure ⇒ `{ ok:false, message }` (or throws, contained as FAIL by the dispatch).

The predicate is registered directly (`validate: validateVerifyStepNames`); JS ignores the unused third `opts` param when the dispatch calls `validate(text, file)`, so the registered instance reads `run-cycle.ts` from `process.cwd()`. Tests call the exported helpers/predicate directly with injected text.

## Failure & Resilience Decisions

**Task 1 — `deriveGateVerifyNames(runCycleText)` (pure, in-memory string parse)**
- N/A — pure. Operates on a string argument; returns `{ ok:false, message }` (not a throw) when the anchor or literals are absent. No I/O in this function itself.

**Task 2 — `extractVerifyStepNames(workflowsText)` (pure, in-memory string parse)**
- N/A — pure. Returns a structured result `{ ok, steps }` / `{ ok:false, message }`; an unresolvable verify line or absent `workflows:` block is a parse failure surfaced via `ok:false`, never silently skipped.

**Task 3 — `validateVerifyStepNames(workflowsText, file, opts)` (reads `src/engine/run-cycle.ts` when `opts.gateText` absent)**
- **Failure modes**: `readFileSync(run-cycle.ts)` can throw (`ENOENT`/`EACCES`). The function wraps the read in `try/catch` and **returns `{ ok:false, message }`** naming the unreadable path and the remediation ("cannot derive gate literals") — fail-closed, never coerced to a pass. (If it instead threw, the dispatch's containment `:377-382` would still surface it as a FAIL; returning a named result gives a clearer message.) A derivation/extraction `ok:false` from Task 1/2 is propagated as the predicate's `ok:false`.
- **Idempotency**: fully idempotent — a read-only build gate, no state mutation, no filesystem writes, no subprocess. Safe to re-run; the engine's step retries re-run `npm run check:invariants` harmlessly.
- **Observability**: every FAIL flows through the dispatch's `console.error("structural-invariants: FAIL …")` line with the predicate's message (workflow + step name, or the unreadable-source/unparseable detail); pass flows through `console.log("structural-invariants: ok …")`. Exit code is non-zero on any FAIL (`runInvariants` returns the failure count → CLI exit 1; read-error exit 2).
- **No silent failure**: every error path returns `ok:false` (or throws and is contained) → a FAIL line + non-zero exit. There is no `catch {}` that swallows to a pass.

**Task 4 — `setup()` synthetic-tree extension (test helper; filesystem writes via `writeFile`)**
- **Failure modes**: a `writeFile`/`mkdir` rejection propagates (the test `await`s it) and fails the test loudly. No catch.
- **Idempotency**: each test uses a fresh `mkdtemp` root cleaned in `finally` — re-runs are independent.
- **Observability**: a write failure surfaces as a rejected test assertion.
- **No silent failure**: confirmed — no swallowed errors in the helper.

**Task 5 — Test additions** and **Task 6 — CLAUDE.md doc line**: N/A — pure (in-memory test assertions) / documentation-only.

---

## Task 1: Derive the recognized verify-step names from the gate's literals

### Overview
Add an exported pure helper that parses `run-cycle.ts` source text into the gate's recognized step-name set, fail-closed when the gate literals can't be found.

### Changes Required
**File**: `scripts/structural-invariants.mjs`
**Changes**:
- Add module-level constants near the other `RegExp` constants:
  ```js
  // Degenerate-verification gate (cycle 0272) recognized-name derivation.
  // Anchor on the gate's comment, then collect step.name === "…" literals in the
  // windowed if-condition (excludes the unrelated step.name comparisons elsewhere
  // in run-cycle.ts). No anchor / no literals ⇒ fail-closed (can't confirm wiring).
  const GATE_ANCHOR = /Degenerate-verification gate/;
  const GATE_STEP_NAME = /step\.name\s*===\s*"([^"]+)"/g;
  ```
- Add exported helper:
  ```js
  /**
   * Parse run-cycle.ts source into the degenerate-verification gate's recognized
   * step-name set. Fail-closed: returns { ok:false, message } when the gate
   * anchor or its step.name literals can't be located.
   * @param {string} runCycleText
   * @returns {{ ok: true, names: Set<string> } | { ok: false, message: string }}
   */
  export function deriveGateVerifyNames(runCycleText) {
    const anchor = runCycleText.search(GATE_ANCHOR);
    if (anchor < 0) {
      return { ok: false, message: 'cannot derive gate literals from src/engine/run-cycle.ts: no "Degenerate-verification gate" anchor found' };
    }
    // Window: from the anchor to the first "{" that opens the gate's if-block.
    const rest = runCycleText.slice(anchor);
    const brace = rest.indexOf('{');
    const window = brace >= 0 ? rest.slice(0, brace) : rest.slice(0, 600);
    const names = new Set();
    GATE_STEP_NAME.lastIndex = 0;
    let m;
    while ((m = GATE_STEP_NAME.exec(window)) !== null) names.add(m[1]);
    if (names.size === 0) {
      return { ok: false, message: 'cannot derive gate literals from src/engine/run-cycle.ts: no `step.name === "…"` comparisons at the gate site' };
    }
    return { ok: true, names };
  }
  ```

### Success Criteria
- [ ] Compiles/builds cleanly (`npm run typecheck` clean under `// @ts-check` + `allowJs`).
- [ ] Returns `{ ok:true, names: Set(["verify","final_verify"]) }` for the real `run-cycle.ts`.
- [ ] Returns `{ ok:false, message }` for text with no anchor and for an anchor with no `step.name === "…"` literals.
- [ ] Failure paths return `ok:false` (no throw, no silent empty pass).

---

## Task 2: Extract verify-script bash steps from `workflows.yml` text

### Overview
Add an exported pure helper that walks the `workflows.yml` text, tracking the current workflow, and returns each `scripts/verify.sh` bash step as `{ workflow, stepName }` — fail-closed when the structure or a verify line can't be resolved.

### Changes Required
**File**: `scripts/structural-invariants.mjs`
**Changes**:
- Add module-level constants:
  ```js
  const WF_NAME = /^\s*-\s*name:\s*([A-Za-z0-9._-]+)/;        // top-level workflow entry
  const VERIFY_CMD = /command:\s*scripts\/verify\.sh\b/;       // verify-script step line
  const STEP_NAME = /name:\s*([A-Za-z0-9._-]+)/;               // inline-flow step name
  ```
- Add exported helper:
  ```js
  /**
   * Extract every scripts/verify.sh bash step from workflows.yml text as
   * { workflow, stepName }. Fail-closed: returns { ok:false, message } when there
   * is no recognizable `workflows:` structure, or a verify-script line whose
   * enclosing workflow or `name:` cannot be resolved.
   * @param {string} workflowsText
   * @returns {{ ok: true, steps: { workflow: string, stepName: string }[] } | { ok: false, message: string }}
   */
  export function extractVerifyStepNames(workflowsText) {
    const lines = workflowsText.split('\n');
    if (!/^\s*workflows:\s*$/m.test(workflowsText)) {
      return { ok: false, message: 'cannot parse src/defaults/workflows.yml: no top-level `workflows:` block' };
    }
    const steps = [];
    let currentWorkflow = null;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const wf = line.match(WF_NAME);
      if (wf) { currentWorkflow = wf[1]; continue; }
      if (!VERIFY_CMD.test(line)) continue;
      const nm = line.match(STEP_NAME);
      if (!currentWorkflow || !nm) {
        return { ok: false, message: `cannot resolve verify-script step at workflows.yml line ${i + 1}: ${line.trim()}` };
      }
      steps.push({ workflow: currentWorkflow, stepName: nm[1] });
    }
    return { ok: true, steps };
  }
  ```
- Note: `WF_NAME` (anchored `^\s*-\s*name:`) distinguishes a top-level workflow entry from an inline-flow step's `name:`; the inline step lines begin with `{ name:` and won't match `WF_NAME`.

### Success Criteria
- [ ] Returns 5 steps for the real `workflows.yml` — `{feature,verify}`, `{feature,final_verify}`, `{document,verify}`, `{quickfix,verify}`, `{e2e-tests,verify}`.
- [ ] Returns `{ ok:false }` for text with no `workflows:` block.
- [ ] Returns `{ ok:false }` for a `verify.sh` line with no resolvable `name:` or no preceding workflow.
- [ ] `walkthrough_*` bash steps (no `command`) are not extracted.
- [ ] Failure paths return `ok:false` (no silent skip).

---

## Task 3: The registered predicate and `INVARIANTS` entry

### Overview
Add the exported `validateVerifyStepNames` predicate (composing Tasks 1–2 and reading `run-cycle.ts` when no gate source is injected) and register one relational entry in `INVARIANTS`.

### Changes Required
**File**: `scripts/structural-invariants.mjs`
**Changes**:
- Extend the imports:
  ```js
  import { readFile } from 'node:fs/promises';
  import { readFileSync } from 'node:fs';        // sync read inside the sync predicate
  ```
- Add exported predicate:
  ```js
  const GATE_SOURCE_FILE = 'src/engine/run-cycle.ts';

  /**
   * Relational invariant: every scripts/verify.sh bash verify step in
   * src/defaults/workflows.yml must be named one of the degenerate-verification
   * gate's recognized literals, DERIVED from the gate's own source (run-cycle.ts)
   * — not re-declared here. A rename that would orphan the gate (cycle 0272) fails
   * the build instead of silently disabling the no-false-greens verification gate.
   * Fail-closed: an unreadable gate source, no derivable literals, an unparseable
   * workflows.yml, or an out-of-set step name each return { ok:false, message }.
   * @param {string} workflowsText  text of src/defaults/workflows.yml
   * @param {string} file
   * @param {{ gateText?: string }} [opts]  inject gate source for tests
   * @returns {{ ok: boolean, actual?: string, message?: string }}
   */
  export function validateVerifyStepNames(workflowsText, file, opts = {}) {
    let gateText = opts.gateText;
    if (gateText === undefined) {
      try {
        gateText = readFileSync(join(process.cwd(), GATE_SOURCE_FILE), 'utf8');
      } catch (e) {
        const cause = /** @type {{ code?: string, message?: string }} */ (e);
        return { ok: false, message: `cannot read ${GATE_SOURCE_FILE} to derive gate literals: ${cause.code ?? cause.message}` };
      }
    }
    const derived = deriveGateVerifyNames(gateText);
    if (!derived.ok) return derived;
    const extracted = extractVerifyStepNames(workflowsText);
    if (!extracted.ok) return extracted;
    const recognized = derived.names;
    const offending = extracted.steps.find((s) => !recognized.has(s.stepName));
    if (offending) {
      return {
        ok: false,
        message:
          `workflow "${offending.workflow}" verify-script step is named "${offending.stepName}", ` +
          `outside the degenerate-verification gate's recognized set {${[...recognized].join(', ')}} ` +
          `(src/engine/run-cycle.ts). Rename it back to verify/final_verify or the gate (cycle 0272) ` +
          `goes silently inert for this workflow.`,
      };
    }
    return { ok: true, actual: `${extracted.steps.length} verify step(s) in {${[...recognized].join(', ')}}` };
  }
  ```
- Register one entry in `INVARIANTS` (append after the detached-spawn fan-out, before the closing `]`):
  ```js
  // --- Verify-step-name / gate lockstep (cycle 0275) ---
  // Each default workflow's terminal scripts/verify.sh bash step must be named
  // one of the degenerate-verification gate's recognized literals, derived from
  // the gate's own source (run-cycle.ts) — a rename fails the build instead of
  // silently disabling the no-false-greens gate (cycle 0272). The predicate reads
  // run-cycle.ts itself (process.cwd()); tests inject gateText directly.
  {
    file: 'src/defaults/workflows.yml',
    validate: validateVerifyStepNames,
    reason:
      'verify-step-name lockstep: every scripts/verify.sh bash step must be named verify/final_verify (derived from the gate literals in run-cycle.ts) so the degenerate-verification gate (cycle 0272) cannot silently go inert',
  },
  ```

### Success Criteria
- [ ] Compiles/builds cleanly; `npm run check:invariants` passes against the live repo (the new entry prints an `ok` line for `src/defaults/workflows.yml`).
- [ ] The registered entry's `validate(text, file)` call (no `opts`) reads `run-cycle.ts` from `process.cwd()`.
- [ ] A temporary `workflows.yml:37` rename to `verify_app` makes `npm run check:invariants` exit 1 with a message naming `feature` and `verify_app` (manual spot-check, reverted).
- [ ] `validateVerifyStepNames` is in the exported surface for import by the test.
- [ ] Failure paths surface as `{ ok:false, message }` → dispatch FAIL line + non-zero exit (no silent catch).

---

## Task 4: Extend `setup()` so whole-tree spawn tests keep passing

### Overview
The whole-tree spawn tests run the full `INVARIANTS` set against the `setup()` synthetic tree. Add a passing `src/defaults/workflows.yml` and a `src/engine/run-cycle.ts` carrying the gate literals so the new entry passes there.

### Changes Required
**File**: `tests/scripts/structural-invariants.test.ts`
**Changes**: inside `setup()`, after the existing writes:
```ts
// cycle 0275: the verify-step-name lockstep invariant reads
// src/defaults/workflows.yml (the entry's file) and src/engine/run-cycle.ts
// (the gate source, via process.cwd() = this synthetic root in the spawned run).
await mkdir(join(cwd, "src/defaults"), { recursive: true });
await writeFile(
  join(cwd, "src/defaults/workflows.yml"),
  "workflows:\n" +
    "  - name: feature\n" +
    "    steps:\n" +
    "      - { name: verify,       agent: bash, command: scripts/verify.sh }\n" +
    "      - { name: final_verify, agent: bash, command: scripts/verify.sh }\n",
);
await writeFile(
  join(cwd, "src/engine/run-cycle.ts"),
  "// Degenerate-verification gate (no false greens)\n" +
    "if (step.agent === \"bash\" && (step.name === \"verify\" || step.name === \"final_verify\")) {\n}\n",
);
```
- Confirm placement doesn't collide with the existing `src/engine/triage.ts` write (different path — OK).

### Success Criteria
- [ ] `"clean fixture -> exit 0, no stderr"`, `"violation fixture -> exit 1"`, and `"real repo root -> exit 0"` all still pass with the new entry in `INVARIANTS`.
- [ ] The synthetic `run-cycle.ts` derivation yields exactly `{verify, final_verify}` and the synthetic `workflows.yml` steps are in-set.
- [ ] Write failures propagate (no swallow).

---

## Task 5: In-process tests for the new predicate

### Overview
Add `node:test` cases covering pass, rename-fail, both unparseable-fail directions, containment-as-FAIL, and drift-coupling, driven against the exported helpers/predicate — keeping the `scripts/structural-invariants.mjs` coverage floor (90%) green.

### Changes Required
**File**: `tests/scripts/structural-invariants.test.ts`
**Changes**:
- Extend the import to include the new exports:
  ```ts
  import { runInvariants, INVARIANTS, validateActiveChildRegistration, validateDetachedSpawn,
    validateVerifyStepNames, deriveGateVerifyNames, extractVerifyStepNames } from "../../scripts/structural-invariants.mjs";
  ```
- Add tests:
  1. **Happy path (real files)**: read the live `src/defaults/workflows.yml` + `src/engine/run-cycle.ts`; assert `validateVerifyStepNames(wfText, "src/defaults/workflows.yml", { gateText: rcText }).ok === true`. (Also a direct `deriveGateVerifyNames(rcText)` ⇒ `names` contains `verify` and `final_verify`; `extractVerifyStepNames(wfText)` ⇒ 5 steps.)
  2. **Fail path (rename)**: take the real `wfText`, string-replace `name: verify,` → `name: verify_app,` in the `feature` block; assert `ok === false` and `message` matches `/feature/` and `/verify_app/`.
  3. **Fail path (unparseable gate source)**: `validateVerifyStepNames(realWfText, file, { gateText: "no gate here" })` ⇒ `ok === false`, message mentions deriving gate literals.
  4. **Fail path (unparseable workflows)**: `validateVerifyStepNames("not yaml", file, { gateText: realRcText })` ⇒ `ok === false` (no `workflows:` block); and a `verify.sh` line with no resolvable name ⇒ `ok === false`.
  5. **Containment**: register a stub entry whose `validate` throws and assert `runInvariants([entry], root)` surfaces a FAIL via `captureConsoleError()` (reuses the existing containment pattern; covers the dispatch branch for the new sub-pattern shape).
  6. **Drift-coupling**: inject `gateText` whose gate window is `step.name === "verify_app"` and a `workflowsText` whose step is `verify_app` ⇒ `ok === true`; the same `workflowsText` with the **real** gate literals (`{verify, final_verify}`) ⇒ `ok === false`. Proves the accepted set is derived, not hardcoded.
  7. **Via `runInvariants` (in-process, real entry)**: locate the new entry in `INVARIANTS` (by `reason.includes("verify-step-name lockstep")`), run `runInvariants([entry], process.cwd())` against the live repo ⇒ returns `0`. Optionally a temp-root variant writing a renamed `workflows.yml` + a gate-literal `run-cycle.ts` and asserting a FAIL via `captureConsoleError`.

### Success Criteria
- [ ] All new tests pass under `npm test`.
- [ ] Branches covered: derive ok/anchor-miss/literal-miss; extract ok/no-workflows/unresolvable-line; predicate gate-read-error (exercise by calling with no `gateText` from a `process.cwd()` lacking the file in a controlled temp scenario, or rely on injected-error coverage), out-of-set, in-set; keeping `scripts/structural-invariants.mjs` ≥90%.
- [ ] Prefer real implementations — inject only `gateText`/`workflowsText` strings; no module mocking.
- [ ] Failure-path assertions confirm `ok:false`/FAIL, not silent pass.

---

## Task 6: Document the new invariant in CLAUDE.md

### Overview
Add one line to the structural-invariants section describing the new entry, consistent with the active-child / detached-spawn entries.

### Changes Required
**File**: `CLAUDE.md` (Structural-invariants policy section)
**Changes**: append one sentence, e.g.:
> Verify-step-name **gate lockstep** is likewise machine-checked (cycle 0275): one relational entry against `src/defaults/workflows.yml` (`validateVerifyStepNames`) asserts every `scripts/verify.sh` bash step is named one of the degenerate-verification gate's recognized literals (`verify`/`final_verify`), **derived from the gate's own source** (`src/engine/run-cycle.ts`) rather than re-declared — so renaming a terminal verify step out of lockstep fails the build (naming the workflow and offending step) instead of silently disabling the no-false-greens gate (cycle 0272); an unreadable gate source / underivable literals / unparseable workflows is a fail-closed FAIL.

### Success Criteria
- [ ] One line added, matching the existing entries' style/density.
- [ ] No other CLAUDE.md content changed.
- [ ] N/A — documentation only.

---

## SPEC Acceptance Traceability

| SPEC Acceptance Bullet (verbatim) | Covering Task | Notes |
|---|---|---|
| [ ] A structural invariant registered in `scripts/structural-invariants.mjs` asserts that each default workflow's terminal bash verify step (the `scripts/verify.sh` bash step) is named `verify` or `final_verify`; `npm run check:invariants` passes against the current `src/defaults/workflows.yml`. | Task 1, Task 2, Task 3 | Predicate + registered entry; passes against live repo |
| [ ] **(User-observable benefit)** Renaming the terminal verify step in a workflow to a name outside the gate's recognized set (e.g. `verify_app`) makes `npm run check:invariants` exit non-zero with a message naming the workflow and the offending step name — demonstrated by a test driving the predicate against such a config. | Task 3, Task 5 | Message names workflow + step; test #2 |
| [ ] **(Failure-path)** When the predicate is given input it cannot parse (e.g. `run-cycle.ts` source with no recognizable gate literals, or a `workflows.yml` with no resolvable verify step where one is expected), it returns `{ ok: false, message }` (or throws and is contained as a FAIL) rather than a silent pass — asserted in-process in `tests/scripts/structural-invariants.test.ts`. | Task 1, Task 2, Task 3, Task 5 | Fail-closed in all three helpers; tests #3, #4, #5 |
| [ ] The recognized-name set used by the invariant is derived from the gate's literals in `src/engine/run-cycle.ts`, not independently re-declared in the invariant entry — verified by a test that changing the recognized literals (fixture) changes the predicate's accepted set. | Task 1, Task 3, Task 5 | `deriveGateVerifyNames`; drift-coupling test #6 |
| [ ] `tests/scripts/structural-invariants.test.ts` drives the new entry's pass branch and fail branch in-process via the exported predicate, keeping the coverage floor for `scripts/structural-invariants.mjs` green. | Task 5 | In-process via exported helpers/predicate; ≥90% floor |
| [ ] The new invariant is documented in the structural-invariants section of `CLAUDE.md` (one line, consistent with the existing entries). | Task 6 | |
| [ ] All existing tests still pass. | Task 4, Task 5 | `setup()` extended so whole-tree spawn tests stay green |
| [ ] No compiler/linter warnings introduced (`npm run typecheck`, `npm run check:invariants`, coverage gates all green). | Task 1, Task 2, Task 3, Task 4, Task 5, Task 6 | `// @ts-check` JSDoc on new exports |

---

## Testing Strategy

### Unit Tests
- **`deriveGateVerifyNames`**: real `run-cycle.ts` ⇒ `{verify, final_verify}`; no-anchor text ⇒ `ok:false`; anchored-but-no-literals text ⇒ `ok:false`; a fixture with `step.name === "verify_app"` ⇒ `{verify_app}` (drift).
- **`extractVerifyStepNames`**: real `workflows.yml` ⇒ 5 steps with correct workflow attribution; `walkthrough_*` excluded; no-`workflows:` text ⇒ `ok:false`; `verify.sh` line with no `name:` ⇒ `ok:false`.
- **`validateVerifyStepNames`**: in-set ⇒ `ok:true`; renamed step ⇒ `ok:false` naming workflow + step; injected unparseable gate text ⇒ `ok:false`; injected unparseable workflows text ⇒ `ok:false`; (gate-source-read-error path covered via the no-`gateText` call in a controlled `process.cwd()` scenario or accepted as the injected-error equivalent).
- **Failure-path coverage**: each named failure mode (unreadable gate source, underivable literals, unparseable workflows, out-of-set name) has an explicit assertion that the result is `ok:false`/FAIL, never a pass.
- **Mocking strategy**: none — inject plain strings (`gateText`, `workflowsText`); read real repo files for the happy path. No module/`fs` mocking.

### Integration / E2E Tests
- **`runInvariants([entry], process.cwd())`** against the live repo ⇒ `0` failures (new entry passes).
- **Whole-tree spawn** (`run(root)` after the extended `setup()`) ⇒ existing `"clean fixture -> exit 0"`, `"violation fixture -> exit 1"`, `"real repo root -> exit 0"` stay green with the new entry in the full set.
- **Containment**: a throwing stub entry through `runInvariants` ⇒ surfaced as FAIL via `captureConsoleError`.
- No UI/E2E suite applies — cycle's own CLI repo is unit-only (CLAUDE.md → *Core thesis*).

## Risk Assessment
- **`process.cwd()` divergence in narrow in-process tests**: a `runInvariants([newEntry], tempRoot)` call without injected `gateText` would read `run-cycle.ts` from the test process's cwd (repo root), not `tempRoot`. *Mitigation*: narrow in-process tests inject `gateText`/`workflowsText` directly; the live-repo `runInvariants([entry], process.cwd())` test and the whole-tree spawn tests (subprocess cwd = synthetic root with `run-cycle.ts` written by `setup()`) keep the two reads consistent.
- **Gate-anchor brittleness**: anchoring on the `Degenerate-verification gate` comment couples to the comment text. *Mitigation*: the comment is stable (`run-cycle.ts:949`); if it changes, the predicate FAILs loudly (fail-closed) rather than silently passing — which is the desired direction and is itself caught by the live-repo happy-path test.
- **Other `step.name === "…"` matches polluting the derived set**: there are 7 other such comparisons in `run-cycle.ts`. *Mitigation*: the derivation windows from the anchor to the first `{`, capturing only the gate's two literals; the happy-path test asserts the set is exactly `{verify, final_verify}`.
- **`setup()` omission breaks whole-tree tests**: forgetting the synthetic `workflows.yml`/`run-cycle.ts` would fail the spawn tests. *Mitigation*: Task 4 is explicit and the spawn tests are the regression signal.
- **Regex over-match in `extractVerifyStepNames`** (e.g. a future multi-line block step): current `workflows.yml` is inline-flow single-line per step. *Mitigation*: SPEC scope freezes the format; a future block-style step that the regex can't resolve fails fail-closed (`ok:false`), not silently.
