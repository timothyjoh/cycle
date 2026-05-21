# Implementation Plan: Cycle 0222

## Overview

Document `appendSystemPrompt` forwarding support for all five non-claudecode exec modules: record per-agent CLI findings in RESEARCH.md and ENGINE.md, add a JSDoc to `ExecModule.runStep` listing which agents honour the field, and add Known Limitations entries for all five agents. No exec module code changes are required because no agent has a confirmed system-prompt-append CLI flag.

## Current State (from Research)

- `ExecModule.runStep` declares `appendSystemPrompt?: string` but has no JSDoc explaining which agents honour it.
- All five non-claudecode modules silently drop `appendSystemPrompt`; `run-cycle.ts:303-310` emits `step.warning { reason: "append_system_prompt_ignored" }` when the field is set for a non-claudecode agent (cycle 0219).
- `ENGINE.md:138` documents the suppression gap in aggregate but lacks per-agent findings.
- The codebase `// TODO` comments in `exec-auggie.ts`, `exec-opencode.ts`, `exec-pi.ts` flag CLI flag names as unverified.
- CLI research (cycle 0222 plan phase): **codex** — `not supported` (confirmed via `codex exec --help`; no system-prompt-append flag exists); **opencode** — `not supported` (confirmed via `opencode run --help`; no system-prompt-append flag exists); **gemini** — `unknown` (CLI not installed in dev environment); **auggie** — `unknown — CLI unstable` (not installed; flag names assumed from codex parity per `exec-auggie.ts` TODO); **pi** — `unknown — CLI unstable` (not installed; same pattern as auggie).

## Desired End State

- `src/engine/exec.ts:ExecModule.runStep` has a JSDoc comment listing all six agents by name, specifying which honours `appendSystemPrompt` (claudecode) and which do not, with a note pointing to ENGINE.md.
- `docs/cycle/0222-feature-implement-or-document-generic-appendsyst/RESEARCH.md` has a `## CLI Findings` section recording the per-agent findings table.
- `docs/ENGINE.md` Known Limitations paragraph at line 138 is updated in-place with per-agent findings for all five agents (cycle 0222).
- No exec module files changed (no agent has a confirmed flag).
- All 659 existing tests pass without modification.
- `npm run test:coverage` green; coverage gates do not decrease.

**Verification:** `grep -n "appendSystemPrompt" src/engine/exec.ts` shows JSDoc. `grep -n "cycle 0222" docs/ENGINE.md` shows the updated paragraph. `npm test` exits 0.

## What We're NOT Doing

- No changes to any `exec-<agent>.ts` file — no agent has a confirmed system-prompt-append CLI flag.
- No changes to `run-cycle.ts` — the `step.warning` condition and emission logic are unchanged.
- No changes to `exec-spawn.ts` or `RunAgentOptions` — the SPEC explicitly defers generic injection to a future cycle.
- No new test files — no agent gains forwarding support, so no argv-assertion tests are needed; the existing warning test remains valid and unmodified.
- No changes to `CLAUDE.md` or `AGENTS.md` — `ExecModule` is an internal interface, not a CLI convention.
- No attempt to install missing CLIs (`gemini`, `auggie`, `pi`) — findings for these agents are recorded as `unknown` and will be updated when CLIs stabilise.

## Implementation Approach

All work is documentation and interface annotation. The CLI research resolved the key open question from RESEARCH.md: two of the five agents (`codex`, `opencode`) are confirmed `not supported` from their installed `--help` output; three are `unknown` because their CLIs are absent or unstable. Since no agent is `supported`, the only code change is a JSDoc addition to `ExecModule`. The documentation changes (RESEARCH.md addendum + ENGINE.md in-place update) fulfil the SPEC's traceability requirement that findings appear in both artifacts.

---

## Task 1: Add JSDoc to `ExecModule.runStep`

### Overview

Add a `/** */` block above `runStep` in `src/engine/exec.ts` listing which agents honour `appendSystemPrompt` and which do not. This satisfies SPEC AC 4 and makes the interface self-documenting.

### Changes Required

**File**: `src/engine/exec.ts`

Replace the bare `runStep(args: {` line at line 10 with a JSDoc-annotated signature:

```typescript
export interface ExecModule {
  /**
   * Runs a single workflow step for an agent.
   *
   * `appendSystemPrompt`: honoured only by `claudecodeExec` (forwarded as
   * `--append-system-prompt <value>` before `-p`). Per-agent findings from
   * cycle 0222: `codex` — not supported; `opencode` — not supported;
   * `gemini` — unknown (CLI not installed); `auggie` — unknown, CLI unstable;
   * `pi` — unknown, CLI unstable. See ENGINE.md Known Limitations for details.
   * `run-cycle.ts` emits `step.warning { reason: "append_system_prompt_ignored" }`
   * for any non-claudecode agent that receives a non-undefined value (cycle 0219).
   */
  runStep(args: {
    repoRoot: string;
    promptPath: string;
    env?: Record<string, string>;
    model?: string;
    thinking?: string;
    appendSystemPrompt?: string;
  }): Promise<StepResult>;
}
```

### Success Criteria

- [ ] `npm run typecheck` exits 0 (no TypeScript errors)
- [ ] JSDoc is present on `runStep`: `grep -A3 "runStep" src/engine/exec.ts` shows the `/** */` block
- [ ] No other files modified in this task

---

## Task 2: Record CLI Findings in RESEARCH.md and Update ENGINE.md

### Overview

Add a `## CLI Findings` section to RESEARCH.md with the per-agent findings table, then update the ENGINE.md Known Limitations paragraph at line 138 in-place with per-agent entries. This fulfils SPEC AC 1 and AC 3.

### Changes Required

**File**: `docs/cycle/0222-feature-implement-or-document-generic-appendsyst/RESEARCH.md`

Append a new section at the end of the file:

```markdown
## CLI Findings

Per-agent `appendSystemPrompt` CLI flag research — cycle 0222:

| Agent | Finding | Method | Notes |
|---|---|---|---|
| codex | not supported | `codex exec --help` (installed at `/usr/local/bin/codex`) | No system-prompt-append flag in exec subcommand; `-c key=value` config override exists but does not inject into system prompt at invocation |
| opencode | not supported | `opencode run --help` (installed at `~/.opencode/bin/opencode`) | No system-prompt-append flag; `--model`, `--thinking`, `--variant` confirmed present |
| gemini | unknown | CLI not installed in dev environment | Cannot confirm or deny; update when installed |
| auggie | unknown — CLI unstable | CLI not installed | Flag names in `exec-auggie.ts` assumed from codex parity per `// TODO` comment; update when CLI stabilises |
| pi | unknown — CLI unstable | CLI not installed | Same pattern as auggie; `exec-pi.ts` has identical `// TODO` comment |
```

**File**: `docs/ENGINE.md`

Replace the existing paragraph at line 138 (the one beginning "`**Known limitation:** \`## File Artifact Mode\` guardrails cover all artifact-producing prompts`") in-place with the following:

```markdown
**Known limitation:** `appendSystemPrompt` forwarding is honoured only by `claudecodeExec` (forwarded as `--append-system-prompt <value>` before `-p`, cycle 0218). The five other registered exec modules (`exec-codex.ts`, `exec-gemini.ts`, `exec-auggie.ts`, `exec-opencode.ts`, `exec-pi.ts`) silently discard the field; `run-cycle.ts` emits `step.warning { reason: "append_system_prompt_ignored" }` when this occurs (cycle 0219). Per-agent CLI findings established in cycle 0222: **codex** — not supported (no system-prompt-append flag, confirmed via `codex exec --help`); **opencode** — not supported (no system-prompt-append flag, confirmed via `opencode run --help`); **gemini** — unknown (CLI not installed in dev environment); **auggie** — unknown, CLI unstable (not installed; `exec-auggie.ts` flag names assumed from codex parity); **pi** — unknown, CLI unstable (not installed; same as auggie). Forwarding will be added to an exec module only when its CLI flag is confirmed; unknown entries will be updated as CLIs stabilise.
```

### Success Criteria

- [ ] `grep "CLI Findings" docs/cycle/0222-feature-implement-or-document-generic-appendsyst/RESEARCH.md` matches
- [ ] `grep "cycle 0222" docs/ENGINE.md` matches the updated paragraph
- [ ] ENGINE.md still contains all five agent names in the updated paragraph: codex, opencode, gemini, auggie, pi
- [ ] No other files modified in this task

---

## Task 3: Verify Quality Gates

### Overview

Run the full test suite and coverage gates to confirm no regression from the documentation and JSDoc changes.

### Changes Required

No code changes — verification only.

```
npm test
npm run test:coverage
```

### Success Criteria

- [ ] `npm test` exits 0; all tests pass (baseline: 659 tests)
- [ ] `npm run test:coverage` exits 0; coverage gates do not decrease (line ≥ 95%, branch ≥ 75%, function ≥ 90%)
- [ ] `npm run typecheck` exits 0
- [ ] `npm run check:invariants` exits 0

---

## SPEC Acceptance Traceability

| SPEC Acceptance Bullet (verbatim) | Covering Task | Notes |
|---|---|---|
| `[ ] For each of the five non-claudecode agents, a finding (`supported` / `not supported` / `unknown`) is recorded in `RESEARCH.md` (artifact step output) and referenced in `ENGINE.md`` | Task 2 | RESEARCH.md addendum adds `## CLI Findings` table; ENGINE.md paragraph updated with per-agent entries |
| `[ ] For every agent where a CLI flag was confirmed: `exec-<agent>.ts` passes the flag to `runAgent`, and a test asserts the flag appears in the spawned argv when `appendSystemPrompt` is set`` | WAIVED — no agent has a confirmed CLI flag; codex and opencode confirmed `not supported`; gemini/auggie/pi are `unknown`; no exec module changes required |
| `[ ] For every agent where no flag exists: `ENGINE.md` contains a `## Known Limitations` (or sub-entry under an existing section) that names the agent explicitly and states `appendSystemPrompt` is silently discarded`` | Task 2 | ENGINE.md line 138 paragraph updated in-place naming all five agents with per-cycle findings |
| `[ ] `exec.ts` `ExecModule.runStep` has a JSDoc comment listing which agents honour `appendSystemPrompt` and which do not`` | Task 1 | JSDoc added above `runStep` in `src/engine/exec.ts` |
| `[ ] All existing exec module tests pass without modification`` | Task 3 | No exec module code changed; all exec tests pass unmodified |
| `[ ] `npm run test:coverage` passes and coverage gates do not decrease`` | Task 3 | Full coverage verification run |

---

## Testing Strategy

### Unit Tests

No new test files needed. The JSDoc change is documentation-only and has no runtime effect. The ENGINE.md and RESEARCH.md changes are documentation files with no test coverage requirement.

Existing tests that remain valid without modification:
- `tests/engine/exec-codex.test.ts` — 6 tests; no `appendSystemPrompt` test present; all pass cleanly since `codexExec` is unchanged
- `tests/engine/exec-gemini.test.ts` — 3 tests; unchanged
- `tests/engine/exec-auggie.test.ts` — 7 tests; unchanged
- `tests/engine/exec-opencode.test.ts` — 6 tests; unchanged
- `tests/engine/exec-pi.test.ts` — 6 tests; unchanged
- `tests/engine/run-cycle.append-system-prompt-warning.test.ts` — parametrized `for...of` loop over all five agents; all five remain in the loop since none gain forwarding support; all 5 warning-assertion tests continue to pass

### Integration / E2E Tests

No integration test changes. The `step.warning` parametrized test covers the runtime behaviour end-to-end for all five agents and requires no modification.

## Risk Assessment

- **ENGINE.md line number shift**: The paragraph at line 138 is identified by content, not line number — the replacement should match on the leading `**Known limitation:** \`## File Artifact Mode\` guardrails` text. Use the Edit tool with sufficient surrounding context to avoid ambiguous matches.
- **RESEARCH.md artifact purity**: RESEARCH.md was written by the research step and may have trailing newline sensitivity. Append the `## CLI Findings` section with a blank line separator to avoid Markdown parsing issues.
- **JSDoc whitespace**: The TypeScript interface uses 2-space indentation; the JSDoc must match (`  /**` at column 2). A misindented comment still compiles but looks inconsistent.
