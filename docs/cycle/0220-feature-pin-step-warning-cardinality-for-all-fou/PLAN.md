All context gathered. Writing the plan now.

# Implementation Plan: Cycle 0220

## Overview
Extend `tests/engine/run-cycle.append-system-prompt-warning.test.ts` with a parametrized loop over all five non-claudecode agents (`codex`, `gemini`, `auggie`, `opencode`, `pi`) so the `step.warning` cardinality contract is pinned for each. No production code changes.

## Current State (from Research)
- Production guard at `run-cycle.ts:303–312` uses `step.agent !== "claudecode"` — already covers all five non-claudecode agents uniformly.
- `ARTIFACT_STEPS` constant (line 35) includes `"build"`, `"spec"`, `"plan"`, `"research"`, `"review"`, `"fix"`, `"documentation"`.
- Existing test at `tests/engine/run-cycle.append-system-prompt-warning.test.ts` covers only `codex` via a single hardcoded test.
- `workflowYml` helper and fake-binary pattern are directly reusable.
- `tests/helpers.ts` exports `expectExactlyOne` but it matches only on `event` field — the multi-field filter in the warning test uses `filter().length === 1` directly, which is correct per CLAUDE.md convention.

## Desired End State
`tests/engine/run-cycle.append-system-prompt-warning.test.ts` contains a single `for` loop over `["codex", "gemini", "auggie", "opencode", "pi"]`. Each iteration is a full `test()` block asserting exactly-one `step.warning` for that agent. The existing one-off codex test is removed (superseded by the loop). All 647+ tests pass, coverage holds.

## What We're NOT Doing
- No changes to `run-cycle.ts` or any production code.
- No new test files — extend only the existing file.
- No changes to workflow YAML defaults, prompts, or other agents.
- No coverage-gate floor changes.

## Implementation Approach
Replace the existing single-agent codex test with a `for…of` loop over the five agent names. Each iteration registers a `test()` with a unique name, creates its own `mkdtemp` root and bin directory, writes a minimal fake binary for that agent, configures the workflow with `agent: <name>` on a `build` step, runs the cycle, then asserts `filter().length === 1` on the warning log lines. Teardown via `finally` block identical to the current pattern.

---

## Task 1: Parametrize Warning Test Over All Five Non-Claudecode Agents

### Overview
Replace the existing codex-only `test()` block with a `for…of` loop that iterates over `["codex", "gemini", "auggie", "opencode", "pi"]`, registering one `test()` per agent. Each iteration is self-contained: its own tmpdir pair, fake binary, git repo, workflow, and assertion.

### Changes Required

**File**: `tests/engine/run-cycle.append-system-prompt-warning.test.ts`

Replace the entire file content:

```typescript
import { test } from "node:test";
import { strict as assert } from "node:assert";
import { mkdtemp, mkdir, writeFile, readFile, rm, chmod } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { runCycle } from "../../src/engine/run-cycle.ts";

function git(cwd: string, args: string[]) {
  const r = spawnSync("git", args, { cwd, encoding: "utf8" });
  if (r.status !== 0) throw new Error("git " + args.join(" ") + ": " + r.stderr);
  return r.stdout;
}

function workflowYml(stepsBody: string): string {
  return (
    "engine:\n" +
    "  max_consecutive_failures: 2\n" +
    "  base_branch: main\n" +
    "  commit:\n" +
    "    mode: trunk\n" +
    "    push: false\n" +
    "triage:\n" +
    "  agent: claudecode\n" +
    "  prompt: prompts/triage.md\n" +
    "  max_turns: 10\n" +
    "workflows:\n" +
    "  - name: feature\n" +
    "    max_cycle_attempts: 3\n" +
    "    steps:\n" +
    stepsBody
  );
}

for (const agentName of ["codex", "gemini", "auggie", "opencode", "pi"]) {
  test(`runCycle emits step.warning when appendSystemPrompt set for non-claudecode agent (${agentName}, build step)`, async () => {
    const root = await mkdtemp(join(tmpdir(), "cycle-test-"));
    const bin = await mkdtemp(join(tmpdir(), "cycle-bin-"));
    try {
      git(root, ["init", "-b", "main"]);
      git(root, ["config", "user.email", "t@t"]);
      git(root, ["config", "user.name", "t"]);
      await mkdir(join(root, "src"), { recursive: true });
      await writeFile(join(root, "src/stub.ts"), "export {};\n", "utf8");
      git(root, ["add", "src/stub.ts"]);
      git(root, ["commit", "-m", "init"]);

      await mkdir(join(root, ".cycle/prompts"), { recursive: true });
      await writeFile(
        join(root, ".cycle/workflows.yml"),
        workflowYml(`      - name: build\n        agent: ${agentName}\n        prompt: prompts/build.md\n`),
        "utf8"
      );
      await writeFile(join(root, ".cycle/prompts/build.md"), "BUILD-SENTINEL", "utf8");

      const fake = join(bin, agentName);
      await writeFile(fake, "#!/bin/bash\ncat\nprintf 'fix\\n' >> src/stub.ts\n", "utf8");
      await chmod(fake, 0o755);

      await runCycle(root, {
        issueId: "TEST-WARN",
        title: "warning test",
        workflow: "feature",
        env: { PATH: bin + ":" + (process.env.PATH ?? ""), CYCLE_BASE: "main" },
      });

      const log = await readFile(join(root, ".cycle/log.jsonl"), "utf8");
      const warnings = log
        .split("\n")
        .filter(
          l =>
            l.includes('"event":"step.warning"') &&
            l.includes('"reason":"append_system_prompt_ignored"') &&
            l.includes(`"agent":"${agentName}"`),
        );
      assert.equal(
        warnings.length,
        1,
        `exactly one step.warning with reason:append_system_prompt_ignored and agent:${agentName} must appear in log`,
      );
    } finally {
      await rm(root, { recursive: true, force: true });
      await rm(bin, { recursive: true, force: true });
    }
  });
}
```

### Success Criteria
- [ ] File compiles cleanly (`npm run typecheck`)
- [ ] Five test cases registered, one per agent name
- [ ] Each test asserts `warnings.length === 1` with agent-specific filter
- [ ] `npm test` passes with 651+ tests (647 existing + 4 new, since codex was already 1)
- [ ] Coverage does not decrease

---

## SPEC Acceptance Traceability

| SPEC Acceptance Bullet (verbatim) | Covering Task | Notes |
|---|---|---|
| `[ ] tests/engine/run-cycle.append-system-prompt-warning.test.ts asserts step.warning fires exactly once for each of gemini, auggie, opencode, and pi when appendSystemPrompt is set on a build step using that agent.` | Task 1 | Loop covers all four plus codex |
| `[ ] Each assertion uses filter().length === 1 (or expectExactlyOne) per the cardinality-pinning convention in CLAUDE.md.` | Task 1 | `assert.equal(warnings.length, 1, ...)` |
| `[ ] No new test file required; extend the existing file with parametrized cases or four additional narrow it blocks.` | Task 1 | Single file, `for…of` loop |
| `[ ] All 647+ tests continue to pass (npm test).` | Task 1 | Verified by `npm test` |
| `[ ] Coverage does not decrease.` | Task 1 | No production code changed; new test paths add coverage |

---

## Testing Strategy

### Unit Tests
- The change IS the tests — five `test()` registrations via a `for…of` loop.
- Each test exercises the full `runCycle` path with a real git repo and fake binary; no mocking.
- Fake binary pattern: `#!/bin/bash\ncat\nprintf 'fix\\n' >> src/stub.ts\n` — matches existing codex stub exactly, only the filename differs per agent.

### Integration / E2E Tests
- `npm test` runs all test files including the updated warning test; coverage gate enforces no regression.

## Risk Assessment
- **Template-string quoting in workflowYml call**: The backtick interpolation for `agentName` inside the steps string must not introduce YAML syntax errors. The existing codex test uses a hardcoded string with correct indentation — the parametrized version uses the same indentation pattern with `${agentName}` substituted in. Low risk; mitigated by running `npm test`.
- **Parallel tmpdir teardown**: Each test creates its own `root` and `bin` in `finally` — no shared state between iterations. No risk of cross-test contamination.
