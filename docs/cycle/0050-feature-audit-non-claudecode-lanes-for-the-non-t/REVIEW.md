# Review: Cycle 0050

## Overall Verdict
PASS — no fixes needed

## Code Quality Review

### Summary
A clean, disciplined audit cycle. The build correctly resolved the SPEC's branch (b): the two lanes that actually deliver the prompt over a piped stdin (`pi`, `opencode`) were confirmed hazardous and pinned to their non-interactive entrypoints (`pi --print`, `opencode run`), while the two confirmed-safe lanes (`gemini`, `auggie`) were left untouched and documented. Each behavioral change is matched by a build-time structural invariant, a lane test, and a backing `docs/models.md` verdict. No new failure surface, no swallowed errors, no speculative changes.

### Findings
1. **Spec-correction (positive)**: The source/reflection issue mis-characterized `opencode`/`pi` as "argv-delivered, lower-risk." The build correctly read `exec-opencode.ts`/`exec-pi.ts`, found both used `promptDelivery: "stdin"`, and treated them as the genuine hazards — the opposite of the issue's stated risk ranking. This is the right call, not a deviation to flag.
2. **Delivery-mode change (correct)**: `opencode` switched `promptDelivery: "stdin" → "argv"` — `src/engine/exec-opencode.ts:23`. Verified against `runAgent`: `"argv"` appends the read prompt as the trailing positional and spawns with `stdio: ["ignore","pipe","pipe"]` (`src/engine/exec-spawn.ts:37,43`). This matches opencode's documented `run [message..]` positional contract. No stdin dependency remains.
3. **Failure handling**: Both lanes retain the unchanged `isRateLimitError` wrap and `runAgent` error path — ENOENT → `{status:"failed", exitCode:-1, stderr}`, non-zero exit → `{status:"failed", exitCode, stderr}`. The argv/`--print` change introduces no `catch`, no silent degrade. Fail-loud guard is the two new structural invariants (a refactor dropping `["run"]`/`["--print"]` fails `npm run check:invariants`).
4. **Idempotency / edge cases**: Changes are pure argv-construction; no state, no file writes, nothing retried. N/A by construction.

### Spec Compliance Checklist
- [x] Per-lane non-TTY-safety verdict for `gemini`, `opencode`, `pi`, `auggie` (+`codex`) in `docs/models.md` (new `## Non-TTY stdin safety` section), each stating delivery mechanism and TTY-gating safety — `docs/models.md:66`
- [x] `gemini` verdict cites the CLI's non-interactive-on-piped-stdin behavior (headless auto-mode), the path `exec-gemini.ts:7,15` uses
- [x] Branch (b): each confirmed-hazard lane invokes the non-interactive entrypoint, retains `CYCLE_<AGENT>_BIN` (`exec-opencode.ts:20`, `exec-pi.ts:11`), and has a matching invariant entry (`scripts/structural-invariants.mjs:181,206`)
- [x] No speculative changes: `exec-gemini.ts`/`exec-auggie.ts` unchanged; pi/opencode fixes cite confirmed local probes; no confirmed-but-unfixable hazard (both have non-interactive entrypoints, recorded)
- [x] Lane code changed ⇒ `npm run check:invariants` passes with new invariants; lane tests cover the non-interactive invocation
- [x] All existing tests pass; `npm run typecheck` clean
- [x] `## SPEC Acceptance Traceability` present in PLAN.md (`PLAN.md:154`), all 7 acceptance bullets re-quoted verbatim and paired with covering tasks
- [x] `## Acceptance Criteria` present in SPEC.md with 7 testable bullets (`SPEC.md:39`)
- [x] CLAUDE.md "Registered step agents" updated for `opencode`/`pi` non-interactive entrypoints; `expects_code: false` correctly NOT required (branch (b))

## Adversarial Test Review

### Summary
Adequate-to-strong. Assertions are specific (subcommand-anchored regex + positional prompt match, not bare truthiness), failure-path tests are retained, and the structural-invariants fixture was kept in parity with the two new pins.

### Findings
1. **Assertion quality (strong)**: `opencode` test asserts both `/^run\b/` (subcommand leads argv) and `/PROMPT-BODY-…\s*$/` (prompt is the trailing positional) — `tests/engine/exec-opencode.test.ts:30-31`. The `\s*$` anchor correctly tolerates `echo`'s trailing newline.
2. **Non-interactive pin tested**: `pi` test asserts `/(^|\s)--print(\s|$)/` in spawned argv via a `CYCLE_PI_BIN` fake — `tests/engine/exec-pi.test.ts:54-58`. Hermetic (no PATH stub), consistent with the agent-binary hermeticity invariant.
3. **Failure paths retained**: Both lanes keep ENOENT, non-zero-exit, and rate-limit-signal tests (opencode 7 tests, pi suite all green) — the delivery-mode change did not silently drop negative-path coverage.
4. **Minor (non-blocking)**: The new `pi --print` test does not itself re-assert the stdin round-trip under `--print`; that property is instead covered by the pre-existing `cat`-fake stdin test still passing with `--print` now leading argv. Coverage is intact (15/15 pi+opencode tests pass), so this is an observation, not a gap.

### Test Coverage
- Command run: `npm run test:coverage` (gate: `check:coverage` + `check:invariants`)
- `src/engine/exec-opencode.ts`: Line 27/27 = 100.00%, Branch 6/6 = 100.00%, Func 1/1 = 100.00%
- `src/engine/exec-pi.ts`: Line 24/24 = 100.00%, Branch 6/6 = 100.00%, Func 1/1 = 100.00%
- Regressions vs base (per-file): none — coverage-gate reported `ok` for every floored file; both changed files at 100% across all three metrics
- New code without tests: none
- Specific scenarios missing tests: none material (see Finding 4 — covered indirectly)

## Doc-vs-Code Claim Verification

Diff touches in-scope doc paths (`docs/models.md`, `CLAUDE.md`). Each introduced/modified claim is backed:

| Claim | Source (doc:line) | Backing (code:line) | Status |
|---|---|---|---|
| opencode invokes `opencode run` (non-interactive subcommand) | `docs/models.md:82` | `src/engine/exec-opencode.ts:13` | OK |
| opencode prompt delivered as `[message..]` positional argv | `docs/models.md:83` | `src/engine/exec-opencode.ts:23` (`promptDelivery: "argv"`) + `src/engine/exec-spawn.ts:37` | OK |
| pi invokes `pi --print` (non-interactive) | `docs/models.md:89` | `src/engine/exec-pi.ts:17` | OK |
| pi prompt still read from piped stdin | `docs/models.md:90` | `src/engine/exec-pi.ts:18` (`promptDelivery: "stdin"`) + `src/engine/exec-spawn.ts:88-91` | OK |
| gemini bare-`gemini` + stdin is the documented non-interactive form | `docs/models.md:72` | `src/engine/exec-gemini.ts:7,15` | OK |
| auggie uses `--print --instruction-file` (file delivery, never stdin) | `docs/models.md:91` | `src/engine/exec-auggie.ts:11,13` | OK |
| codex uses `codex exec` (fixed cycle 0049) | `docs/models.md:79` | `src/engine/exec-codex.ts` (invariant `codex lane invokes codex exec` = 1, green) | OK |
| `pi --print` / `opencode run` pinned by structural invariants | `docs/models.md:103` | `scripts/structural-invariants.mjs:181,206` | OK |
| CLAUDE.md: opencode `run` element / pi `--print` element build-time-pinned | `CLAUDE.md:67` | `scripts/structural-invariants.mjs:181,206` | OK |

No unbacked claims. Note: the external upstream-CLI behavioral assertions (gemini headless-on-non-TTY, pi interactive-hang, opencode TUI-on-non-TTY) are the audit's cited verdicts with linked sources and confirmed local probes; they are the deliverable itself, not code-backed prose, and are out of the strict source-backing scope of this pass.
