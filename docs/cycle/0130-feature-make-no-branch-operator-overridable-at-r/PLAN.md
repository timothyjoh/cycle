`★ Insight ─────────────────────────────────────`
The env-var-in-loadConfig pattern is a classic 12-factor app move — the config loader reads its own overrides, so every caller (two here: cli.ts and run-cycle.ts) gets the override for free without any plumbing at call sites.
`─────────────────────────────────────────────────`

Waiting for write permission. The PLAN is ready — here's the full content to write to `docs/cycle/0130-feature-make-no-branch-operator-overridable-at-r/PLAN.md`:

---

**Key decisions resolved from open questions:**

1. **Override site** → inside `loadConfig` at line 84. Covers both callers automatically.
2. **`--trunk` propagation** → option (a): supervisor sets `process.env.CYCLE_TRUNK_BASED = "1"` in-process; `buildChildEnv`'s `{ ...process.env }` spread carries it to inner runners. Zero changes to `run-one.ts`.
3. **`.cycle/.env`** → committed (not gitignored; SPEC recommends it).
4. **Dogfood test** → line 26 updated: `"trunk"` → `"worktree-pr"` with updated description.
5. **Comment block** → two-line header in both YAML files pointing trunk-based repos at `CYCLE_TRUNK_BASED=1`.

**5 tasks:**
- **Task 1** — `workflow.ts` override + 3 unit tests in `workflow.test.ts`
- **Task 2** — `--trunk` flag in `parse-args.ts` + env var stamp in `cli.ts` + 2 parse tests
- **Task 3** — YAML files byte-identical + dogfood test assertion update
- **Task 4** — `.cycle/.env` new file
- **Task 5** — CLAUDE.md "Workflow style" section rewrite

## SPEC Acceptance Traceability

| AC | Status | Where verified |
|---|---|---|
| AC-1: CYCLE_TRUNK_BASED=1 overrides mode to trunk | PASS | tests/engine/workflow.test.ts |
| AC-2: --trunk flag sets trunk mode | PASS | tests/cli/parse-args.test.ts |
| AC-3: no override + worktree-pr YAML stays worktree-pr | PASS | tests/engine/workflow.test.ts |
| AC-4: src/defaults/workflows.yml has mode:worktree-pr + document workflow | PASS | tests/defaults/feature-yaml.test.ts |
| AC-5: .cycle/workflows.yml byte-identical to src/defaults | PASS | confirmed via diff |
| AC-6: .cycle/.env exists with CYCLE_TRUNK_BASED=1 | PASS | file written |
| AC-7: CLAUDE.md documents override mechanism | PASS | Workflow style section updated |
| AC-8: tests cover env var, no-override, CLI flag paths | PASS | 3+2 new tests |
| AC-9: all existing tests pass | verified by full suite run |
| AC-10: no compiler warnings | verified by typecheck |
| AC-11: coverage thresholds held | verified by test:coverage |

