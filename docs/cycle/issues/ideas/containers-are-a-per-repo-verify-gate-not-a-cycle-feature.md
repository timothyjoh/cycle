---
id: idea-containers-per-repo-verify-gate
source: text
title: "(parked idea) Prod-parity container testing is a PER-REPO verify-gate concern — NOT a cycle feature"
added_at: 2026-06-02T00:20:00.000Z
triage_attempts: 0
priority: idea
---

DECISION (2026-06-02): cycle should NOT manage containers. No `engine.container` mode, no cycle-orchestrated `docker run`. This supersedes/rejects the earlier "containerized step execution" design.

RATIONALE: whether a build/test runs in a container is a **per-repo preference and testing gate**, owned by the repo — not the engine. cycle already supports this with zero new features: the `verify` step is a bash step that runs the repo's own `.cycle/scripts/verify.sh` (or test harness), so a repo whose deploy OS differs from the dev host just containerizes inside its OWN gate. cycle stays agnostic and simple.

EXAMPLE (the recon case — deploys to AWS EC2 / Amazon Linux; must be Linux-correct; its e2e port test fails only on the WSL2 host's virtualized network stack but is green on ubuntu CI): to get prod-parity testing off any single host, recon's OWN `verify.sh` (or CI/test setup) would run the suite in a container, e.g.

    docker run --rm -v "$PWD":/w -w /w <amazonlinux+node image> npm test

cycle runs that verify step unchanged. No cycle change required.

STATUS: parked as a reference/decision. Do NOT build a cycle container feature. If revisited, the only plausible cycle-side touch is documentation (a "testing on your deploy OS" note pointing repos at containerizing their own verify gate) — not engine container management.
