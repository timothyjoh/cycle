**PASS — no MUST-FIX.md needed.**

Three-pass summary:

**Pass 1 (Code Quality):** Clean. Subprocess discipline throughout. Push-guard logic at `commit-cycle.ts:202` correctly handles all three modes. Both cli.ts wiring sites (resume + main drain) symmetric in retry/terminal behavior. SPEC→PLAN traceability complete.

**Pass 2 (Tests):** Strong. 429 pass, coverage 99.16%/92.04%/97.22%, all per-file floors met. Two minor gaps noted (closes block not tested end-to-end through commitCycle; worktree-pr push path untested) — neither rises to must-fix since worktree-pr is deferred and the closes block unit test + commit-args wiring are straightforward.

**Pass 3 (Doc-vs-Code):** All 18 enumerated doc claims backed by exact `file:line` references. `cycle.checkout` event, denylist constants, artifact paths, retry behavior — all match.
