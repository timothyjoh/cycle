The artifact dir is `docs/cycle/0050-feature-audit-non-claudecode-lanes-for-the-non-t/`.

# SPEC — Cycle 0050: Audit non-claudecode agent lanes for the non-TTY stdin hazard

## WHY
Cycle 0049 discovered that bare `codex` rejects a piped (non-TTY) stdin with `Error: stdin is not a terminal` on codex-cli ≥ 0.136, and pinned the lane to `codex exec`. The fix's own SPEC and `BUILD.md` flagged that the `gemini`, `opencode`, `pi`, and `auggie` lanes were never checked for the identical interactive-vs-non-interactive hazard, but no follow-up was filed. The hazard is concrete, not speculative: `runAgent` spawns every agent with a piped stdin (`stdio` defaults to `["pipe","pipe","pipe"]` for stdin delivery — never a TTY), and three lanes — `gemini`, `opencode`, and `pi` — deliver their prompt over that piped stdin (`exec-gemini.ts`, `exec-opencode.ts`, `exec-pi.ts` all pass `promptDelivery: "stdin"`). Any of them would break identically if its upstream CLI gates non-interactive mode on a TTY the way codex-cli now does — and per the codex pattern the failure would surface cycles later on someone else's machine, not here.

## CONCRETE USER BENEFIT
After this cycle, a user running cycle with `--workflow` steps configured for the `gemini`, `opencode`, or `pi` agent can read `docs/models.md` and see, per lane, the confirmed prompt-delivery mechanism and an explicit statement of whether that lane is safe against the non-TTY stdin failure that broke codex — and, for any lane where the upstream CLI is confirmed to gate non-interactive mode on a TTY, the lane is already pinned to its non-interactive entrypoint so the user never hits `stdin is not a terminal` mid-run.

## USABLE END-STATE
Each non-claudecode lane (`gemini`, `opencode`, `pi`, `auggie`) has a one-line audit verdict recorded in `docs/models.md`: its prompt-delivery path and a non-TTY-safety confirmation backed by the upstream CLI's actual interactive-mode gating. Where a real hazard is confirmed, the lane invokes the CLI's non-interactive equivalent (mirroring the `codex exec` fix and its `CYCLE_<AGENT>_BIN` + structural-invariant pattern). Where no hazard exists, no lane code changes and the cycle is satisfied by the doc deliverable.

## Objective
Audit the four non-claudecode agent lanes against the non-TTY stdin hazard that broke the codex lane in cycle 0049, prioritizing the `gemini` lane because it most closely mirrors the codex breakage (prompt delivered over piped stdin). Record a per-lane verdict in `docs/models.md`, and apply a non-interactive-entrypoint fix only to a lane where the upstream CLI is confirmed to gate non-interactive mode on a TTY. No speculative changes.

## Source Issue
`refl-0049-audit-gemini-lane-for-the-same-non-tty-s` — "Audit non-claudecode lanes for the non-TTY stdin hazard that broke codex"

## Scope

### In Scope
- Audit all four non-claudecode lanes — read each `exec-*.ts` to confirm the prompt-delivery path (`gemini`/`opencode`/`pi` = piped stdin; `auggie` = `--print --instruction-file`), then check each upstream CLI's interactive-mode gating against that path, prioritizing `gemini`.
- Record a per-lane verdict (delivery mechanism + non-TTY-safety confirmation) in `docs/models.md`.
- Apply a non-interactive-entrypoint fix (+ tests + structural invariant) **only** to a lane where a TTY-gating hazard is confirmed against the upstream CLI; if none is confirmed, set `expects_code: false` on the source issue so the empty-diff guard is satisfied by the doc deliverable.

### Out of Scope
- Any change to the `claudecode` or `codex` lanes (codex was fixed in 0049).
- Verifying the speculative `--model` / `--thinking` flag names for `opencode`/`pi` (tracked by the existing `TODO:` comments in those lanes) — this audit is about stdin/TTY gating only.
- Adding a structural invariant for general agent-fleet consistency (the REGISTRY / `Step.agent` / `exec-*.ts` triad) beyond any agent-binary/subcommand invariant required by a confirmed fix.

## Requirements
- The audit must determine each lane's verdict from the upstream CLI's **actual** interactive-mode gating (its `--help` / docs for a non-interactive / print / exec equivalent), not from assumption.
- `docs/models.md` must carry a per-lane non-TTY-safety line for `gemini`, `opencode`, `pi`, and `auggie`, consistent with the existing `codex` note at `docs/models.md:58`.
- If a fix is applied to a lane, it must mirror the codex pattern: invoke the CLI's non-interactive subcommand/flag, preserve the lane's `CYCLE_<AGENT>_BIN` override, register the matching build-time structural invariant in `scripts/structural-invariants.mjs`, and add lane tests.
- If no fix is applied, the source issue `refl-0049-audit-gemini-lane-for-the-same-non-tty-s` must carry `expects_code: false` in its YAML frontmatter and the cycle's deliverable is the `docs/models.md` update alone.
- **Failure behavior**: This is primarily an audit/doc deliverable; its only failure surface is an incorrect verdict. A lane must not be "fixed" on suspicion — a lane is changed only when the upstream CLI is confirmed to reject a piped stdin (or gate non-interactive mode on a TTY) on the path that lane uses. Any applied fix must, on an unavailable or wrong-version agent CLI, surface the failure through the existing lane path (non-zero `exitCode`, populated `stderr`) rather than silently degrade — the `codex exec` fix's behavior is the reference. A confirmed-but-unfixable hazard (no non-interactive entrypoint exists upstream) must be recorded as an explicit warning in `docs/models.md`, never silently dropped.

## Acceptance Criteria
- [ ] `docs/models.md` contains a per-lane non-TTY-safety verdict for each of `gemini`, `opencode`, `pi`, and `auggie`, each stating its prompt-delivery mechanism and whether the upstream CLI gates non-interactive mode on a TTY (user-observable: a reader can determine each lane's safety from the doc).
- [ ] For the `gemini` lane specifically, the verdict cites the gemini CLI's non-interactive behavior on a piped stdin (the path `exec-gemini.ts` uses).
- [ ] Either (a) no `exec-*.ts` lane file under `src/engine/` is modified and `docs/cycle/issues/todo/refl-0049-audit-gemini-lane-for-the-same-non-tty-s.md` has `expects_code: false` in its frontmatter; **or** (b) for each lane with a confirmed hazard, its `exec-*.ts` invokes the CLI's non-interactive entrypoint, retains `CYCLE_<AGENT>_BIN`, and a matching entry exists in `scripts/structural-invariants.mjs`.
- [ ] Failure-path: a lane is changed only against a confirmed upstream TTY-gating behavior; the spec's "no speculative changes" rule is observable as either an unchanged `exec-*.ts` set (doc-only outcome) or a fix whose commit/docs cite the upstream gating evidence. A confirmed-but-unfixable hazard is recorded as a warning line in `docs/models.md`.
- [ ] If any lane code changed, `npm run check:invariants` passes with the new invariant(s) and lane tests cover the non-interactive invocation.
- [ ] All existing tests still pass.
- [ ] No compiler/linter warnings introduced (`npm run typecheck` clean).

## Testing Strategy
- Node's built-in `node:test` runner (`npm test`), consistent with the existing `tests/engine/exec-*.test.ts` suites.
- If a fix is applied: add a lane test asserting the non-interactive subcommand/flag is present in the spawned `argv` (mirroring the codex `exec`-subcommand test), using the lane's `CYCLE_<AGENT>_BIN` override to inject a fake binary — never a PATH stub (per the agent-binary hermeticity invariant in CLAUDE.md). Include a hermeticity check that the lane resolves its binary via `CYCLE_<AGENT>_BIN ?? "<bin>"`.
- If doc-only: no new tests; rely on `expects_code: false` to satisfy the empty-diff guard, and confirm the existing suite still passes.
- Regression: confirm the structural-invariants gate and existing exec-lane tests remain green.

## Documentation Updates
- **docs/models.md**: add the per-lane non-TTY-safety verdicts for `gemini`, `opencode`, `pi`, and `auggie` (the primary deliverable), consistent with the existing `codex` note.
- **CLAUDE.md / AGENTS.md**: if a lane fix lands, update the "Registered step agents" description for that lane to note the non-interactive entrypoint, and register the new structural invariant per the existing "Adding a new agent" guidance. No CLAUDE.md change is required for a doc-only outcome.
- **README.md**: no user-facing README change expected.

Documentation is part of "done" — the `docs/models.md` verdicts are the core deliverable of this cycle, not an afterthought.

## Dependencies
- The existing lane files `src/engine/exec-gemini.ts`, `exec-opencode.ts`, `exec-pi.ts`, `exec-auggie.ts`, the shared `exec-spawn.ts` (which establishes the piped-stdin spawn), and `src/engine/exec-codex.ts` (the reference fix).
- `docs/models.md` (existing; the `codex` non-TTY note at line 58 is the format reference).
- `scripts/structural-invariants.mjs` (only if a fix is applied — for the agent-subcommand invariant).
- Upstream CLI documentation / `--help` output for `gemini`, `opencode`, `pi`, and `auggie` to confirm each lane's interactive-mode gating. No new env vars or external services required.
