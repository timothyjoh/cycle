# RFC-001: Issue Lifecycle, Triage, and Queue Management

**Status:** Accepted (2026-05-13). Supersedes the corresponding sections of BRIEF.md and docs/ARCHITECTURE.md.
**Scope:** How issues enter the engine, how they get decomposed and enriched, how the queue is ordered, how failure cascades through `depends_on`, and how the engine resumes after halt.

---

## 1. Motivation

The MVP (cycles 0001–0009) forced `--workflow feature` on every input, never advanced files past `queued/` (superseded — see § 12 BB-1), never decomposed issues, and halted the entire engine on any cycle failure. That was fine for proving the loop. Real use needs:

- A dedicated **inbox** (`raw/`) that an external agent / human / tracker fetch can drop into without engine ceremony.
- A **triage** pass that enriches every raw issue with codebase context, decomposes large ones into vertical slices, and orders them.
- A live **drain-on-success** queue (`tbd.jsonl`) — not the current append-only audit log.
- Deterministic **cascade-and-continue** on failure — block only items whose `depends_on` actually depends on the failed item; keep working on the rest.
- **Resume on restart** from `log.jsonl` — the engine knows what cycle was in-flight and picks up where it left off.

---

## 2. Folder layout

```
docs/cycle/issues/
├── raw/        # Inbox. Sparse drops from agents, CLI, tracker fetch, reflection.
│               # Strives to be empty whenever the engine is running.
├── todo/       # Triaged, enriched, vertical-slice work items. Each = one cycle's input.
├── done/       # Successful cycles' files land here. Decomposed parents land here too
│               # with `_raw` suffix.
├── failed/     # Cycles that exhausted 3 attempts. Artifacts preserved alongside.
├── blocked/    # Items whose `depends_on` graph reached a failed item.
│               # Human moves back to raw/ (or todo/) to retry.
└── TEMPLATE.md
```

The previous `tbd/`, `queued/`, and `triaged/` folders are removed during bootstrap. Existing files migrate: `tbd/` → `raw/`, `queued/` → `todo/`, `triaged/` is dropped (was empty).

---

## 3. Files and their frontmatter

### Raw drop (`raw/<id>.md`)

Thin. May be one line; may be a copy of a Jira description. The body is whatever the source had.

```yaml
---
id: Jira-007
source: jira          # jira | linear | github | text | reflection
title: "Safari login broken"
added_at: 2026-05-13T01:30:00Z
triage_attempts: 0    # engine-managed
priority: 3           # optional hint to triage; not honored automatically
---
Description text from the upstream source.
```

Default and range: `priority` is an integer in the inclusive range 1–10; `cycle drop` (via `materializeFreeformIssue`) emits `3` when `--priority` is not given.

### Triaged todo (`todo/<parent>-<slug>.md`)

Triage writes these. Always enriched (even when no decomposition needed). Always carries the workflow name.

```yaml
---
id: Jira-007-fix-login-cookie
parent: Jira-007
workflow: feature          # selected by triage from workflows.yml
title: "Fix login cookie expiry on Safari 17"
depends_on: []             # ids of other todos that must complete first
triaged_at: 2026-05-13T02:30:00Z
source: jira               # inherited from parent
---

## Context
[Enriched: triage explored the codebase and wrote what's relevant.]

## Acceptance
- [criteria]
```

### Decomposed parent (`done/<id>_raw.md`)

Once triage emits children, the original raw file moves to `done/` with `_raw` suffix. It's not active work; it's the historical record of the original ask.

### Failed (`failed/<id>.md`)

Augmented with failure metadata:

```yaml
---
# … original frontmatter …
failed_at: 2026-05-13T03:45:00Z
failed_step: pr
failed_attempts: 3
last_cycle_id: "0042"
---
```

Cycle artifacts (SPEC/PLAN/RESEARCH/BUILD/REVIEW/MUST-FIX/FIX) for the failed cycle are preserved at `docs/cycle/<cycle_id>-<workflow>-<slug>/` for the human to inspect.

### Blocked (`blocked/<id>.md`)

```yaml
---
# … original frontmatter …
blocked_at: 2026-05-13T03:45:01Z
blocked_by: [Jira-007-fix-login-cookie]   # transitive chain captured
---
```

---

## 4. Configuration: `workflows.yml`

Single file. Engine config + triage config + workflows array.

```yaml
engine:
  max_consecutive_failures: 2    # halts engine after 2 cycles in a row exhausting attempts
  base_branch: master

triage:
  agent: claudecode              # configurable: claudecode | codex | gemini | ...
  prompt: prompts/triage.md
  max_turns: 10

workflows:
  - name: feature
    description: Full SDLC pass for a new feature
    max_cycle_attempts: 3
    steps:
      - { name: spec,       agent: claudecode, prompt: prompts/spec.md }
      - { name: research,   agent: claudecode, prompt: prompts/research.md }
      - { name: plan,       agent: claudecode, prompt: prompts/plan.md }
      - { name: build,      agent: claudecode, prompt: prompts/build.md }
      - { name: review,     agent: claudecode, prompt: prompts/review.md }
      - { name: fix,        agent: claudecode, prompt: prompts/fix.md, skip_unless: MUST-FIX.md }
      - { name: verify,     agent: bash,       command: scripts/verify.sh }
      - { name: commit,     agent: bash,       command: scripts/commit.sh }
      - { name: pr,         agent: bash,       command: scripts/pr.sh }
      - { name: reflection, agent: claudecode, prompt: prompts/reflection.md }
```

**Where things live:**
| Setting | File | Why |
|---|---|---|
| Workflow steps and per-step agent | `workflows.yml` (each workflow) | Workflow recipe |
| `max_cycle_attempts` (per cycle) | `workflows.yml` (per workflow) | Workflow-specific tolerance |
| Reflection step + prompt | `workflows.yml` (per workflow) | Reflection is a workflow step |
| Triage agent / prompt / turn cap | `workflows.yml` (top section) | Engine-internal subroutine |
| `max_consecutive_failures` | `workflows.yml` (engine section) | Engine-wide policy |
| Default base branch | `workflows.yml` (engine section) | Engine-wide policy |

Prompts stay **flat** under `prompts/`. When a workflow needs a divergent variant, use prefix/suffix (`prompts/spec-bug.md`), not subdirectories.

---

## 5. Triage subroutine

Engine-internal, not a workflow. Configurable agent. Runs at two trigger points:

1. **engine.start**, if `log.jsonl` shows no in-flight cycle.
2. **Between cycles**, before each pop, if `raw/` is non-empty.

(If an in-flight cycle is detected at startup, the engine resumes that cycle first; triage runs after it completes.)

### Inputs

- All files in `raw/`
- Current `tbd.jsonl` (pending and in_progress lines)
- All files in `todo/` (for context — what's already queued and in what order)
- Codebase access via full claudecode tool set (Read, Grep, Glob, Bash, etc.)

### Output (stdout, JSON)

```json
{
  "ordering": [
    "Jira-007-fix-login-cookie",
    "Jira-007-add-2fa-flow",
    "txt-20260513-…-investigate-flakey-test-1"
  ],
  "children": [
    {
      "raw_id": "Jira-007",
      "slug": "fix-login-cookie",
      "id": "Jira-007-fix-login-cookie",
      "title": "Fix login cookie expiry on Safari 17",
      "workflow": "feature",
      "depends_on": [],
      "body": "## Context\n…\n\n## Acceptance\n- …\n"
    },
    {
      "raw_id": "Jira-007",
      "slug": "add-2fa-flow",
      "id": "Jira-007-add-2fa-flow",
      "title": "Add 2FA fallback for sessions that fail cookie check",
      "workflow": "feature",
      "depends_on": ["Jira-007-fix-login-cookie"],
      "body": "…"
    }
  ],
  "decomposed_parents": ["Jira-007"]
}
```

### Engine actions on triage success

For each entry in `children[]`:
- Write `todo/<id>.md` with frontmatter (id, parent, workflow, title, depends_on, triaged_at, source-inherited-from-parent) and body
- Append a line to `tbd.jsonl` in `ordering[]` position

For each id in `decomposed_parents[]`:
- Move `raw/<id>.md` → `done/<id>_raw.md`

For each raw NOT in `decomposed_parents` but covered by `children[]` (the "already-vertical-slice, just enriched" case):
- Same move: `raw/<id>.md` → `done/<id>_raw.md` (one child carries the work)

If existing `todo/` items are reordered, **rewrite the entire `tbd.jsonl`** in the new `ordering[]`. In-progress lines are fenced — triage cannot move them.

### Triage failure handling

Per-raw retry up to 3 attempts (BRIEF's existing `triage_attempts` frontmatter). On each retry, prompt receives the validator's error message as feedback (one-shot self-correction). Validator resolves every `depends_on` id against `siblings ∪ tbd.jsonl rows ∪ todo/<id>.md files` and rejects self-loops; resolution failures ride the same retry path. After 3 failures:
- Move `raw/<id>.md` → `failed/<id>.md` with `triage_attempts: 3`
- Continue triaging the other raw files

If ALL raws fail triage in one pass (suggests broken prompt or API outage): emit `engine.paused` and exit. Don't start any cycle from a corrupted triage. Raws remain in `raw/`; no rename occurs on the all-fail path. `triage_attempts` is bumped per attempt via `bumpAttempts` and reflects the full 3 on `engine.paused`. See [Recovering from engine.paused](../README.md#recovering-from-enginepaused) for the operator recovery flow.

---

## 6. Queue: `tbd.jsonl`

Live, priority-ordered queue. Drains on success/failure. **Not the audit log** — `log.jsonl` is the audit log.

### Row schema

```json
{
  "id": "Jira-007-fix-login-cookie",
  "parent": "Jira-007",
  "title": "Fix login cookie expiry on Safari 17",
  "status": "pending",
  "attempt": 0,
  "depends_on": [],
  "triaged_at": "2026-05-13T02:30:00Z"
}
```

When status flips `pending → in_progress`, the engine writes `cycle_id: "0042"` into the row.

### State transitions

| Trigger | Action |
|---|---|
| Triage emits new todo | Append row, status `pending` |
| Engine pops next row | status `pending → in_progress`, write `cycle_id` |
| Cycle ends `ok` | **Remove** row, move `todo/<id>.md → done/<id>.md` |
| Cycle ends `failed` AND attempt < max | Increment `attempt`, status back to `pending`, no file move |
| Cycle ends `failed` AND attempt >= max | **Remove** row, move `todo/<id>.md → failed/<id>.md`, add failure frontmatter, run `propagateBlocked()` |

### Pop ordering

FIFO from the top of `tbd.jsonl`, with one constraint:
- If the top row has unsatisfied `depends_on` (any id in the array still appears as pending or in_progress in `tbd.jsonl`), skip it and pop the next eligible row. Resume normal order when its deps clear.

Deps in `failed/` or `blocked/` don't count as "unsatisfied" — they count as resolved-by-cascade. But by then `propagateBlocked()` will have moved the dependent rows out.

---

## 7. `propagateBlocked` — deterministic, no LLM

Triggered when a cycle's attempt counter hits the per-workflow `max_cycle_attempts` (default 3).

```
propagateBlocked(failedId):
  for each row in tbd.jsonl (pending or in_progress):
    if failedId in row.depends_on:
      move todo/<row.id>.md → blocked/<row.id>.md
      write blocked_by: [failedId] into the file's frontmatter
      remove row from tbd.jsonl
      emit issue.blocked event
      recursively call propagateBlocked(row.id)
```

The `blocked_by` array captures the transitive chain so a human reading the file knows the full reason. Artifacts of the failed cycle (`docs/cycle/<id>-<workflow>-<slug>/`) are preserved as the failure record.

No LLM needed — the dependency graph is explicit. If the user wants a smarter "could this still work despite the failure?" judgment, that's a future enhancement that could replace `propagateBlocked` with an agent, but for now the deterministic walk is the right shape.

---

## 8. Engine-wide halt policy

A counter tracks **consecutive** cycle failures. Each time a cycle moves to `failed/`, the counter increments. Each time a cycle moves to `done/`, the counter resets to 0.

If the counter reaches `engine.max_consecutive_failures` (default 2), the engine:
- Emits `engine.halted` with the failed cycle ids
- Exits non-zero
- Preserves the remaining `tbd.jsonl` for the next invocation

A success between failures resets the counter — partial failures don't compound a halt.

---

## 9. Reflection — workflow step

Reflection is the **last step** in each workflow that wants it (declared in `workflows.yml`). It's a normal claudecode step with the standard tool set.

### Inputs (via prompt)
- Cycle's `cycle_id`, `workflow`, `title`, `issue_id`
- All cycle artifacts (SPEC.md, RESEARCH.md, PLAN.md, BUILD.md, REVIEW.md, MUST-FIX.md, FIX.md)
- The cycle's git diff vs base
- Recent `log.jsonl` events

### Output (JSON to stdout)

```json
{
  "sharp_edges": [
    {
      "title": "pr.sh fallback merge doesn't delete remote branch",
      "body": "## Observation\nDuring this cycle the fallback merge path …\n\n## Suggested approach\n…\n",
      "priority_hint": 7
    }
  ]
}
```

Engine writes each `sharp_edges[]` entry as a new file in `raw/` with `source: reflection` frontmatter and the body. These get triaged on the next pass like any other raw input. Triage decides whether they're worth front-of-queueing.

If no sharp edges: empty array, no files written. Reflection step is short-circuit cheap.

---

## 10. Engine lifecycle

```
engine.start
  │
  ├── Read log.jsonl tail
  │     │
  │     ├── In-flight cycle detected? ──yes──> Resume from last incomplete step
  │     │                                              │
  │     │                                              ▼
  │     │                                       cycle.end (ok|failed)
  │     │
  │     └── No in-flight cycle ──┐
  │                              │
  │                              ▼
  ├── Triage raw/ (if any) ──> writes todo/ + tbd.jsonl, may reorder pending
  │
  ├── Loop while tbd.jsonl has eligible rows AND consecutive_failures < max:
  │     │
  │     ├── Pop next eligible row (respecting depends_on)
  │     ├── status pending → in_progress, write cycle_id
  │     ├── Run cycle with workflow from file frontmatter
  │     │
  │     ├── Cycle end ok ───> remove row, file → done/, reset consecutive_failures
  │     │
  │     ├── Cycle end failed, attempt < max ───> increment attempt, status → pending
  │     │
  │     ├── Cycle end failed, attempt >= max ───> remove row, file → failed/,
  │     │                                          propagateBlocked, increment
  │     │                                          consecutive_failures
  │     │
  │     └── Check raw/ for new drops; if any, run triage before next pop
  │
  └── engine.stop (status: ok | halted | paused)
```

---

## 11. Resume semantics

On `engine.start`, the engine reads `log.jsonl` from the tail:
- Last event is `engine.stop` → fresh start
- Last event is `cycle.start` or `step.start/step.end` without matching `cycle.end` → resume that cycle

Resume identifies the last incomplete step (last `step.start` without matching `step.end`) and re-runs from there. Earlier artifacts (SPEC/RESEARCH/PLAN/etc.) remain on disk. The branch is preserved.

Each step's prompt and script must be **restart-tolerant**:
- Prompt steps: tolerate "artifact file already exists" — overwrite or extend
- `build.sh`-style steps: tolerate partial working tree
- `commit.sh`: idempotent by design (`git diff --cached --quiet` short-circuit)
- `pr.sh`: detect existing PR by branch name, skip create, resume polling/fallback merge

Edge case: if resume detects a cycle whose attempt counter has already incremented past `max_cycle_attempts`, treat it as failed at the moment of restart — move file to `failed/`, run `propagateBlocked`, continue.

---

## 12. Bootstrap and migration plan

> Folder names `tbd/`, `queued/`, `triaged/` below describe pre-RFC-001 lifecycle state. All renames completed by cycle 0014; current model is `raw/ → todo/ → done/`.

Cycles needed to land this design (in order). Bootstrap items run on the **current** engine via the existing `tbd/ → queued/` (superseded — see § 12 BB-1) path until each one updates the engine to know about its new piece.

1. **BB-1: Rename `tbd/ → raw/`, `queued/ → todo/`.** Update `scan.ts` to scan `raw/`, move to `todo/`, dedup by id (also fixes the existing bug). Update `closes.sh` and other path references. Update tests. Drop the empty `triaged/` folder.

2. **BB-2: Consolidate `workflows.yml`.** Inline `engine:` and `triage:` config sections. Merge `workflows/feature.yaml` content into the `workflows[]` array. Update `src/engine/workflow.ts` loader.

3. **BB-3: New `tbd.jsonl` row schema + drain semantics.** Status field, attempt counter, depends_on, triaged_at, cycle_id-when-in-progress. Drain rows on cycle.end ok/failed (per § 6). Engine reads workflow from file frontmatter at pop time.

4. **BB-4: Triage subroutine.** New `src/engine/triage.ts`, new `src/defaults/prompts/triage.md`. Wire triage triggers at engine.start (when no in-flight) and between cycles when `raw/` is non-empty. Per-raw retry. JSON parse + schema validation.

5. **BB-5: Resume logic.** Read `log.jsonl` at engine.start; detect in-flight cycle; re-run from last incomplete step. Make each step's prompt/script restart-tolerant.

6. **BB-6: `propagateBlocked` + engine halt policy.** Dependency graph walk on cycle exhaustion. `max_consecutive_failures` counter. `engine.halted` event.

7. **BB-7: Reflection step.** Add to `workflows.yml` feature workflow. New `src/defaults/prompts/reflection.md`. Engine reads `sharp_edges[]` from stdout, writes new `raw/` files. **Status: landed (cycle 0018).** `src/engine/reflection.ts:ingestReflection` materializes each `sharp_edges[]` entry as `raw/refl-<cycleId>-<slug>.md` with `source: reflection` frontmatter. Reflection-step failures (`exec_failed`, `parse_error`, `invalid_entry`) emit `reflection.skipped` and do NOT flip `cycle.end` to failed. Idempotent on resume.

Once BB-1 through BB-4 land, the engine's `raw/` inbox is active and triage will process all subsequent issues. BB-5 through BB-7 can themselves be processed by the new pipeline (they'll get enriched + ordered by triage).

---

## 13. Open questions / future work

These don't block bootstrap but are tracked as future issues:

- **Multi-agent abstraction.** `agent: codex` / `agent: gemini` require new `exec-*.ts` modules. Config schema accepts the strings today; impl is staged.
- **Triage's `depends_on` inference quality.** First pass: triage only marks explicit deps. Future: heuristics from codebase analysis. **Status: landed (cycle 0021).** Prompt now instructs the agent to infer chained `depends_on` between sibling children on decomposition; validator resolves every `depends_on` id against `siblings ∪ tbd.jsonl rows ∪ todo/<id>.md files` and rejects self-loops, with failures feeding the per-raw retry feedback loop.
- **CLI surface alignment.** `cycle drop "<text>"` writes to `raw/` (today: `tbd/` — superseded — see § 12 BB-1). Add `cycle status` to show queue + in-flight + blocked counts.
- **Re-triage of a `re_triage: true` raw item.** Children that turn out to need further decomposition get punted back to `raw/`.
- **`engine.paused` recovery.** When all triage fails, engine.paused — what's the recovery flow?
- **Step-level restart tolerance audit.** Walk each existing step (spec/research/plan/build/review/fix/verify/commit/pr) and confirm/improve restart behavior.

---

## 14. Backward compatibility

- The `tbd/` and `queued/` folders are deleted after migration; any files still in them at bootstrap time get moved to `raw/` and `todo/` respectively.
- The `triaged/` folder is deleted (was empty).
- The existing `tbd.jsonl` is **archived** to `.cycle/tbd.jsonl.bootstrap-archive` and a fresh file is started under the new schema. Old append-only history is preserved for audit.
- Skill template (`.claude/skills/cycle.md`) gets updated text describing the new flow.
