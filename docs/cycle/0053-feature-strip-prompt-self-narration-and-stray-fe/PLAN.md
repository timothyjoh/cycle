Plan write. Resolutions: (Q1) sanitize only local var → `writeFile`, `ingestReflection` keeps raw stdout. (Q2) golden = `Now sync defaults…` canonical. (Q4) blank-between = `/^\s*$/`. Existing doc test line 73 needs trailing-newline adjustment.

```markdown
# Implementation Plan: Cycle 0053

## Overview

Add pure helper `sanitizeArtifactStdout(stdout: string): string` at `src/engine/sanitize-artifact.ts` and wire it at the single artifact-write seam in `src/engine/run-cycle.ts:146`, so every `docs/cycle/<id>/<STEP>.md` written by an agent step is stripped of leading narration prefixes and unwrapped of a single outer ``` fence before hitting disk. `log.jsonl` and the `ingestReflection` call path keep raw stdout.

## Current State (from Research)

- **Single chokepoint exists.** `src/engine/run-cycle.ts:146` is the only place agent stdout becomes a `<STEP>.md` artifact. Bash steps don't go through this seam (and are out of scope).
- **`log.jsonl` is trivially safe.** `appendLog` never carries `stdout`; `step.end` only emits status/exit_code/head_sha. Sanitizing at the `writeFile` call site has no log-payload impact.
- **`ingestReflection` is the only other `r.stdout` consumer** (`run-cycle.ts:149`). It does its own `trim() + FENCE_RE` (json-only) at `reflection.ts:36-38`. SPEC requires "sanitization happens at the single point where captured stdout becomes the `<step>.md` write payload" — `ingestReflection` is not that point.
- **Pure-helper style precedent:** `src/engine/frontmatter.ts`, inner helpers in `src/engine/reflection.ts:145-225` (`trimToLastBalancedClose`, `truncateUtf8`) — small, named export, no I/O, no fs/path imports.
- **Test-infra precedent:** native `node:test` + `node:assert/strict`. Pure-function units in `tests/engine/frontmatter.test.ts`. `runCycle` integration template in `tests/engine/run-cycle.documentation.test.ts:41-82` (fake `claude` shell on `PATH`, `printf '%s' '<stdout>'`, then `readFile` the artifact).
- **Existing fence regex (do not reuse):** `reflection.ts:10` is JSON-only by design. SPEC asks for a broader `(\w+)?` language-tag pattern. The two stay distinct.
- **Pre-existing test must be adjusted:** `tests/engine/run-cycle.documentation.test.ts:73` currently does `assert.equal(await readFile(docFile, "utf8"), summary)` against a fake stdout `"Updated README.md to mention the new flag."` (no trailing `\n`). Once sanitization runs at the seam, on-disk content gains exactly one trailing `\n`, breaking this byte-exact assertion. Update to compare against `summary + "\n"`.

## Desired End State

- A new `src/engine/sanitize-artifact.ts` exports `sanitizeArtifactStdout(stdout: string): string` — pure, deterministic, idempotent, no I/O.
- `src/engine/run-cycle.ts:146` writes `sanitizeArtifactStdout(r.stdout)` instead of `r.stdout` to `<STEP>.md`. The same `r.stdout` continues to flow unsanitized to `ingestReflection` on line 149.
- `tests/engine/sanitize-artifact.test.ts` exercises the six listed unit cases plus the idempotence and empty-input invariants.
- One new integration test in `tests/engine/run-cycle.sanitize.test.ts` (sibling to `run-cycle.documentation.test.ts`) feeds `"Now sync defaults…\n\n# BUILD\nReal content.\n"` through the seam and asserts the on-disk `BUILD.md` no longer starts with `Now `; the in-process `log.jsonl` is asserted to NOT contain the body.
- `tests/engine/run-cycle.documentation.test.ts:73` is corrected to expect `summary + "\n"`.
- `CLAUDE.md` `## Architecture quick reference` gains a one-line bullet pointing at `sanitize-artifact.ts`.
- `npm run typecheck`, `npm test`, `npm run test:coverage`, `scripts/coverage-gate.mjs` all clean against current floors.

How to verify, end-to-end:

```sh
npm run typecheck && npm test && npm run test:coverage
```

…and grep a recent BUILD.md from a fresh dogfood run for `^Now ` (must be empty).

## What We're NOT Doing

- **No prompt edits** under `src/defaults/prompts/`. The engine-side filter is the durable defense; prompt tightening is a separate future cycle (per SPEC §Out of Scope).
- **No retroactive rewrite** of historical `BUILD.md`/`REVIEW.md`/etc. Forward-looking only.
- **No general prompt-output lint** beyond the four-prefix narration regex and the single outer-fence unwrap.
- **No sanitization for bash steps** (`commit`, `commit-trunk`, `pr`, `verify`) — they don't write `<STEP>.md`.
- **No change to `ingestReflection`.** It keeps consuming raw `r.stdout` and applying its own JSON-fence unwrap. We do not couple reflection ingestion to the new helper.
- **No `r.stdout` mutation.** Sanitization output is held in a local `const` and used only for the `writeFile` call.
- **No new dependency**, no `package.json` edit, no defaults-sync. The change is engine-internal TypeScript only.
- **No `src/engine/exec-claudecode.ts` / `exec-codex.ts` / `exec-gemini.ts` changes.** Capture layer is untouched; sanitize is post-capture.

## Implementation Approach

1. Write the pure helper first with a complete unit test file (TDD-style — tests red, then green).
2. Wire the helper at the single seam (`run-cycle.ts:146`) — one-line edit.
3. Adjust the one existing test that depends on byte-exact artifact match.
4. Add one new integration test that exercises the wiring (artifact stripped, raw stdout untouched in log).
5. Update `CLAUDE.md`.

Rationale: the helper is testable in isolation with no fixtures, the seam is one line, and integration is one fake-claude script. Splitting into more slices adds no value.

The four-step pipeline (per SPEC):

1. Trim leading whitespace (`s.replace(/^\s+/, "")`).
2. Drop leading narration lines: while the head matches `^(Now|Next|Here is|Output)\b[^\n]*(\n|$)`, slice it off; between drops, also tolerate a run of whitespace-only lines `/^\s*\n/`. Stop on the first non-narration, non-blank line.
3. Outer-fence unwrap: if the entire remaining payload matches `/^```(?:\w+)?\n([\s\S]*)\n```\s*$/`, replace with the captured body. Single pass; never recurse.
4. Trim trailing whitespace. If the result is non-empty, append exactly one `\n`. If empty, return `""`.

Word boundary `\b` is what excludes `Notification`, `Outputs`, `Nowadays`. Case-sensitive match.

---

## Task 1: Pure helper + unit tests

### Overview

Implement `sanitizeArtifactStdout` and exhaustively unit-test it before any engine wiring exists.

### Changes Required

**File**: `src/engine/sanitize-artifact.ts` (new)

```ts
const NARRATION_LINE = /^(Now|Next|Here is|Output)\b[^\n]*(?:\n|$)/;
const BLANK_LINE = /^[^\S\n]*\n/;
const OUTER_FENCE = /^```(?:\w+)?\n([\s\S]*)\n```\s*$/;

export function sanitizeArtifactStdout(stdout: string): string {
  let s = stdout.replace(/^\s+/, "");

  // Drop one-or-more leading narration lines, tolerating blank lines between.
  while (NARRATION_LINE.test(s)) {
    s = s.replace(NARRATION_LINE, "");
    while (BLANK_LINE.test(s)) s = s.replace(BLANK_LINE, "");
  }

  // Unwrap a single outer fence covering the entire remaining payload.
  const fence = s.match(OUTER_FENCE);
  if (fence) s = fence[1];

  s = s.replace(/\s+$/, "");
  return s === "" ? "" : s + "\n";
}
```

Notes:
- `[^\S\n]*` for the blank-line regex tolerates whitespace-only lines that are not just `\n` (per Open Q4 resolution).
- `OUTER_FENCE` anchors are `^` / `$` against the whole string — no `m` flag — so inner fences are not unwrapped.
- `NARRATION_LINE` ends with `(?:\n|$)` so a payload that is *only* `"Now done."` (no trailing `\n`) gets fully consumed by step 2, then step 4 returns `""`.

**File**: `tests/engine/sanitize-artifact.test.ts` (new)

Eight `node:test` cases:

| # | Name | Input → expected |
|---|---|---|
| 1 | strips canonical `Now …` BUILD line | `"Now sync defaults to .cycle/.\n\n# BUILD\nbody.\n"` → `"# BUILD\nbody.\n"` |
| 2 | strips compound: leading narration + outer fence | `"Now write review.\n\n\`\`\`markdown\n# Review\nbody.\n\`\`\`\n"` → `"# Review\nbody.\n"` |
| 3 | idempotent on clean payload | `f(f("# FIX\nbody.\n")) === f("# FIX\nbody.\n") === "# FIX\nbody.\n"` |
| 4 | inner fence preserved | `"# Doc\n\nIntro.\n\n\`\`\`ts\ncode();\n\`\`\`\n\nOutro.\n"` → unchanged (modulo trailing-newline normalization) |
| 5 | mid-document `Now ` line preserved | 10 lines of body, line 5 is `Now we tear down.` → that line still present in output |
| 6 | non-narration prefix preserved | `"Note: read CLAUDE.md.\n"` → `"Note: read CLAUDE.md.\n"`; same for `"Notice: …"`, `"Nowadays …"`, `"Notification …"`, `"Outputs …"` |
| 7 | multi-line leading narration with blank lines between | `"Now A.\n\nNext B.\n\nHere is C.\n\n# Body\n"` → `"# Body\n"` |
| 8 | empty / whitespace-only | `""` → `""`; `"   \n\n\t\n"` → `""` |

Assertions use `assert.equal` for byte-exact match. No fixtures, no mocks, no setup/teardown — pure-function calls only.

### Success Criteria

- [ ] `src/engine/sanitize-artifact.ts` compiles under `npm run typecheck`.
- [ ] `npm test -- --test-name-pattern=sanitize-artifact` passes all eight cases.
- [ ] No imports of `node:fs`, `node:path`, or any peer engine module from the new file.
- [ ] `npm run test:coverage` shows ≥ 95% line / ≥ 90% function on the new file.

---

## Task 2: Wire the helper at the artifact-write seam

### Overview

One-line edit at `src/engine/run-cycle.ts:146` to route the write through `sanitizeArtifactStdout`. `ingestReflection` on line 149 keeps the raw `r.stdout`.

### Changes Required

**File**: `src/engine/run-cycle.ts`

Add the import alongside the other engine peers (the file already imports e.g. `ingestReflection` from `./reflection.ts`):

```ts
import { sanitizeArtifactStdout } from "./sanitize-artifact.ts";
```

Edit line 146 from:

```ts
await writeFile(join(artifactDir, `${step.name.toUpperCase()}.md`), r.stdout, "utf8");
```

to:

```ts
await writeFile(join(artifactDir, `${step.name.toUpperCase()}.md`), sanitizeArtifactStdout(r.stdout), "utf8");
```

Line 149 (`ingestReflection(repoRoot, cycleId, slug, r.stdout, log)`) is **unchanged** — reflection ingestion continues on raw stdout, preserving its existing trim + JSON-fence-unwrap behavior.

### Success Criteria

- [ ] `npm run typecheck` clean.
- [ ] `npm test` passes (after Task 3 adjustment lands).
- [ ] `grep -n "sanitizeArtifactStdout" src/engine/run-cycle.ts` returns exactly one call site (line 146).
- [ ] `grep -n "r\.stdout" src/engine/run-cycle.ts` still shows the line-149 `ingestReflection(... r.stdout, log)` consumer untouched.

---

## Task 3: Fix the existing documentation test's byte-exact assertion

### Overview

`tests/engine/run-cycle.documentation.test.ts:73` does `assert.equal(await readFile(docFile, "utf8"), summary)` where `summary = "Updated README.md to mention the new flag."` (no trailing `\n`). Post-sanitization, the artifact gains exactly one `\n`. Update the assertion.

### Changes Required

**File**: `tests/engine/run-cycle.documentation.test.ts`

Line 73, change:

```ts
assert.equal(await readFile(docFile, "utf8"), summary);
```

to:

```ts
assert.equal(await readFile(docFile, "utf8"), summary + "\n");
```

Leave the fake-shell stdout (`printf '%s' '${summary}'`) untouched — that simulates an agent that didn't emit a trailing newline, and the sanitizer's job is precisely to normalize that.

### Success Criteria

- [ ] `npm test -- --test-name-pattern="documentation step success"` passes.
- [ ] No other byte-exact `readFile(...md, "utf8") === <raw>` assertions exist in `tests/engine/` (verified by grep — see Code References).

---

## Task 4: Integration test asserting the wiring witness

### Overview

A small `runCycle` integration test that uses a single-step `build` workflow, fixtures a fake `claude` whose stdout starts with `Now …`, runs the engine, and verifies (a) the on-disk `BUILD.md` does not start with `Now `, (b) the on-disk body matches the expected post-sanitize bytes, (c) `log.jsonl` contains `step.end` but no leak of the agent body.

### Changes Required

**File**: `tests/engine/run-cycle.sanitize.test.ts` (new)

Pattern mirrors `tests/engine/run-cycle.documentation.test.ts:41-82`. Single test:

```ts
test("runCycle: agent stdout starting with 'Now …' is sanitized in BUILD.md; log.jsonl unaffected", async () => {
  // mkdtemp root + bin, setupGitRepo, write workflows.yml with a single
  // step:
  //   - name: build
  //     agent: claudecode
  //     prompt: prompts/build.md
  // write a fake `claude` that printf-emits:
  //   "Now sync defaults to .cycle/.\n\n# BUILD\nReal body.\n"
  //
  // run runCycle, then:
  //   - read BUILD.md, assert it equals "# BUILD\nReal body.\n"
  //   - read .cycle/log.jsonl, assert no line contains "Now sync defaults"
  //     (proves the log was never given the sanitized OR raw body, since
  //     `appendLog` is structurally stdout-free)
});
```

The `log.jsonl` assertion is intentionally negative on the *raw narration string* — that's the wiring witness SPEC requested. Phrasing it as "log differs from artifact" would be over-specified given the log has no stdout at all.

Workflow `no_branch: true` keeps the test off branch-creation paths; alternatively reuse the documentation test's single-step workflow shape with `base_branch: main` and `CYCLE_BASE=main`.

### Success Criteria

- [ ] New test passes under `npm test`.
- [ ] Test runs in < 5s (parity with `run-cycle.documentation.test.ts`).
- [ ] Test does not depend on real Claude / Codex / Gemini binaries — fake shell on `PATH` only.
- [ ] Negative assertion on `log.jsonl` for `Now sync defaults` is present.

---

## Task 5: CLAUDE.md architecture-reference bullet

### Overview

Add a one-line bullet under `## Architecture quick reference` noting the sanitize seam. This is the explicit "done" criterion in SPEC §Documentation Updates; the `documentation` workflow step itself will sweep further drift after this cycle's `commit-trunk` lands.

### Changes Required

**File**: `CLAUDE.md`

In the `## Architecture quick reference` list (just after the "Documentation step" bullet, before "Subprocess discipline"), add:

> - Artifact sanitization: `src/engine/sanitize-artifact.ts:sanitizeArtifactStdout(stdout: string): string` is applied at the single artifact-write seam in `src/engine/run-cycle.ts` so every `docs/cycle/<id>/<STEP>.md` is stripped of leading `^(Now|Next|Here is|Output)\b …` narration lines and unwrapped of a single outer ``` fence covering the entire remaining payload. Pure / idempotent / no I/O. `log.jsonl` payloads are untouched (the logger never carries stdout). `ingestReflection` continues to consume raw `r.stdout` with its own JSON-fence handling.

No README.md change — sanitization is engine-internal and surface-invisible to consumers. SPEC §Documentation Updates makes this optional.

### Success Criteria

- [ ] `git diff master -- CLAUDE.md` shows exactly one new bullet, no other edits.
- [ ] Bullet references `src/engine/sanitize-artifact.ts` and `src/engine/run-cycle.ts` by path.

---

## Testing Strategy

### Unit Tests

- `tests/engine/sanitize-artifact.test.ts`: eight cases covering the four-step pipeline, idempotence, all six negative cases, and empty input. Pure-function calls; no fixtures, no mocks. This is the bulk of the coverage and lives in a single tight file.
- **Mocking stance**: zero mocks. The helper is pure; assertions are byte-exact `assert.equal`.

### Integration / E2E Tests

- `tests/engine/run-cycle.sanitize.test.ts`: one fake-`claude`-on-`PATH` scenario, one `runCycle` invocation, two assertions (artifact sanitized; `log.jsonl` free of the narration body). Reuses the well-established `mkdtemp + setupGitRepo + workflowYml + fake-shell + readFile` pattern from `run-cycle.documentation.test.ts`.
- No Playwright / browser / multi-process tests — this is an internal pipeline change with no user-visible UI.
- The `run-cycle.documentation.test.ts:73` adjustment is itself a regression-coverage assertion that sanitization runs on at least one real seam usage.

## Risk Assessment

- **Breakage of byte-exact artifact tests we didn't find.** Mitigation: `grep -rn "readFile.*\.md.*utf8" tests/engine/` in Task 3's pre-check returned only `tests/engine/branch.test.ts:178` (writes its own SPEC.md directly, doesn't traverse the seam) and the `run-cycle.documentation.test.ts:73` we're already updating. The dogfood `BUILD.md`-style tests don't byte-match artifacts against a raw fixture — they assert presence or shape. Verified via grep before writing this plan.
- **Sanitization mangling a legitimately fence-only payload.** A future agent that legitimately emits `\`\`\`json\n{...}\n\`\`\`\n` as its full output would lose the outer fence. Today this matters for `reflection` — but `reflection`'s ingestion path keeps raw `r.stdout` (Task 2 leaves line 149 untouched), so `ingestReflection`'s own JSON unwrap is unaffected. The on-disk `REFLECTION.md` artifact may end up unwrapped, but it has no programmatic consumer — it is reference reading only. Mitigation: documented in CLAUDE.md bullet (Task 5).
- **Over-greedy narration regex matching unintended lines.** Mitigation: `\b` word boundary explicitly tested against `Notification`, `Outputs`, `Nowadays`, `Note:`, `Notice:` (Task 1 case 6).
- **Idempotence regression.** Mitigation: Task 1 case 3 asserts `f(f(x)) === f(x)` on a clean payload; the helper's final trim+single-`\n` step makes the fixed point trivial.
- **Coverage-gate regression on `src/engine/triage.ts`.** This cycle does not touch `triage.ts`; the floor stays satisfied. `scripts/coverage-gate.mjs` is run via the `posttest:coverage` hook as part of `npm run test:coverage`.
- **`commit-trunk.sh` failure surfacing through the sanitized artifact.** Bash steps don't traverse this seam (`step.agent === "bash"` path in `run-cycle.ts:132-133` skips both `writeFile` and `ingestReflection`). No risk.
```

Plan write done. 5 tasks: helper + units (Task 1), one-line seam wire (Task 2), fix existing doc test trailing-newline assert (Task 3), new integration test (Task 4), CLAUDE.md bullet (Task 5). All open questions resolved inline. Engine captures stdout to PLAN.md.
