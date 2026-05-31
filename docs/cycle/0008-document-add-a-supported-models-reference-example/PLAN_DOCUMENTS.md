# PLAN_DOCUMENTS — Cycle 0008: Supported-models reference + "Adding a new agent" model contract

## Source Issue
`docs-supported-models-reference` — "Add a supported-models reference/example file for cycle users"

## Files to Touch

### 1. docs/models.md
- **Section / location**: New file (does not exist today; sibling of `docs/workflows.md`).
- **Change**: create
- **What**: A user-facing reference with the following sections, in order:

  1. **Title + caveat banner** — `# Supported agent models`, followed by a blockquote caveat verbatim in intent:
     > These model IDs are a **snapshot, accurate as of 2026-05**. Model IDs drift fast. An enumerated list is a snapshot, not a contract — **the discovery command is the durable source of truth.** Verify any ID against the agent's live CLI before relying on it.

  2. **`## Setting a model`** — show the `defaults: { agent, model }` block and a per-step override, cross-referencing `feat-workflow-defaults-agent-model`. Link to the canonical syntax in [`docs/workflows.md#top-level-defaults`](workflows.md#top-level-defaults) rather than re-documenting resolution rules. Include a short fenced YAML example mirroring `src/defaults/models.example.yml`, and one sentence: "Per-field resolution is `effective X = step.X ?? defaults.X`; bash steps ignore `model`/`thinking`."

  3. **`## Per-agent model reference`** — a table built from the issue's ground-truth block (rows: claudecode, codex, gemini, auggie, opencode, pi), columns: Agent | `--model` format | Known-good examples | Discover live list | `thinking`. Use the exact cell values from the issue table (lines 68–73). Below the table, a short prose note for each *open-ended* agent (opencode, pi): "**Open-ended — not enumerable.** Documented by format + discovery only; do not freeze a model list here."

  4. **`## thinking-flag support`** — one line per agent: claudecode/gemini/auggie silently ignore `thinking` (no `--thinking` flag); codex supports `--thinking`; opencode/pi flag mapping is **assumed/TODO** (see `src/engine/exec-opencode.ts`, `exec-pi.ts`) — do not present as authoritative.

  5. **`## Adding a new agent — model contract` (maintainer-facing)** — extends the CLAUDE.md agent-fleet note with the model dimension. State the rule plainly: "An enumerated list is a snapshot, not a contract; the discovery command is the durable source of truth. Open-ended agents (pi, opencode) are documented by *format + discovery only*, never by a frozen list." Then require whoever adds an agent to answer, in this file, all five rows:
     1. **Model-set shape** — Enumerable (claudecode/codex/gemini/auggie) vs Open-ended / provider-namespaced (opencode `anthropic/…`, pi `~/.pi/agent/models.json`). Do not enumerate open-ended sets.
     2. **`--model` forwarding** — how the agent's `exec-*.ts` maps `step.model` → argv (flag name, position); mark unverified flag names TODO (opencode/pi precedent).
     3. **`thinking` support** — whether a `--thinking` (or equivalent) flag exists; if not, state `thinking` is silently ignored (auggie precedent).
     4. **Default model** — what the agent uses when no `--model` is passed.
     5. **Discovery command** — `auggie models list` / `opencode models` / in-session `/model` / vendor docs URL.

     Cross-reference the three other touch-points a new agent already requires (REGISTRY in `exec.ts`, `Step.agent` union in `workflow.ts`, the `exec-*.ts` module) per the CLAUDE.md note.

  6. **`## Sources`** — carry the issue's source list (Claude Code CLI ref, OpenAI Codex models, Gemini CLI docs, OpenCode models, Augment CLI ref, pi).
- **Reason**: Satisfies the primary deliverable and the maintainer "model contract" deliverable in a single user/maintainer reference, meeting acceptance criteria 1, 3, 4, 5, 6.

### 2. src/defaults/models.example.yml
- **Section / location**: New file under `src/defaults/` (alongside `workflows.yml`).
- **Change**: create
- **What**: A copy-pasteable, illustrative (not engine-loaded) example:
  ```yaml
  # models.example.yml — illustrative defaults + per-step model overrides.
  # NOT loaded by the engine. Copy the blocks you want into .cycle/workflows.yml.
  # Model IDs are a snapshot (accurate as of 2026-05); verify against each CLI's
  # live discovery command (see docs/models.md) before relying on them.

  # Run-wide defaults: every step inherits these unless it overrides them.
  defaults:
    agent: claudecode      # default agent for all steps
    model: opus            # claudecode alias; see docs/models.md for the full list
    # thinking: ...        # claudecode ignores --thinking; omit it here

  workflows:
    feature:
      steps:
        - { name: spec,   prompt: prompts/spec.md }                   # inherits claudecode + opus
        - { name: build,  prompt: prompts/build.md, model: sonnet }   # per-step model override
        - { name: review, prompt: prompts/review.md, agent: codex, model: gpt-5.5, thinking: high }  # override agent+model+thinking
        - { name: verify, agent: bash, run: scripts/verify.sh }       # bash ignores model/thinking
  ```
- **Reason**: Satisfies acceptance criterion 2 (copy-pasteable `defaults:` + per-step override) and the issue's "second deliverable" example artifact. `scripts/sync-defaults.mjs` discovers `src/defaults/**` **recursively** (`readdir(..., {recursive: true})`), so this file auto-syncs to `.cycle/models.example.yml` with no script change — the authoring/verify step must run `npm run sync-defaults` so `.cycle/` lands the copy (acceptance criterion 7).

### 3. CLAUDE.md
- **Section / location (a)**: `## Architecture` section, the paragraph beginning "Registered step agents (via resolveAgent): `claudecode` (first-class; ...". Anchor: end of the `defaults` block paragraph that begins "**Top-level `defaults`** block.".
  - **Change**: insert
  - **What**: One sentence at the end of that paragraph: "User-facing per-agent `--model` formats, known-good IDs, and live-discovery commands live in [`docs/models.md`](docs/models.md)."
- **Section / location (b)**: `## Structural-invariants policy`, the blockquote `> **Note:** Agent fleet consistency (REGISTRY in `exec.ts`, ... must be updated manually when adding a new agent.`
  - **Change**: replace (extend the existing sentence)
  - **What**: Append to that Note: " When adding an agent, also document its model contract (model-set shape, `--model` forwarding, `thinking` support, default model, discovery command) per [`docs/models.md`](docs/models.md) → *Adding a new agent — model contract*."
- **Reason**: Satisfies acceptance criterion that the reference is **linked from `CLAUDE.md`**, and that the maintainer section **extends the existing agent-fleet note** (criterion 5).

### 4. README.md
- **Section / location**: `## Design docs` list (lines ~178–186), after the `docs/ENGINE.md` bullet.
- **Change**: insert
- **What**: One list item: `- [`docs/models.md`](docs/models.md) — supported agent models per CLI, the `defaults:`/per-step `model` syntax, and the live-discovery commands.`
- **Reason**: Issue Task requests the reference be linked from `README`/`BRIEF.md`; the README "Design docs" list is the canonical link surface. (BRIEF.md left out to keep this cycle to the minimal 4-file slice — see Out of Scope.)

## Cross-References to Verify
- **docs/workflows.md** — `## Top-level `defaults`` section (line 48) and the example at lines 25/53. Confirm `docs/models.md`'s "Setting a model" example and the anchor link `workflows.md#top-level-defaults` resolve and do not contradict the canonical resolution rule (`effective X = step.X ?? defaults.X`).
- **docs/ENGINE.md** — line 11 agent-dispatch paragraph (per-agent `--model`/`--thinking` mapping). Confirm `docs/models.md`'s thinking-flag and forwarding claims match: codex/opencode/pi accept `model`+`thinking`; claudecode/gemini/auggie ignore `thinking`; opencode/pi flags are assumed/TODO.
- **CLAUDE.md** — `## Architecture` "Registered step agents" paragraph. Confirm the per-agent claims in `docs/models.md` (claudecode `--model` before `-p`; gemini via stdin; auggie short names + `CYCLE_AUGGIE_BIN`; opencode/pi assumed flags) stay consistent after edits.
- **docs/sync-defaults.md** — confirm no enumerated file manifest exists that would need the new `models.example.yml` added (sync is directory-recursive, so none expected).

## Out of Scope
- **BRIEF.md link** — not added this cycle (README is the chosen link surface; acceptance only requires CLAUDE.md). A reflection follow-up may add a BRIEF.md "Design docs" pointer if desired.
- **Verifying opencode/pi `--model`/`--thinking` flag names against `opencode --help` / `pi --help`** — these remain marked assumed/TODO in the doc; resolving the TODO requires running those CLIs and editing `src/engine/exec-opencode.ts` / `exec-pi.ts` (code change), which belongs to the `feature` workflow, not this doc cycle.
- **A dedicated `docs/adding-an-agent.md`** — the maintainer contract is folded into `docs/models.md` to stay within the minimal file slice; promoting it to a standalone doc is deferred.
- **Updating `.cycle/models.example.yml` by hand** — it is produced by `npm run sync-defaults`, not hand-edited.

## Risks
- **Test fixtures**: `src/defaults/models.example.yml` is a new file under `src/defaults/`. `sync-defaults` discovers it recursively and writes `.cycle/models.example.yml` + a `.sync-state.json` entry; verify no test asserts an exact/closed list of synced files or a fixed `src/defaults/` file count that this new file would break. Search `tests/` for `models.example`, `sync-defaults`, and hardcoded `src/defaults` manifests before authoring.
- **YAML validity**: the example file must be parseable YAML even though the engine never loads it; an authoring typo could trip any test that lints every `*.yml` under the repo. Confirm no such glob test exists.
- **Anchor drift**: the `workflows.md#top-level-defaults` fragment depends on the `## Top-level `defaults`` heading text; if that heading is reworded the link breaks (low risk this cycle — workflows.md is not being edited).
- **In-flight conflict**: this cycle's dependencies (`feat-workflow-defaults-agent-model`, `feat-agent-model-forwarding`) are already merged (commits `bbc1b9f`, `62a8af5`), so the documented `defaults`/`--model` behavior is live — no conflict with unlanded code.
- **Agent-prompt structure**: only Markdown docs and one illustrative YAML are touched; no `*/prompts/*.md` template is modified, so no agent prompt's expected structure changes.

## Misclassification Check
Not misclassified. All four edits are documentation (`docs/models.md`, `CLAUDE.md`, `README.md`) and one illustrative, engine-unloaded YAML example under `src/defaults/` that is propagated by the existing `sync-defaults` script with **no logic, type, test, or script change**. The one code-touching item the issue mentions (verifying/correcting opencode/pi flag names in `exec-*.ts`) is explicitly deferred to Out of Scope and left marked TODO. This is correctly routed to the `document` workflow.
