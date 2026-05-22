# RFC-003: In-Cycle Remediation, Priority Routing, and Scope-Guard Demotion

**Status:** Proposed (2026-05-20).
**Supersedes:** the `priority` semantics in [RFC-001](RFC-001-issue-lifecycle.md) §3 (the integer 1–10 "hint, not honored automatically"). Replaces reflection's `priority_hint`.
**Scope:** How the `feature` workflow remediates its own sharp edges *within the cycle that produced them*; how reflection routes work into three buckets; how a single deterministic `priority` enum drives queue ordering and a human-in-the-loop `discuss` lane; how the commit scope guard stops being a hard blocker; and the single-engine concurrency lock.

---

## 1. Motivation

Two recurring failure patterns drove this RFC.

**1a. Reflection over-emission → exponential backlog.** The `feature` reflection step surfaces every sharp edge as a `raw/` issue. With 3+ edges per cycle and each cycle's reflection front-loaded as "self-heal" work, the `todo/` queue grew faster than it drained. We want emergent work to *remain possible* — but triaged, prioritized, and bounded, with trivial in-scope fixes collapsed into the cycle that created them rather than spawned as future cycles.

**1b. Inconsistent commits / "the engine dies and we don't know why."** Two mechanical causes:
- The **commit scope guard** blocks any commit where a `src/`/`scripts/` file is dirty but absent from BUILD.md's agent-authored `## Touched Files` list. Two violations trip `engine.paused {reason: "commit-scope-guard-loop"}`. This is the halt seen in cycles 0200–0201.
- **Perceived parallelism / trunk-vs-worktree drift.** The engine is already strictly serial; apparent parallel work comes from a second `cycle run` overlapping (no runtime lock). Worktree behavior is *not* the harness — the shipped default is `commit.mode: worktree-pr` and **nothing loads `.cycle/.env`**, so the documented `CYCLE_TRUNK_BASED=1` override silently never fires.

---

## 2. The `feature` workflow tail

New step sequence (changed portion in **bold**):

```
spec → research → plan → build → review → fix → verify
  → reflection → final_fix → final_verify → documentation
                  ───────    ──────────────
```

- **`final_fix`** (agent step, `skip_unless: FINAL_FIXES.md`) — reads `FINAL_FIXES.md`, applies only mechanical fixes confined to the cycle footprint, and self-runs the full suite before finishing.
- **`final_verify`** (bash step, `scripts/verify.sh`) — the hard deterministic gate after `final_fix`. **Must have a distinct name** (not a second step literally named `verify`): `log-tail.ts` dedups `completedSteps` by name, so two `verify` steps collapse and the second is skipped on resume.

Reflection stays *after* the existing `verify`, so it always reflects on a green tree. Both `build`/`fix`/`final_fix` prompts gain a soft self-check ("do not finish until the full suite passes"); the bash gates remain the authoritative wall.

### 2.1 Why a second remediation pass, not a re-loop

`reflection` runs after `fix`, so appending to MUST-FIX.md cannot retroactively feed the already-run fix step. A dedicated `final_fix` pass after reflection is cleaner than reordering reflection before fix (which would blind it to the fixed code) or looping fix→reflect→fix (engine complexity + infinite-loop risk).

---

## 3. Footprint tracking & scope-guard demotion

### 3.1 `touched.json` — engine-owned, git-derived

The cycle footprint moves out of BUILD.md prose into a structured `touched.json` in the cycle artifact directory, **derived by the engine from git**, not authored by the agent:

- The engine snapshots `git status --porcelain` before each mutating step (`build`, `fix`, `final_fix`) and records the delta after.
- `touched.json` is the union of those deltas — the authoritative footprint. It cannot drift or be misreported the way the agent-authored `## Touched Files` list does.

`fix` and `final_fix` are constrained by prompt to **only modify files already in the footprint** (+ tests/docs). Anything requiring a file outside the footprint is, by rule, deferred to a new issue (see §4).

### 3.2 The scope guard becomes a non-blocking signal

The commit scope guard no longer blocks. At commit time:

- The commit **stages everything** dirty (already current `stageFiles` behavior), minus the denylist. Partial/footprint-only commits are forbidden — they could ship a tree that fails tests (a fix may legitimately depend on a file outside the declared footprint).
- Any `src/`/`scripts/` file dirty but outside the footprint is emitted as a **non-blocking `commit.scope_warning`** event with the file list.
- That list is handed to **reflection**, which files cleanup issues (§4) for genuine scope creep.

Rationale: a green, test-backed commit that touched one extra file is not worth halting the engine. `final_verify` (tests must pass) + the footprint instruction + reflection surfacing the escape are the discipline; the scope guard was never the thing protecting against `final_fix`.

---

## 4. Reflection: three outputs, three buckets

Reflection writes three things:

1. **`REFLECTION.md`** — narrative, including its routing decisions for this cycle.
2. **`FINAL_FIXES.md`** — the mechanical, in-footprint fix list for `final_fix`.
3. **`raw/` issues** — deferred work, each carrying a `priority` (§5).

Every sharp edge is sorted by this rule:

| Bucket | Bright line | Destination |
|---|---|---|
| **fix-now** | Confined to the cycle footprint **AND** mechanical (no design decision) | `FINAL_FIXES.md` |
| **defer** | Requires files outside the footprint, or is large enough to deserve its own spec/review (includes `commit.scope_warning` escapes) | `raw/` issue + `priority: low\|medium\|high\|critical` |
| **discuss** | Implies the approach may be wrong, or a genuine design fork reflection can't resolve alone | `raw/` issue + `priority: discuss` |

The footprint test is objective and engine-verifiable, which removes the "small today, big tomorrow" inconsistency. The only judgment left to reflection is narrow and appropriate: *mechanical vs needs-design*.

### 4.1 Emission cap

Reflection emits **at most the top 1–2 deferred issues per cycle**, choosing the highest-value, and dedups against `raw/`, `todo/`, `discuss/`, and recently-surfaced ids. This is safe **because reflection recurs every cycle**: a sharp edge that genuinely matters resurfaces the next time that area is touched and gets filed then; one-off trivia that never resurfaces was not worth a queue row. `FINAL_FIXES.md` is uncapped (already bounded by "footprint + mechanical").

---

## 5. The `priority` enum

A single enum replaces both RFC-001's integer `priority` and reflection's `priority_hint`:

```
priority: low | medium | high | critical | discuss
```

- **Default `medium`.** If a `raw/` drop omits `priority`, **triage sets it to `medium` and moves on**. `materializeFreeformIssue` (`cycle drop`) emits `medium` instead of the old `3`.
- **`low|medium|high|critical` are ordering tiers; `discuss` is a routing flag** (§6), not a tier.
- Anyone may set `priority` at drop time, including `discuss`. Reflection is just the common producer of `discuss`.

### 5.1 Engine-side deterministic ordering

Queue ordering stops being the triage agent's job. The engine sorts pending rows:

1. By tier: `critical` → `high` → `medium` → `low`.
2. **Stable within a tier** (preserves triage insertion order).
3. **Never places a dependent ahead of its `depends_on`** (topological clamp).

`QueueRow` gains a `priority` field. The triage agent keeps doing enrichment, decomposition, and dependency inference — but no longer decides global order. This also retires the blanket "front-of-queue all reflection work" behavior: self-healing becomes *prioritized*, not *always-first*.

---

## 6. The `discuss/` lane

A new lifecycle folder, parallel to `blocked/`:

```
docs/cycle/issues/discuss/   # Parked for human judgment. Not in tbd.jsonl. Not auto-processed.
```

- **Engine-routed before the agent.** During the triage phase, the engine reads each raw's `priority` *before* invoking the triage agent. `priority: discuss` → move the raw to `discuss/` as-is, emit `issue.parked_for_discussion`, and skip the agent (no enrichment, no `tbd.jsonl` row).
- **Release mirrors `blocked/`.** A human reads `discuss/<id>.md`, sets a real priority, and moves it back to `raw/`; the next run triages it normally.

`discuss/` deliberately is *not* `todo/`: a `todo/` file with no `tbd.jsonl` row is an implicit state the engine actively walks (drain-by-filename, dependency scans) and can orphan. A dedicated folder keeps parked items out of every structure the engine traverses.

---

## 7. Concurrency: single-engine lock

Only one `cycle run` supervisor may run at a time. A PID lockfile (with liveness check — stale lock from a dead PID is reclaimed) guards the supervisor entry. This is the real fix for "spinning out of control" / apparent parallelism and the `markInProgress` race (two supervisors popping the same pending row, the second throwing an unhandled `already in_progress`).

Independently: load `.cycle/.env` at engine bootstrap (or flip the shipped default to `trunk` and correct CLAUDE.md) so trunk-based operation is actually enforced as documented.

---

## 8. Rollout order

Filed as `raw/` issues, build order encoded by id prefix (`redesign-NN-…`):

1. `redesign-01-single-engine-lock` — **critical**. Lands first so all subsequent cycles are race-safe.
2. `redesign-02-load-cycle-env` — high. Trunk enforcement gap.
3. `redesign-03-priority-enum-and-ordering` — high. Foundational for §5/§6.
4. `redesign-04-footprint-json-and-scope-guard-demote` — high. Foundational for §2/§3.
5. `redesign-05-discuss-folder-lifecycle` — medium. Needs 03.
6. `redesign-06-final-fix-step` — high. Needs 04.
7. `redesign-07-reflection-three-bucket-rewrite` — high. Capstone; needs 03, 04, 05, 06.
