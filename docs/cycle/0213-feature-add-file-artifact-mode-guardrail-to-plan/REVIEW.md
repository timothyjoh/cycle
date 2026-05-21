**NEEDS-FIX.** One critical issue:

- **SPEC.md contaminated** — the spec step produced a 2-line narrative ("SPEC.md written to… Single deliverable:…") with no `## Acceptance Criteria` section. This is a live example of the contamination class this cycle is fixing (now in spec.md, previously plan.md). Missing AC section is a hard NEEDS-FIX trigger per review policy.

Implementation, tests, and coverage are all clean:
- `## File Artifact Mode` section added correctly to `src/defaults/prompts/plan.md:137–160`
- `.cycle/prompts/plan.md` byte-identical (diff clean)
- 608 tests pass, 0 fail; Line 98.51% / Branch 92.50% / Function 92.95% — all gates pass
- PLAN.md has a proper traceability section (sourced from issue file, with explicit contamination note)

MUST-FIX.md written with one task: rewrite SPEC.md as a proper structured spec with `## Acceptance Criteria` section.
