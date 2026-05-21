# SPEC — Cycle 0207: Widen stripFences regex to match any language-tagged fence opener

## Objective
Extend the `stripFences` helper's opening-fence pattern from the narrow `(?:json)?` form to `(?:\w+)?`, so that any language-tagged fence opener LLMs emit (e.g. ` ```javascript `, ` ```text `, ` ```JSON `, ` ```jsonc `) is stripped before `JSON.parse`. This closes the remaining ~24% of fence variants that the cycle 0206 fix left unhandled.

## Source Issue
`refl-0206-stripfences-regex-misses-non-json-langua` — "Widen stripFences regex to match any language-tagged fence opener"

## Scope

### In Scope
- Widen the opening fence regex in `stripFences` from `/^```(?:json)?\r?\n/` to `/^```(?:\w+)?\r?\n/`
- Add unit test cases for `javascript`, `text`, `JSON` (case), and `jsonc` fence variants

### Out of Scope
- Changes to the closing fence pattern (already correct)
- Reflection fence recovery in `parseWithRepair` (separate issue)
- Any other callers of `stripFences`

## Requirements
- `stripFences` must strip any fence opener where the language tag matches `\w+` (letters, digits, underscore), including mixed-case tags
- The regex must be case-insensitive for the tag portion so `JSON`, `Json`, `json` all match
- All existing tests must continue to pass
- 100% line coverage floor for `src/engine/log-fmt.ts` must be maintained

## Acceptance Criteria
- [ ] `stripFences("```javascript\n{...}\n```")` returns `{...}`
- [ ] `stripFences("```text\n{...}\n```")` returns `{...}`
- [ ] `stripFences("```JSON\n{...}\n```")` returns `{...}` (case-insensitive)
- [ ] `stripFences("```jsonc\n{...}\n```")` returns `{...}`
- [ ] Existing tests for ` ```json ` and bare ` ``` ` pass unchanged
- [ ] New unit test cases added for each variant above
- [ ] `npm test` passes with zero failures
- [ ] `npm run test:coverage` + `npm run check:coverage` pass; `src/engine/log-fmt.ts` remains at 100%
- [ ] All existing tests still pass
- [ ] No compiler/linter warnings introduced

## Testing Strategy
- Node built-in test runner (`node:test`) — same as the existing `tests/engine/log-fmt.test.ts`
- Add four new `test()` cases to `tests/engine/log-fmt.test.ts`, one per new variant
- No E2E or integration tests needed; `stripFences` is a pure function

## Documentation Updates
- **CLAUDE.md / AGENTS.md**: No change — `log-fmt.ts` entry already documented; regex detail lives in `docs/ENGINE.md`
- **docs/ENGINE.md**: Remove or update the "Known limitation" note in the Triage Fence handling section that describes the incomplete regex; replace with a note that the regex now matches any `\w+` language tag

Documentation is part of "done" — code without updated docs is incomplete.

## Dependencies
- `src/engine/log-fmt.ts` must exist (it does, from cycle 0206)
- `tests/engine/log-fmt.test.ts` must exist (it does)
- No external services or env vars required
