I need write permission. Could you approve the write to `docs/cycle/0146-quickfix-make-triagedeps-runagent-required-wrappe/PLAN.md`? Or if you'd prefer I'll just output the plan here.

Here's what the fix covers:

**7 change sites across 5 files:**

`src/engine/triage.ts`:
- L31: `runAgent?:` → `runAgent:` (required field)
- L730: export `runAgentViaDispatch` (callers need it for explicit construction)
- L160-162: remove `= {}` default + `?? runAgentViaDispatch` from `runTriage`
- L270-272: same for `dryRunTriage`

`src/cli/triage.ts`:
- L2: add `runAgentViaDispatch` to import
- L46: `{}` → `{ runAgent: runAgentViaDispatch }`

`src/cli.ts` (L8, L107, L394):
- Add `runAgentViaDispatch` to import; pass it as deps at both `runTriage(...)` call sites

`tests/engine/triage.test.ts` (L902, L1367) and `tests/engine/triage-dry-run.test.ts` (L403):
- These 3 tests intentionally exercise the real dispatch path — add `runAgentViaDispatch` to their imports and pass `{ runAgent: runAgentViaDispatch }` explicitly

**Verification:** `npm run typecheck` catches any forgotten `{}` — the regression test is the type system itself. The existing `triage-wrapper-delegation` test from cycle 0145 must still pass.
