# SPEC — Cycle 0021: Triage infers `depends_on` between sibling children

## Objective

When triage decomposes a single raw into multiple children, the triage
agent should infer sequential / causal dependencies between siblings and
emit them as `depends_on` arrays on the children — and the engine
validator should reject any `depends_on` id that can't be resolved to a
real downstream consumer. This closes the loop on BB-4's "depends_on is
honored if present" by making it almost always present when it should
be, so `propagateBlocked` and the queue popper see real ordering instead
of phantom independence.

## Source Issue

`depends-on-inference` — "Improve triage's depends_on inference quality"

## Scope

### In Scope

- Update `src/defaults/prompts/triage.md` (and re-sync `.cycle/`) with
  an explicit sibling-dependency inference rule plus one worked
  few-shot example, and clarify that `depends_on` ids must reference
  another child in the same output, a current `tbd.jsonl` row id, or a
  file in `todo/` — never an invented id.
- Extend the post-agent validator in `src/engine/triage.ts` to enforce
  that every `depends_on` id resolves to (a) another child in the same
  output, (b) a current `tbd.jsonl` row, or (c) a `todo/<id>.md` file.
  Self-loops (`child.id ∈ child.depends_on`) are also rejected. Both
  failure modes feed back into the existing per-raw retry loop with a
  validator error message that names the offending child and id.
- Add tests in `tests/engine/triage.test.ts` covering: happy-path
  chained-siblings acceptance, dangling-id rejection + retry-feedback,
  and self-loop rejection.

### Out of Scope

- Cross-raw dependency inference (agent still sees one raw at a time
  per BB-4).
- Cycle detection across the global queue graph (deferred per issue).
- Re-running validation against `done/` or `failed/` ids — the three
  allowed resolution sources stay bounded.

## Requirements

- Updated `triage.md` prompt: new "infer sibling deps on decomposition"
  rule + one few-shot example showing chained `depends_on` across
  siblings.
- `src/defaults/prompts/triage.md` and `.cycle/prompts/triage.md` stay
  in sync (`npm run sync-defaults` after edit).
- Validator: every `depends_on` entry must resolve to a known id
  (sibling child, `tbd.jsonl` row, or `todo/<id>.md`); self-references
  rejected; error message names the offending child id and offending
  reference; validator failure feeds the existing per-raw retry (up to
  3 attempts) with the message threaded into the next prompt.
- Validator failure does not crash the pass — it routes through the
  same retry path that today handles JSON parse failures and schema
  errors. Whole-pass failure after exhaustion preserves current
  `engine.paused` behavior.
- Coverage thresholds preserved: line ≥ 95%, branch ≥ 75%, function
  ≥ 90%.

## Acceptance Criteria

- [ ] `src/defaults/prompts/triage.md` contains the new sibling-dep
      inference instruction and a few-shot example demonstrating
      chained `depends_on` across siblings.
- [ ] `.cycle/prompts/triage.md` matches `src/defaults/prompts/triage.md`
      after `npm run sync-defaults`.
- [ ] `src/engine/triage.ts` validator rejects: (a) a child whose
      `depends_on` references an id that is neither another child in
      the same output nor a current `tbd.jsonl` row nor a file in
      `todo/`; (b) a child whose `depends_on` includes its own id.
- [ ] On validator rejection, the per-raw retry loop re-prompts the
      agent with an error message that names the offending child id
      and offending `depends_on` reference.
- [ ] New unit tests in `tests/engine/triage.test.ts` (or sibling file)
      cover: happy-path chained siblings, dangling-id rejection +
      retry-feedback verification, self-loop rejection.
- [ ] `npm test` passes; `npm run typecheck` clean.
- [ ] `npm run test:coverage` reports line ≥ 95%, branch ≥ 75%,
      function ≥ 90% with no per-file regressions in `src/engine/triage.ts`.
- [ ] `CLAUDE.md` triage paragraph updated to mention that the
      validator now resolves `depends_on` ids against siblings + queue
      + `todo/`.

## Testing Strategy

- Framework: Node's built-in test runner (`node --test`), matching the
  rest of `tests/engine/`.
- Stub the agent subprocess via the existing test harness in
  `tests/engine/triage.test.ts`; have the stub return canned JSON
  payloads per scenario.
- Scenarios:
  - **Happy path:** raw "add login" → three children
    (`auth-middleware`, `login-form` depends on `auth-middleware`,
    `2fa-flow` depends on `login-form`). Assert validator accepts,
    `tbd.jsonl` rows carry the chained `depends_on`, and `todo/<id>.md`
    frontmatter reflects it.
  - **Dangling id:** child references `does-not-exist` in
    `depends_on`. Assert validator rejects, the per-raw retry counter
    increments, and the next stub invocation receives a prompt
    containing the validator's error string (offending child id +
    offending reference).
  - **Self-loop:** child `foo` has `depends_on: [foo]`. Assert
    validator rejects with a self-loop-specific error and feeds it to
    the retry.
  - **Existing-queue resolution:** child references an id that is not
    a sibling but is a row already in `tbd.jsonl` (or a file in
    `todo/`). Assert validator accepts.
- No UI; no Playwright needed.

## Documentation Updates

- **CLAUDE.md**: extend the triage subroutine paragraph in
  "Architecture quick reference" to note that the validator resolves
  every `depends_on` id against (sibling children ∪ `tbd.jsonl` rows ∪
  `todo/` files) and rejects self-loops; dangling/self-loop failures
  feed into the per-raw retry like other validator errors.
- **README.md**: no user-facing surface change — skip.
- **`docs/RFC-001-issue-lifecycle.md`**: if §5 (triage) enumerates
  validator rules, add the new one alongside the existing ones; a
  one-line bullet is enough.

Documentation is part of "done" — code without updated docs is incomplete.

## Dependencies

- BB-4 triage subroutine already shipped (it is — `src/engine/triage.ts`
  exists with the per-raw retry loop and JSON validator).
- `propagateBlocked` (BB-6) already shipped — this cycle increases the
  value of its existing behavior but doesn't change it.
- No new external services or env vars.
