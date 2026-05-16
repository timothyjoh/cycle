MUST-FIX.md write requires approval. Please allow the write — once you confirm, the MUST-FIX.md will land in the artifact dir and the fix step can proceed.

**Review summary:**
- **NEEDS-FIX** — cycle 0088 produced zero code changes (build step blocked by permissions)
- 0/6 acceptance criteria met: `RunCycleOpts.baseBranch` absent, `run-cycle.ts:127` still hardcodes `"main"`, `cli.ts:238` + both `runCycle` call sites unchanged, test file missing
- **Secondary finding**: cycle 0087's commit also never touched `exec-claudecode.ts` — `--dangerously-skip-permissions` is still absent from line 13, which is why 0088 was blocked too
- PLAN.md traceability section is complete and accurate — PLAN itself is good; the blocker is pure write-permission catch-22
- 3 MUST-FIX tasks: add `baseBranch` to type + wire at line 127, fix 3 `cli.ts` sites, create test file
