---
id: refl-0054-dryruntriage-wrap-mislabels-non-enoent-r
title: Narrow dryRunTriage prompt-template catch to ENOENT (stop mislabeling EACCES/EIO/etc as `prompt template missing`)
workflow: quickfix
depends_on: []
triaged_at: "2026-05-14T19:48:06.180Z"
source: triage
---
## Problem

`src/engine/triage.ts:268-274` (the cycle-0054 wrap) catches *every* `readFile` rejection on the prompt-template path and re-throws as:

```
prompt template missing: <resolved-path>: <inner.message>
```

ENOENT is the intended case. But EACCES (permission denied), EIO, EBUSY, EMFILE, and any other `readFile` failure all surface with the same `prompt template missing:` prefix — a wrong-shape contract. An operator iterating on `cycle triage --dry-run` after `engine.paused` who hits a permission-denied error currently reads `prompt template missing: <path>: EACCES: permission denied`, which is semantically wrong (the template exists; we just can't read it).

REVIEW.md cycle 0054 flagged this explicitly as non-blocking finding #2. CLAUDE.md's `cycle triage --dry-run` row documents the `prompt template missing: <resolved-path>: <cause>` shape as the contract for the *missing* case — narrowing the catch aligns code with that documented contract.

## Fix

Narrow the catch in `src/engine/triage.ts` (around the cycle-0054 wrap, ~lines 268-274) to ENOENT only:

```ts
try {
  promptBody = await fs.promises.readFile(promptPath, "utf8");
} catch (e) {
  if ((e as NodeJS.ErrnoException).code === "ENOENT") {
    throw new Error(`prompt template missing: ${promptPath}: ${(e as Error).message}`);
  }
  throw e;
}
```

Let EACCES / EIO / EBUSY / EMFILE / other I/O errors propagate with their native shape, which is distinguishable from ENOENT by both `code` and message.

## Acceptance

- Case B test in `tests/engine/triage-dry-run.test.ts` (the existing missing-prompt-template assertion) continues to pass — it seeds an absent file → ENOENT, so the narrowed branch still fires.
- No new test required for EACCES propagation unless we want to pin it explicitly. If we do, add one test that `chmod 000`s the prompt template and asserts the thrown error does **not** carry the `prompt template missing:` prefix (and surfaces `EACCES` instead). Skip on Windows / CI environments where `chmod` doesn't bite.
- CLAUDE.md `cycle triage --dry-run` row stays accurate; no doc edit required (the doc already implies the ENOENT-only contract).
- typecheck + full test suite green; coverage gate untouched.

## Scope notes

- Two-line change in the catch block.
- No behavior change for the documented happy path or for ENOENT.
- Low priority — only bites under unusual filesystem states (chmod, busy mounts, fd exhaustion) — but the narrowing removes the wrong-shape contract from the operator-debug path.
- Origin: cycle 0054 reflection.
