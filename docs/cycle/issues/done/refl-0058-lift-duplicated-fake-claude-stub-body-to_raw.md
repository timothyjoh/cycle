---
id: refl-0058-lift-duplicated-fake-claude-stub-body-to
source: reflection
title: lift-duplicated-fake-claude-stub-body-to-shared-test-helper
added_at: "2026-05-14T21:03:59.400Z"
triage_attempts: 0
priority_hint: 5
origin_cycle_id: "0058"
---

This cycle's spec post-condition guard raised the on-disk SPEC.md floor from 0 bytes to 200 bytes, which broke 21 existing tests in `tests/engine/run-cycle.test.ts` that used `#!/bin/bash\necho FAKED\n` as their stub `claude` binary (6 bytes of output). The fix was a mechanical `echo FAKED` → `yes FAKED | head -50` swap at every call site — 21 identical edits to identical 1-line stub bodies (verified: `grep -c 'yes FAKED' tests/engine/run-cycle.test.ts` = 21, all at the same `await writeFile(fake, "#!/bin/bash\nyes FAKED | head -50\n", "utf8")` shape).

This is the second time a single-byte-shape change has cascaded into a mass test rewrite (cycle 0058 SPEC §Risk explicitly forecast it). The next floor change — for example, raising `SPEC_MIN_BYTES` from 200 to a more realistic value, or adding `BUILD_MIN_BYTES` / `PLAN_MIN_BYTES` floors when the pattern generalises — will require the same N-call-site sweep. The stub body is also wrong-by-construction (`FAKED FAKED FAKED…` produces nonsense SPEC content that happens to clear the byte floor but would never survive a semantic post-condition).

Direction: extract a `tests/engine/_helpers/fake-claude.ts` (or alongside the existing test-helpers seam) exposing a single `FAKE_CLAUDE_BODY` constant — or a `writeFakeClaude(bin, opts?)` helper that lets each test request a realistic-shape SPEC stub (e.g. parameterized minimum-byte template that emits enough heading+prose to look like a real spec). Update the 21 sites in one pass. Future floor changes touch one line.
