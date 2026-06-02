---
id: txt-20260602-000000-containerized-step-execution
source: text
title: "Containerized step execution: run cycle steps (at least verify/bash) inside a configured Docker image for prod-parity Linux builds"
added_at: 2026-06-02T00:00:00.000Z
triage_attempts: 0
priority: high
---

GOAL: let cycle run its steps inside a configured Docker container so a repo's build/verify happens on a consistent, prod-parity Linux environment — independent of the dev host (Mac / Windows / WSL2). This is the clean answer to "a project shouldn't be limited to building on a Mac," and the proper fix for the sibling `recon` repo (deploys to AWS EC2 / Amazon Linux; its full suite is green on ubuntu CI but a port-release e2e test fails on the WSL2 host's virtualized network stack — a container gives a real Linux netns and matches CI/prod). Relates to the cross-platform issue (txt-20260601-230000); this is the container-based approach, complementary to per-host shell abstraction.

HARD CONSTRAINT — must be developed AND validated on THIS WSL2 machine (the Mac is gone). The feature must work with Docker running under WSL2 (containers run in a real Linux network namespace via the Docker VM, which is exactly why they avoid the WSL2 host quirks). Do NOT design anything that assumes a macOS host. Build + test it here.

DESIGN:
- New config, e.g. `engine.container: { image: "amazonlinux:2023", ... }` (or per-step `container:` override). When set, steps run inside `docker run` against that image with the repo bind-mounted (working dir = the mounted repo), env passed through (respect the child-env.ts curation + CYCLE_* re-injection contract), exit code propagated, stdout/stderr captured exactly as the non-container path.
- SCOPE (phase it): at MINIMUM, run the `verify`/bash steps in-container (prod-parity for the quality GATE — the highest-value slice). Agent steps (claudecode/codex/etc.) running in-container is harder (CLI install + auth inside the image) — design so it's POSSIBLE later (full-cycle-in-container mode) but the first deliverable can keep agents on the host and only containerize verify/bash. Make the boundary explicit and documented.
- Image expectations: the configured image must have the repo's toolchain (e.g., Node >= 22.6 for JS repos). Document that the image is the user's responsibility; optionally support a build/prepare hook. Default off (no container) — fully backward compatible.
- Subprocess discipline: spawn `docker` with ARRAY args, shell:false, never exec/shell:true (per CLAUDE.md). Propagate the child exit code; surface docker-not-available / image-pull failures with a clear, actionable error (tie into the cross-platform PREFLIGHT: if `engine.container` is set, preflight that `docker` exists and the daemon is reachable, else halt cleanly with guidance — on WSL2: start dockerd / enable Docker Desktop WSL integration).
- Determinism/cleanup: container is ephemeral (`--rm`); no leaked containers on failure/timeout; honor the existing per-step timeout (kill the container, not just the local process).

DELIVERABLES: container exec lane (likely a new src/engine/exec-container.ts or an option on exec-bash/the step dispatcher) returning the shared StepResult shape; config plumbing in workflow.ts + loadConfig; preflight integration; docs (docs/ENGINE.md + CLAUDE.md + a docs/containerized-execution.md with the WSL2-Docker setup notes and an Amazon-Linux example). TESTS: unit tests mocking the docker spawn (args correctness, exit-code propagation, env passthrough, --rm, timeout kills the container, docker-missing → clear preflight error); a gated integration test that actually runs a trivial step in a real container WHEN Docker is available on the host (skip cleanly when not). Meet coverage floors (add a per-file floor for the new lane). Backward-compat: with no `engine.container`, the argv/behavior is byte-for-byte the current host path.

NOTE: to validate the integration path on this machine, the Docker daemon must be running under WSL2 (Docker CLI 29.4.0 is installed; daemon currently not started).
