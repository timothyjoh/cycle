All gates green. Writing the build summary.

## Summary

Cycle 0050 audited the four non-`claudecode` agent lanes against the non-TTY stdin hazard that broke `codex` in cycle 0049 and, following the SPEC's branch (b), applied confirmed non-interactive-entrypoint fixes to the two lanes the research confirmed hazardous (`pi`, `opencode`) while recording doc-only verdicts for the two confirmed-safe lanes (`gemini`, `auggie`).

**Files modified:**
- `src/engine/exec-pi.ts` (+5 lines): argv initialization changed from `[]` to `["--print"]` (pi's documented non-interactive mode; bare `pi` hangs on a piped non-TTY stdin), `promptDelivery: "stdin"` retained, `CYCLE_PI_BIN` override unchanged, lane comment records the rationale.
- `src/engine/exec-opencode.ts` (+7 lines): argv initialization changed from `[]` to `["run"]` (opencode's non-interactive subcommand; bare `opencode` launches the interactive TUI on a non-TTY stdin), `promptDelivery` switched `"stdin"`→`"argv"` so the prompt is delivered as the documented `[message..]` positional, `CYCLE_OPENCODE_BIN` override unchanged.
- `scripts/structural-invariants.mjs` (+22 lines): two new count-based pins mirroring the codex `["exec"]` pin — `["run"]` for opencode and `["--print"]` for pi.
- `tests/engine/exec-pi.test.ts` (+30 lines): new test asserting `/(^|\s)--print(\s|$)/` in the spawned argv via a `CYCLE_PI_BIN` fake; the existing `cat`-fake stdin round-trip still passes (prompt still flows via stdin under `--print`).
- `tests/engine/exec-opencode.test.ts` (~7 lines changed): converted the stdin round-trip test to an argv round-trip — fake now `echo "$@"`s its argv, asserting `/^run\b/` and the prompt as the trailing positional.
- `tests/scripts/structural-invariants.test.ts` (~10 lines): extended the `setup` fixture helper to write the `["run"]`/`["--print"]` argv-pin lines into the opencode/pi lane stubs so the two new count-based invariants are satisfied against the synthetic fixture root.
- `docs/models.md` (+44 lines): new `## Non-TTY stdin safety (interactive-mode gating)` section with a per-lane verdict (delivery mechanism + safety confirmation) for `gemini`, `codex`, `opencode`, `pi`, `auggie`, consistent with the existing codex thinking-flag note.
- `CLAUDE.md` (~1 line): updated the `opencode` and `pi` clauses in "Registered step agents" to name their non-interactive entrypoints and structural-invariant pins; `gemini`/`auggie`/`codex`/`claudecode` clauses unchanged.

**PLAN.md tasks complete:** Task 1 (pi `--print` pin + invariant + test), Task 2 (opencode `run` pin + argv delivery + invariant + converted test), Task 3 (`docs/models.md` verdicts), Task 4 (`CLAUDE.md` agent-fleet update) — all four landed.

**Tests:** `npm test` → 1090 pass, 0 fail (3 suites, 220.6s). `npm run typecheck` → clean. `npm run check:invariants` → all entries ok including both new pins.

**Coverage:** `npm run test:coverage` → exit 0; coverage gate (`check:coverage`) and `check:invariants` post-hooks both passed. `src/engine/exec-pi.ts` and `src/engine/exec-opencode.ts` each at 100.00% line / 100.00% branch / 100.00% function. No per-file regression.

**Failure modes handled:** The fixes change only argv/delivery, introducing no new failure surface — a missing/wrong-version `pi`/`opencode` binary still surfaces through the unchanged `runAgent` paths (ENOENT → `{status:"failed", exitCode:-1, stderr}`; non-zero exit → `{status:"failed", exitCode, stderr}`; rate-limit signal → `rateLimited:true`). The existing ENOENT, non-zero-exit, and rate-limit failure-path tests for both lanes remain green after the argv/delivery change, satisfying SPEC line 37 ("surface the failure through the existing lane path … rather than silently degrade"). The two structural invariants are the fail-loud guard: a future refactor dropping the `["run"]`/`["--print"]` literal fails `npm run check:invariants` (exit 1). No `catch`, no error suppression added.

**Deviations from PLAN.md:** One unplanned edit — `tests/scripts/structural-invariants.test.ts`'s `setup` fixture helper had to be extended to emit the new argv-pin lines into its synthetic opencode/pi lane stubs; without it the two new invariants counted 0 against the fixture root and the in-process invariant-gate tests failed. This is a fixture-parity update, not a behavior change. The opencode argv-round-trip assertion uses a `\s*$` anchor (not the bare `$` the plan implied) to tolerate `echo`'s trailing newline.

**Deferred / follow-up:** None for this cycle. The `opencode`/`pi` `--model`/`--thinking` flag-name verification remains out of scope (SPEC §Out of Scope) and its existing `TODO` comments stay accurate.

## Touched Files
- src/engine/exec-pi.ts
- src/engine/exec-opencode.ts
- scripts/structural-invariants.mjs
- tests/engine/exec-pi.test.ts
- tests/engine/exec-opencode.test.ts
- tests/scripts/structural-invariants.test.ts
- docs/models.md
- CLAUDE.md
- docs/ARCHITECTURE.md
