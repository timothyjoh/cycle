```markdown
# Implementation Plan: Cycle 0019

## Overview
Add `priority: 3` as the sixth, RFC-001-mandated frontmatter key emitted by `materializeFreeformIssue`, so `cycle drop "<text>"` produces a `raw/` file structurally identical to the RFC §"Raw drop" example. Update the existing unit test to assert all six keys in order. No CLI surface, triage, or docs changes.

## Current State (from Research)
- `src/issue/materialize.ts` already writes to `docs/cycle/issues/raw/` via `mkdir … {recursive:true}` + `writeFile`. Emits five hand-built frontmatter lines: `id`, `source: text`, `title`, `added_at`, `triage_attempts: 0`. The `priority` key is the only field missing vs. the RFC.
- Two call sites flow through this function: `src/cli.ts:54` (the `drop` branch) and `src/cli.ts:63` (the `run "<text>"` convenience path). One edit covers both — expected fallout, allowed by SPEC.
- Stdout JSONL contract `{event:"issue.dropped", issue_id, path}` lives at `src/cli.ts:55` and must not change.
- `parseFrontmatter` in `src/engine/frontmatter.ts:17` recognises `^-?\d+$` as numeric, so an unquoted `priority: 3` round-trips as a JS `number` — matching the integer shape triage expects today (triage doesn't read `priority` yet, so adding it is a forward-compatible no-op).
- Existing unit test `tests/issue/materialize.test.ts` uses fixed clock + `mkdtemp` + regex `assert.match`. One happy-path test, ~16 lines.
- E2E test `tests/cli/multi-loop.test.ts:123` shells out to `dist/cycle.js`, asserts the drop path contains `/docs/cycle/issues/raw/` and the body contains the text — does not introspect frontmatter, so it survives untouched.
- Acceptance grep `grep -rn "docs/cycle/issues/tbd" src/ tests/` is already clean — must remain clean.

## Desired End State
- `materializeFreeformIssue` emits exactly six frontmatter lines in RFC-001 order: `id`, `source: text`, `title`, `added_at`, `triage_attempts: 0`, `priority: 3`, followed by `---`, blank line, body, trailing newline.
- `tests/issue/materialize.test.ts` asserts: path under `raw/`, all six keys present in stable order, `priority: 3` unquoted numeric, body trailing newline preserved.
- `npm test` is green. `npm run typecheck` is clean. `npm run test:coverage` meets the baseline (line ≥ 95 %, branch ≥ 75 %, function ≥ 90 %) and `src/issue/materialize.ts` shows 100 % line / function.
- `grep -rn "docs/cycle/issues/tbd" src/ tests/` still returns zero.
- The bundled `dist/cycle.js` (rebuilt automatically via `pretest`) produces files matching the new shape end-to-end.

Verification: run `npm test`, `npm run typecheck`, `npm run test:coverage`, and the acceptance grep. Spot-check by dropping an issue in a tmp repo via `dist/cycle.js` and `cat`ing the resulting file.

## What We're NOT Doing
- No `--priority` CLI flag on `cycle drop`. Deferred to a follow-up. (Source: SPEC §Out of Scope.)
- No `cycle status` command — sibling child issue `cli-drop-writes-to-raw-status-command`.
- No edits to `src/engine/triage.ts` or how triage reads `raw/` frontmatter.
- No change to how triage *orders* by priority — RFC says priority "not honored automatically"; we only emit the hint.
- No `--help` text or README edits for `drop` (current README has no `drop` example; CLI parser has no help surface for this branch).
- No changes to `docs/RFC-001-issue-lifecycle.md` — the example value `priority: 5` is illustrative; our default `3` is set in code, not in the RFC.
- No new E2E or Playwright tests.
- No cleanup of historical mentions of `tbd/` in `docs/plans/2026-05-12-cycle-mvp-dogfood.md` — frozen artifact.
- No edits to `src/cli.ts` (the shared call site picks up the new field automatically through `materializeFreeformIssue`).

## Implementation Approach
Single vertical slice: insert one line in the materializer's frontmatter template, then expand the existing unit test in the same commit to (a) prove the new field is present and (b) lock in field order for all six keys. Field order is asserted with a single regex that matches the full frontmatter block — one assertion, one place to update if RFC field order ever changes. The e2e test in `tests/cli/multi-loop.test.ts` already exercises the bundled binary end-to-end and will continue to pass without modification because it doesn't introspect frontmatter.

The change is one slice, not multiple, because the implementation and its test are both ~5 lines and splitting them would manufacture coordination overhead without buying any incremental verification.

---

## Task 1: Emit `priority: 3` from `materializeFreeformIssue` and lock the six-field contract in tests

### Overview
Insert `"priority: 3"` as the sixth frontmatter line (between `triage_attempts: 0` and the closing `---`) so the emitted file matches RFC-001 §"Raw drop". Extend the existing unit test to assert (a) the new field, (b) all six keys appear in the documented order, (c) `priority` is unquoted numeric `3`, (d) trailing newline on body is preserved.

### Changes Required

**File**: `src/issue/materialize.ts`
**Changes**: Add one line to the frontmatter array between the existing `triage_attempts` line and the closing `---`.

```ts
  const frontmatter = [
    "---",
    `id: ${id}`,
    "source: text",
    `title: "${text.replace(/"/g, '\\"')}"`,
    `added_at: ${now.toISOString()}`,
    "triage_attempts: 0",
    "priority: 3",
    "---",
    "",
    text,
    "",
  ].join("\n");
```

No signature change. No new imports. The function still returns `{ path, id }`.

**File**: `tests/issue/materialize.test.ts`
**Changes**: Replace the existing per-field `assert.match` set with a single multiline regex that asserts the full ordered frontmatter block, then keep the path/id/body assertions as today. The single-regex approach makes field order a first-class invariant; a future RFC field-order change requires one line to update.

```ts
import { test } from "node:test";
import { strict as assert } from "node:assert";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { materializeFreeformIssue } from "../../src/issue/materialize.ts";

test("writes a markdown file with frontmatter to raw/", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-test-"));
  try {
    const { path, id } = await materializeFreeformIssue(
      "fix login bug",
      root,
      new Date("2026-05-12T10:30:00Z"),
    );
    assert.ok(path.endsWith("/docs/cycle/issues/raw/txt-20260512-103000-fix-login-bug.md"));
    assert.equal(id, "txt-20260512-103000-fix-login-bug");
    const body = await readFile(path, "utf8");

    // Lock the full six-field frontmatter block in documented order (RFC-001 §"Raw drop").
    const expectedFrontmatter =
      "---\n" +
      "id: txt-20260512-103000-fix-login-bug\n" +
      "source: text\n" +
      'title: "fix login bug"\n' +
      "added_at: 2026-05-12T10:30:00.000Z\n" +
      "triage_attempts: 0\n" +
      "priority: 3\n" +
      "---\n";
    assert.ok(
      body.startsWith(expectedFrontmatter),
      `frontmatter mismatch:\n${body}`,
    );

    // Body preserved with trailing newline (no trimming).
    assert.match(body, /\nfix login bug\n$/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
```

Notes:
- `startsWith` over `assert.match` because we want exact byte equality of the frontmatter block, not regex tolerance.
- We keep the `\nfix login bug\n$` regex on the tail to assert the trailing newline survives independently of frontmatter formatting.
- The test still uses `mkdtemp` + `rm` for isolation — no shared state.

### Success Criteria
- [ ] `npm run typecheck` reports zero warnings.
- [ ] `npm test` is green — `tests/issue/materialize.test.ts` passes, `tests/cli/multi-loop.test.ts:123` "drop materializes an issue to raw/" still passes unmodified.
- [ ] `npm run test:coverage` shows line ≥ 95 %, branch ≥ 75 %, function ≥ 90 % overall, and `src/issue/materialize.ts` reports 100 % line / function.
- [ ] `grep -rn "docs/cycle/issues/tbd" src/ tests/` returns zero matches.
- [ ] Manual smoke: in a tmp repo, run `node dist/cycle.js drop "fix login bug"`, then `cat docs/cycle/issues/raw/txt-*-fix-login-bug.md` shows the six-field frontmatter with `priority: 3`.
- [ ] No file is written to `docs/cycle/issues/tbd/` during the drop (folder is not created).
- [ ] Existing stdout JSONL contract `{"event":"issue.dropped","issue_id":"…","path":"…"}` is byte-identical to before (path string, id string, event string all unchanged).
- [ ] Coverage numbers (line / branch / function, plus any per-file regressions) are reported in `BUILD.md` and `FIX.md` per project policy.

---

## Testing Strategy

### Unit Tests
- Extend the existing single happy-path test in `tests/issue/materialize.test.ts`. Lock the full six-field frontmatter block with one `startsWith` assertion against a literal string — this catches field-add/remove, field-reorder, and value-shape (quoted vs. unquoted) regressions in one assertion.
- Keep the path, id, and trailing-newline assertions intact — they cover orthogonal contracts (filesystem layout, ID derivation, body preservation).
- No mocking. The test uses a real tmp directory and the real filesystem. The clock is the only injected dependency (already passed as the third arg to `materializeFreeformIssue`).
- Edge cases: title with embedded `"` already covered implicitly by the existing `\\"` escape in `materialize.ts:14`. Not adding a separate test — RFC change scope here is the priority field, not the title-escaping branch (and that branch is already at 100 % function coverage with the single happy path).

### Integration / E2E Tests
- `tests/cli/multi-loop.test.ts:123` already spawns `dist/cycle.js`, drops an issue against a tmp repo root, parses the JSONL stdout, and asserts the resulting file is under `/docs/cycle/issues/raw/` with the dropped text in the body. It does not introspect frontmatter, so it continues to pass without modification — providing free end-to-end coverage of the bundled binary against the new materializer.
- `pretest` runs `npm run build`, so the bundled `dist/cycle.js` exercised by the e2e test is always built from the updated source.
- No new e2e or Playwright tests required — this cycle has zero UI surface.

### Anti-Mock Stance
No mocking introduced anywhere. The materializer's only side effect is `fs/promises` writes, exercised against a real tmp directory; the clock is injected as a constructor arg, not stubbed; the bundled binary is run as a real subprocess in the e2e path. This matches the existing pattern in `tests/issue/materialize.test.ts:8-23`.

## Risk Assessment
- **Risk:** A downstream consumer parses `raw/` frontmatter with a stricter YAML library that rejects unquoted integers in some context — would treat `priority: 3` differently from `triage_attempts: 0`.
  **Mitigation:** Project's only reader is `src/engine/frontmatter.ts`, a regex-based reader that already round-trips `triage_attempts: 0` as a number. Adding `priority: 3` exercises the same code path (`^-?\d+$`). Confirmed in research (`src/engine/frontmatter.ts:17`).
- **Risk:** `tests/cli/multi-loop.test.ts:123` secretly introspects frontmatter and breaks on the new field.
  **Mitigation:** Research confirmed it only asserts the path contains `/docs/cycle/issues/raw/` and the body contains the dropped text (lines 136–137). No frontmatter introspection. Will re-verify by reading lines 123–147 again at build time before declaring the cycle green; if the assertion turns out to include frontmatter, mirror the `priority: 3` check there in the same commit.
- **Risk:** Per-file coverage for `src/issue/materialize.ts` slips below 100 % when the new line adds an untested branch.
  **Mitigation:** The new line is a pure constant string, not a branch — coverage stays at 100 %. The existing single happy-path test hits the new line on first execution.
- **Risk:** The `src/cli.ts:62-64` `run "<text>"` path also picks up `priority: 3` and surprises a downstream user expecting the old five-field shape.
  **Mitigation:** Research confirmed this is shared writer fallout, expected and not excluded by SPEC. No downstream consumer in `src/` reads `priority` today (triage ignores it), so behaviour is unchanged. Document the fallout in `BUILD.md` so the reviewer can confirm intent.
- **Risk:** `npm run sync-defaults` is required for a defaults-file change but not actually needed here.
  **Mitigation:** No `src/defaults/` file is touched in this cycle — only `src/issue/materialize.ts` and `tests/issue/materialize.test.ts`. `sync-defaults` is not in the critical path.
```
