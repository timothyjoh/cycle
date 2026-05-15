---
id: refl-0069-spec-precondition-greps-should-anchor-on
source: reflection
title: spec-precondition-greps-should-anchor-on-id-field-not-substring
added_at: "2026-05-15T20:09:13.330Z"
triage_attempts: 0
priority_hint: 4
origin_cycle_id: "0069"
---

SPEC.md AC #3 specified `grep failed-blocked-frontmatter .cycle/tbd.jsonl` as a precondition gate. Cycle 0069's own queue row title contained the literal phrase `failed-blocked-frontmatter`, so the loose substring grep returned `1` and would have aborted the disposition as a false positive. BUILD had to silently narrow to `'"id":"failed-blocked-frontmatter"'` to satisfy the SPEC's *intent* (no live row with that id) without tripping the gate. REVIEW flagged this as a SPEC-authoring lesson.

Future queue-inspection preconditions that target an issue id should always anchor on the JSONL `"id":"<id>"` field (or use `jq`) rather than a free-substring grep. Title strings contain user prose and routinely include the phantom id verbatim. Consider a brief SPEC-authoring note in CLAUDE.md or the spec prompt, or a small lint/check helper that recognizes the precondition-grep pattern and warns when the target id appears in the queue's title field.
