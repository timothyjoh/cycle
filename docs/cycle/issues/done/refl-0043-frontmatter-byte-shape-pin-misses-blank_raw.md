---
id: refl-0043-frontmatter-byte-shape-pin-misses-blank
source: reflection
title: frontmatter-byte-shape-pin-misses-blank-line-between-fence-and-body
added_at: "2026-05-14T15:59:25.110Z"
triage_attempts: 0
priority_hint: 4
origin_cycle_id: "0043"
---

The new e2e test at `tests/cli/multi-loop.test.ts:175-187` pins `expectedFrontmatter` ending in `---\n`, then asserts the body tail with `/\npark this too\n$/`. The writer at `src/issue/materialize.ts:23-26` emits `["---", "", text, ""].join("\n")`, so the canonical output between the closing fence and the body is `---\n\npark this too\n` (mandatory blank line). If a future writer change dropped that blank line, both `body.startsWith(expectedFrontmatter)` (still matches — closing `---\n` unchanged) and the body-tail regex (still matches — the `\n` before `park` is now the `\n` ending `---`) would silently pass.

The same gap exists in the unit test at `tests/issue/materialize.test.ts:21-33`, so both layers leak. The fix is one character: extend the expected prefix to `"---\n\n"` in both tests. This was the explicit purpose of cycle 0043 (byte-shape pin), so closing this hole strengthens the pin against the exact class of divergence it was filed to prevent.
