---
id: setup-workflow-generate-verify-sh
title: "setup workflow: use LLM to generate and evolve project-specific verify.sh"
added_at: "2026-05-25T00:00:00.000Z"
source: operator
triage_attempts: 0
priority_hint: 5
---

## Problem

The default `verify.sh` is a generic fallback. Projects have real diversity: Node + Jest, Node + Vitest, Cargo, Python + pytest, Make-based, polyglot. The right verify script depends on the project's actual tech stack — and that stack can change over the course of a project (adding a Python service, switching test runners, etc.).

A static default cannot adapt. A manually written `.cycle/scripts/verify.sh` requires operator intervention every time the stack changes.

## Vision

A `setup` workflow (or a dedicated `verify-setup` step in `init`) that:

1. Inspects the repo for tech stack signals: `package.json`, `Cargo.toml`, `pyproject.toml`, `Makefile`, `go.mod`, etc.
2. Uses an LLM step to generate a project-specific `.cycle/scripts/verify.sh` tailored to what it finds.
3. Runs the generated script once to validate it (smoke test: does it exit 0 on a clean repo?).
4. Commits the script to `.cycle/scripts/verify.sh`.

Regeneration triggers to consider:
- Operator runs `cycle setup` explicitly
- `package.json` changes test runner (detected by triage)
- A new language config file appears at repo root

## Design questions to resolve

- Is this a `setup` subcommand or a built-in workflow (`cycle run --workflow setup`)?
- What's the failure mode if the generated script fails the smoke test? (retry with error context? prompt operator?)
- Should the script be committed to the repo (shared with team) or kept local in `.cycle/`?
- How do we detect "stack has changed enough to warrant regeneration" without false positives?

## Acceptance Criteria (TBD — needs design pass first)

- [ ] Design questions above answered
- [ ] `setup` workflow or command generates a working `verify.sh` for at least: Node/npm, Rust/cargo, Python/pytest
- [ ] Generated script is validated before commit
- [ ] Regeneration path documented for operators
- [ ] All existing tests pass
