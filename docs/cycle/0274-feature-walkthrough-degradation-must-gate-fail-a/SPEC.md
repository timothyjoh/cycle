# SPEC — Cycle 0274: Walkthrough degradation is a blocking gate for UI-shipping cycles

## WHY
The walkthrough hook is the engine's strongest "did the running app actually work" signal — it drives the real app and captures the cycle's feature. But it is declared supplementary and **never fails a cycle**. When it degrades (the hook captured only a fallback/home/login screen instead of the cycle's feature), the engine merely flags it; the UI-shipping `feature` cycle still drains `ok`. Live evidence: recent cycles degraded to a single `/login` screenshot (the per-cycle scenario hit an auth precondition and bailed) and every one of them passed. The most direct "the feature was never demonstrated" evidence is currently ignored for pass/fail — a false green that violates the Core thesis (no false greens).

## CONCRETE USER BENEFIT
A repo maintainer who opts in (`engine.walkthrough_required: true`) gets a cycle that **fails loud** when its UI feature was never actually demonstrated: a degraded walkthrough produces `cycle.end { status: "failed" }` with a "walkthrough did not demonstrate the feature" diagnostic on stderr, instead of a silent green. They can trust that a `done/` UI cycle in that repo has a walkthrough that proved the feature ran — rather than discovering a `/login`-only screenshot after the fact.

## USABLE END-STATE
In a repo that sets `engine.walkthrough_required: true`, a UI-shipping `feature` cycle whose present-and-run walkthrough hook reports degradation blocks with a named diagnostic and a failed cycle outcome. A clean (non-degraded) walkthrough passes exactly as today. Repos with no walkthrough hook, repos that have not opted in, and doc-only / explicitly-non-UI cycles are completely unaffected — including cycle's own headless CLI repo, which configures no hook and never gates.

## Objective
Promote the walkthrough degradation signal from a non-blocking flag to a fail-closed blocking gate on the `walkthrough_capture` step, gated behind an explicit, defensively-coerced `engine.walkthrough_required` config and a per-issue UI-scope determination. When the gate is active, the hook is present and ran, the cycle ships UI, and the hook-owned degradation sidecar reports degradation, the engine routes the step through its existing fatal step-failure path (`step.end { status: "failed" }` → `cycle.end { status: "failed" }`) and emits a clear, named diagnostic. Every other path — no hook, not opted in, doc-only, non-UI, clean walkthrough — is byte-for-byte unchanged.

## Source Issue
`fix-walkthrough-degradation-is-a-blocking-gate-walkthrough-blocking-gate` — "Walkthrough degradation must gate (fail) a UI-shipping cycle, not just flag it"

## Scope

### In Scope
- A pure resolver module: `resolveWalkthroughRequired(cfg)` (defensive `=== true` coercion of `engine.walkthrough_required`; absent/non-boolean/malformed ⇒ `false`), a per-issue UI-scope predicate reusing the existing `expects_code` plus a new `expects_ui` frontmatter field, and a pure `classifyWalkthroughDegradation(sidecarText)` that reads the hook-owned degradation sidecar `walkthrough/walkthrough-status.json` (`{ degraded: boolean, reason?: string }`) — modeled on the pure half of `noop-marker.ts` / `verify-counts.ts`.
- Wire the gate into the existing `walkthrough_capture` intercept in `src/engine/run-cycle.ts`: after the hook exits 0 and media is collected, when the gate is active (required + UI-shipping + hook present-and-ran) and the sidecar reports degradation, flip the step to a fatal failure through the **existing** `step.end { status: "failed" }` → `cycle.end { status: "failed", failing_step: "walkthrough_capture" }` block and emit `walkthrough.degraded { cycle_id, step, reason, sidecar }` exactly once.
- Documentation: CLAUDE.md *Walkthrough capture* / engine flags and `docs/ENGINE.md` → *Walkthrough capture*; tests covering all four AC paths.

### Out of Scope
- The engine's own heuristic "only the home/fallback/login chapter was captured" detection (inferring degradation from media content/filenames). This cycle gates only on the explicit hook-owned sidecar signal; heuristic detection is a sibling/future round.
- Authoring or driving the per-cycle walkthrough scenarios (consumer-repo hook + prompts).
- Verify/e2e gating (siblings `fix-verify-must-exercise-running-app`, `fix-no-false-greens-unverified-blocks`).
- Gating the phased `quickfix` `walkthrough_before` / `walkthrough_after` steps — this cycle scopes the `feature` `walkthrough_capture` step only.

## Requirements
- `engine.walkthrough_required` plumbs through `loadConfig` as an optional boolean and resolves at the read site via `=== true` (absent/empty/non-boolean/malformed ⇒ `false`), matching the convention of `engine.compress_output` and the other `engine.*` flags. Default `false` keeps every current repo — including cycle's own — inert.
- A cycle is **UI-shipping** (subject to the gate) when `engine.walkthrough_required === true` **and** the source issue is not doc-only (`resolveExpectsCode(fm) !== false`) **and** not explicitly opted out (`expects_ui !== false`). The per-issue frontmatter resolution is fail-closed: in a required repo, an absent/non-boolean/`true` `expects_ui` ⇒ UI-shipping (gated); only an explicit `expects_ui: false` (or `expects_code: false`) exempts the cycle.
- The degradation signal is the hook-owned sidecar `<artifactDir>/walkthrough/walkthrough-status.json`. `classifyWalkthroughDegradation` returns degraded when the parsed JSON has `degraded === true`; returns not-degraded when the sidecar is absent or parses with a falsy/absent `degraded` (the hook ran and did not flag degradation).
- The gate fires only on the `walkthrough_capture` step, only after the hook exited 0 (the existing non-zero-exit / timeout fatal path is untouched), and only when the hook is present-and-ran (no hook ⇒ the unchanged `step.end { status: "skipped", reason: "walkthrough_hook_absent" }`, no `step.start`, no gate).
- A gated-degraded cycle routes through the existing fatal step-failure block — same `step.end { status: "failed" }` → `cycle.end { status: "failed", failing_step: "walkthrough_capture" }` pairing and early return through the unchanged `finally` cleanup as every other terminal path. No new halt reason.
- **Failure behavior**:
  - **Degraded + gated**: fail the cycle via the existing fatal path; emit `walkthrough.degraded` exactly once and a `formatWalkthroughDegradedError`-style stderr diagnostic ("walkthrough did not demonstrate the feature: …") referencing the sidecar reason. Never a silent kill.
  - **Sidecar present but unreadable/unparseable in a gated UI cycle**: fail-closed — treated as degraded (a corrupt proof-of-work signal cannot be coerced to "the app works"); the `walkthrough.degraded` reason names the parse failure.
  - **Sidecar absent / `degraded` falsy / gate inactive (not required, doc-only, or `expects_ui: false`) / no hook**: not gated — the step proceeds to its existing `step.end { status: "ok" }` (with the `walkthrough_artifacts` pointer when media exists), byte-for-byte unchanged.
  - **Source-issue read for UI-scope** is wrapped so any read/parse error degrades to the fail-closed default (UI-shipping in a required repo); it never throws out of the intercept and never coerces a silent pass.
  - The post-success collect/manifest-write `step.walkthrough_capture_failed` degrade and the un-phased media/manifest behavior remain unchanged.

## Acceptance Criteria
- [ ] **User-observable benefit**: In a repo with `engine.walkthrough_required: true`, a UI-shipping `feature` cycle whose present-and-run hook wrote `walkthrough/walkthrough-status.json` with `{ degraded: true }` produces `cycle.end { status: "failed", failing_step: "walkthrough_capture" }`, emits `walkthrough.degraded` exactly once, and surfaces a "walkthrough did not demonstrate the feature" diagnostic on the step's `step.end.stderr` — not a silent `ok`.
- [ ] A present-and-run hook with no sidecar, or a sidecar whose `degraded` is absent/falsy, keeps `step.end { status: "ok" }` and the cycle completes normally (hook-clean → ok).
- [ ] No walkthrough hook present ⇒ inert: exactly one `step.end { status: "skipped", reason: "walkthrough_hook_absent" }`, no `step.start`, no `walkthrough.degraded`, no failure — preserving cycle's own repo and any repo without a hook.
- [ ] A doc-only cycle (`expects_code: false`) and a cycle with `expects_ui: false` are not gated even when `engine.walkthrough_required: true` and the sidecar reports `degraded: true` — the step completes `ok`.
- [ ] **Failure-path criterion**: With `engine.walkthrough_required: true` on a UI cycle, a present-but-unreadable/unparseable `walkthrough-status.json` fail-closes — the cycle fails via the fatal path with a `walkthrough.degraded` event whose `reason` names the parse failure, and the worktree/cycle outcome is the standard terminal-failure shape (no silent pass).
- [ ] With `engine.walkthrough_required` absent or non-boolean (the default), behavior is byte-for-byte identical to today regardless of any sidecar — no `walkthrough.degraded` ever fires.
- [ ] `walkthrough.degraded` is cardinality-pinned in tests with `filter(...).length === 1`.
- [ ] Coverage holds at/above the per-file floor for `src/engine/walkthrough.ts` (95%) and any new/touched module (the new resolver module carries a ≥95% floor); no coverage regression vs the master baseline.
- [ ] All existing tests still pass.
- [ ] No compiler/linter warnings introduced (`npm run typecheck` clean).

## Testing Strategy
- **Framework**: `node:test` + the repo's existing harness (`tests/engine/*.test.ts`, `tests/helpers.ts` — use `expectExactlyOne` for the `walkthrough.degraded` payload assertion).
- **Pure-unit tests** (new resolver module): `resolveWalkthroughRequired` over `true` / `false` / absent / `"true"` string / `null` / number / missing `engine` (each ⇒ correct boolean, default `false`); UI-scope predicate over `expects_code: false`, `expects_ui: false`, `expects_ui: true`, absent, non-boolean; `classifyWalkthroughDegradation` over `{ degraded: true }`, `{ degraded: false }`, `{}`, empty string, malformed JSON, non-object JSON.
- **Integration tests** (driving the `walkthrough_capture` intercept via the existing run-cycle test fakes — a fake hook script that writes media + a chosen sidecar):
  - Happy path: required + UI + clean sidecar (or none) → `step.end ok`, `cycle.end` not failed, no `walkthrough.degraded`.
  - Block path: required + UI + `{ degraded: true }` → fatal path (`step.end failed` → `cycle.end failed`), exactly one `walkthrough.degraded`, diagnostic text present.
  - Inert path: no hook → unchanged `walkthrough_hook_absent` skip, no `walkthrough.degraded`.
  - Exemption paths: `expects_code: false` and `expects_ui: false` with `degraded: true` → `step.end ok`, no gate.
  - Failure path: required + UI + unparseable sidecar → fail-closed block with parse-failure reason.
  - Regression: `walkthrough_required` absent + `degraded: true` sidecar → `step.end ok` (default-off proves no behavior change).
- **No UI in this change** (engine-only); no Playwright/e2e suite added — this cycle is the gate that *enforces* UI demonstration in consumer repos, not a UI deliverable itself.

## Documentation Updates
- **CLAUDE.md**: add `engine.walkthrough_required` to the *Workflow defaults* engine-flag list (default `false`, defensively coerced `=== true`); note the per-issue `expects_ui` opt-out alongside `expects_code: false`; extend the `src/engine/walkthrough.ts` architecture note to describe the degradation gate and the `walkthrough.degraded` event.
- **docs/ENGINE.md** → *Walkthrough capture*: document the blocking-gate semantics (gate activation conditions, the `walkthrough/walkthrough-status.json` sidecar contract, fail-closed-on-unparseable, the fatal-path routing, and the `walkthrough.degraded` event shape), and cross-reference BRIEF.md → *Core thesis* and the verify-gating siblings.
- **README.md**: no user-facing CLI-surface change; the new knob is documented in CLAUDE.md/ENGINE.md (engine configuration), so no README update is required.

Documentation is part of "done" — code without updated docs is incomplete.

## Dependencies
- Existing `walkthrough_capture` intercept and helpers in `src/engine/run-cycle.ts` and `src/engine/walkthrough.ts` (`resolveWalkthroughHook`, `execWalkthroughHook`, `collectWalkthroughMedia`, `writeWalkthroughManifest`).
- `resolveExpectsCode` and `parseFrontmatter` (`src/engine/run-cycle.ts`) for the per-issue UI-scope determination.
- `loadConfig` / `CycleConfig` (`src/engine/workflow.ts`) to plumb the optional `engine.walkthrough_required` boolean.
- The existing fatal step-failure block (`step.end { status: "failed" }` → `cycle.end { status: "failed" }` early return) in the `walkthrough_capture` intercept — reused, not duplicated.
- No external services or env vars; the degradation signal is a hook-written file under the per-cycle artifact dir.
