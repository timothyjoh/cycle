---
id: refl-0054-learning-mode-insight-blocks-leak-into-c-sanitize-insight-marker-blocks
title: Strip `★ Insight ─────…─────` blocks in sanitizeArtifactStdout + pin zero-decoration contract in CLAUDE.md
workflow: feature
depends_on: [refl-0054-learning-mode-insight-blocks-leak-into-c-audit-suppress-output-style-propagation]
triaged_at: "2026-05-14T19:53:31.183Z"
source: triage
parent: refl-0054-learning-mode-insight-blocks-leak-into-c
---
Defense-in-depth follow-up to the source-side fix in `…-audit-suppress-output-style-propagation`. Even with env scrub / explicit-flag suppression in place, extend `src/engine/sanitize-artifact.ts:sanitizeArtifactStdout` to strip output-style decorative blocks at the artifact-write seam so any future inheritance regression cannot silently re-pollute committed `docs/cycle/<id>/<STEP>.md` files.

This cycle MUST land after the sibling investigation cycle so the marker bytes encoded in the regex match what the agent actually emits (the visible markers are U+2605 `★` and U+2500 `─`, but byte-exact confirmation comes from the sibling's BUILD.md).

## Work

1. **Extend `sanitizeArtifactStdout`** with a third pass (after narration-strip, before/after outer-fence-unwrap — pick whichever composes cleanly) that removes paired insight marker blocks:
   - Opener line matches `^★ Insight ─+$`
   - Closer line matches `^─+$`
   - Strip the opener, the closer, and every line between (including the rendered insight content — these are decorative, never load-bearing)
   - Multiline scan; safe to apply repeatedly across multiple blocks in one stdout
   - Pure / idempotent / no I/O — same contract as the existing two passes
2. **Tests** in `tests/engine/sanitize-artifact.test.ts`:
   - Strips one insight block in the middle of an otherwise normal stdout (the 0054 FIX.md shape)
   - Strips multiple insight blocks in one stdout
   - Leaves stdout untouched when no `★ Insight` opener is present
   - Composes with the existing narration-strip + outer-fence-unwrap passes (e.g. an insight block embedded inside a fenced payload that is itself preceded by `Now ...` narration)
   - Idempotent: `sanitize(sanitize(s)) === sanitize(s)`
   - Coverage on `src/engine/sanitize-artifact.ts` does not regress (line/branch).
3. **CLAUDE.md** — add one paragraph under the existing artifact-sanitization architecture-quick-reference bullet pinning the contract: captured agent stdout written to `docs/cycle/<id>/<STEP>.md` MUST NOT carry output-style decoration (e.g. `★ Insight ─────` blocks from the `learning` style). Source-side suppression in `child-env.ts` + `exec-claudecode.ts` is the primary defense; `sanitizeArtifactStdout`'s insight-strip pass is belt-and-suspenders.

## Acceptance

- `sanitizeArtifactStdout` strips paired insight blocks in addition to its existing two passes.
- New tests cover the strip pass, idempotence, multi-block input, and composition with the prior passes.
- Coverage on `src/engine/sanitize-artifact.ts` does not regress vs the master baseline.
- CLAUDE.md carries an explicit "zero output-style decoration in committed artifacts" contract paragraph naming both defense layers.

## Depends on

`refl-0054-learning-mode-insight-blocks-leak-into-c-audit-suppress-output-style-propagation` — the sibling cycle confirms the byte-exact marker pattern to encode in the regex AND lands the source-side suppression that this work backstops.
