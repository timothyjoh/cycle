All changes verified. Here is what changed and why:

**`src/engine/log-fmt.ts`** (new) — single exported `truncateHeadCapped(s, max)` function replacing three independent inline implementations of the same head-capped truncation logic.

**`src/engine/run-cycle.ts`** — removed the `truncateStepEndStderr` export (lines 50–51), added `import { truncateHeadCapped } from "./log-fmt.ts"`, updated the call at line 243 to `truncateHeadCapped(r.stderr, MAX_STEP_END_STDERR)`. `MAX_STEP_END_STDERR` stays exported so callers can reference the domain constant.

**`src/engine/triage.ts`** — deleted the local `MAX_ERR_LEN`/`truncate` block (lines 242–244), added `import { truncateHeadCapped } from "./log-fmt.ts"`, updated the call at line 248 to `truncateHeadCapped(lastErrors[i] ?? "", 2000)`.

**`tests/engine/run-cycle.step-end-stderr-dispatch.test.ts`** — swapped the import of `truncateStepEndStderr` (from run-cycle) for `truncateHeadCapped` (from log-fmt), updated all three unit test bodies to call `truncateHeadCapped(input, MAX_STEP_END_STDERR)`, renamed the tests accordingly, and added a new `max+1` boundary case (`"a".repeat(2001)` → length 2000 ending `…`).

**`CLAUDE.md`** — added one-liner under Architecture noting `src/engine/log-fmt.ts` as the shared truncation helper.
