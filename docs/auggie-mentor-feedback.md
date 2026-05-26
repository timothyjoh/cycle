# Mentor Review: cycle (Dark Software Factory)

> Critical review of the `@cycleai/cli` repo as an example of an autonomous-development factory. Assessment covers documentation, architecture, operational readiness, code quality, and the gap between stated goals and shipped behavior.

---

## 1. Executive Summary

**The good:** This is a surprisingly mature workflow-orchestration engine. The issue lifecycle (raw → todo → done/failed/blocked/discuss), the JSONL audit log, the resume-from-tail crash recovery, and the reflection/self-healing loop are genuinely well thought-out. The test discipline (per-file coverage floors, structural invariants, exactly-once event assertions) is stronger than most early-stage tools.

**The gap:** It is an *orchestrator*, not a self-contained factory. It depends entirely on external agent CLIs (`claude`, `codex`, `gemini`, etc.) being installed, authenticated, and rate-limit-compliant. Calling it a "dark factory for AFK software development" oversells the current artifact. A more accurate framing is "a deterministic SDLC state machine that drives external agent CLIs through a repo-local prompt-and-artifact pipeline." That's still valuable, but the docs and README should say so up front.

**Verdict:** The *engine* is solid. The *product packaging* (docs, onboarding, operational observability, default prompts) needs a lot of hardening before a user can safely `npx @cycleai/cli init` in a brownfield repo and walk away.

---

## 2. What's Working Well

- **State machine clarity.** The five issue folders plus `tbd.jsonl` queue give a human operator a durable, git-visible picture of what the engine is doing. Crash recovery via `log.jsonl` tail-scan is the right primitive.
- **Artifact contamination suppression.** `ARTIFACT_SUPPRESS_PROMPT` + `sanitizeArtifactStdout` + the File Artifact Mode prompt headers show real operational experience with LLM output drift. This is the kind of detail that only appears after several broken cycles.
- **Footprint tracking.** `touched.json` derived from `git status --porcelain` delta is a good innovation. It removes the agent's ability to lie about what it changed.
- **Retry layering.** Per-step `on_fail: retry:N` + per-cycle `max_cycle_attempts` + pre-build skip on retry gives three different recovery horizons. That's appropriate for brownfield work.
- **Test posture.** Per-file coverage floors, structural-invariant regex checks, and `expectExactlyOne` cardinality assertions show an understanding that an engine's correctness is defined by its event log, not just return values.

---

## 3. Critical Issues (Would Block Safe AFK Operation)

### 3.1 The product is not self-contained
The README says "drop work into a repo, walk away." In reality the operator must:
- Install Node ≥ 22.6
- Install and authenticate the `claude` CLI (or another registered agent CLI)
- Install and authenticate `gh`
- Ensure the repo has a working test suite that `verify.sh` can discover

There is no bundled model, no fallback agent, and no preflight check that validates these dependencies. If `claude` hits a rate limit or the auth token expires, the engine emits `engine.paused` and exits 42 — but the human must notice, diagnose, and re-invoke. That's not AFK; that's async-with-babysitting.

**Recommendation:** Add a `cycle doctor` subcommand that checks for all required binaries, auth status, and repo testability. Update the README to describe cycle as an "agent CLI orchestrator" rather than a standalone factory.

### 3.2 `verify.sh` default is too naive for brownfield claims
The default verify script checks for `package.json` + `npm test`, `Cargo.toml`, or `pyproject.toml`. Brownfield repos use yarn, pnpm, poetry, pipenv, make, gradle, maven, etc.

**Recommendation:** Change the default to *fail* when no test runner is detected, with a clear message telling the user to write `.cycle/scripts/verify.sh`. Auto-install is never the right default for a factory.

**Status (cycle 0254):** Implemented. The `npm install` auto-install fallback is removed. Missing `node_modules/` in a Node repo exits 1 with a message directing the operator to run `npm install` before starting cycle. Missing `pytest` in a Python repo exits 1 similarly. No recognized test runner exits 1 directing the operator to write a custom `.cycle/scripts/verify.sh`. The top-of-file comment declares the default intentionally strict.

### 3.3 Git error handling is opaque
All git failures in `branch.ts` and `commit-cycle.ts` surface as generic `Error("git ... failed: <stderr>")`. There is no classification of:
- Network errors (retry-worthy)
- Merge conflicts (requires human intervention)
- Dirty working tree (operator error)
- Branch already exists (idempotency issue)

In a factory context, these need different remediation paths. A merge conflict should probably halt the queue immediately; a network push error should back off and retry.

**Recommendation:** Wrap git errors into a typed enum (`GitErrorKind`) and teach the engine to react differently per kind.

### 3.4 `gh` dependency is hard-coded for commit body generation
`commit-cycle.ts` calls `gh repo view` to discover the repo slug so it can emit `Closes #N` lines. This means the tool requires GitHub CLI even for repos hosted on GitLab, Bitbucket, or local-only remotes. The `gh` call silently fails and omits the closes block, but the dependency is still present and confusing.

**Recommendation:** Make `Closes #N` generation optional, triggered only when `gh` is present and the remote is GitHub. Document the fallback behavior.

---

## 4. Significant Design Concerns

### 4.1 Documentation proliferation and overlap
There are six authoritative-ish documents:
- `README.md` (product + quick-start)
- `BRIEF.md` (product philosophy)
- `docs/ARCHITECTURE.md` (system design)
- `docs/ENGINE.md` (implementation reference)
- `docs/RFC-001.md` (issue lifecycle spec)
- `docs/RFC-003.md` (remediation + priority routing)

All of them contain some degree of implementation detail, and all of them repeat the workflow step sequences, folder layouts, and CLI surface. A new contributor cannot tell which doc to trust when they conflict.

**Recommendation:** Designate exactly two docs:
- `README.md` — product + quick-start only (no implementation details).
- `docs/ARCHITECTURE.md` — the single system design doc.
- Everything else (`ENGINE.md`, RFCs) is historical record, cross-linked from ARCHITECTURE but not required reading.

### 4.2 Frontmatter parser is hand-rolled and fragile
`src/engine/frontmatter.ts` uses regex parsing (`/^---\n([\s\S]*?)\n---\n/`) and a custom `parseScalar` that splits arrays on commas with no escape handling. A title like `title: "Fix login, cookie, and session"` will be misparsed as an array. Multi-line values are unsupported.

This is a latent bug that will corrupt issue metadata the moment a real ticket contains commas, quotes, or newlines in a field. It also means the engine can never safely write or read YAML-compatible frontmatter.

**Recommendation:** Replace with a minimal YAML frontmatter parser (the runtime already depends on `yaml`). Use `YAML.parse` for the frontmatter block and `YAML.stringify` for serialization.


### 4.3 Hardcoded magic constants
`SPEC_MIN_BYTES = 200`, `MAX_STEP_END_STDERR = 2000`, `DEFERRED_CAP = 2`, `MAX_ATTEMPTS = 3` are scattered through the source with no configuration path. In a brownfield repo, a 200-byte spec minimum might be too high for a trivial config change, and a 2-item deferred cap might be too low for a large refactor.

**Recommendation:** Move these into `engine:` section of `workflows.yml` with the current values as defaults.

### 4.4 `cycle status` ignores `ideas/` items
`src/cli/status.ts` counts `raw`, `todo`, `done`, `failed`, `blocked` but not `discuss`. A repo with 20 parked discuss items looks empty. Operators will forget parked work exists.

**Recommendation:** Add `discuss:` count to status output.

### 4.5 Rate-limit handling exists only in docs
`README.md`, `BRIEF.md`, and `ARCHITECTURE.md` all describe rate-limit backoff and `engine.paused {reason: "rate_limit"}`. Searching the source, there is no code path that emits this event. The actual agent exec modules (`exec-claudecode.ts`, `exec-codex.ts`, etc.) resolve on process close with a simple `code === 0 ? "ok" : "failed"`. There is no HTTP status inspection, no retry loop, no `retry_after` parsing.

**Recommendation:** Either implement rate-limit detection in the exec-spawn layer (inspect stderr for known patterns, emit the event, and back off) or remove the claim from documentation. Undocumented unimplemented features are preferable to documented fantasies.

### 4.6 Init/upgrade leaves prompts stale
`runInit` copies `src/defaults/` into `.cycle/` once. `npm run sync-defaults` keeps `src/defaults/` and `.cycle/` in sync during development, but an end user running `npx @cycleai/cli init --upgrade` gets the new engine bundle while their prompts may remain old. There is no version stamp on prompts, no migration logic, and no warning when the engine version and prompt version diverge.

**Recommendation:** Add a `.cycle/prompts/.version` file stamped with the package version at init time. On upgrade, warn if user-edited prompts differ from shipped defaults. Provide a `--sync-prompts` flag that shows a diff and requires `--yes` to overwrite.

---

## 5. Code Quality Notes

### 5.1 `cli.ts` is an imperative script, not a dispatch table
The main entrypoint is a flat sequence of `if` blocks with inline `process.exit()` calls. This makes it impossible to unit-test the CLI routing without spawning a subprocess. It also means CLI argument parsing is split between `parseArgs.ts` (for `run`/`drop`) and inline manual parsing in `cli.ts` (for `init`, `status`, `triage`, `cleanup`).

**Recommendation:** Refactor to a command registry (`Map<string, CommandHandler>`) where each handler is an async function returning an exit code. Test each handler in isolation.

### 5.2 `run-cycle.ts` is doing too much
At 460+ lines, `runCycle` manages: step dispatch, artifact write, post-condition guards (spec size, fix emptiness, empty diff), skip-unless gates, resume logic, touched-file accumulation, documentation path appending, and branch reset. These are all correct, but they share one mutable closure scope and one `for` loop. Adding a new post-condition or a new non-fatal step requires editing the middle of the loop.

**Recommendation:** Extract a `StepRunner` abstraction: each step type (agent, bash, guard, skip) implements a small interface. The loop becomes a pipeline of `StepRunner[]`.

### 5.3 Git operations duplicated across modules
`branch.ts`, `commit-cycle.ts`, and `run-cycle.ts` all spawn git directly. `commit-cycle.ts` uses `spawnSync`; `branch.ts` uses async `spawn`. The environment handling (`buildChildEnv`) is inconsistently applied — `commit-cycle.ts` passes `envExtra` to every spawn, but `branch.ts` does not, meaning git hooks or alias configs can leak into the child.

**Recommendation:** Centralize all git spawning into one `git.ts` module that always uses `buildChildEnv` and consistently handles stdout/stderr/exit-code.

### 5.4 No linting or formatting configuration
`package.json` has no `eslint`, `prettier`, or `dprint`. For a tool that writes code into other repos and claims to respect conventions, its own codebase lacks enforced conventions.

**Recommendation:** Add a minimal lint pass (even if just `tsc --noEmit` plus a simple `eslint` for unused vars). It signals professionalism and catches the kind of drift brownfield repos suffer from.

---

## 6. Operational Gaps for AFK Use

| Gap | Impact |
|---|---|
| No built-in progress viewer / TUI | Operator must `tail -f .cycle/log.jsonl` or parse JSONL |
| No webhook / notification hook | A halted engine is invisible unless someone polls `status` |
| No resource cap (time, token spend) | A runaway agent could burn API quota indefinitely |
| No cycle timeout | A hung `claude -p` process stalls the engine forever |
| No disk-space guard | Artifact directories accumulate unbounded |
| No graceful shutdown | `SIGTERM` exits immediately; in-flight cycle is left mid-step with no `cycle.end` |

The engine is built for a human watching a terminal. A true dark factory needs at least a notification channel (Slack, email, simple HTTP POST) when `engine.halted` or `engine.paused` fires.

---

## 7. Recommendations (Prioritized)

**P0 — Fix before claiming production-ready:**
1. Implement `cycle doctor` (dependency/auth preflight).
2. Replace regex frontmatter parser with `yaml` module.
3. Harden `verify.sh` default: fail-fast instead of auto-install.
4. Remove or implement rate-limit claims.
5. Add `discuss` count to `cycle status`.

**P1 — Significant reliability improvements:**
6. Centralize git ops and classify errors (retry vs halt vs warn).
7. Make `gh` optional; make `Closes #N` generation conditional.
8. Add per-cycle timeout and `SIGTERM` graceful shutdown (finish current step, emit `cycle.end status:interrupted`, release lock).
9. Extract `StepRunner` abstraction to reduce `run-cycle.ts` complexity.
10. Add prompt-version tracking and upgrade warnings.

**P2 – Polish and contributor experience:**
11. Unify CLI dispatch into a testable command table.
12. Add a minimal linter to the repo.
13. Reduce doc duplication; make ARCHITECTURE.md the single source of truth.
14. Move magic constants into `workflows.yml`.
15. Add an optional notification webhook config to `engine:`.

---

## 8. Conclusion

`cycle` is one of the more thoughtful autonomous-dev orchestrators I've reviewed. The state machine, artifact pipeline, and test discipline show real scars from running this on actual code. But it currently sits in an uncanny valley: too complex to be a simple script, too dependent on external CLIs to be a self-contained factory. The documentation oversells the autonomy and undersells the operational prerequisites.

If I were adopting this in a brownfield team, I would use it as a *structured prompt runner* for a single trusted repo where I control the agent CLIs — not as a generic "drop in any repo and walk away" tool. The gap between those two use cases is exactly the P0 and P1 items above.

With 2–3 focused cycles on operational hardening, this becomes genuinely useful. Without that work, it's a sophisticated demo that needs a babysitter.
