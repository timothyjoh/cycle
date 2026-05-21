RESEARCH.md written. Key findings:

- `review.md` (232 lines) has no `## File Artifact Mode` section — insert before `## Output 1: REVIEW.md` at line 109
- Exact section wording: mirror plan.md's variant (third prohibition = "trailing commentary", not spec's "informal single-sentence substitutes")
- Two key test assertion strings already required by convention: `"You are writing a file, not responding in a conversation"`, `"insight blocks or star-marker"`, `"confirmation sentences"`
- New assertions belong in `tests/defaults/review-prompt-spec-ac.test.ts` (4 existing tests there)
- Dogfood byte-identity test already exists at `plan-prompt-spec-traceability.test.ts:89–96` — will catch missed `sync-defaults`
- After editing: run `npm run sync-defaults`
