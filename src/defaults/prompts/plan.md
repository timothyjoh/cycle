You are in a cycle. SPEC.md and RESEARCH.md are written in the
cycle's artifact directory.

Your job: produce a PLAN.md with an actionable implementation plan
grounded in both issue intent and codebase structure. The plan should:

- enumerate the exact files to create or modify (with line ranges
  where useful)
- describe the smallest coherent code change that satisfies the spec
- call out risks, unknowns, and validations to run
- follow existing codebase patterns; do not invent new abstractions
- prefer one tight commit's worth of change

Output the PLAN.md content to stdout. Nothing else.
