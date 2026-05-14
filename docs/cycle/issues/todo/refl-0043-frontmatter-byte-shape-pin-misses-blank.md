---
id: refl-0043-frontmatter-byte-shape-pin-misses-blank
title: Extend frontmatter byte-shape pin to include mandatory blank line between closing fence and body
workflow: feature
depends_on: []
triaged_at: "2026-05-14T16:01:17.820Z"
source: triage
---
## Problem

Cycle 0043 pinned the canonical byte-shape of the frontmatter block emitted by `materializeFreeformIssue`, but the pin stops at the closing `---\n` fence. The writer at `src/issue/materialize.ts:23-26` emits:

```ts
["---", "", text, ""].join("\n")
```

so the canonical bytes between the closing fence and the body are `---\n\npark this too\n` — i.e. there is a **mandatory blank line** after the fence before the body begins.

Two tests pin around this region but neither pins the blank line itself:

- `tests/cli/multi-loop.test.ts:175-187` — `expectedFrontmatter` ends in `---\n`, then body tail is asserted via `/\npark this too\n$/`.
- `tests/issue/materialize.test.ts:21-33` — same shape: prefix ends at `---\n`, body matched separately.

## Why this is a hole

If a future writer change drops the blank line (e.g. `["---", text, ""].join("\n")`), the output becomes `---\npark this too\n` — and **both** assertions still pass:

- `body.startsWith(expectedFrontmatter)` — closing `---\n` is still present at the start.
- `/\npark this too\n$/` — the `\n` immediately before `park` is now the `\n` ending `---`, so the regex still matches.

This is exactly the class of silent divergence cycle 0043 was filed to prevent. The pin currently locks the frontmatter fields and the body content, but leaves the blank-line separator between them un-pinned.

## Fix

One-character extension in both tests: change the expected prefix from ending in `"---\n"` to ending in `"---\n\n"`. Both layers (unit + e2e) leak the same way, so both must be tightened in the same change.

## Acceptance

- `tests/issue/materialize.test.ts` expected-prefix string ends with `---\n\n` (the blank line is pinned, not implicit).
- `tests/cli/multi-loop.test.ts` `expectedFrontmatter` ends with `---\n\n` for the `cycle run "<text>" --dry-run` assertion (and any sibling `cycle drop` assertion in the same file).
- A mutation test (or manual flip) confirms: removing the blank line from `materialize.ts` now fails at least one test.
- No production code changes; this is a test-tightening cycle, not a behavior change.

## Notes

This is a tiny, surgical cycle whose value is **defense-in-depth on the existing byte-shape pin**. It does not depend on `refl-0043-cycle-run-dry-run-emits-log-jsonl-while` (the asymmetry-in-log-emission raw) — that one is independent and can run in either order.
