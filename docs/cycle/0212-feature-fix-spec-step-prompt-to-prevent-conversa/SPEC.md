# SPEC — Cycle 0212: Fix Spec Step Prompt to Prevent Conversational Narration in SPEC.md Artifacts

## Objective
Add an explicit file-artifact instruction to the spec step prompt so the agent never emits conversational framing (insight blocks, `★` markers, confirmation sentences) into `SPEC.md` files. Downstream agents (plan, build, review) read `SPEC.md` as their source of truth; contaminated files break PLAN→SPEC traceability and force agents to infer requirements from prose.

## Source Issue
`refl-0209-spec-md-artifacts-contain-learning-mode` — "Fix spec step prompt to prevent conversational narration in SPEC.md artifacts"

## Scope

### In Scope
- Add a preamble or header instruction to `src/defaults/prompts/spec.md` that explicitly identifies `SPEC.md` as a file artifact and prohibits conversational framing
- Prohibit: insight/`★` blocks, `"Spec written to…"` confirmation messages, informal single-sentence section substitutes

### Out of Scope
- Retroactive rewrite of contaminated historical SPEC.md files (0084, 0085, 0089, 0094, 0097, 0192, 0195, 0209)
- Engine-level post-processing to strip conversational output from SPEC.md at write time
- Changes to other prompt files (plan, review, reflection)

## Requirements
- Spec prompt must include an explicit instruction that the agent is writing a file artifact, not responding in a conversation
- Spec prompt must explicitly prohibit insight blocks and `★` markers
- Spec prompt must explicitly prohibit confirmation sentences like "Spec written to…"
- Prohibition language must be unambiguous: both the behavior to avoid and its consequence must be stated

## Acceptance Criteria
- [ ] `src/defaults/prompts/spec.md` contains explicit language identifying the output as a file artifact
- [ ] `src/defaults/prompts/spec.md` contains an explicit prohibition on insight/`★` blocks and confirmation messages
- [ ] `npm run sync-defaults` runs cleanly so `.cycle/prompts/spec.md` is updated to match
- [ ] `npm test` passes with no regressions
- [ ] A grep for `★` or `Insight` in `src/defaults/prompts/spec.md` returns no matches in the file's body text (only in prohibited-examples if used)

## Testing Strategy
- `npm test` — full suite; no new test needed since the change is prompt text only
- Manual check: `grep -n 'Insight\|★\|written to' src/defaults/prompts/spec.md` to confirm prompt body has no contamination
- Manual check: confirm `.cycle/prompts/spec.md` matches after `sync-defaults`

## Documentation Updates
- **CLAUDE.md / AGENTS.md**: No convention changes
- **README.md**: No user-facing change
- **docs/ENGINE.md**: No change needed; this is a prompt fix, not an architecture change

## Dependencies
- `npm run sync-defaults` must propagate `src/defaults/prompts/spec.md` → `.cycle/prompts/spec.md`
