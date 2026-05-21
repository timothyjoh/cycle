All 659 tests pass, all coverage gates green. Implemented Tasks 1–3 from PLAN.md.

Modified `src/engine/exec.ts` (+12 lines): added JSDoc block above `runStep` listing all six agents by name with per-agent `appendSystemPrompt` support status and pointer to ENGINE.md. Modified `docs/ENGINE.md` (~1 line replaced): updated the Known Limitations paragraph at the former line 138 in-place, replacing the aggregate gap statement with per-agent findings for all five non-claudecode agents (codex: not supported; opencode: not supported; gemini: unknown; auggie: unknown CLI unstable; pi: unknown CLI unstable), all attributed to cycle 0222. Modified `docs/cycle/0222-feature-implement-or-document-generic-appendsyst/RESEARCH.md` (+11 lines): appended `## CLI Findings` table with per-agent findings, method, and notes. No exec module files changed — no agent has a confirmed system-prompt-append CLI flag, so no argv forwarding or new tests were required; the existing parametrized warning test for all five agents passes unchanged. No deviations from PLAN.md. `npm test` result: 659/659 pass, 0 fail. `npm run test:coverage` result: line 98.53%, branch 92.53%, function 92.95% — no regression vs baseline (≥95% line, ≥75% branch, ≥90% function).

## Touched Files
- src/engine/exec.ts
- docs/ENGINE.md
- docs/cycle/0222-feature-implement-or-document-generic-appendsyst/RESEARCH.md
- docs/cycle/issues/raw/refl-0221-file-artifact-mode-directive-insufficien.md
- docs/cycle/issues/raw/refl-0221-review-md-contamination-excluded-from-mu.md
- docs/cycle/issues/raw/refl-0221-spec-md-wrong-correct-negative-example-m.md
- docs/cycle/issues/todo/refl-0219-append-system-prompt-suppression-still-i.md
