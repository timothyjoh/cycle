`★ Insight ─────────────────────────────────────`
The non-null assertion on `child.stdin!` is safe here because we guard it with `if (promptDelivery === "stdin")` — that branch only executes when spawn was called without an explicit `stdio` option, so Node defaults stdin to "pipe" (non-null Writable). TypeScript can't narrow through the ternary's union type, so the `!` bridges the gap.
`─────────────────────────────────────────────────`

Created `src/engine/exec-spawn.ts` (44 lines) and `tests/engine/exec-spawn.test.ts` (88 lines); reduced `exec-codex.ts` from 43→8 lines, `exec-claudecode.ts` from 41→8 lines, `exec-gemini.ts` from 47→8 lines (removing stale try/catch); added `exec-spawn.ts` floor to `scripts/coverage-gate.mjs`; updated `tests/scripts/coverage-gate.test.ts` fixtures. All PLAN tasks complete. `npm test`: 509/509 pass. `npm run test:coverage`: line 98.50%, branch 91.93%, function 92.96%; exec-spawn.ts 100% line ≥ 90% floor.

## Touched Files
- src/engine/exec-spawn.ts
- src/engine/exec-codex.ts
- src/engine/exec-claudecode.ts
- src/engine/exec-gemini.ts
- scripts/coverage-gate.mjs
- tests/engine/exec-spawn.test.ts
- tests/scripts/coverage-gate.test.ts
- docs/cycle/0162-feature-extract-shared-runagent-helper-before-ge/BUILD.md
