```markdown
# Research: Cycle 0021

## Cycle Context

SPEC.md asks for two coupled changes to triage: (1) update `triage.md` prompt
with an explicit "infer sibling dependencies on decomposition" rule plus a
chained worked example, and clarify that `depends_on` ids must resolve to a
sibling child / current `tbd.jsonl` row / `todo/<id>.md` file; (2) extend the
post-agent validator in `src/engine/triage.ts` to enforce that resolution and
reject self-loops, threading the offending child id + offending reference back
into the existing per-raw retry feedback loop. Add tests in
`tests/engine/triage.test.ts` for happy-path chained siblings, dangling-id
rejection, self-loop rejection, and existing-queue resolution.

## Current Codebase State

### Relevant Components

- Triage engine: `src/engine/triage.ts:1-604` — single source of truth for
  raw → todo conversion. Exports `runTriage`, `validateOutput`, and the
  `TriageDeps` / `TriageAgentRunner` injection seam used by tests.
- Prompt template (canonical): `src/defaults/prompts/triage.md:1-121` —
  shipped default copied into consumer repos via `npm run sync-defaults`.
- Prompt template (dogfooded, in-tree): `.cycle/prompts/triage.md` —
  currently byte-identical to `src/defaults/prompts/triage.md` (verified by
  diff).
- Triage test suite: `tests/engine/triage.test.ts:1-792` — 15+ tests using
  `runAgent` injection, captured logger, temp repo per test.
- Queue schema: `src/engine/queue.ts:6-15` — `QueueRow` includes `id`,
  `depends_on: string[]`, `triaged_at`, optional `parent`, `cycle_id`.
- Workflow config types: `src/engine/workflow.ts:5-35` — `CycleConfig.workflows[].name`
  is the allow-list the validator already checks against.
- Frontmatter writer: `src/engine/frontmatter.ts:51-58` — serializes
  `depends_on` arrays into todo file frontmatter via `serializeValue`.
- RFC-001 §5 (triage): `docs/RFC-001-issue-lifecycle.md:205-225` — lists
  current engine actions and validation behavior. §15 open questions at
  `docs/RFC-001-issue-lifecycle.md:415` already names "Triage's depends_on
  inference quality" as the deferred follow-up this cycle closes.
- CLAUDE.md triage paragraph: `CLAUDE.md` "Architecture quick reference"
  section (the triage paragraph beginning "Triage subroutine:") — current
  text enumerates validator behavior but does not mention `depends_on`
  resolution.

### Existing Patterns to Follow

- **Validator return shape**: `validateOutput` returns a discriminated union
  `{ ok: true; parsed } | { ok: false; reason: string }` —
  `src/engine/triage.ts:258-433`. New checks must use the same shape and
  produce a single `reason` string that names the offending child index/id
  and the offending value. Examples already present at lines 326-330
  (`children[i].depends_on[j]`), 352-356 (`children[i].id`), 386-391
  (duplicate child id), 398-402 (queue collision), 414 / 418-422 (ordering).
- **Error message style for retry**: messages flow verbatim into the next
  prompt via `lastError → feedback → renderPrompt(... "PREVIOUS ATTEMPT
  FAILED VALIDATION:\n${lastError}" ...)` — `src/engine/triage.ts:112-114`
  and `src/engine/triage.ts:236-256`. Messages must be self-contained: name
  field path + value, so the agent can self-correct on the next pass.
- **Sibling resolution set construction**: `children` is built top-down at
  `src/engine/triage.ts:309-373`. Existing collision checks already build
  `seen` (line 384) and `queueIds` (line 395) and `childIds` (line 408).
  New code can reuse these sets — they're computed after all per-child
  shape checks pass.
- **`todo/` listing**: `listTodos(repoRoot)` returns `readdir`-sorted
  `*.md` basenames including the `.md` extension —
  `src/engine/triage.ts:227-234`. The same listing is fed to the prompt as
  `{{TODO_LISTING}}`. To resolve a `depends_on` id against `todo/`, the
  validator must compare `id` against `basename.replace(/\.md$/,"")`.
  Currently `listTodos` is only used inside `runTriage`, not threaded into
  `validateOutput`; SPEC's "todo/<id>.md" criterion requires plumbing the
  listing through.
- **Per-raw retry loop**: `for (let attempt = raw.attempts; attempt <
  MAX_ATTEMPTS; ...)` at `src/engine/triage.ts:109-183` — validator
  failure path at lines 148-158 sets `lastError`, bumps the persisted
  `triage_attempts`, emits `triage.raw.failed`, and continues to the next
  attempt. This is exactly the path new resolution failures should ride.
- **Prompt template variables**: four substitutions —
  `{{RAWS_BLOCK}}`, `{{TBD_JSONL}}`, `{{TODO_LISTING}}`,
  `{{RETRY_FEEDBACK}}` — `src/engine/triage.ts:251-255`. Adding prompt
  examples does not require code changes; substitutions are positional and
  no-op when absent. Tests use a stub template (`tests/engine/triage.test.ts:56-60`)
  so prompt-rule changes don't break them.
- **Test harness shape**: each test uses `setupRepo()` to scaffold
  `.cycle/prompts/triage.md` + raw/todo/done/failed dirs, then injects a
  `runAgent` that returns canned `{exitCode, stdout, stderr}`
  (`tests/engine/triage.test.ts:49-62`, `133-139`, `261-281`). The
  validator-failure-then-success pattern is at lines 360-436.
- **Few-shot example precedent**: the prompt already carries a worked
  example block at `src/defaults/prompts/triage.md:91-120` showing a
  two-child decomposition. The SPEC's three-child chained example
  (`auth-middleware` → `login-form` → `2fa-flow`) is a direct extension
  of that block's structure.

### Dependencies & Integration Points

- `runTriage` → `validateOutput`: `src/engine/triage.ts:148` is the only
  call site. Signature change to pass the todo listing (or a pre-computed
  `Set<string>` of known ids) must be reflected here.
- `validateOutput` is exported (`src/engine/triage.ts:258`) but not
  imported anywhere outside `tests/engine/triage.test.ts`. No external
  consumers to consider.
- `applyRaw` writes `depends_on` to both `todo/<id>.md` frontmatter
  (`src/engine/triage.ts:456`) and `tbd.jsonl` row (`src/engine/triage.ts:472`).
  No change needed there — the validator runs before `applyRaw`.
- `cli.ts` runs triage on engine start and again at the top of the pop
  loop whenever `raw/` is non-empty (per CLAUDE.md). Pure-validator
  changes are CLI-transparent.
- `sync-defaults` script copies `src/defaults/` → `.cycle/`. After editing
  `src/defaults/prompts/triage.md`, must run `npm run sync-defaults` to
  align `.cycle/prompts/triage.md`.

### Test Infrastructure

- Framework: Node's built-in `node:test` + `node:assert/strict`, no
  external test runner.
- Layout: `tests/engine/triage.test.ts` colocates all triage cases;
  per-test isolation via `mkdtemp(tmpdir(), "cycle-triage-")` and
  `rm(root, {recursive,force})` in `finally` — `tests/engine/triage.test.ts:49-62`.
- Mocking approach: agent subprocess stubbed exclusively via
  `TriageDeps.runAgent`. No fs mocks, no `child_process` mocks, no global
  monkey-patching.
- Logger capture: `makeLog()` returns `{log, events}` where `events`
  collects `{event, fields}` — `tests/engine/triage.test.ts:39-47`. Tests
  assert on `events.find(e => e.event === "...")` or `.fields.reason`.
- Existing coverage of the change area: `validateOutput` already has
  test coverage for JSON-parse failure, non-object, missing arrays,
  string-field type checks, id-shape, workflow allow-list, unknown
  raw_id, duplicate child id, queue collision, and ordering rules
  (`tests/engine/triage.test.ts:754-791` and across the file). Coverage
  baseline per CLAUDE.md: line ≥ 95%, branch ≥ 75%, function ≥ 90%.
- Validator-retry-feedback assertion pattern at
  `tests/engine/triage.test.ts:419-428` (`seenPrompts[1].includes("PREVIOUS
  ATTEMPT FAILED VALIDATION:")` + substring of expected error). New tests
  for dangling-id and self-loop should follow the same pattern.

## Code References

- `src/engine/triage.ts:65` — `MAX_ATTEMPTS = 3` (the retry budget).
- `src/engine/triage.ts:93-96` — prompt template read from
  `.cycle/<cfg.triage.prompt>` (resolves to `.cycle/prompts/triage.md`).
- `src/engine/triage.ts:109-183` — per-raw retry loop where validator
  failure becomes `lastError` and feeds the next attempt.
- `src/engine/triage.ts:148-158` — current validator failure path
  (validation `ok:false` → `lastError = validation.reason` →
  `triage.raw.failed` event).
- `src/engine/triage.ts:227-234` — `listTodos(repoRoot)`; returns file
  basenames (with `.md`).
- `src/engine/triage.ts:258-433` — `validateOutput`: structural checks,
  workflow allow-list, raw_id membership, duplicate-id check, queue
  collision, ordering rules. No `depends_on`-content check today.
- `src/engine/triage.ts:332-345` — current `depends_on` validation:
  array-of-string only; no id resolution.
- `src/engine/triage.ts:395-408` — `queueIds`, `pendingIds`, `childIds`
  sets are already built here for ordering checks; can be reused for
  `depends_on` resolution.
- `src/engine/triage.ts:451-479` — `applyRaw` writes child
  `depends_on` to todo frontmatter and `tbd.jsonl` row.
- `src/defaults/prompts/triage.md:67-69` — current `depends_on` rule
  ("ids of other children's ids, or existing queue ids"). Lacks the
  sibling-inference instruction and the "never invent ids" clarification.
- `src/defaults/prompts/triage.md:79-90` — "Rules of thumb" section
  where the new sibling-inference rule should live.
- `src/defaults/prompts/triage.md:91-120` — existing two-child worked
  example; new three-child chained example slots in next to it.
- `src/engine/queue.ts:6-15` — `QueueRow.depends_on: string[]`; queue
  ids are the resolution source for option (b).
- `docs/RFC-001-issue-lifecycle.md:205-225` — current triage section;
  the validator-rule line is a candidate for a one-line bullet update.
- `docs/RFC-001-issue-lifecycle.md:415` — "Triage's `depends_on`
  inference quality" listed under §15 open questions; this cycle moves
  it to landed.
- `CLAUDE.md` triage paragraph in "Architecture quick reference" — to
  be extended with "validator resolves depends_on against siblings ∪
  tbd.jsonl ∪ todo/, rejects self-loops, dangling/self-loop failures
  feed retry."
- `tests/engine/triage.test.ts:360-436` — canonical validator-failure→
  retry-feedback→success test pattern to mirror for the new cases.
- `tests/engine/triage.test.ts:79-104` — `decomposeJson(rawId)` helper
  emits a two-child chained `depends_on`; the new happy-path test wants
  a three-child variant.

## Open Questions

- **`todo/` resolution scope**: `listTodos` returns the current on-disk
  listing at the start of the raw's attempt loop. Should the resolution
  set be computed once per raw (current listing only) or re-read on
  each attempt? Today the queue rows are re-read per attempt
  (`src/engine/triage.ts:110`); follow that for consistency.
- **Resolution-set passing**: should `validateOutput`'s signature grow a
  `todoIds: Set<string>` parameter, or should the function call
  `listTodos` itself? Current style keeps `validateOutput` pure (no I/O)
  and pushes I/O to `runTriage`; a plumbed parameter preserves that.
- **Sibling vs. queue priority**: a `depends_on` id could in principle
  collide between a sibling child id and a queue/`todo/` id (the
  validator already rejects child ids that collide with queue rows at
  `src/engine/triage.ts:395-403`, so this is unreachable today). Plan
  step should confirm no edge case introduced.
- **Empty `depends_on`**: SPEC requires only rejection of unresolved /
  self-referential ids; an empty array remains valid (current behavior
  at `src/engine/triage.ts:332-345`). Worth an explicit test or covered
  by existing happy-path? Existing enrich-only tests already pass empty
  arrays through, so coverage exists.
- **Decomposed-parent id in `depends_on`**: a child could reference its
  raw parent id (e.g., `parent` while creating `parent-a`/`parent-b`).
  The parent is being moved to `done/` in the same pass, so it is not
  in `tbd.jsonl`, not in `todo/`, and not in `children`. SPEC implies
  this is dangling and should be rejected; plan step should confirm
  the wording for the resulting error message.
```
