---
id: txt-20260513-034426-bb-6-propagateblocked-engine-wide-halt-p
source: text
title: "BB-6: propagateBlocked + engine-wide halt policy. New engine function propagateBlocked(failedId): walks tbd.jsonl, for every row whose depends_on contains failedId, moves todo/<id>.md -> blocked/<id>.md with blocked_by:[failedId] frontmatter, drops row from tbd.jsonl, emits issue.blocked event, recurses for transitive blocking. Pure deterministic logic, no LLM. Engine halt: maintain consecutive_failures counter; increment on cycle move to failed/, reset to 0 on cycle move to done/; when counter reaches engine.max_consecutive_failures (default 2), emit engine.halted with failed cycle ids and exit non-zero. See docs/RFC-001-issue-lifecycle.md sections 7, 8, 12 (BB-6)."
added_at: 2026-05-13T03:44:26.655Z
triage_attempts: 0
---

BB-6: propagateBlocked + engine-wide halt policy. New engine function propagateBlocked(failedId): walks tbd.jsonl, for every row whose depends_on contains failedId, moves todo/<id>.md -> blocked/<id>.md with blocked_by:[failedId] frontmatter, drops row from tbd.jsonl, emits issue.blocked event, recurses for transitive blocking. Pure deterministic logic, no LLM. Engine halt: maintain consecutive_failures counter; increment on cycle move to failed/, reset to 0 on cycle move to done/; when counter reaches engine.max_consecutive_failures (default 2), emit engine.halted with failed cycle ids and exit non-zero. See docs/RFC-001-issue-lifecycle.md sections 7, 8, 12 (BB-6).
