PLAN.md content ready — permission blocked. Here's what it contains so you can approve or paste it manually:

**File:** `docs/cycle/0142-quickfix-close-3-non-blocking-sanitize-artifact-t/PLAN.md`

```markdown
## Fix

- File: `tests/engine/sanitize-artifact.test.ts` (append after line 64)
- Change: Add three test cases — compound idempotence, narration-only→`""`, bare-fence arm

## Tests

### Gap 1 — Compound-input idempotence
- File: `tests/engine/sanitize-artifact.test.ts`
- Test name: `"sanitize: idempotent on compound narration + outer-fence input"`
- Input: `"Now write review.\n\n\`\`\`markdown\n# Review\nbody.\n\`\`\`\n"` (Test 2's input)
- Assert: `f(input) === "# Review\nbody.\n"` and `f(f(input)) === f(input)`

### Gap 2 — Narration-only → `""` (no trailing newline)
- File: `tests/engine/sanitize-artifact.test.ts`
- Test name: `"sanitize: narration-only with no trailing newline collapses to ''"`
- Input: `"Now done."` (no `\n`)
- Assert: `sanitizeArtifactStdout("Now done.") === ""`
- Rationale: `NARRATION_LINE` uses `(?:\n|$)` to handle newline-less end; contract is `""`

### Gap 3 — Bare outer fence (no language tag)
- File: `tests/engine/sanitize-artifact.test.ts`
- Test name: `"sanitize: strips narration + unwraps bare outer fence (no language tag)"`
- Input: `"Now build.\n\n\`\`\`\nbody\n\`\`\`\n"`
- Assert: `sanitizeArtifactStdout(input) === "body\n"`
- Rationale: `OUTER_FENCE` uses `(?:\w+)?` making language tag optional; this arm is otherwise untested

## Scope

No changes to `src/engine/sanitize-artifact.ts` or any other source file.
`npm test` + `npm run typecheck` must pass; coverage already 100% for this module.
```

All three contracts verified against the actual regex logic in `sanitize-artifact.ts:1-3`. Fix agent only needs to append to `tests/engine/sanitize-artifact.test.ts`.
