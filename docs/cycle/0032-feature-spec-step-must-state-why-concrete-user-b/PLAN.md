# Implementation Plan: Cycle 0032

## Overview
Harden the autonomous-delivery loop against the "passes mechanical acceptance criteria but delivers no usable value" failure mode by editing two engine default prompts — `spec.md` must force every SPEC to open with a WHY / CONCRETE USER BENEFIT / USABLE END-STATE / SCAFFOLDING ESCAPE HATCH block and require a user-observable-benefit acceptance criterion, and `review.md` must treat an undeliverable user benefit as a MUST-FIX — then mirror both to `.cycle/prompts/` and lock the new mandates in with prompt-shape tests.

## Current State (from Research)
- `src/defaults/prompts/spec.md` (157 lines): SPEC.md output template opens at `# SPEC — Cycle <cycle_id>` (`:29`) with `## Objective` (`:31`) — no user-benefit block. `## Required Sections` (`:76`) mandates `## Acceptance Criteria`, the observable-outcome bullet rule (`:79`), the checkbox-format example `- [ ] <observable condition>` (`:83`), and the failure-path criterion mandate (`:85`–`:89`).
- `src/defaults/prompts/review.md` (280 lines): Pass 1 carries `Spec compliance` (`:38`), `SPEC→PLAN traceability` (`:40`), `SPEC AC coverage` (`:46`), and `Failure handling` (`:53`) bullets; the NEEDS-FIX-triggers enumeration is `:166`–`:171`; `## Output 2: MUST-FIX.md` task templates are `:211`–`:266` (including the SPEC→PLAN-traceability task template at `:253`).
- Dogfood mirrors `.cycle/prompts/spec.md` and `.cycle/prompts/review.md` are currently `diff`-clean against their sources.
- Test pattern: `node:test` + `import { strict as assert } from "node:assert"`, prompt read via `readFile(SRC, "utf8")`, `assert.ok(body.includes("…"))` or `assert.match(body, /…/)`; byte-identical invariant via `Buffer.compare(src, dog) === 0`. `tests/defaults/spec-prompt-ac.test.ts` already has `SRC`/`DOG` constants (`:5`–`6`) and the dogfood test (`:72`–`79`). `tests/defaults/review-prompt-spec-ac.test.ts` declares `SRC` only (`:5`) and has **no** `DOG` constant and **no** byte-identical test.
- `npm run sync-defaults` (`scripts/sync-defaults.mjs`) copies `src/defaults/` → `.cycle/` and records sha256 pairs in `.cycle/.sync-state.json`; running it after a normal edit is idempotent and safe.

## Desired End State
- `src/defaults/prompts/spec.md` instructs every SPEC to open with a mandatory block naming **WHY**, **CONCRETE USER BENEFIT**, **USABLE END-STATE**, and **SCAFFOLDING ESCAPE HATCH**, and requires at least one acceptance criterion phrased as the user-observable benefit (composing with, not replacing, the failure-path mandate).
- `src/defaults/prompts/review.md` adds a benefit-delivery verification bullet to Pass 1, lists an undeliverable user benefit in the NEEDS-FIX-triggers enumeration, and provides a MUST-FIX task template for it.
- `.cycle/prompts/spec.md` and `.cycle/prompts/review.md` are byte-identical to their `src/defaults/` sources (post `sync-defaults`).
- Extended prompt-shape tests assert each new mandate and a review.md byte-identical dogfood invariant; `npm test` and `npm run typecheck` pass clean.
- **Verify:** `npm test` green; `diff -q src/defaults/prompts/spec.md .cycle/prompts/spec.md` and the review equivalent exit 0; `npm run typecheck` emits no warnings.

## What We're NOT Doing
- No change to `src/engine/**` or any engine runtime code (the issue explicitly requires no engine change).
- No edits to other prompts (`build.md`, `plan.md`, `research.md`, `fix.md`, `final_fix.md`, `documentation.md`, etc.).
- No rework of the existing Acceptance Criteria / failure-path / File Artifact Mode mandates in either prompt — additive only.
- No changes to `scripts/sync-defaults.mjs` semantics, `.sync-state.json` format, or the sync/divergence guard tests.
- No update to maestro or any downstream repo's already-shipped `.cycle/prompts/`.
- No new CLI surface, README change, or new env var.

## Implementation Approach
Two prompt-only vertical slices, each = prompt edit + dogfood sync + locking tests for that prompt, followed by a whole-suite verification task. The spec slice places the mandate in **both** the SPEC.md output *template* (so the writer sees the target shape) and the `## Required Sections` prose (so it is an explicit instruction the tests can assert against). The review slice threads the new rule through the three places the reviewer's PASS/NEEDS-FIX decision is wired: the Pass 1 checklist (where the check is performed), the NEEDS-FIX-triggers enumeration (where it gates the verdict, and where the existing regex-style test reaches it), and the Output 2 MUST-FIX task templates (so the `fix` step receives an actionable item). `sync-defaults` is run once after the source edits (it copies the whole tree, covering both prompts). Test literal tokens are fixed up-front so prompt prose and assertions agree exactly: `WHY`, `CONCRETE USER BENEFIT`, `USABLE END-STATE`, `SCAFFOLDING ESCAPE HATCH`, `user-observable benefit`, and a `Benefit delivery` / undeliverable-benefit phrasing on the review side.

## Failure & Resilience Decisions
- **Task 1 (edit `spec.md`) / Task 3 (edit `review.md`)** — N/A — pure prompt-text edits with no runtime code path. The deliverable's only live failure surface is the test layer (Tasks 2, 4, 5): if a mandate string is removed, its `body.includes(...)` assertion fails loudly; if `src/defaults/` and `.cycle/` drift, the `Buffer.compare === 0` byte-identical test fails. No error is swallowed — both are observable as failed `node:test` assertions, never a silent pass.
- **Task: `npm run sync-defaults` (within Tasks 1/3)** — **Failure modes:** if a `.cycle/prompts/*` destination is locally divergent (sha matches neither recorded `dst_sha256` nor current `src_sha256`), `sync-defaults.mjs` preserves it and exits non-zero (exit 2) rather than overwriting — surfaced to the operator, not swallowed. The expected path here is a clean overwrite (we just authored the source edit). **Idempotency:** the copy + sha-record is fully idempotent — re-running after the same edit reproduces identical `.cycle/` files and `.sync-state.json`; the engine retrying this cycle's steps re-runs it safely. **Observability:** divergence/skip is printed by the script and the byte-identical test (Tasks 2/4) is the in-gate cross-check. **No silent failure:** a non-zero exit or a red dogfood test is the failure signal.
- **Tasks 2, 4, 5 (tests + verification)** — N/A — assertion-only; any failure surfaces as a non-zero `npm test` / `npm run typecheck` exit.

---

## Task 1: Add the WHY / CONCRETE USER BENEFIT / USABLE END-STATE / SCAFFOLDING ESCAPE HATCH mandate + user-benefit acceptance criterion to the spec prompt

### Overview
Edit `src/defaults/prompts/spec.md` so the SPEC.md output template opens with the four-part user-benefit block and the `## Required Sections` prose mandates it plus a user-observable-benefit acceptance criterion, then mirror to `.cycle/`.

### Changes Required
**File**: `src/defaults/prompts/spec.md`

**Change A — output template (insert before `## Objective` at `:31`)**: add a mandatory opening block to the fenced SPEC.md template so the writer emits the target shape:
```markdown
## WHY
[The problem / motivation. What is broken, missing, or painful today.]

## CONCRETE USER BENEFIT
[An observable, end-to-end thing a user (or caller, for a library) can DO
or OBSERVE after this cycle that they could not before. NOT "code compiles",
"tests pass", or "endpoint returns X" — those are mechanics, not benefit.]

## USABLE END-STATE
[What "done" looks like from the user's point of view.]

## SCAFFOLDING ESCAPE HATCH (only if this round has no direct user benefit yet)
[If this round is genuinely foundational, say so explicitly, name the user
benefit it unlocks, and name the later round that delivers it. Omit this
heading entirely when the round delivers a direct user benefit.]
```
(The existing `## Objective` block and everything after it is preserved.)

**Change B — `## Required Sections` prose (insert after the failure-path mandate, `:89`)**: add an explicit, test-targetable instruction:
```markdown
Every SPEC.md must open with a mandatory block answering **WHY** (the
problem/motivation), **CONCRETE USER BENEFIT** (an observable, end-to-end
thing a user can DO or OBSERVE that they could not before — explicitly NOT
"code compiles / tests pass / endpoint returns X"), and **USABLE END-STATE**
(what "done" looks like from the user's point of view). If a round is
genuinely foundational with no direct user benefit yet, use the **SCAFFOLDING
ESCAPE HATCH**: say so explicitly, name the user benefit it unlocks, and name
the later round that delivers it.

In addition to the failure-path criterion above, at least one acceptance
criterion must be phrased as the **user-observable benefit** — the concrete
thing a user can now do or observe (or, for flagged scaffolding, the concrete
capability the next round builds on) — not solely mechanics. This composes
with, and does not replace, the failure-path criterion mandate.
```

Then run `npm run sync-defaults` so `.cycle/prompts/spec.md` matches byte-for-byte.

### Success Criteria
- [ ] `src/defaults/prompts/spec.md` contains the literal tokens `WHY`, `CONCRETE USER BENEFIT`, `USABLE END-STATE`, `SCAFFOLDING ESCAPE HATCH`, and `user-observable benefit`.
- [ ] The existing `## Objective`, `## Acceptance Criteria`, failure-path, and File Artifact Mode prose are unchanged (additive only).
- [ ] `npm run sync-defaults` exits 0 and `diff -q src/defaults/prompts/spec.md .cycle/prompts/spec.md` exits 0.
- [ ] Builds/syncs cleanly; failure path (drift / removed mandate) is caught by Task 2 tests.

---

## Task 2: Lock the new spec-prompt mandates with prompt-shape assertions

### Overview
Extend `tests/defaults/spec-prompt-ac.test.ts` with presence assertions for each new mandate token; the existing byte-identical dogfood test (`:72`–`79`) already guards drift.

### Changes Required
**File**: `tests/defaults/spec-prompt-ac.test.ts`

**Changes**: append tests mirroring the existing `readFile(SRC, "utf8")` + `assert.ok(body.includes(...))` style:
```ts
test("spec prompt mandates WHY opening-block heading", async () => {
  const body = await readFile(SRC, "utf8");
  assert.ok(body.includes("WHY"), "missing WHY mandate in spec prompt");
});

test("spec prompt mandates CONCRETE USER BENEFIT", async () => {
  const body = await readFile(SRC, "utf8");
  assert.ok(body.includes("CONCRETE USER BENEFIT"),
    "missing CONCRETE USER BENEFIT mandate in spec prompt");
});

test("spec prompt mandates USABLE END-STATE", async () => {
  const body = await readFile(SRC, "utf8");
  assert.ok(body.includes("USABLE END-STATE"),
    "missing USABLE END-STATE mandate in spec prompt");
});

test("spec prompt defines SCAFFOLDING ESCAPE HATCH", async () => {
  const body = await readFile(SRC, "utf8");
  assert.ok(body.includes("SCAFFOLDING ESCAPE HATCH"),
    "missing SCAFFOLDING ESCAPE HATCH escape-hatch instruction");
});

test("spec prompt requires a user-observable-benefit acceptance criterion distinct from failure-path", async () => {
  const body = await readFile(SRC, "utf8");
  assert.ok(body.includes("user-observable benefit"),
    "missing user-observable-benefit acceptance-criterion mandate");
  // Coexistence guard: the existing failure-path mandate must remain.
  assert.ok(body.includes("failure-path criterion"),
    "user-benefit mandate must compose with, not replace, the failure-path mandate");
});
```

### Success Criteria
- [ ] Five new tests pass against the Task 1 edits.
- [ ] All pre-existing tests in the file (including the byte-identical dogfood test) still pass.
- [ ] `npm run typecheck` clean.
- [ ] Removing any new mandate from `spec.md` turns the matching assertion red (verified by transient manual check or reasoning — no silent pass).

---

## Task 3: Add the benefit-delivery verification rule to the review prompt (Pass 1 + NEEDS-FIX trigger + MUST-FIX template)

### Overview
Edit `src/defaults/prompts/review.md` so the reviewer verifies the SPEC's stated user benefit was actually delivered, routes an undeliverable benefit to MUST-FIX, and provides an actionable MUST-FIX task template; then mirror to `.cycle/`.

### Changes Required
**File**: `src/defaults/prompts/review.md`

**Change A — Pass 1 checklist (insert a bullet after `SPEC AC coverage`, `:50`)**:
```markdown
- **Benefit delivery** — does the implementation actually deliver the
  user benefit the SPEC states in its `## CONCRETE USER BENEFIT` (and
  `## USABLE END-STATE`) block? Verify a user (or caller) can really do
  or observe the promised thing end-to-end — not merely that the
  mechanics pass. If the SPEC used the **SCAFFOLDING ESCAPE HATCH**,
  verify the flag is honest and the unlocked capability is genuinely
  present. A user benefit that is promised but cannot actually be
  realized is a MUST-FIX, not a pass — write it to MUST-FIX.md.
```

**Change B — NEEDS-FIX-triggers enumeration (`:166`–`:171`)**: add the undeliverable-benefit trigger to the list so it gates the verdict and the regex-style test reaches it:
```markdown
NEEDS-FIX triggers: code-quality findings, missing tests, coverage
regressions, missing SPEC requirements, an undeliverable user benefit
(the SPEC's stated user benefit cannot actually be realized), any
unbacked doc-vs-code claim from Pass 3, a missing or empty
`## Acceptance Criteria` section in SPEC.md, swallowed/silent errors,
fail-open failure defaults, or non-idempotent retried operations, OR a
missing or incomplete SPEC→PLAN traceability section in PLAN.md.
```

**Change C — Output 2 MUST-FIX task template (insert a template after the SPEC→PLAN one, `:265`)**:
```markdown
- [ ] ### Task N (Undeliverable User Benefit): [Short title]
  **Priority:** Critical
  **Files:** [the source/UI files that must change to deliver the benefit]
  **Problem:** SPEC's `## CONCRETE USER BENEFIT` promises "[quote the
    benefit]", but a user cannot actually realize it because [specific
    gap — e.g. the control is not wired, the flow dead-ends].
  **Fix:** [Exactly what to implement so the promised benefit is
    realizable end-to-end.]
  **Verify:** [Concrete user-observable check — the action a user takes
    and the result they observe.]
```

Then run `npm run sync-defaults` so `.cycle/prompts/review.md` matches byte-for-byte.

### Success Criteria
- [ ] `src/defaults/prompts/review.md` contains a `Benefit delivery` Pass 1 bullet, an undeliverable-user-benefit entry inside the `NEEDS-FIX triggers:` enumeration, and an `Undeliverable User Benefit` MUST-FIX task template.
- [ ] Existing Pass 1 bullets, the rest of the NEEDS-FIX list, and the other MUST-FIX templates are unchanged (additive only).
- [ ] `npm run sync-defaults` exits 0 and `diff -q src/defaults/prompts/review.md .cycle/prompts/review.md` exits 0.

---

## Task 4: Lock the review-prompt benefit-delivery rule + add the missing review.md byte-identical dogfood invariant

### Overview
Extend `tests/defaults/review-prompt-spec-ac.test.ts` with assertions for the new benefit-delivery mandate and add the `DOG` constant + byte-identical dogfood test that the file currently lacks.

### Changes Required
**File**: `tests/defaults/review-prompt-spec-ac.test.ts`

**Change A — add `DOG` constant** (after `SRC`, `:5`):
```ts
const DOG = ".cycle/prompts/review.md";
```

**Change B — presence + verdict-gating assertions** (append):
```ts
test("review prompt Pass 1 verifies user-benefit delivery", async () => {
  const body = await readFile(SRC, "utf8");
  assert.ok(body.includes("Benefit delivery"),
    "missing Benefit delivery verification bullet in Pass 1");
});

test("review prompt routes an undeliverable user benefit to MUST-FIX", async () => {
  const body = await readFile(SRC, "utf8");
  assert.ok(body.includes("undeliverable user benefit"),
    "missing undeliverable-user-benefit MUST-FIX routing");
});

test("review prompt NEEDS-FIX triggers include an undeliverable user benefit", async () => {
  const body = await readFile(SRC, "utf8");
  assert.match(body, /NEEDS-FIX triggers:[\s\S]*undeliverable user benefit/,
    "NEEDS-FIX triggers missing undeliverable-user-benefit mention");
});

test("review prompt MUST-FIX templates include an Undeliverable User Benefit task", async () => {
  const body = await readFile(SRC, "utf8");
  assert.ok(body.includes("Undeliverable User Benefit"),
    "missing Undeliverable User Benefit MUST-FIX task template");
});
```

**Change C — byte-identical dogfood invariant** (mirror `spec-prompt-ac.test.ts:72`–`79` / `file-artifact-mode-guardrail.test.ts:59`–`66`):
```ts
test("dogfood review prompt is byte-identical to default", async () => {
  const [src, dog] = await Promise.all([readFile(SRC), readFile(DOG)]);
  assert.equal(Buffer.compare(src, dog), 0,
    "src/defaults/prompts/review.md and .cycle/prompts/review.md must match byte-for-byte");
});
```

### Success Criteria
- [ ] Four new mandate assertions + the new byte-identical dogfood test pass against the Task 3 edits.
- [ ] All pre-existing tests in the file still pass.
- [ ] The NEEDS-FIX regex (`/NEEDS-FIX triggers:[\s\S]*undeliverable user benefit/`) matches the edited enumeration.
- [ ] `npm run typecheck` clean.

---

## Task 5: Full-suite verification + sync-drift confirmation

### Overview
Run the complete gate to confirm new and existing tests coexist, no typecheck warnings, and no `src/defaults/` ↔ `.cycle/` drift.

### Changes Required
No file changes. Run:
- `npm test` — full suite (auto-builds via `pretest`); confirm all `tests/defaults/*` pass together (old + new), including `file-artifact-mode-guardrail.test.ts` and the sync-guard tests.
- `npm run typecheck` — `tsc --noEmit`, zero warnings.
- `diff -q src/defaults/prompts/spec.md .cycle/prompts/spec.md` and `diff -q src/defaults/prompts/review.md .cycle/prompts/review.md` — both exit 0.

Record the outcomes in `BUILD.md`. Per SPEC, state explicitly that no CLAUDE.md / README.md change was warranted (the `sync-defaults` convention is already documented; no CLI surface or convention changed).

### Success Criteria
- [ ] `npm test` exits 0; old and new prompt-shape assertions pass together (no collision with existing AC / FAM assertions).
- [ ] `npm run typecheck` exits 0 with no warnings.
- [ ] Both `diff -q` checks exit 0 (byte-identical dogfood confirmed at the shell level in addition to the in-suite tests).
- [ ] BUILD.md records that no doc change was warranted.

---

## SPEC Acceptance Traceability

| SPEC Acceptance Bullet (verbatim) | Covering Task | Notes |
|---|---|---|
| `- [ ] `src/defaults/prompts/spec.md` contains a mandatory opening-block instruction naming all four of: WHY, CONCRETE USER BENEFIT, USABLE END-STATE, SCAFFOLDING ESCAPE HATCH.` | Task 1 | Verified by Task 2 token assertions |
| `- [ ] `src/defaults/prompts/spec.md` requires at least one acceptance criterion phrased as the user-observable benefit (distinct from the existing failure-path criterion mandate).` | Task 1 | Verified by Task 2 `user-observable benefit` + `failure-path criterion` coexistence assertion |
| `- [ ] `src/defaults/prompts/review.md` instructs that an undeliverable user benefit is a MUST-FIX (written to MUST-FIX.md), not a pass.` | Task 3 | Verified by Task 4 Pass 1 + NEEDS-FIX + MUST-FIX-template assertions |
| `- [ ] **User-observable benefit**: a maintainer (or any future `spec`/`review` cycle) reading the freshly synced `.cycle/prompts/spec.md` and `.cycle/prompts/review.md` finds the new user-benefit mandates present — i.e. running `cycle` now steers every spec toward a stated user benefit and every review toward verifying it, without any further engine work.` | Task 1, Task 3, Task 5 | Synced via `sync-defaults`; byte-identical dogfood + `diff -q` confirm `.cycle/` carries the mandates |
| `- [ ] **Failure-path / regression criterion**: `.cycle/prompts/spec.md` and `.cycle/prompts/review.md` are byte-identical to their `src/defaults/` sources, and the prompt-shape tests fail if either new mandate is removed — verified by `npm test`.` | Task 2, Task 4, Task 5 | spec dogfood test pre-exists; review dogfood test added in Task 4; per-mandate `includes` assertions are the removal guards |
| `- [ ] New/extended assertions exist in `tests/defaults/spec-prompt-ac.test.ts` and `tests/defaults/review-prompt-spec-ac.test.ts` covering the WHY/benefit/end-state/scaffolding mandates and the benefit-delivery MUST-FIX rule.` | Task 2, Task 4 | |
| `- [ ] All existing tests still pass (`npm test`).` | Task 5 | |
| `- [ ] No compiler/linter warnings introduced (`npm run typecheck`).` | Task 5 | |

---

## Testing Strategy

### Unit Tests
- **Spec prompt mandates** (`tests/defaults/spec-prompt-ac.test.ts`): assert presence of `WHY`, `CONCRETE USER BENEFIT`, `USABLE END-STATE`, `SCAFFOLDING ESCAPE HATCH`, and `user-observable benefit`. Coexistence edge case: assert `failure-path criterion` still present alongside the new user-benefit mandate so the additive change cannot silently delete the prior mandate.
- **Review prompt mandates** (`tests/defaults/review-prompt-spec-ac.test.ts`): assert `Benefit delivery`, `undeliverable user benefit`, and `Undeliverable User Benefit`; assert the NEEDS-FIX enumeration regex `/NEEDS-FIX triggers:[\s\S]*undeliverable user benefit/` matches (mirrors the existing `…Acceptance Criteria` regex pattern at `:31`–`38`).
- **Failure-path / drift tests:** the byte-identical `Buffer.compare(src, dog) === 0` assertions (spec pre-existing; review added in Task 4) fail loudly if `src/defaults/` and `.cycle/` drift — exercised by simply not running `sync-defaults`, or by editing one copy. Each per-mandate `includes(...)` assertion is the missing-mandate failure scenario (removing the prose turns the test red).
- **Mocking strategy:** none — tests read the real prompt files from disk via `readFile`, matching the existing anti-mock convention in `tests/defaults/`.

### Integration / E2E Tests
- No runtime code path and no UI — no E2E tests required (SPEC §Testing Strategy). The integration check is the whole-suite run in Task 5: `npm test` confirms the new `tests/defaults/*` assertions coexist with the existing AC / File-Artifact-Mode / sync-guard suites, and the shell-level `diff -q` on both prompt pairs cross-checks the in-suite byte-identical assertions.

## Risk Assessment
- **Token-mismatch between prose and assertion** (test asserts a string the prompt doesn't contain verbatim): mitigated by fixing the canonical literal tokens (`WHY`, `CONCRETE USER BENEFIT`, `USABLE END-STATE`, `SCAFFOLDING ESCAPE HATCH`, `user-observable benefit`, `Benefit delivery`, `undeliverable user benefit`, `Undeliverable User Benefit`) up-front and using those exact strings in both the prompt edit and the assertions.
- **Forgetting `sync-defaults`, leaving `.cycle/` drifted**: mitigated by the byte-identical dogfood tests (now present for both prompts) plus the explicit `diff -q` step in Task 5 — drift fails the gate rather than passing silently.
- **`sync-defaults` reports local divergence (exit 2)** because `.cycle/prompts/*` was hand-edited out of band: mitigated by editing only `src/defaults/` and letting sync propagate; if divergence is reported, re-sync with the documented `--force` / `CYCLE_SYNC_DEFAULTS_FORCE=1` override only after confirming `.cycle/` holds no intentional local change.
- **NEEDS-FIX regex over-broad / brittle** (`[\s\S]*` spanning the whole enumeration): mitigated by anchoring on the literal `NEEDS-FIX triggers:` prefix exactly as the existing Acceptance-Criteria regex does, keeping the new test consistent with the established pattern.
