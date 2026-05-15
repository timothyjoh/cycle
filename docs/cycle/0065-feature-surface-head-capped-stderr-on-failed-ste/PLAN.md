# Implementation Plan: Cycle 0065

## Overview
Extend the single `step.end` emit in `src/engine/run-cycle.ts` so failed bash steps carry a head-capped `stderr` field (2000-char convention). Successful events and agent-path events keep their current shape.

## Current State (from Research)
- `execBashStep` already captures `stderr` on every call (`src/engine/exec-bash.ts:9,23,28-29`).
- Single `step.end` emit converges bash + agent paths at `src/engine/run-cycle.ts:169`; payload today is `{cycle_id, step, status, exit_code}`.
- Precedent for conditional payload-key spread: `src/engine/run-cycle.ts:136` — `...(headSha ? { head_sha: headSha } : {})`.
- 2000-char head-cap convention at `src/engine/triage.ts:231-233` (`s.length > MAX_ERR_LEN ? s.slice(0, MAX_ERR_LEN - 1) + "…" : s`).
- Existing failed-bash precedent test: `tests/engine/run-cycle.test.ts:126-179` (boom.sh exit 1) — reads `.cycle/log.jsonl` and regex-matches the JSONL line.
- `workflowYml` helper at `tests/engine/run-cycle.test.ts:15-28` wraps step bodies in full engine/triage YAML scaffold.
- Logger accepts arbitrary payload keys (`src/engine/log.ts:11-16`); no schema gate to update. `log-tail` reads only `step` name + `step.start.head_sha`; new key is inert.

## Desired End State
- A failed bash `step.end` line in `.cycle/log.jsonl` includes `"stderr":"<captured>"` (head-capped to 2000 chars).
- A successful bash `step.end` line has NO `stderr` key.
- An agent-path `step.end` (claudecode/codex/gemini) has NO `stderr` key — unchanged by this cycle.
- All existing tests still pass; coverage gates green; per-file `triage.ts ≥95%` floor untouched.
- New tests in `tests/engine/run-cycle.step-end-stderr.test.ts` cover the three scenarios from SPEC's testing strategy.
- `CLAUDE.md` "Architecture quick reference" carries one new line noting the failed-bash stderr surface.

**Verification:** `npm test` green; grep `.cycle/log.jsonl` from a hand-run failing bash step shows `"stderr":"..."`; `npm run typecheck` clean; `npm run test:coverage` keeps line ≥95% / branch ≥75% / func ≥90%.

## What We're NOT Doing
- NOT extending the conditional to agent-path failures (claudecode/codex/gemini). BUILD.md will record whether the same masking applies and file a follow-up issue if so — no code change here.
- NOT refactoring `truncate` into a shared helper across `triage.ts` + `run-cycle.ts`. REFLECTION.md will flag the duplication as a candidate for consolidation when a third caller appears.
- NOT changing `execBashStep` capture mechanism, log schema, or any other consumer of `step.end`.
- NOT modifying README (no user-facing section describes `step.end` payloads).
- NOT modifying the dogfood `.cycle/` mirror — this cycle touches `src/engine/run-cycle.ts` only, not any `src/defaults/` file, so `npm run sync-defaults` is not required.

## Implementation Approach
Single seam: extend the one `step.end` emit at `src/engine/run-cycle.ts:169` with a conditional-spread of a head-capped `stderr` field, gated on `step.agent === "bash" && r.status === "failed"`. Emit even when `r.stderr === ""` (consistent shape; acceptance criterion pins literal captured value). Inline a local `MAX_STEP_END_STDERR = 2000` constant + `truncate` function mirroring `triage.ts:231-233` — REFLECTION.md cross-links the duplicate.

Tests live in a new sibling file `tests/engine/run-cycle.step-end-stderr.test.ts` (mirrors `run-cycle.spec-guard.test.ts` / `run-cycle.sanitize.test.ts` pattern) to keep `run-cycle.test.ts` from growing beyond its current 1552 lines. Reuse `workflowYml` via direct copy of the helper into the new file (sibling tests already inline their own helper imports / copies).

---

## Task 1: Emit head-capped stderr on failed bash step.end

### Overview
Extend the single `step.end` log emit so failed bash steps include `stderr` (head-capped to 2000 chars, trailing `…` on overflow). No other payload-shape change.

### Changes Required
**File**: `src/engine/run-cycle.ts`

**Changes**: Add module-local constant + truncate helper near other module-local constants (alongside `SPEC_MIN_BYTES`). Extend the `step.end` emit at line 169 with a conditional spread.

```ts
// near top-of-file module constants (alongside SPEC_MIN_BYTES)
const MAX_STEP_END_STDERR = 2000;
const truncateStderr = (s: string): string =>
  s.length > MAX_STEP_END_STDERR ? s.slice(0, MAX_STEP_END_STDERR - 1) + "…" : s;

// replace line 169
await log.emit("step.end", {
  cycle_id: cycleId,
  step: step.name,
  status: r.status,
  exit_code: r.exitCode,
  ...(step.agent === "bash" && r.status === "failed"
    ? { stderr: truncateStderr(r.stderr) }
    : {}),
});
```

Gate is `step.agent === "bash" && r.status === "failed"`, not `r.stderr` truthiness — empty string is emitted literally on bash failure (matches SPEC acceptance criterion "captured stderr matches the child output, exact string for sub-cap payloads").

### Success Criteria
- [ ] `npm run typecheck` clean.
- [ ] `npm test` green (existing failed-bash test at `tests/engine/run-cycle.test.ts:126-179` still passes — its assertions don't constrain unknown keys).
- [ ] Hand verification: an ad-hoc failing bash step appends a `step.end` line containing `"stderr"`.

---

## Task 2: Test — successful bash step.end omits stderr key

### Overview
Assert a passing bash step's `step.end` line in `.cycle/log.jsonl` does NOT carry a `stderr` key. Regression guard against the conditional firing on success.

### Changes Required
**File**: `tests/engine/run-cycle.step-end-stderr.test.ts` (new)

**Changes**: New test file with shared scaffold (mirrors sibling test files in `tests/engine/`). Drive a single-step bash workflow whose script exits 0:

```ts
await writeFile(ok, "#!/bin/bash\necho hi\nexit 0\n", "utf8");
```

After `runCycle`, read `.cycle/log.jsonl`, find the `step.end` line for the bash step, `JSON.parse` it, assert:

```ts
const parsed = JSON.parse(stepEndLine);
assert.equal(parsed.status, "ok");
assert.ok(!("stderr" in parsed), "successful step.end must not carry stderr");
```

Workflow: a single bash step (no spec/claudecode dependencies — `workflowYml` helper requires a `feature` workflow shape with at least one step; check the existing `injects CYCLE_ISSUE_ID into bash step env` test at `tests/engine/run-cycle.test.ts:181-227` for the minimal-bash-step pattern).

### Success Criteria
- [ ] Test passes.
- [ ] Inverting the production conditional (temporarily emitting `stderr` on success) makes this test fail — confirms the assertion is load-bearing.

---

## Task 3: Test — failed bash step.end carries verbatim stderr (sub-cap)

### Overview
Drive a real bash script that writes a short stderr message and exits non-zero. Assert the emitted `step.end.stderr` equals the literal captured string.

### Changes Required
**File**: `tests/engine/run-cycle.step-end-stderr.test.ts`

**Changes**: Second test in the new file. Script:

```bash
#!/bin/bash
echo "boom went wrong" >&2
exit 1
```

After `runCycle` (expect `status: "failed"`), read the log, parse the `step.end` line, assert:

```ts
const parsed = JSON.parse(stepEndLine);
assert.equal(parsed.status, "failed");
assert.equal(parsed.stderr, "boom went wrong\n");
```

(Trailing newline because `echo` appends one — verify by running the script locally first if uncertain.)

### Success Criteria
- [ ] Test passes against the Task 1 implementation.
- [ ] Test fails if `stderr` is omitted from the emit.

---

## Task 4: Test — failed bash step.end truncates stderr at 2000 chars

### Overview
Drive a bash script that emits ≥ 2001 chars of stderr. Assert `step.end.stderr.length === 2000` and ends in `…`. Boundary check matching `triage.ts` convention.

### Changes Required
**File**: `tests/engine/run-cycle.step-end-stderr.test.ts`

**Changes**: Third test. Script generates a deterministic ≥ 2001-char stderr (avoid `/dev/urandom` — non-deterministic and shell-escape risk):

```bash
#!/bin/bash
printf 'x%.0s' {1..2500} >&2
exit 1
```

`printf 'x%.0s' {1..N}` emits N copies of `x`. Stderr will be exactly 2500 `x` chars (no trailing newline). After `runCycle`, parse the `step.end` line:

```ts
const parsed = JSON.parse(stepEndLine);
assert.equal(parsed.status, "failed");
assert.equal(parsed.stderr.length, 2000);
assert.ok(parsed.stderr.endsWith("…"), "stderr must end with ellipsis on overflow");
assert.equal(parsed.stderr.slice(0, 1999), "x".repeat(1999));
```

If brace expansion `{1..2500}` proves fragile across bash versions, fall back to `yes x | head -c 2500 | tr -d '\n' >&2` or `python3 -c 'import sys; sys.stderr.write("x"*2500)'` (Node 22 runtime guarantees python3 available? — prefer pure bash). Brace expansion is bash builtin since 3.0; safe.

### Success Criteria
- [ ] Test passes.
- [ ] Lowering `MAX_STEP_END_STDERR` to 100 in production code (temporarily) makes this test fail — confirms the assertion is load-bearing.
- [ ] Boundary verified: stderr of exactly 2000 chars is NOT truncated (optionally add a fourth test asserting `stderr.length === 2000 && !endsWith("…")` for an exactly-cap payload — captured here as a stretch case, mark optional).

---

## Task 5: Update CLAUDE.md

### Overview
One-line addition under "Architecture quick reference" documenting the new payload field.

### Changes Required
**File**: `CLAUDE.md`

**Changes**: Locate the `step.end` description (currently nothing explicit — the section discusses `step.start`/`step.end` indirectly via the restart-policy paragraph). Insert one line under "Architecture quick reference" before the "Subprocess discipline" section:

> Failed bash `step.end` events carry a head-capped `stderr` field (2000-char convention, slice to MAX-1 + `…`, mirroring `src/engine/triage.ts` `engine.paused` last-errors); successful bash events and all agent-path events omit the field.

Find the right anchor by reading the "Restart policy" bullet at the end of "Architecture quick reference" and appending a new bullet under it.

### Success Criteria
- [ ] `CLAUDE.md` carries the line.
- [ ] No other doc file mentions `step.end` payload schema (verified via `grep -rn 'step.end' docs/ README.md AGENTS.md` excluding `docs/cycle/*` artifacts).

---

## Testing Strategy

### Unit Tests
- All three new tests in `tests/engine/run-cycle.step-end-stderr.test.ts`.
- Drive real bash scripts via `execBashStep` through the full `runCycle` seam — no mocks. SPEC pins this.
- `JSON.parse` the relevant `step.end` line rather than regex-match (regex would fail on long random stderr containing `"` or `\`). Find the line via `lines.find(l => /\"event\":\"step.end\"/.test(l))`.

### Integration / E2E Tests
- The full `runCycle` orchestrator is exercised by each new test — bash-step path through `execBashStep` → `log.emit` → `.cycle/log.jsonl`. No additional integration coverage needed.

### Mocking Strategy
- Zero mocks. Real `git init`, real bash scripts, real filesystem (`mkdtemp` + cleanup). Fake `claudecode` binary is only needed if a workflow step requires it — minimal-bash-only workflows (per `injects CYCLE_ISSUE_ID into bash step env` precedent) avoid even that.

## Risk Assessment

- **Brace expansion portability for `{1..2500}` in Task 4 truncation test.** Mitigation: bash builtin since 3.0; macOS ships 3.2+ system bash, and the test invokes `/bin/bash` directly via `execBashStep` (`src/engine/exec-bash.ts:1-33`). If a CI runner uses a stripped-down bash, fall back to `for i in $(seq 1 2500); do printf x; done >&2`. Decision: try brace expansion first; switch only on failure.
- **Trailing-newline assumption in Task 3.** `echo "boom went wrong" >&2` appends `\n`. Mitigation: assert literal `"boom went wrong\n"`. If the bash binary on macOS strips the newline (it doesn't), switch to `printf "boom went wrong" >&2`.
- **Empty-stderr emission (open question resolved here).** SPEC acceptance criterion "captured stderr matches the child output (exact string for sub-cap payloads)" requires emitting `""` literally on bash failures with no stderr writes. Risk: an operator may find `"stderr":""` lines noisy. Mitigation: this matches the SPEC literal; a future cycle can downgrade to "omit when empty" if log noise becomes an issue. Resolution: emit literal, including `""`. (Optional fourth test asserting empty-stderr emission can be added if the planner deems it load-bearing — left out for scope discipline; the conditional-spread shape guarantees it implicitly.)
- **Coverage gate.** New conditional branch in `run-cycle.ts` adds two branches (bash-failed vs other). All three tests collectively cover both branch arms (Task 2 covers the "no spread" arm via success; Tasks 3 + 4 cover the "spread" arm). Per-file `triage.ts ≥ 95%` floor is untouched (no edits to that file). Global line+branch+func gates should hold or improve.
- **Agent-path follow-up issue.** BUILD.md must report whether agent-path failures suffer the same masking and propose a follow-up issue. The agent-path `step.end` at line 169 already drops `r.stderr` (populated at lines 147, 161 and by provider modules). Decision: file a follow-up issue surfaced via reflection at cycle end, not in this cycle's code.
- **Dogfood divergence.** This cycle edits `src/engine/run-cycle.ts` only — no `src/defaults/` file changes. `npm run sync-defaults` is not required; the `.cycle/workflows.yml` divergence guard (CLAUDE.md `sync-defaults` divergence guard section) is irrelevant here.
