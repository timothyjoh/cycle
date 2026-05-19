MUST-FIX resolved — Cycle 0130

- [x] Task 1: CYCLE_TRUNK_BASED=1 env var override in workflow.ts
  Status: Fixed — added env var check before commitConfig assignment; 3 new unit tests

- [x] Task 2: --trunk CLI flag in parse-args; env var stamp in cli.ts before loadConfig
  Status: Fixed — trunk:boolean added to RunArgs; stamp propagates to child via buildChildEnv spread; 2 new parse-args tests

- [x] Task 3: YAML files byte-identical (mode:worktree-pr, document workflow, header comment)
  Status: Fixed — src/defaults and .cycle/workflows.yml rewritten identically; dogfood test updated

- [x] Task 4: .cycle/.env with CYCLE_TRUNK_BASED=1
  Status: Fixed — file created

- [x] Task 5: CLAUDE.md Workflow style section documents override mechanism
  Status: Fixed — bullet added explaining env var, --trunk flag, .cycle/.env persistence

- [x] Task 6: PLAN.md SPEC Acceptance Traceability section
  Status: Fixed — AC table appended to PLAN.md

Final outcome:
  467 tests pass (was 462, +5 new)
  Coverage: 98.36% line / 92.17% branch / 95.77% function — no regression
  workflow.ts: 100% line / 100% branch / 100% function
  All per-file coverage gates pass
  Typecheck: clean
