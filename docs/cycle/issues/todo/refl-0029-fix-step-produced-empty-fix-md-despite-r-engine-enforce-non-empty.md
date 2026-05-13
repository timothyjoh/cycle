---
id: refl-0029-fix-step-produced-empty-fix-md-despite-r-engine-enforce-non-empty
title: "Engine: fail fix step when MUST-FIX.md has unchecked tasks and FIX.md is empty"
workflow: feature
depends_on: [refl-0029-fix-step-produced-empty-fix-md-despite-r-prompt-enumerate-must-fix]
triaged_at: "2026-05-13T21:49:11.797Z"
source: triage
parent: refl-0029-fix-step-produced-empty-fix-md-despite-r
---
## Problem

The fix step's `step.end status:ok` event today does not require FIX.md to corroborate it. In cycle 0029, MUST-FIX.md had two checked tasks (1, 2), one deferred (3), and one dropped (4), yet FIX.md was emitted as a single blank line. The engine accepted the empty artifact and moved on. This means the only structured trail of what closed inside the fix step is the diff — reflection has to reconstruct intent and guess at MUST-FIX dispositions.

The sibling raw `refl-0029-fix-step-produced-empty-fix-md-despite-r-prompt-enumerate-must-fix` tightens the prompt to require a non-empty enumerated FIX.md. This child adds the engine-side enforcement so prompt drift cannot silently re-introduce the regression.

## Direction

After the `fix` step's child process exits with `status:ok`, the engine should:

1. Read the cycle's `MUST-FIX.md` artifact. If it does not exist or has zero task lines (matching whatever bullet/checkbox shape the build/fix steps emit), skip the check.
2. If MUST-FIX.md has one or more task lines, read `FIX.md` from the cycle artifact dir.
3. If FIX.md is missing or has no non-whitespace content, flip the step result to failed with a clear reason (e.g. `"fix step produced empty FIX.md while MUST-FIX.md has N unchecked task(s)"`), surfacing the artifact paths so operators can fix on retry.
4. Emit `step.end status:failed` with the structured reason so the existing terminal-failure / propagateBlocked machinery handles it like any other failure.

Keep the check tight: scan for non-whitespace bytes in FIX.md and for task lines in MUST-FIX.md; don't try to parse the dispositions themselves (that's the prompt's job). Goal is to make empty FIX.md a hard failure of the fix step, not to validate disposition strings.

## Acceptance

- Engine `fix` step handler (likely `src/engine/workflow.ts` / `src/engine/exec.ts` post-step hook) gains the MUST-FIX-vs-FIX.md guard.
- Failure path emits `step.end status:failed` with a non-empty reason naming the artifact (e.g. `"FIX.md empty while MUST-FIX.md has 4 task(s)"`).
- Unit test in `tests/engine/` covers three cases: (a) MUST-FIX absent → no check, step stays ok; (b) MUST-FIX present + FIX.md non-empty → step stays ok; (c) MUST-FIX present + FIX.md empty/missing → step flipped to failed.
- Coverage gate on touched files holds the CLAUDE.md baseline (line ≥95%, branch ≥75%, function ≥90%).

## Notes / dependency

Depends on `refl-0029-fix-step-produced-empty-fix-md-despite-r-prompt-enumerate-must-fix` so the prompt-side contract is in place before the engine starts enforcing it. Otherwise the first cycle that runs the new check will fail spuriously while operators discover the new format.
