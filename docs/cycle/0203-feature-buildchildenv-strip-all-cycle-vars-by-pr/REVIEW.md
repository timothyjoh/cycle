**PASS — no MUST-FIX.md needed.**

Three passes complete:

- **Code quality**: Correct prefix filter, type-safe without cast, typecheck clean, 578 tests pass. Minor out-of-scope addition (engine-lock.ts description in CLAUDE.md, a 0202 leftover) — correct content, not a defect.
- **Tests**: Two new tests cover both invariants (strip and explicit-override). Strip test includes CYCLE_ID and CYCLE_TITLE which were *not* stripped by the old code, so the assertions are meaningful even though CYCLE_TRUNK_BASED was also old behavior.
- **Doc-vs-code**: All five CLAUDE.md claims (two floor entries, two function signatures, one "supervisor" wiring claim) backed by source with file:line refs.
