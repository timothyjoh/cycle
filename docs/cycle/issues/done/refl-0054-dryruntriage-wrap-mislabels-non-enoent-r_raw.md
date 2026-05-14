---
id: refl-0054-dryruntriage-wrap-mislabels-non-enoent-r
source: reflection
title: dryruntriage-wrap-mislabels-non-enoent-readfile-failures
added_at: "2026-05-14T19:45:13.559Z"
triage_attempts: 0
priority_hint: 3
origin_cycle_id: "0054"
---

`src/engine/triage.ts:268-274` (the cycle-0054 wrap) catches every `readFile` rejection on the prompt-template path and re-throws as `prompt template missing: <resolved-path>: <inner.message>`. ENOENT is the intended case, but EACCES (permission denied), EIO, EBUSY, and EMFILE all surface with the same `prompt template missing:` prefix. REVIEW.md cycle 0054 flagged this explicitly as non-blocking finding #2.

For an operator iterating on `cycle triage --dry-run` after `engine.paused`, a permission-denied error on the prompt template currently reads `prompt template missing: <path>: EACCES: permission denied` — semantically wrong (the template exists; we just can't read it). Suggested direction: narrow the catch to ENOENT (`if ((e as NodeJS.ErrnoException).code === "ENOENT") throw new Error("prompt template missing: …"); throw e;`) and let other I/O errors propagate with their native ENOENT-distinct shape. The Case B test would continue to pass (it seeds an absent file → ENOENT). No new test required unless we want to pin EACCES propagation explicitly.

Low priority — this only bites under unusual filesystem states, but the narrowing is two lines and removes the wrong-shape contract from the docs path.
