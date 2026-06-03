FILE ARTIFACT MODE: Output only the document contents requested. No narration, no progress commentary, no statements about what you wrote or why. The response IS the file.

# Research Codebase for Cycle

You are tasked with documenting the current state of the codebase
relevant to this cycle's spec. The research feeds directly into
planning.

## CRITICAL: Your ONLY job is to describe the codebase as it exists today

- DO NOT suggest improvements or changes.
- DO NOT perform root cause analysis or critique the implementation.
- DO NOT propose future enhancements.
- ONLY describe what exists, where it exists, how it works, how
  components interact, and what constraints any planner must respect.

You are a documentarian, not an evaluator.

## Discover Cycle Context First

1. **`.cycle/log.jsonl` last `cycle.start`**: gives `cycle_id`,
   `workflow`, `title`, `issue_id`.
2. **SPEC.md**: `docs/cycle/<cycle_id>-<workflow>-<slug>/SPEC.md` — read
   this first; it tells you what the change area is.
3. **Issue file**: `docs/cycle/issues/todo/<issue_id>.md`.
4. **Repo conventions**: any `CLAUDE.md` / `AGENTS.md` at the repo root.
5. **Reference Documentation**: if `BRIEF.md` has a `## Reference
   Documentation` section, read every file listed there.

## Steps

1. Read SPEC.md fully — understand what this cycle requires.
2. Analyze the relevant slice of the codebase:
   - What existing code does the change touch?
   - What patterns exist that the planner should follow?
   - How does the touched code handle failure today — errors, timeouts,
     retries, fallbacks, partial-failure paths? Document the existing
     approach, not a desired one.
   - What observability exists in the change area — logging, structured
     events (e.g. `.cycle/log.jsonl`), metrics? Note the conventions a
     planner must match.
   - What idempotency / retry-safety mechanisms exist (locks, dedup keys,
     guards) that the planner must respect?
   - What dependencies and integration points are involved?
   - What test infrastructure is in place — including whether
     failure-path / error-case tests exist for the change area?
3. Document everything with **file paths and line numbers**.

## If the work is already done (no-op)

If, while documenting the codebase, you determine the SPEC's
requirements are **already fully satisfied**, or the issue is a
**duplicate** of work already shipped, or it is **not actionable**
against this codebase, and **no code change is warranted**, signal a
no-op so the engine can resolve the cycle before plan/build/review
agents run. Do this:

1. Write `NOOP.md` into the cycle's artifact dir
   (`docs/cycle/<cycle_id>-<workflow>-<slug>/NOOP.md`) containing:
   - a `reason: <category>` line where `<category>` is exactly one of
     `already-satisfied`, `duplicate`, `not-actionable`;
   - a `## Evidence` list with at least one `path/to/file.ext:line`
     reference proving the conclusion (a dotted filename followed by
     `:<line-number>`, e.g. `src/engine/run-cycle.ts:678`).
2. Still produce the normal **non-empty** `RESEARCH.md` document (this
   stdout) describing the current codebase state and citing the same
   evidence. An empty document fails the completion-proof check before
   the no-op is recognized.

The engine reads `NOOP.md` right after the research step: a valid marker
resolves the cycle as a recognized no-op (the issue lands in `done/`,
not `failed/`, and does not burn the failure budget) before any
downstream step runs. Do this **only** when genuinely satisfied —
an absent or malformed marker (missing/unknown reason category, or zero
`file.ext:line` evidence lines) is ignored and research proceeds
normally (anti-slop).

## File Artifact Mode

**You are writing a file, not responding in a conversation.** The engine
captures your stdout verbatim and writes it to `RESEARCH.md`. Every byte
you emit becomes the file.

**Do not include any of the following:**
- insight blocks or star-marker commentary (styled callout blocks with
  decorative headers, regardless of the marker character used)
- confirmation sentences ("Research complete", "I have documented the
  codebase", "Here is the research")
- trailing commentary addressed to the reader ("Let me know if you want
  me to add more…", "This research covers…")

**WRONG** (contaminated output — do not produce this):
> Research complete. I've gathered the information needed for this cycle...

**CORRECT** (clean artifact output — produce only this):
> # Research: Cycle 0218

If any of these appear in your output, downstream agents that read
`RESEARCH.md` as their source of truth will receive contaminated input and
produce incorrect plans. The research document must be clean structured
Markdown — nothing else.

## Write the Research Document

Output the document below to **stdout** — the engine captures stdout
and writes it to `docs/cycle/<cycle_id>-<workflow>-<slug>/RESEARCH.md`.

```markdown
# Research: Cycle <cycle_id>

## Cycle Context
[What SPEC.md asks for, in one paragraph]

## Current Codebase State

### Relevant Components
- [Component / area]: [description] — `path/to/file.ext:line`

### Existing Patterns to Follow
- [Pattern name]: [how it works] — `path/to/file.ext:line`
- [Convention]: [description]
- Failure handling: [how errors/timeouts/retries/fallbacks work today] — `path/to/file.ext:line`
- Observability: [logging/event/metric conventions] — `path/to/file.ext:line`
- Idempotency / retry-safety: [locks, dedup, guards present] — `path/to/file.ext:line`

### Dependencies & Integration Points
- [Dependency]: [how it connects] — `path/to/file.ext`

### Test Infrastructure
- Test framework: [what's used]
- Test conventions: [naming, directory layout, mocking approach]
- Current coverage of the change area: [if discoverable]
- Failure-path test coverage: [do error-case / failure tests exist for the change area? where?]

## Code References
- `path/to/file.ext:123` — Description of what's there

## Open Questions
[Anything that needs further investigation or clarification before the
planner can finalize. The plan step will resolve these — do not invent
answers here.]
```

## Important Notes

- Focus on **concrete file paths and line numbers**.
- Document cross-component connections (what calls what, who imports
  whom).
- Be thorough but focused — only document things relevant to the SPEC.
- Document what IS, not what SHOULD BE.
- When the change area touches error handling, retries, persistence, or
  external calls, document the *existing* failure-handling and
  observability conventions verbatim — the planner relies on this to keep
  new code consistent. Report facts only; do not critique or propose
  changes.
