Key findings for the planner:

- All seven templates already have `## File Artifact Mode` sections with prohibition lists and (six of seven) `**WRONG**`/`**CORRECT**` blocks — none have the new inline `FILE ARTIFACT MODE:` directive yet
- Test coverage is split across three files: `file-artifact-mode-guardrail.test.ts` (build/research/fix/documentation), `spec-prompt-ac.test.ts` (spec), `plan-prompt-spec-traceability.test.ts` (plan+review)
- `documentation.md` IS in `ARTIFACT_STEPS`, so it needs the directive
- Open question: whether the seven new directive-presence tests go in the existing files or a new one; and exact placement of the directive (top of file vs. before FAM section) is left for the planner to decide
