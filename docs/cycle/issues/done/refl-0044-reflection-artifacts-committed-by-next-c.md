---
id: refl-0044-reflection-artifacts-committed-by-next-c
title: Stop the next cycle's `commit` step from scooping the prior cycle's reflection artifacts
workflow: feature
depends_on: []
triaged_at: "2026-05-14T16:19:04.955Z"
source: triage
---
## Problem

`feature.workflow` (`.cycle/workflows.yml:22-30`) runs `commit` at step 29 and `reflection` at step 30. That ordering means every cycle's own `REFLECTION.md` plus its reflection-surfaced `docs/cycle/issues/raw/refl-<cycleId>-*.md` files are written to disk *after* the cycle's commit has already landed. Triage then mutates those raws into `todo/`/`done/` between cycles. The next cycle's `commit-trunk.sh` stages everything in `git status --porcelain` (modulo a small denylist), so it greedily scoops the orphaned reflection + triage debris under its own commit title.

Concrete recent example: cycle 0044's commit `7cf2c92` ("Reconcile RFC-001 raw-drop example priority…") actually contains 14 files spanning cycle 0043's reflection + triage debris — `docs/cycle/0043-…/REFLECTION.md` (+19), three `refl-0043-*` raws archived into `done/`, three new `refl-0043-*` todos, plus one stale `todo→done` rename for `refl-0019-cycle-run-text-path-shares-writer-but-no.md`. Cycle 0044's SPEC was a single-line doc edit; the commit message attributes the housekeeping to it.

This is structural, not accidental drift — it happens every cycle, not just when an agent goes off-spec. Git blame, PR review, and rollback boundaries silently lose their per-cycle alignment.

## Why this is distinct from neighbors

- `refl-0029-cycle-commit-scoops-unrelated-readme-dri` covers **same-cycle** out-of-scope drift caused by working-tree pollution. The reflection-orphan path here is **deterministic and between cycles**, and the artifacts are legitimate cycle outputs that should be committed — just not under the *next* cycle's title.
- `refl-0028-dormant-stash-cycle-0027-debris-quaranti` covers stash debris, not workflow ordering.

## Plausible directions (decide during plan step)

- **(a) Reorder `feature.workflow` so `commit` runs after `reflection`.** Smallest mechanical change. Breaks the invariant that the cycle's coded change ships before reflection writes anything new — a `reflection` parse failure or a flaky test on the reflection prompt would now block `commit`. Worth checking how `reflection.skipped` currently surfaces.
- **(b) Add a tiny `commit-reflection` step after `reflection`** that stages only `docs/cycle/<cycleId>-*/REFLECTION.md` + `docs/cycle/issues/raw/refl-<cycleId>-*.md` and commits them with a deterministic title (e.g. `cycle <id>: reflection artifacts`). Keeps the coded-change commit atomic; adds a second commit per cycle that's clearly scoped. Tradeoff: every cycle now produces two commits and the engine needs an extra `commit-only` script that doesn't share `commit-trunk.sh`'s greedy staging.
- **(c) Have `reflection` write to a staging path** (e.g. `.cycle/staged-reflection/`) that the next cycle moves into place at the start of its run. Preserves single-commit-per-cycle but pushes the housekeeping into the next cycle anyway — gains correctness on the commit title at the cost of cross-cycle file-move plumbing and an awkward bootstrap on the first cycle of a fresh repo.

(a) is the smallest change but breaks an invariant; (b) is the cleanest separation; (c) is the most invasive. Pick during `plan`.

## Out of scope for this cycle

- Re-attributing past commits already on `master` — leave history alone.
- Touching `commit-trunk.sh`'s denylist for unrelated drift (that's `refl-0029-cycle-commit-scoops-unrelated-readme-dri`).
- Changing the reflection prompt itself (no behavior change to *what* reflection writes, only *when* it's committed and under whose title).

## Acceptance

- After this cycle ships, running a full feature cycle end-to-end produces a commit whose title and contents are aligned: either the cycle's coded change *and* its reflection artifacts ship together under that cycle's title (option a/b), or reflection artifacts ship in a separately-titled commit owned by the cycle that produced them (option b). No future cycle's commit should contain a prior cycle's `REFLECTION.md` or `refl-<otherCycleId>-*.md` files.
- The choice and its rationale are documented in CLAUDE.md under the workflow-style section, so future cycles know which invariant holds.
- Regression test covers the chosen path. If (a): a workflow-ordering assertion on `feature.workflow`. If (b): an integration test that runs a mock cycle with reflection output and asserts the two commits exist with the expected file partitioning. If (c): a test that the staging path is cleaned by the next cycle's start.
