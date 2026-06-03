# Implementation Plan: Cycle 0043

## Overview
Machine-enforce the residue **arm→persist** correspondence in `src/cli.ts` at build time by extending `scripts/structural-invariants.mjs` with a relational (predicate) invariant kind and registering one new entry that pins every non-whitelisted `pendingResidueContext = { … }` arming assignment to a following `await persistResidue(...)`. No residue-guard runtime behavior changes.

## Current State (from Research)
- `scripts/structural-invariants.mjs` is a single-file `INVARIANTS` table of count-based `{ file, pattern, expected, reason }` entries; the driver (lines 130–150) reads each file (read-error ⇒ `exit 2`), counts regex matches, FAILs on `actual !== expected` (stderr `structural-invariants: FAIL <file> -- <reason>: expected N, got M`, `failed++`), else logs `ok -- <file> <reason>: <actual>`, and finally `process.exit(failed > 0 ? 1 : 0)`. There is **no** `try/catch` around match evaluation.
- The lone residue entry (lines 45–51) counts `await haltIfResidue()` *check* sites at exactly 3 — it does not cover persist sites.
- `src/cli.ts` arming sites (confirmed by direct read):
  - **Whitelisted (un-persisted):** `src/cli.ts:650` — `pendingResidueContext = { cycleId: tail.cycleId, issueId: tail.issueId, failingStep: undefined };`, single-line, followed by `if (await haltIfResidue())` at 651.
  - **Five paired arm→persist sites** (each `pendingResidueContext = { … };` immediately followed by `await persistResidue(pendingResidueContext);`): 670–671, 801–802, 858–859, 873–874 (within-budget `drainRetry`, cycle 0042), 886–887.
  - **Clear sites** (must NOT match the arm predicate): `pendingResidueContext = undefined;` at 610–611, 661, 679, 683, 774–775, 818.
- All current arms are **single-line** object literals; the whitelist marker `failingStep: undefined` is on the same single line as its arm. This resolves the RESEARCH open question on arm format.
- Test harness: `tests/scripts/structural-invariants.test.ts` spawns the real script via `spawnSync(process.execPath, [SCRIPT], { cwd })` against a temp dir populated by `setup(cwd, triageContent, cliContent?)`; `setup` writes all invariant-target files. The default `cliContent` and the `cli-clean.ts`/`cli-violation.ts` fixtures contain **zero** arming lines, so the new relational invariant must pass vacuously when no arm is present. A real-repo regression pin (lines 105–109) asserts `exit 0` / empty stderr against the actual tree.
- `scripts/structural-invariants.mjs` carries a **90%** per-file coverage floor (`scripts/coverage-gate.mjs:20`); `scripts/**` is in `test:coverage`, so every new branch must be exercised by a spawned-script test.

## Desired End State
- `npm run check:invariants` exits 0 on the unmodified tree and prints an `ok` line for the new residue arm/persist invariant alongside every existing entry's unchanged `ok`/`FAIL` output.
- Deleting an `await persistResidue(...)` after an arming assignment, or adding a new non-whitelisted arm with no following persist, makes the check FAIL with `process.exit(1)` and a stderr line naming the offending `src/cli.ts` arm line and the arm/persist remediation.
- The whitelisted `failingStep: undefined` tail-derived site does not trip the check.
- A thrown/malformed predicate surfaces as a FAIL or non-zero exit, never a silent pass; the read-error `exit 2` path is preserved.
- New paired/un-paired fixtures + tests cover the predicate end-to-end, holding the 90% floor.

Verify: `npm run check:invariants` (exit 0, new `ok` line present); `npm test`; `npm run typecheck`; the manual delete/add experiments from the Acceptance Criteria.

## What We're NOT Doing
- No change to residue-guard **runtime** behavior in `src/cli.ts`, `src/engine/failed-residue-guard.ts`, or `src/engine/residue-context-store.ts` (arming assignments, persist/unpersist calls, halt logic stay byte-for-byte).
- No new invariant for `haltIfResidue()` check sites (already covered) or for `unpersistResidue()` clear sites.
- No general plugin/predicate framework — only the smallest dispatch extension the new entry needs.
- No multi-line arm parsing — all real arms are single-line; the predicate targets that shape.
- No README change (purely internal build-gate hardening).

## Implementation Approach
Extend the driver to dispatch two entry kinds while leaving count-based entries untouched: an entry with a `validate(text, file)` function is a **relational** entry; an entry with a `pattern` is the existing **count-based** entry; anything else is malformed and FAILs. The relational evaluation runs inside a `try/catch` so a thrown predicate becomes a FAIL (never an unhandled rejection or silent pass). The new entry's `validate` scans `src/cli.ts` line-by-line: it flags each non-whitelisted single-line `pendingResidueContext = { … }` arm whose next non-comment/non-blank line is not `await persistResidue(...)`. The whitelist keys structurally on `failingStep: undefined` in the arm line. Fixtures and a paired/un-paired test pair lock the behavior in and hold the coverage floor.

## Failure & Resilience Decisions
- **Task 1 (driver dispatch + try/catch):**
  - *Failure modes*: a relational `validate` throws ⇒ caught, converted to a FAIL line (`failed++`), so a buggy/malformed predicate cannot be coerced to a pass. An entry that is neither count-based nor relational (no `pattern`, no `validate`) ⇒ FAIL line naming the malformed entry. File read error ⇒ existing `exit 2` path preserved (read happens before dispatch).
  - *Idempotency*: pure read-only script; re-running yields identical results. N/A beyond read.
  - *Observability*: stdout `ok` lines, stderr `FAIL` lines, process exit code — the script's only observability surface (no `.cycle/log.jsonl`). Thrown-predicate FAIL embeds the error message.
  - *No silent failure*: every divergence (count mismatch, predicate violation, predicate throw, malformed entry, read error) produces a stderr line and/or non-zero exit; nothing is swallowed.
- **Task 2 (arm/persist predicate):**
  - *Failure modes*: an un-paired non-whitelisted arm ⇒ `{ ok: false }` with a message naming the line number/text + remediation. A clear (`= undefined`) is never matched as an arm. The whitelist (`failingStep: undefined`) is honored even when un-persisted.
  - *Idempotency*: pure string analysis over file contents; no I/O, no state. Safe to re-run.
  - *Observability*: the violation message (line number + arm text + arm/persist contract) is carried back to the driver and printed to stderr.
  - *No silent failure*: any violation flips `ok` false ⇒ driver FAILs ⇒ `exit 1`; a thrown predicate is caught by Task 1's `try/catch` ⇒ FAIL.
- **Task 3 (fixtures + tests):** N/A — test code, exercised by the suite.
- **Task 4 (docs):** N/A — pure documentation.

---

## Task 1: Add relational-entry dispatch and predicate error containment to the driver

### Overview
Restructure the driver loop in `scripts/structural-invariants.mjs` to dispatch count-based vs. relational entries and to contain predicate errors, without altering the behavior or output of any existing count-based entry.

### Changes Required
**File**: `scripts/structural-invariants.mjs`

**Changes**: Replace the driver loop body (lines 131–148) so that, after the unchanged file read (read-error still `console.error(...)` + `process.exit(2)`), it branches on entry kind:

```js
for (const entry of INVARIANTS) {
  const { file, reason } = entry;
  let text;
  try {
    text = await readFile(join(process.cwd(), file), 'utf8');
  } catch (e) {
    console.error(`structural-invariants: cannot read ${file}: ${e.code ?? e.message}`);
    process.exit(2);
  }

  if (typeof entry.validate === 'function') {
    // Relational/predicate invariant. Contain any throw as a FAIL so a
    // malformed or erroring predicate can never be coerced to a silent pass.
    let res;
    try {
      res = entry.validate(text, file);
    } catch (e) {
      console.error(`structural-invariants: FAIL ${file} -- ${reason}: predicate threw: ${e.message}`);
      failed++;
      continue;
    }
    if (!res || !res.ok) {
      console.error(`structural-invariants: FAIL ${file} -- ${reason}: ${res ? res.message : 'predicate returned no result'}`);
      failed++;
    } else {
      console.log(`structural-invariants: ok -- ${file} ${reason}: ${res.actual}`);
    }
  } else if (entry.pattern) {
    const actual = (text.match(entry.pattern) ?? []).length;
    if (actual !== entry.expected) {
      console.error(`structural-invariants: FAIL ${file} -- ${reason}: expected ${entry.expected}, got ${actual}`);
      failed++;
    } else {
      console.log(`structural-invariants: ok -- ${file} ${reason}: ${actual}`);
    }
  } else {
    console.error(`structural-invariants: FAIL ${file} -- ${reason}: malformed invariant entry (no pattern or validate)`);
    failed++;
  }
}
```

The header comment (lines 1–8) is updated to note that entries are either count-based (`pattern`/`expected`) or relational (`validate(text, file) => { ok, actual?, message }`).

### Success Criteria
- [ ] Compiles/builds cleanly (`.mjs`, no typecheck target, but `node scripts/structural-invariants.mjs` runs without error).
- [ ] Existing count-based entries emit byte-identical `ok`/`FAIL` lines and the same `expected N, got M` text.
- [ ] `npm run check:invariants` and the existing `tests/scripts/structural-invariants.test.ts` cases pass unchanged.
- [ ] Read-error path still exits 2.
- [ ] Failure paths behave as designed (predicate throw ⇒ FAIL; malformed entry ⇒ FAIL; no silent catch).

---

## Task 2: Register the residue arm/persist relational invariant

### Overview
Add the arm/persist predicate and one `INVARIANTS` entry that uses it to pin every non-whitelisted arm in `src/cli.ts` to a following `await persistResidue(...)`.

### Changes Required
**File**: `scripts/structural-invariants.mjs`

**Changes**: Add a module-level predicate function and append the entry to the `INVARIANTS` table.

```js
// Relational invariant: every in-memory residue arm must be mirrored to disk.
// An arm is a single-line `pendingResidueContext = { … }` assignment; a clear
// (`= undefined`) is not an arm. The tail-derived resume/startup arm carries
// `failingStep: undefined` and is intentionally NOT persisted -> whitelisted
// structurally. The paired persist may sit past intervening comment/blank lines.
const ARM = /pendingResidueContext\s*=\s*\{/;
const ARM_NOT_CLEAR = /pendingResidueContext\s*=\s*undefined/;
const WHITELIST = /failingStep:\s*undefined/;
const PERSIST = /await\s+persistResidue\s*\(/;
const SKIPPABLE = /^\s*(\/\/|\/\*|\*|$)/; // comment or blank line

function validateResidueArmPersist(text) {
  const lines = text.split('\n');
  const violations = [];
  let paired = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!ARM.test(line) || ARM_NOT_CLEAR.test(line)) continue; // not an arm
    if (WHITELIST.test(line)) continue;                        // whitelisted
    // Look ahead past comment/blank lines for the paired persist.
    let j = i + 1;
    while (j < lines.length && SKIPPABLE.test(lines[j])) j++;
    if (j < lines.length && PERSIST.test(lines[j])) {
      paired++;
    } else {
      violations.push(`line ${i + 1}: ${line.trim()}`);
    }
  }
  if (violations.length > 0) {
    return {
      ok: false,
      message:
        `un-persisted residue arm(s) — every \`pendingResidueContext = { … }\` ` +
        `assignment must be immediately followed by \`await persistResidue(pendingResidueContext);\` ` +
        `(except the whitelisted \`failingStep: undefined\` tail-derived site). Offending: ` +
        violations.join('; '),
    };
  }
  return { ok: true, actual: `${paired} paired` };
}
```

Append to `INVARIANTS`:

```js
{
  file: 'src/cli.ts',
  validate: validateResidueArmPersist,
  reason:
    'residue arm/persist correspondence: every non-whitelisted pendingResidueContext arm is followed by await persistResidue (cycle 0042 fifth persist site; tail-derived failingStep:undefined site whitelisted)',
},
```

### Success Criteria
- [ ] `npm run check:invariants` exits 0 and prints `ok -- src/cli.ts residue arm/persist correspondence …: 5 paired`.
- [ ] The whitelisted `src/cli.ts:650` site does not trip the check.
- [ ] Clear sites (`= undefined`) are not flagged as arms.
- [ ] Removing any one `await persistResidue(...)` in `src/cli.ts` makes the check FAIL with the offending line named.
- [ ] Failure paths behave as designed (un-paired arm ⇒ FAIL, exit 1).

---

## Task 3: Fixtures and tests for the new predicate invariant

### Overview
Add paired (passing) and un-paired (failing) `src/cli.ts` fixtures and tests that spawn the real script against them, plus an assertion that the new `ok` line appears on the real tree. Cover the predicate-throw / malformed-entry containment indirectly via the new fixtures and keep the 90% floor.

### Changes Required
**File**: `tests/fixtures/structural-invariants/cli-residue-clean.ts` (new)

Must satisfy **all** cli invariants so only the residue invariant is under test: exactly one `consecutiveFailures += 1;`, exactly three `await haltIfResidue()`, plus the residue layout:

```ts
// fixture: residue arm/persist clean layout
consecutiveFailures += 1;
if (await haltIfResidue()) { halted = true; }
if (await haltIfResidue()) { halted = true; }
if (await haltIfResidue()) { halted = true; }
// whitelisted tail-derived arm (failingStep: undefined), not persisted:
pendingResidueContext = { cycleId: tail.cycleId, issueId: tail.issueId, failingStep: undefined };
// paired arm -> persist (adjacent):
pendingResidueContext = { cycleId, issueId: row.id, failingStep };
await persistResidue(pendingResidueContext);
// paired arm -> persist separated by a comment (comment tolerance):
pendingResidueContext = { cycleId, issueId: row.id, failingStep: "commit" };
// intervening comment line
await persistResidue(pendingResidueContext);
// clear site must NOT be treated as an arm:
pendingResidueContext = undefined;
await unpersistResidue();
```

**File**: `tests/fixtures/structural-invariants/cli-residue-violation.ts` (new)

Same baseline (1× `+= 1`, 3× `haltIfResidue`) so only the residue invariant fails, with one un-paired arm:

```ts
// fixture: residue arm with no following persist (violation)
consecutiveFailures += 1;
if (await haltIfResidue()) { halted = true; }
if (await haltIfResidue()) { halted = true; }
if (await haltIfResidue()) { halted = true; }
// whitelisted site present and un-persisted -> must still pass:
pendingResidueContext = { cycleId: tail.cycleId, issueId: tail.issueId, failingStep: undefined };
// non-whitelisted arm with NO following persist -> the violation:
pendingResidueContext = { cycleId, issueId: row.id, failingStep };
if (acct.halt) { halted = true; }
```

**File**: `tests/scripts/structural-invariants.test.ts`

Add three tests following the existing spawn pattern:

```ts
test("structural-invariants: residue arm/persist clean fixture -> exit 0, no stderr", async () => { /* setup(root, triageClean, cliResidueClean); assert status 0, stderr "" */ });

test("structural-invariants: residue arm without persist -> exit 1, names src/cli.ts + arm line + arm/persist contract", async () => {
  // setup(root, triageClean, cliResidueViolation); run
  // assert.equal(result.status, 1)
  // assert.ok(result.stderr.includes("src/cli.ts"))
  // assert.match(result.stderr, /residue arm\/persist/)
  // assert.match(result.stderr, /persistResidue/)
  // assert.match(result.stderr, /line \d+/)
});

test("structural-invariants: real repo emits residue arm/persist ok line", () => {
  const result = run(process.cwd());
  assert.equal(result.status, 0);
  assert.match(result.stdout, /ok -- src\/cli\.ts residue arm\/persist correspondence.*: 5 paired/);
});
```

The existing `setup()` default `cliContent` (zero arms) already passes the new invariant vacuously — no change to `setup()` needed; the new fixtures are passed as the `cliContent` arg.

### Success Criteria
- [ ] New clean fixture ⇒ exit 0, empty stderr.
- [ ] New violation fixture ⇒ exit 1; stderr names `src/cli.ts`, the arm line number, and references `persistResidue`/the arm-persist contract; the whitelisted `failingStep: undefined` arm in the same fixture does not trip the check.
- [ ] Real-repo test confirms the new `ok` line with `5 paired`.
- [ ] All existing tests still pass (`npm test`).
- [ ] `scripts/structural-invariants.mjs` holds its 90% coverage floor (`npm run check:coverage`).

---

## Task 4: Documentation updates

### Overview
Replace the "enforced only by prose / five persist sites" framing with a statement that the arm→persist correspondence is now machine-checked, and note the whitelisted tail-derived site.

### Changes Required
**File**: `CLAUDE.md`
- *Structural-invariants policy* note (~line 57): mention that `INVARIANTS` now supports relational/predicate entries (a `validate(text, file)` entry alongside count-based `{ pattern, expected }`), and that the residue arm→persist correspondence is enforced by one such entry.
- Residue-guard paragraph (~line 128): change "persisted at the four terminal-failure branches **and the within-budget retry arm** (five persist sites, cycle 0042)" framing to state the five-site arm→persist pairing is now **machine-checked** by `scripts/structural-invariants.mjs` (with the tail-derived `failingStep: undefined` site whitelisted), not doc-maintained.

**File**: `docs/ENGINE.md` (*Failed-cycle dirty-worktree residue guard*, ~lines 60–76)
- Note that persist-site pairing is enforced at build time via a relational `INVARIANTS` entry in `scripts/structural-invariants.mjs`, and briefly document the predicate-invariant facility (validate-style entry) if the section enumerates the residue invariants.

**File**: `README.md`
- No change required — state explicitly in the cycle's report that this is internal build-gate hardening with no user-facing runtime change.

### Success Criteria
- [ ] CLAUDE.md and docs/ENGINE.md no longer describe the pairing as prose-only; both reference the machine check and the whitelisted site.
- [ ] No stale "enforced only by prose" wording remains.

---

## SPEC Acceptance Traceability

| SPEC Acceptance Bullet (verbatim) | Covering Task | Notes |
|---|---|---|
| [ ] Running `npm run check:invariants` on the unmodified working tree exits 0 and prints an `ok` line for the new residue arm/persist invariant. | Task 2, Task 1 | Driver emits `ok -- src/cli.ts … : 5 paired`. |
| [ ] **(User-observable benefit)** Temporarily deleting one `await persistResidue(pendingResidueContext);` line that follows an arming assignment in `src/cli.ts` makes `npm run check:invariants` exit non-zero with a `FAIL` line that names the offending arming line and references the arm/persist contract; restoring the line returns the check to passing. | Task 2 | Predicate lookahead finds no persist ⇒ violation naming the arm line + contract. |
| [ ] **(Failure-path)** Temporarily adding a new arming assignment `pendingResidueContext = { cycleId, issueId: row.id, failingStep };` with no following `await persistResidue(...)` makes the check FAIL and `process.exit(1)`, naming the new line; the whitelisted tail-derived site (`failingStep: undefined`, around `src/cli.ts:650`) does not trip the check. | Task 2, Task 3 | Violation fixture exercises exactly this shape incl. the whitelisted site. |
| [ ] The existing `haltIfResidue()` count invariant and all other `INVARIANTS` entries still report their prior `ok`/`FAIL` results unchanged (verified by the check passing on the current tree with all entries listed). | Task 1, Task 3 | Count-based path byte-identical; real-repo regression pin asserts exit 0. |
| [ ] A unit/integration test exercises the new predicate invariant against both a paired fixture (passes) and an un-paired fixture (fails), so the check itself is covered, and meets the `scripts/structural-invariants.mjs`-adjacent coverage policy (`scripts/**` is in `test:coverage`). | Task 3 | New clean + violation fixtures and spawned-script tests; 90% floor held. |
| [ ] All existing tests still pass (`npm test`). | Task 1, Task 3 | No runtime change; existing fixtures pass new invariant vacuously. |
| [ ] No compiler/linter/typecheck warnings introduced (`npm run typecheck`). | Task 1, Task 2, Task 3 | `.mjs` script untyped; fixtures are isolated stub `.ts` not in the build graph. |

---

## Testing Strategy

### Unit Tests
- **Happy path**: `cli-residue-clean.ts` (whitelisted arm + adjacent paired arm + comment-separated paired arm + a clear site) ⇒ exit 0, empty stderr, and the `5 paired` `ok` line on the real tree.
- **Failure paths**:
  - *Un-paired arm* (`cli-residue-violation.ts`): non-whitelisted arm with no following persist ⇒ exit 1, stderr names `src/cli.ts`, the arm line number, and `persistResidue`/the arm-persist contract.
  - *Persist removed from a previously-paired site*: covered by the manual Acceptance experiment and structurally identical to the un-paired fixture (predicate sees a non-persist next code line).
  - *Whitelist honored*: the violation fixture includes the `failingStep: undefined` arm un-persisted; the check still fails only on the genuine violation, not the whitelisted line.
  - *Comment tolerance*: the clean fixture's comment-separated arm→persist pair confirms the lookahead skips comment/blank lines.
  - *Predicate-throw containment* (Task 1): exercised by the malformed/throw branch via the dispatch; the `try/catch` converts a throw to a FAIL line. (Driver-level branch reachable in coverage through the relational entry path.)
- **Edge cases**: clear sites (`= undefined`) not matched as arms (clean fixture); multiple arming sites in one file (clean fixture has three arms); read-error `exit 2` path unchanged (existing behavior, not re-tested here).
- **Mocking strategy**: none — tests spawn the **real** `scripts/structural-invariants.mjs` via `spawnSync` against temp dirs populated by `setup()`, matching the established anti-mock pattern.

### Integration / E2E Tests
- Real-repo regression: the existing exit-0/empty-stderr pin (lines 105–109) plus the new `stdout` assertion that the residue arm/persist `ok` line appears against the actual `src/cli.ts`, confirming the predicate matches the live five-paired/one-whitelisted layout. No UI ⇒ no browser E2E.

## Risk Assessment
- **Predicate over-matching a distant unrelated persist**: mitigated by stopping the lookahead at the first non-comment/non-blank line — only an *immediately* following (modulo comments) `await persistResidue(...)` counts as paired.
- **Whitelist regex too broad/narrow**: `failingStep:\s*undefined` keys on the exact tail-reconstruction shape at `src/cli.ts:650`; confirmed single-line. If a future genuine arm legitimately used `failingStep: undefined` it would be silently whitelisted — acceptable and intended per SPEC (that shape *is* the un-persisted tail-derived site).
- **Fixture failing an unrelated cli invariant**: mitigated by giving both new fixtures exactly one `consecutiveFailures += 1` and three `await haltIfResidue()` so only the residue invariant is under test.
- **Coverage floor regression**: mitigated by the clean + violation fixtures exercising both predicate branches (paired and violation) plus the driver's relational dispatch; verify via `npm run check:coverage`.
- **Existing tests breaking from new invariant running against their cli stubs**: mitigated because zero-arm cli stubs pass the relational invariant vacuously (no arm ⇒ no violation).
