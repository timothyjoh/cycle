---
id: redesign-02-load-cycle-env
source: text
title: Load .cycle/.env at engine bootstrap so CYCLE_TRUNK_BASED is honored as documented
added_at: "2026-05-21T02:42:44Z"
triage_attempts: 1
priority: high
---

See [RFC-003](../../../RFC-003-in-cycle-remediation-and-priority-routing.md) §1b and §7.

## Problem

CLAUDE.md states trunk-based operation is "enforced via `CYCLE_TRUNK_BASED=1` in `.cycle/.env`." But **no code reads `.cycle/.env`**. The flag is only set by the `--trunk` CLI flag (`src/cli.ts:125`) or an already-exported shell env var; the only reader is `src/engine/workflow.ts:86`. The shipped default is `commit.mode: worktree-pr` (`src/defaults/workflows.yml:7`). So a repo relying on `.cycle/.env` silently runs in worktree-pr mode — creating branches/worktrees, contradicting the documented "edit master directly" workflow, and producing inconsistent commit/checkout behavior depending on how each invocation got its environment.

## Approach

Load `.cycle/.env` (simple `KEY=VALUE` lines) into `process.env` at engine bootstrap, before `loadConfig`, without overwriting variables already set in the real environment (real env wins; `--trunk` still wins). Keep the subprocess discipline (no `shell: true`); a tiny hand-rolled parser is fine — avoid adding a dependency unless one is already present.

Out of scope: changing the shipped default. We keep `worktree-pr` as the YAML default and let `.cycle/.env` / `--trunk` override it, which is what the docs already promise.

## Acceptance Criteria

- [ ] With `.cycle/.env` containing `CYCLE_TRUNK_BASED=1` and no shell export, `cycle run` resolves `commit.mode` to `trunk` (verify via a `cycle.checkout … reason: "trunk"` log entry or equivalent).
- [ ] A real exported env var and `--trunk` both still take precedence over (or agree with) the file.
- [ ] Malformed/comment/blank lines in `.cycle/.env` are tolerated.
- [ ] Tests cover: file present sets the var, real-env precedence, missing file is a no-op.
- [ ] Recommended workflow: `feature`.
