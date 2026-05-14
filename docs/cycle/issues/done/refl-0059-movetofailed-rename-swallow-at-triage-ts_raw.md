---
id: refl-0059-movetofailed-rename-swallow-at-triage-ts
source: reflection
title: movetofailed-rename-swallow-at-triage-ts-676-677-now-unreachable
added_at: "2026-05-14T21:34:29.214Z"
triage_attempts: 0
priority_hint: 4
origin_cycle_id: "0059"
---

REVIEW.md Finding 2 in §Adversarial Test Review documents that `src/engine/triage.ts:676-677` (the `moveToFailed.rename` catch-swallow) is no longer covered. The deferred-flush pattern means the rename only fires on partial-fail, and the only fault-injection path that previously hit the swallow (`vanish`: raw already unlinked) was deliberately repointed to all-fail per PLAN. Per-file floor (99.45% ≥ 95%) doesn't trip, but the defensive code is now reachable only in a vanishingly narrow window — partial-fail with a raw unlinked between the per-raw retry phase and the deferred flush.

Direction: either (a) delete the defensive try/catch (the flush path now only runs after we know `raws.length > failed.length`, so the unlink-mid-pass race is much less plausible), or (b) add a fault-injection test that unlinks one raw between retry-end and flush-start to keep the swallow exercised. (a) is more honest — defensive code that's unreachable from tests rots quietly. If we choose (b), the test should `await` between the retry and the flush via a hookable seam, which means a small refactor for testability.
