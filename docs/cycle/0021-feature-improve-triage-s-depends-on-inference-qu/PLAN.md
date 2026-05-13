```markdown
# Implementation Plan: Cycle 0021

## Overview
Teach the triage agent (via prompt) to infer sibling `depends_on` chains on
decomposition, and enforce in the validator that every `depends_on` id resolves
to a sibling child / `tbd.jsonl` row / `todo/<id>.md` file (no self-loops, no
dangling refs). Validator failures ride the existing per-raw retry feedback
path; whole-pass failure preserves current `engine.paused` behavior.

## Current State (from Research)
- `src/engine/triage.ts:148` is the sole `validateOutput` call site; the
  function is pure (no I/O) and returns `{ ok, parsed | reason }`.
- `validateOutput` already builds `queueIds`, `childIds`, `pendingIds` sets at
  `src/engine/triage.ts:395-408` for ordering checks — easy to reuse.
- `depends_on` is structurally validated as `string[]` at
  `src/engine/triage.ts:332-345` but contents are never resolved.
- `listTodos(repoRoot)` exists at `src/engine/triage.ts:227-234` and returns
  `*.md` basenames (with extension). Already called once per attempt to render
  the prompt (`src/engine/triage.ts:111`).
- Retry-feedback path: validator `reason` becomes `lastError`, threaded into
  the next prompt via `{{RETRY_FEEDBACK}}` (`src/engine/triage.ts:112-114`).
- Prompt: `src/defaults/prompts/triage.md` — depends_on rule lives in
  "Field rules" (lines 67-69) and "Rules of thumb" (lines 79-90); one
  two-child worked example at lines 91-120.
- Test pattern for validator-failure → retry-feedback → success is at
  `tests/engine/triage.test.ts:360-436`. Stub agent via `TriageDeps.runAgent`,
  log capture via `makeLog()`.

## Desired End State
- Triage prompt explicitly instructs the agent to: (a) infer chained
  `depends_on` between sibling children when decomposing, (b) only use ids
  resolvable to a sibling / queue row / `todo/` file. Verified by reading
  `src/defaults/prompts/triage.md` and the synced `.cycle/prompts/triage.md`.
- `validateOutput` takes a `todoIds: Set<string>` argument, resolves every
  `child.depends_on[j]` against `siblings ∪ queueIds ∪ todoIds`, and rejects
  self-loops (`child.id ∈ child.depends_on`). On rejection it returns a
  `reason` naming offending `children[i].id` and the offending reference.
  Verified by new unit tests.
- `runTriage` passes the existing per-attempt `todoListing` into the validator
  (stripped of `.md`); failures continue to ride the existing retry path.
  Verified by retry-feedback assertion in new tests.
- `CLAUDE.md` triage paragraph mentions the new resolution rule. RFC-001 §5
  adds a one-line validator bullet; §15 open-question line for this issue
  marked landed.
- `npm test` green; `npm run typecheck` clean; coverage line ≥ 95% / branch ≥
  75% / func ≥ 90% with no per-file regression in `src/engine/triage.ts`.

## What We're NOT Doing
- No cross-raw dependency inference (one raw per agent call stays).
- No cycle detection across the global queue graph.
- No resolution against `done/` or `failed/` ids — three sources only.
- No change to `applyRaw`, frontmatter writer, or `tbd.jsonl` row schema.
- No change to the per-raw retry budget (`MAX_ATTEMPTS = 3`) or
  `engine.paused` semantics.
- No README user-facing change (per SPEC).

## Implementation Approach
Two coupled changes plus tests, in this order:
1. **Validator first (red-green).** Add the resolution check with a plumbed
   `todoIds` parameter. Land tests for happy-path, dangling, self-loop,
   existing-queue resolution. Keep `validateOutput` pure — `runTriage` owns
   the I/O for `todoIds`.
2. **Prompt second.** Update `src/defaults/prompts/triage.md` with the new
   rule + three-child chained example. Run `npm run sync-defaults` to
   propagate to `.cycle/`. Stub-based tests use a minimal template
   (`tests/engine/triage.test.ts:56-60`) so prompt text changes don't break
   tests; verify the synced file matches by diff.
3. **Docs last.** Update `CLAUDE.md` and `docs/RFC-001-issue-lifecycle.md`
   together with the merged change.

Reasoning: validator change is the only behavior change; doing it first
catches regressions before the prompt nudges the agent toward chained
`depends_on` it would now actually fail without resolution.

---

## Task 1: Plumb `todoIds` into `validateOutput` and add resolution check

### Overview
Extend `validateOutput` to take a `Set<string>` of currently-known `todo/`
ids and reject any `depends_on` entry that cannot be resolved to a sibling
child id, a current `tbd.jsonl` row id, or a `todo/` id. Reject self-loops
with a distinct error message. Thread the listing through `runTriage`.

### Changes Required

**File**: `src/engine/triage.ts`

**Change 1.1** — Signature + new resolution pass in `validateOutput`
(around `src/engine/triage.ts:258-433`):

- Add a fifth parameter `todoIds: Set<string>` to `validateOutput`. Build
  it in `runTriage` from the existing `todoListing` by stripping the `.md`
  suffix:
  ```ts
  const todoIds = new Set(
    todoListing.map((f) => f.replace(/\.md$/, "")),
  );
  ```
  and pass it at the call site (`src/engine/triage.ts:148`).
- After the existing `childIds` set is built (line ~408) — and after the
  ordering loop completes — add a new resolution pass:
  ```ts
  const knownIds = new Set<string>([...childIds, ...queueIds, ...todoIds]);
  for (let i = 0; i < children.length; i++) {
    const c = children[i];
    for (let j = 0; j < c.depends_on.length; j++) {
      const dep = c.depends_on[j];
      if (dep === c.id) {
        return {
          ok: false,
          reason: `children[${i}].depends_on[${j}]: ${c.id} depends on itself (self-loop)`,
        };
      }
      if (!knownIds.has(dep)) {
        return {
          ok: false,
          reason: `children[${i}].depends_on[${j}]: ${dep} is not a sibling child, tbd.jsonl row, or todo/<id>.md file (offending child: ${c.id})`,
        };
      }
    }
  }
  ```
- Self-loop check runs first so a child listing its own id gets the more
  specific message (instead of the generic "unresolved" message — `c.id` is
  in `childIds` so the generic check would otherwise pass).

**Change 1.2** — Update the single call site at
`src/engine/triage.ts:148`:
```ts
const todoIds = new Set(todoListing.map((f) => f.replace(/\.md$/, "")));
const validation = validateOutput(agentResult.stdout, [raw], queueRows, cfg, todoIds);
```
(`todoListing` is already in scope from line 111.)

**Change 1.3** — No other caller of `validateOutput` exists outside tests
(per RESEARCH lines 99-101). Update test call sites in Task 4.

### Success Criteria
- [ ] `npm run typecheck` clean (new parameter wired everywhere).
- [ ] Existing triage tests still pass after passing an empty
  `new Set<string>()` for `todoIds` where appropriate.
- [ ] `validateOutput` is still pure (no I/O), per the existing convention.
- [ ] Error messages name offending child id + offending reference (SPEC
  requirement).

---

## Task 2: Prompt update — sibling-inference rule + chained example

### Overview
Add an explicit "infer sibling deps on decomposition" rule and a clarification
that `depends_on` ids must resolve to siblings / queue / `todo/` (never
invented). Add a three-child worked example showing chained `depends_on`.

### Changes Required

**File**: `src/defaults/prompts/triage.md`

**Change 2.1** — Rewrite the `depends_on` bullet in "Field rules"
(lines 67-69):
```md
- `depends_on` is an array of ids that must each resolve to one of:
  (a) another child id in this same output, (b) a current `tbd.jsonl`
  row id, or (c) a `todo/<id>.md` file in the listing above. **Never
  invent ids.** A child must not list its own id. Empty array if no
  dependencies.
```

**Change 2.2** — Add a new "Rules of thumb" bullet (insert after line 87,
before the "Do not reorder" bullet):
```md
- When decomposing one raw into multiple children, infer ordering: if
  child B builds on child A's output (e.g. UI built on a new endpoint,
  test fixture used by a later step), set `B.depends_on = [A.id]`. Chain
  through C if C builds on B. Use `depends_on` for true causal /
  sequential constraints, not for "this would be nicer second."
```

**Change 2.3** — Replace the worked example block (lines 91-120) with a
three-child chained example:
```md
## Example

Input raw with `id: txt-001`, title "Add login":

\`\`\`json
{
  "ordering": [
    "txt-001-auth-middleware",
    "txt-001-login-form",
    "txt-001-2fa-flow"
  ],
  "children": [
    {
      "raw_id": "txt-001",
      "slug": "auth-middleware",
      "id": "txt-001-auth-middleware",
      "title": "Add session auth middleware",
      "workflow": "feature",
      "depends_on": [],
      "body": "Build session-cookie middleware behind /api routes.\n"
    },
    {
      "raw_id": "txt-001",
      "slug": "login-form",
      "id": "txt-001-login-form",
      "title": "Add login form UI",
      "workflow": "feature",
      "depends_on": ["txt-001-auth-middleware"],
      "body": "Add /login route + form posting to /api/session.\n"
    },
    {
      "raw_id": "txt-001",
      "slug": "2fa-flow",
      "id": "txt-001-2fa-flow",
      "title": "Add optional 2FA on login",
      "workflow": "feature",
      "depends_on": ["txt-001-login-form"],
      "body": "Layer TOTP challenge onto the login form path.\n"
    }
  ],
  "decomposed_parents": ["txt-001"]
}
\`\`\`
```

**Change 2.4** — Run `npm run sync-defaults` so
`.cycle/prompts/triage.md` matches `src/defaults/prompts/triage.md`
byte-for-byte.

### Success Criteria
- [ ] `diff src/defaults/prompts/triage.md .cycle/prompts/triage.md`
  outputs nothing.
- [ ] Prompt explicitly lists the three resolution sources (sibling /
  `tbd.jsonl` / `todo/`) and "never invent ids" / "no self-reference".
- [ ] Example demonstrates chained `depends_on` across three siblings.
- [ ] Existing triage tests still pass (test stub template at
  `tests/engine/triage.test.ts:56-60` is independent of the shipped
  prompt).

---

## Task 3: Tests — happy-path chained, dangling-id, self-loop, queue/todo resolution

### Overview
Cover the four scenarios from SPEC Testing Strategy plus the existing-queue
resolution variant. Follow the canonical retry-feedback test pattern at
`tests/engine/triage.test.ts:360-436`.

### Changes Required

**File**: `tests/engine/triage.test.ts`

**Change 3.1** — Add a helper at the top of the file (after
`decomposeJson` around line 79) that emits a three-child chained payload:
```ts
function chainedDecomposeJson(rawId: string): string {
  return JSON.stringify({
    ordering: [
      `${rawId}-auth-middleware`,
      `${rawId}-login-form`,
      `${rawId}-2fa-flow`,
    ],
    children: [
      { raw_id: rawId, slug: "auth-middleware", id: `${rawId}-auth-middleware`,
        title: "Auth middleware", workflow: "feature",
        depends_on: [], body: "x\n" },
      { raw_id: rawId, slug: "login-form", id: `${rawId}-login-form`,
        title: "Login form", workflow: "feature",
        depends_on: [`${rawId}-auth-middleware`], body: "x\n" },
      { raw_id: rawId, slug: "2fa-flow", id: `${rawId}-2fa-flow`,
        title: "2FA flow", workflow: "feature",
        depends_on: [`${rawId}-login-form`], body: "x\n" },
    ],
    decomposed_parents: [rawId],
  });
}
```

**Change 3.2** — New test: happy-path chained siblings.
- Set up one raw via `setupRepo()`, stub `runAgent` to return
  `chainedDecomposeJson("r1")`.
- Run `runTriage`. Assert: `processed=["r1"]`, three files in `todo/`,
  `tbd.jsonl` has three rows with chained `depends_on`, raw file moved to
  `done/<id>_raw.md`.
- Read each todo file and assert frontmatter `depends_on` matches.

**Change 3.3** — New test: dangling-id rejection + retry feedback.
- First stub response: same as chained, but one child carries
  `depends_on: ["does-not-exist"]`.
- Second stub response: valid `decomposeJson("r1")`.
- After `runTriage`, assert:
  - `events.find(e => e.event === "triage.raw.failed").fields.reason`
    contains both `does-not-exist` and the offending child id.
  - The second prompt rendered by the stub contains
    `PREVIOUS ATTEMPT FAILED VALIDATION:` and the dangling id (mirror
    `tests/engine/triage.test.ts:419-428`).
  - Final state: `processed=["r1"]`, second attempt succeeded.

**Change 3.4** — New test: self-loop rejection.
- Stub returns a child `foo` with `depends_on: ["r1-foo"]` and `id:
  "r1-foo"`.
- Assert validator failure with `reason` containing `self-loop` and the
  offending child id; assert retry path triggered (event count and the
  next-attempt prompt substring).
- Make the retry succeed via second stub response to avoid hitting
  `engine.paused` and keep the test focused on the validator wording.

**Change 3.5** — New test: existing-queue / todo resolution.
- Pre-seed `tbd.jsonl` with one pending row `{id: "old-1", status:
  "pending", ...}`.
- Pre-seed one `todo/old-2.md` file.
- Stub returns a single child whose `depends_on` is `["old-1", "old-2"]`.
- Assert validator accepts (no `triage.raw.failed`), todo created with
  those deps, queue row added with those deps.

**Change 3.6** — Unit-level `validateOutput` tests (no agent loop) for
the new branches, mirroring the existing terse `validateOutput` tests at
`tests/engine/triage.test.ts:754-791`:
- Dangling id with explicit `todoIds: new Set()`.
- Self-loop with `todoIds: new Set()`.
- Resolution via `todoIds` only (sibling and queue empty).

These pure-function tests pin branch coverage without paying the cost of
the retry harness.

### Success Criteria
- [ ] All new tests pass under `npm test`.
- [ ] Retry-feedback assertions confirm the error message names both the
  offending child id and the offending reference.
- [ ] `npm run test:coverage` shows no per-file regression in
  `src/engine/triage.ts` (branch coverage on new lines covered by tests
  3.2 / 3.3 / 3.4 / 3.6).
- [ ] No new external mocks; agent stubbing via `TriageDeps.runAgent`
  only.

---

## Task 4: Update existing callers / signatures

### Overview
Touch existing call sites that pass `validateOutput` to add `todoIds`.

### Changes Required

**File**: `tests/engine/triage.test.ts`

- Search for existing direct `validateOutput(...)` calls (the
  pure-function tests around `tests/engine/triage.test.ts:754-791`) and
  pass `new Set<string>()` as the fifth argument unless the test
  specifically asserts `todoIds` resolution.

**File**: `src/engine/triage.ts:148` — already covered by Change 1.2.

### Success Criteria
- [ ] No `TS2554` "expected N got M" errors in `npm run typecheck`.
- [ ] All pre-existing tests still green.

---

## Task 5: Documentation updates

### Overview
Reflect the new validator behavior in CLAUDE.md and RFC-001.

### Changes Required

**File**: `CLAUDE.md`

- Extend the triage paragraph in "Architecture quick reference" with:
  > The validator also resolves every `depends_on` id against
  > `siblings ∪ tbd.jsonl rows ∪ todo/<id>.md files` and rejects
  > self-loops; resolution failures feed the existing per-raw retry like
  > other validator errors.

**File**: `docs/RFC-001-issue-lifecycle.md`

- In §5 (triage validator rules), add a one-line bullet for
  `depends_on` resolution + self-loop rejection.
- In §15 open questions, mark
  "Triage's `depends_on` inference quality" as landed in cycle 0021
  (consistent with how other items are crossed off in that section).

### Success Criteria
- [ ] CLAUDE.md change is one paragraph extension, not a new section.
- [ ] RFC-001 bullet matches the wording style of the surrounding
  validator-rule list.
- [ ] §15 line for this issue is struck through or annotated landed
  per existing convention in that section.

---

## Testing Strategy

### Unit Tests
- `validateOutput` pure-function tests for: dangling id, self-loop, resolution
  via `todoIds`, resolution via `queueIds`, resolution via sibling. Use
  `new Set<string>()` for irrelevant resolution sources.
- Edge cases:
  - Empty `depends_on` (already covered — keep at least one assertion).
  - Child references its parent raw id (which is being decomposed) — should
    be rejected as dangling because the parent is moved to `done/` and is not
    in `todoIds`, `queueIds`, nor `childIds`. Add an explicit assertion.
- **Anti-mock:** all tests run against real fs in a `mkdtemp` repo and a
  real `runTriage` call; only the agent subprocess is stubbed (matches
  existing test conventions at `tests/engine/triage.test.ts:49-62`). No
  child_process / fs mocks.

### Integration / E2E Tests
- Happy-path chained-sibling end-to-end test (Task 3.2) verifies the full
  pipeline: validator accept → `applyRaw` writes todo files and tbd.jsonl
  rows with chained `depends_on` → raw moves to `done/`.
- Dangling-id retry test (Task 3.3) verifies the cross-attempt feedback
  thread, the only place where validator wording becomes user-observable.

## Risk Assessment

- **Risk:** Self-loop check ordering matters. If the generic "unresolved
  id" check runs first, a child listing its own id would actually pass
  (since `c.id ∈ childIds`) — and never hit the self-loop branch.
  **Mitigation:** Self-loop check runs first per Change 1.1; pure-function
  test in Task 3.6 asserts the self-loop-specific message wording.
- **Risk:** Per-raw `todoIds` becomes stale across attempts when the
  agent's prior attempt populated `todo/` then failed mid-apply.
  **Mitigation:** `runTriage` re-reads `todoListing` at the top of every
  attempt (`src/engine/triage.ts:111`); same per-attempt freshness applies
  to `todoIds`. No new staleness window.
- **Risk:** Stripping `.md` from listings could collide with an id that
  legitimately contains `.md` in its body. **Mitigation:** Id format is
  enforced as `raw_id-slug`, slug kebab-case alphanumeric+dashes
  (`src/defaults/prompts/triage.md:62`); `.md` cannot appear inside an id.
- **Risk:** Prompt-text change tightens "never invent ids" — the agent may
  occasionally emit `depends_on: []` instead of inferring a real
  dependency, regressing ordering quality. **Mitigation:** Out of validator
  scope; agent quality is monitored via downstream queue behavior. SPEC
  explicitly scopes prompt + validator, not agent self-evaluation.
- **Risk:** Coverage regression on the new branches if any error path is
  not exercised. **Mitigation:** Task 3.6 adds direct `validateOutput`
  unit tests for each new branch; cheap and pin branch coverage.
- **Risk:** `sync-defaults` skipped → `.cycle/prompts/triage.md` lags the
  shipped prompt and dogfooded runs use the old rule. **Mitigation:**
  Task 2.4 explicit step; success criterion is a clean `diff`.
```
