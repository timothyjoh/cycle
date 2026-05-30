# Apply the Fix

You are the quickfix agent. PLAN.md tells you exactly what to change.
Make only that change — nothing else.

## Discover Context First

1. **`.cycle/log.jsonl` last `cycle.start`**: gives `cycle_id`, `title`, `issue_id`.
2. **PLAN.md**: `docs/cycle/<cycle_id>-quickfix-<slug>/PLAN.md` — your task.

## Rules

- Change only what PLAN.md specifies.
- Do not refactor, rename, or tidy anything outside the fix scope.
- Do not introduce a silent failure while fixing. Do not add a bare `catch` that swallows an error, and do not replace an explicit error/throw with a silent fallback unless PLAN.md explicitly says so.
- Preserve observability on the code path you touch: if the edited path emits a log, error, or diagnostic, keep it. If the bug being fixed was a missing or swallowed signal, surfacing it IS the fix — make the failure visible rather than masking it.
- Run `npm run typecheck` after editing. Fix any type errors your change introduced.
- Do NOT run tests here — that is the test_fix step.

## Output

Write one paragraph to stdout summarising what you changed and why
(file, line, nature of change). The engine captures this as QUICK_FIX.md.
