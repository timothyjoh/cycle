---
id: refl-0021-triage-validator-seen-and-childids-dupli
source: reflection
title: triage-validator-seen-and-childids-duplicate-tracking
added_at: "2026-05-13T19:03:57.424Z"
triage_attempts: 0
priority_hint: 4
origin_cycle_id: "0021"
---

`validateOutput` in `src/engine/triage.ts` builds two independent sets that track the same thing: `seen` (line ~392, populated during the children loop) and `childIds` (line ~416, populated again before the ordering/resolution passes). REVIEW.md called this out as a pre-existing nit (Finding 7) — untouched by cycle 0021 but now more visible because the new resolution pass reuses `childIds` again.

Why it matters: the duplication invites future bugs. The next time someone adds a child-id constraint they will pick one of the two sets, and a subtle divergence (e.g. a forgotten `.add()` in one branch) will produce a validator that lets through bad output. The cost of consolidation is tiny; the cost of a phantom failure here is silent queue corruption because `applyRaw` runs unconditionally on accepted output.

Suggested direction: build a single canonical `childIds: Set<string>` once, immediately after the children-shape validation, and use it for the duplicate-id check, the ordering loop, and the new `depends_on` resolution pass. Delete `seen`.
