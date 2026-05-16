Write permission needed — please approve the write to `docs/cycle/0097-feature-add-prior-deliverable-verification-claus/PLAN.md`.

The plan covers 3 tasks:
1. **Task 1** — Add `## Prior Deliverable Verification` section to `src/defaults/prompts/spec.md` (between Discover and Write sections) with the three required steps: identify, verify via shell command with inline output, resolve absences.
2. **Task 2** — Run `npm run sync-defaults` to keep `.cycle/prompts/spec.md` byte-identical.
3. **Task 3** — Create `tests/defaults/spec-prompt-prior-deliverable-verification.test.ts` with 4 tests (section header, 2 phrase assertions, parity check) matching the `plan-prompt-spec-traceability.test.ts` pattern.
