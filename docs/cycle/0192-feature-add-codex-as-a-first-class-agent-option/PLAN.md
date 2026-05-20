Plan complete. 5 tasks, dependency-ordered:

1. **Task 1** — Extend `Step` type + `ExecModule` interface (workflow.ts + exec.ts)
2. **Task 2** — Build codex argv from model/thinking (exec-codex.ts)
3. **Task 3** — Forward fields from run-cycle call site
4. **Task 4** — 4 new exec-codex tests + 1 workflow parse test
5. **Task 5** — Docs: add `thinking` row, fix stale `--yolo` in ARCHITECTURE.md, update ENGINE.md + CLAUDE.md

Key resolved question: `ARCHITECTURE.md:468` `codex exec --yolo` is stale — actual baseline is `argv: []`. Plan corrects this in Task 5. Sibling exec modules (claudecode, gemini) need zero changes — TypeScript structural subtyping + spread exemption from excess-property checks means extra optional fields pass through safely.

## SPEC Acceptance Traceability

| SPEC Acceptance Criterion | Covered by |
|---|---|
| `Step` type includes `"codex"` in the agent union | Task 1 |
| `Step` type includes `model?: string` and `thinking?: string` | Task 1 |
| `ExecModule.runStep()` accepts optional `model` and `thinking` | Task 1 |
| `exec-codex.ts` passes `--model <model>` when `model` is set | Task 2 |
| `exec-codex.ts` passes `--thinking <thinking>` when `thinking` is set | Task 2 |
| Both flags together: argv is `["--model", "<m>", "--thinking", "<t>"]` | Task 2 |
| Neither flag: argv is `[]` (no regression from current behaviour) | Task 2 |
| `run-cycle.ts` forwards `step.model` and `step.thinking` to `runStep()` | Task 3 |
| New tests cover: model-only, thinking-only, both, neither | Task 4 |
| All existing tests still pass (531 tests, 0 failures) | Task 4 |
| `npm run typecheck` passes with no errors | Task 1 |
| Coverage gates pass (`npm run check:coverage`) | Task 4 |
| `npm run check:invariants` passes | Task 4 |
