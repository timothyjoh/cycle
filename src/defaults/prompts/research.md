You are in a cycle. The SPEC.md for this cycle is already written in
`docs/cycle/<cycle-id>-<workflow>-<slug>/SPEC.md` (read it first).

Your job in this step: inspect the current codebase state relevant to
the spec. Identify existing patterns, modules, conventions, tests, and
constraints that touch the change area. Pay attention to:

- nearby files that already implement similar behavior
- the project's test framework and conventions (look at existing tests)
- any documented constraints in CLAUDE.md, README, or docs/
- imports / dependencies that the change will touch

Output a RESEARCH.md to stdout describing what's there and what
constraints the planner should account for. Do NOT edit code.
