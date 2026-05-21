# Spec: Fix Spec Step Learning-Mode Conflict Causing Recurring SPEC.md Contamination

## Objective

Extend `sanitizeArtifactStdout` to strip the two observed SPEC.md contamination patterns (`SPEC.md written to \`path\`.` and `Single deliverable: …`) that recur across cycles despite existing prompt guardrails. Add a concrete negative example of the exact contamination to `spec.md`'s `## File Artifact Mode` section. Add test coverage for both the sanitizer extension and the prompt guardrail content.

## Acceptance Criteria

- [ ] `sanitizeArtifactStdout` strips `SPEC.md written to \`path\`.` leading confirmation line
- [ ] `sanitizeArtifactStdout` strips `Single deliverable:` leading line
- [ ] New test cases in `sanitize-artifact.test.ts` cover both patterns
- [ ] `src/defaults/prompts/spec.md` contains the exact string `SPEC.md written to` as a concrete negative example
- [ ] `spec-prompt-ac.test.ts` has an assertion verifying `confirmation sentences` phrase is present
- [ ] All tests pass with global coverage gates met (Line ≥ 95%, Branch ≥ 75%, Function ≥ 90%)

## Out of Scope

- Invocation-layer suppression (stripping learning-mode system context before artifact-writing steps)
- Engine post-conditions to reject structurally invalid SPEC.md (no `## Acceptance Criteria`)
- Sanitization hardening for other artifact types beyond what the regex naturally covers
- Fixing the `sync-defaults` NVM path divergence in `.cycle/scripts/verify.sh`
