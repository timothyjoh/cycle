## Fix Summary

Addressed Task 1 (Critical): rewrote `## Recovering from engine.paused` in `README.md` to match actual engine behavior. The prior section falsely claimed the paused pass left `raw/` untouched; in reality `src/engine/triage.ts:225` runs `moveToFailed` per failed raw before `engine.paused` is emitted, so all failed raws live at `docs/cycle/issues/failed/<id>.md` with `failed_step: "triage"` frontmatter. Section now: (1) intro names the move-to-`failed/` behavior, (2) step 1 includes `ls docs/cycle/issues/failed/` plus a note about `triage.raw.failed` log events, (3) step 2 shows the `mv failed → raw` restore step and notes empty-`raw/` exit-0 ambiguity, (4) step 3 points edit/delete guidance at `failed/<id>.md`, (5) safety guarantee drops the false `raw/` claim and acknowledges the real on-disk side effect.

**Tests:** 286/286 pass. **Typecheck:** clean. **Coverage:** 97.14 / 90.64 / 96.21 (line / branch / function) — unchanged from BUILD.md baseline. **Unfixed:** none.

**Deviation note:** Verify check 1 (zero `raw/<id>.md` in section) collides with MUST-FIX's own prescribed `mv ... raw/<id>.md` restore command; two destination-only occurrences remain. Check 1's intent (no edit/delete instruction at a non-existent `raw/<id>.md`) is satisfied. Documented in MUST-FIX.md status note.
