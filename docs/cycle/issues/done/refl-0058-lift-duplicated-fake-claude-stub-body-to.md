---
id: refl-0058-lift-duplicated-fake-claude-stub-body-to
title: Extract shared fake-claude stub helper for run-cycle tests to absorb future artifact byte-floor changes
workflow: quickfix
depends_on: []
triaged_at: "2026-05-14T21:06:06.988Z"
source: triage
---
## Problem

Cycle 0058's spec post-condition guard raised the on-disk `SPEC.md` floor from 0 bytes to 200 bytes (`SPEC_MIN_BYTES = 200` in `src/engine/run-cycle.ts`). That single-byte-shape change cascaded into 21 mechanical edits in `tests/engine/run-cycle.test.ts`: every test that wrote a fake `claude` binary with `#!/bin/bash\necho FAKED\n` (6 bytes of stdout) had to swap to `#!/bin/bash\nyes FAKED | head -50\n` to clear the new floor.

Verification: `grep -c 'yes FAKED' tests/engine/run-cycle.test.ts` = 21, all at the same `await writeFile(fake, "#!/bin/bash\nyes FAKED | head -50\n", "utf8")` call shape.

This is the **second** time a byte-shape change cascaded into a mass test rewrite (cycle 0058 SPEC §Risk explicitly forecast it). The next floor change — raising `SPEC_MIN_BYTES`, adding `BUILD_MIN_BYTES` / `PLAN_MIN_BYTES`, or layering a semantic post-condition that needs real-shaped SPEC content — will force the same N-call-site sweep.

The current `yes FAKED | head -50` stub is also wrong-by-construction: `FAKED FAKED FAKED…` is nonsense SPEC content that happens to clear the byte floor but would never survive a semantic post-condition (e.g., a future check for `## Acceptance` headings).

## Direction

Extract the fake-claude stub body to a shared test helper so future floor changes touch one location instead of 21.

## Acceptance

- New module `tests/engine/_helpers/fake-claude.ts` (or beside the existing test-helpers seam — pick whichever convention the repo already uses; if none, create `_helpers/`) exports either:
  - a `FAKE_CLAUDE_BODY` string constant containing the canonical stub script body, **or**
  - a `writeFakeClaude(binPath: string, opts?: { minBytes?: number; shape?: "spec" | "build" | "plan" }): Promise<void>` helper that writes the executable stub with the right shape and chmod 0o755.
  Pick the helper-function form if multiple shapes are foreseeable; pick the constant form if a single canonical body covers every current call site. Justify the pick in the BUILD.md (a 2-line note is fine).
- The stub body emits **realistic-shape** SPEC content (not `FAKED FAKED FAKED…`): at minimum a `# Heading\n\n` line plus enough prose to clear `SPEC_MIN_BYTES` with margin (target ≥ 300 bytes so a future bump to 256 still passes). Inline a templated body — no fixture files.
- All 21 call sites in `tests/engine/run-cycle.test.ts` migrate to the new helper. After the sweep, `grep -c 'yes FAKED' tests/engine/run-cycle.test.ts` returns `0` and `grep -c 'echo FAKED' tests/engine/run-cycle.test.ts` returns `0` (the literal byte-shape string is gone from the test file).
- Full test suite (`npm test`) passes after the migration. Coverage gate (`npm run test:coverage`) still passes — the helper is pure test infrastructure, so `src/` coverage numbers should be unchanged.
- One regression test (or doc comment + assertion) pins the helper's emitted-body byte length `> SPEC_MIN_BYTES` so the helper itself can't silently fall below the floor again. Importing `SPEC_MIN_BYTES` from `src/engine/run-cycle.ts` is the right move — the helper and the floor share fate.
- BUILD.md notes the form picked (constant vs function), the new byte-length-of-emitted-body, and the grep counts before/after.

## Out of scope

- Generalizing `BUILD_MIN_BYTES` / `PLAN_MIN_BYTES` — that's a separate raw if/when it lands. This cycle only lifts the duplication so the **next** floor change is one-line.
- Migrating other test files (e.g., `tests/engine/triage.test.ts`) to the same helper unless they already use the identical `#!/bin/bash\nyes FAKED | head -50\n` shape. Stay scoped to the 21 known sites unless the sweep surfaces a 22nd-identical copy.
- Semantic SPEC.md post-conditions (heading checks, acceptance-bullet checks). Out of scope — file as a separate raw if desired.

## Risk

- A poorly-chosen helper signature (e.g., over-parameterized `shape: "spec"|"build"|"plan"` when only one shape is in use) re-introduces premature abstraction. Mitigation: prefer the constant-export form unless ≥2 shapes are needed today.
- Importing `SPEC_MIN_BYTES` from `src/` into a test helper couples tests to engine internals. Acceptable — the helper's whole purpose is to track that floor. Alternative: hard-code a higher number (e.g., 300) in the helper and rely on the pinned-byte-length test to fail loudly if the floor moves past it.
