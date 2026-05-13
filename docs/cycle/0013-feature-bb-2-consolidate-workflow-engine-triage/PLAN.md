Got all context. Writing plan to stdout.

```markdown
# Implementation Plan: Cycle 0013

## Overview
Collapse split workflow/engine/triage config into a single `src/defaults/workflows.yml`, teach `src/engine/workflow.ts` to load the new shape (picking a named workflow from a `workflows[]` array), and expose parsed `engine`/`triage` config for future cycles (BB-3/4/6/7) to consume.

## Current State (from Research)
- `src/engine/workflow.ts` (25 lines) reads `.cycle/workflows/<name>.yaml`, exports `Step`/`Workflow` types, throws `malformed workflow: <path>` on shape failure. One in-repo consumer: `src/engine/run-cycle.ts:33`.
- `src/defaults/workflows/feature.yaml` — 31 lines, nine steps: `spec, research, plan, build, review, fix (skip_unless: MUST-FIX.md), verify, commit, pr`.
- `scripts/sync-defaults.mjs` — three-pair `rm -rf` + `cp -r` loop for `workflows`, `prompts`, `scripts`.
- `src/cli/init.ts:17` — `cp(defaults/workflows → .cycle/workflows, recursive)`.
- 13 test sites reference `workflows/feature.yaml`: 1 each in `tests/engine/workflow.test.ts`, `tests/defaults/feature-yaml.test.ts`, `tests/defaults/feature-loadable.test.ts`, `tests/cli/init.test.ts`, plus 9 in `tests/engine/run-cycle.test.ts` (lines 28, 71, 117, 166, 201, 229, 277, 332, 369).
- Init test also asserts negative absence of `tbd/queued/triaged` — unrelated, leave alone.
- `yaml` package already in `package.json`; no new deps.
- Build script `scripts/build.mjs` copies `src/defaults → dist/defaults` recursively — no edit needed (auto-picks up the new file shape).

## Desired End State
- `src/defaults/workflows.yml` exists with three top sections per RFC-001 §4 line 111-138 (no `reflection` step — that's BB-7).
- `src/defaults/workflows/` directory gone from disk.
- `src/engine/workflow.ts` rewritten: still exports `Step`/`Workflow`, `loadWorkflow(repoRoot, name)` reads `.cycle/workflows.yml` and array-picks. New types `EngineConfig`, `TriageConfig`, `CycleConfig`. New export `loadConfig(repoRoot): Promise<CycleConfig>` returning `{ engine, triage, workflows }`.
- `scripts/sync-defaults.mjs` copies the single file and `rm -rf`s the stale `.cycle/workflows/` dir.
- `src/cli/init.ts` copies the single `workflows.yml`.
- `.cycle/workflows.yml` committed (dogfood sync).
- All 89 tests pass; new tests added for array-pick, error paths, engine/triage exposure; coverage ≥ 95 / 75 / 90.
- CLAUDE.md architecture bullet mentions `workflows.yml` (one-line edit).

Verification: `npm test`, `npm run typecheck`, `npm run test:coverage`, plus `stat src/defaults/workflows` returns ENOENT and `cat .cycle/workflows.yml` shows the three-section file.

## What We're NOT Doing
- No BB-3: `tbd.jsonl` schema change, drain semantics, reading `workflow` from issue frontmatter at pop time. `runCycle` still receives `workflow` via `RunCycleOpts`.
- No BB-4: triage subroutine implementation. `triage:` is parsed and exposed but not invoked.
- No BB-6: `max_consecutive_failures` enforcement. Field parsed, no halt counter.
- No BB-7: reflection step in the feature workflow. Nine steps only.
- No `engine.base_branch` consumption — `runCycle` continues to source `CYCLE_BASE` from env.
- No ADR / no new top-level docs. Only the one-line CLAUDE.md edit.
- No ARCHITECTURE.md/BRIEF.md edits (deferred per SPEC line 61).
- No reorg of `prompts/` or `scripts/` subdirs in defaults.

## Implementation Approach
Single vertical slice that lands the new file + loader + sync + dogfood state atomically — the loader rewrite is the load-bearing change and migrating the test fixtures in the same commit keeps the suite green at every step. Two passes:

1. **Loader-first, fixture-driven.** Rewrite `workflow.ts` to read `.cycle/workflows.yml`, add `loadConfig`. Update or add tests directly against the new loader contract (fail-fast: SPEC's error cases become tests first). Migrate the 13 test sites to the new shape. Run suite — should be red on `feature-yaml.test.ts` only (no `workflows.yml` on disk yet).
2. **Defaults + sync + init + CLAUDE.md.** Create `src/defaults/workflows.yml`, delete the old dir, update `sync-defaults.mjs` and `init.ts`. Run `npm run sync-defaults` to materialize `.cycle/workflows.yml` (delete stale `.cycle/workflows/`). Suite green; coverage check; one-line CLAUDE.md edit.

Loader API choice: single `loadConfig(repoRoot): Promise<CycleConfig>` returning `{ engine, triage, workflows }` — one read per call, no caching (mirrors today's `loadWorkflow` which re-reads every call). `loadWorkflow(root, name)` stays as the existing entry point and is implemented in terms of `loadConfig`. `max_cycle_attempts` becomes a typed required field on `Workflow`. Error wording: plain `new Error(...)` with discriminating prefixes (`workflows.yml missing`, `workflows.yml malformed: <reason>`, `unknown workflow: <name>`).

---

## Task 1: Rewrite workflow loader and types

### Overview
Replace `src/engine/workflow.ts` with the new shape. `loadWorkflow` keeps its signature `(repoRoot, name) => Promise<Workflow>` so `run-cycle.ts:33` is untouched. Add `loadConfig` returning the full parsed file. Preserve `skip_unless` field on steps as data (`Step.skipUnless?: string` is unread by engine but must round-trip).

### Changes Required
**File**: `src/engine/workflow.ts` (full rewrite)

```ts
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import YAML from "yaml";

export type Step = {
  name: string;
  agent: "claudecode" | "bash";
  prompt?: string;
  command?: string;
  skip_unless?: string;
};

export type Workflow = {
  name: string;
  description?: string;
  max_cycle_attempts: number;
  steps: Step[];
};

export type EngineConfig = {
  max_consecutive_failures: number;
  base_branch: string;
};

export type TriageConfig = {
  agent: string;
  prompt: string;
  max_turns: number;
};

export type CycleConfig = {
  engine: EngineConfig;
  triage: TriageConfig;
  workflows: Workflow[];
};

export async function loadConfig(repoRoot: string): Promise<CycleConfig> {
  const path = join(repoRoot, ".cycle/workflows.yml");
  let body: string;
  try {
    body = await readFile(path, "utf8");
  } catch {
    throw new Error(`workflows.yml missing: ${path}`);
  }
  const parsed = YAML.parse(body);
  if (!parsed || typeof parsed !== "object") {
    throw new Error(`workflows.yml malformed: not an object (${path})`);
  }
  if (!parsed.engine || typeof parsed.engine !== "object") {
    throw new Error(`workflows.yml malformed: missing engine (${path})`);
  }
  if (!parsed.triage || typeof parsed.triage !== "object") {
    throw new Error(`workflows.yml malformed: missing triage (${path})`);
  }
  if (!Array.isArray(parsed.workflows)) {
    throw new Error(`workflows.yml malformed: workflows must be an array (${path})`);
  }
  for (const w of parsed.workflows) {
    if (!w?.name || !Array.isArray(w.steps)) {
      throw new Error(`workflows.yml malformed: workflow entry missing name or steps (${path})`);
    }
  }
  return parsed as CycleConfig;
}

export async function loadWorkflow(repoRoot: string, name: string): Promise<Workflow> {
  const cfg = await loadConfig(repoRoot);
  const wf = cfg.workflows.find((w) => w.name === name);
  if (!wf) throw new Error(`unknown workflow: ${name}`);
  return wf;
}
```

### Success Criteria
- [ ] `npm run typecheck` clean.
- [ ] `loadWorkflow(root, "feature")` signature/return matches the old one (run-cycle.ts compiles unchanged).
- [ ] `loadConfig(root)` returns `{ engine, triage, workflows }` with typed fields.
- [ ] Five distinct error messages: missing file, malformed (not object), missing engine, missing triage, workflows not array, entry missing name/steps, unknown workflow name.

---

## Task 2: Rewrite loader tests + add error-path + array-pick tests

### Overview
`tests/engine/workflow.test.ts` becomes the loader's full test surface: happy path, two-entry array-pick, engine+triage exposure, and each error path.

### Changes Required
**File**: `tests/engine/workflow.test.ts` (rewrite)

Tests (each minting a tmpdir + writing a synthetic `.cycle/workflows.yml`):
1. `parses a workflow with claudecode and bash steps` — single-entry happy path, asserts `wf.name`, `wf.steps.length`, agents, `wf.max_cycle_attempts`.
2. `picks the named workflow from a multi-entry workflows array` — writes 2 entries (`feature`, `bug`), calls `loadWorkflow(root, "bug")`, asserts the bug steps come back (proves array-pick — not "only entry happens to be feature").
3. `loadConfig exposes engine and triage sections` — writes file with engine + triage, asserts `cfg.engine.max_consecutive_failures`, `cfg.engine.base_branch`, `cfg.triage.agent`, `cfg.triage.prompt`, `cfg.triage.max_turns`.
4. `loadWorkflow throws when file missing` — no file written, expect `/workflows\.yml missing/`.
5. `loadWorkflow throws on missing workflows array` — file with only engine/triage, expect `/workflows must be an array/`.
6. `loadWorkflow throws on unknown workflow name` — file with `feature`, request `"nope"`, expect `/unknown workflow: nope/`.
7. `loadConfig throws on entry missing steps` — `workflows: [{name: "x"}]`, expect `/missing name or steps/`.
8. `loadConfig throws on missing engine` — `workflows:`-only, expect `/missing engine/`.
9. `loadConfig throws on missing triage` — engine + workflows only, expect `/missing triage/`.

Use `assert.rejects(fn, /regex/)` for error tests.

### Success Criteria
- [ ] All 9 tests in this file pass.
- [ ] Each error-path assertion uses a regex on the message — proves the discriminating prefix.
- [ ] Tear-down via `rm({ recursive: true, force: true })` in `finally`.

---

## Task 3: Migrate `tests/defaults/feature-yaml.test.ts`

### Overview
Parse `src/defaults/workflows.yml`, walk to the `feature` entry, assert the nine-step name sequence.

### Changes Required
**File**: `tests/defaults/feature-yaml.test.ts`

```ts
import { test } from "node:test";
import { strict as assert } from "node:assert";
import { readFile } from "node:fs/promises";
import YAML from "yaml";

test("default feature workflow has expected step sequence", async () => {
  const y = YAML.parse(await readFile("src/defaults/workflows.yml", "utf8"));
  const feature = y.workflows.find((w: { name: string }) => w.name === "feature");
  assert.ok(feature, "workflows.yml should contain a feature workflow");
  const names = feature.steps.map((s: { name: string }) => s.name);
  assert.deepEqual(names, ["spec", "research", "plan", "build", "review", "fix", "verify", "commit", "pr"]);
  assert.equal(feature.steps.length, 9, "regression guard: step count should be 9");
});
```

### Success Criteria
- [ ] Test passes after Task 6 ships the default file.
- [ ] Regression guard on step count (catches accidental add/remove).

---

## Task 4: Migrate `tests/defaults/feature-loadable.test.ts`

### Overview
Copy `src/defaults/workflows.yml` → `.cycle/workflows.yml` in a tmp root, call `loadWorkflow(root, "feature")`, assert nine steps.

### Changes Required
**File**: `tests/defaults/feature-loadable.test.ts`

```ts
import { test } from "node:test";
import { strict as assert } from "node:assert";
import { mkdtemp, mkdir, copyFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadWorkflow } from "../../src/engine/workflow.ts";

test("default workflows.yml loads via the engine", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-test-"));
  try {
    await mkdir(join(root, ".cycle"), { recursive: true });
    await copyFile("src/defaults/workflows.yml", join(root, ".cycle/workflows.yml"));
    const w = await loadWorkflow(root, "feature");
    assert.equal(w.steps.length, 9);
    assert.equal(w.steps[0].agent, "claudecode");
    assert.equal(w.steps[6].agent, "bash");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
```

### Success Criteria
- [ ] Passes after Task 6.
- [ ] No `mkdir(.cycle/workflows)` step (proves the single-file shape).

---

## Task 5: Migrate run-cycle and init test fixtures

### Overview
Rewrite the 10 test sites that write `.cycle/workflows/feature.yaml` to instead write `.cycle/workflows.yml` with the new top-level shape (minimal — only fields the loader requires, so engine+triage are stubbed). Update `tests/cli/init.test.ts:17` to stat the single file.

### Changes Required
**File**: `tests/engine/run-cycle.test.ts` (9 sites)

Each `await mkdir(..., ".cycle/workflows", ...)` + `writeFile(.../feature.yaml, "name: feature\nsteps:\n…")` becomes:

```ts
await writeFile(join(root, ".cycle/workflows.yml"),
  `engine:\n  max_consecutive_failures: 2\n  base_branch: main\ntriage:\n  agent: claudecode\n  prompt: prompts/triage.md\n  max_turns: 10\nworkflows:\n  - name: feature\n    max_cycle_attempts: 3\n    steps:\n      - name: spec\n        agent: claudecode\n        prompt: prompts/spec.md\n      - name: note\n        agent: bash\n        command: scripts/note.sh\n`,
  "utf8");
```

(Drop the `mkdir(.cycle/workflows)` line at each site — the parent `.cycle/` is created by other `mkdir`s that already exist for `prompts/` etc., or add a single `mkdir(.cycle, recursive)` if not.)

Per-site step body preserved verbatim from the current fixture — only the wrapper YAML shape changes.

**File**: `tests/cli/init.test.ts`

- Line 17: `await stat(join(root, ".cycle/workflows.yml"));` (was `.cycle/workflows/feature.yaml`).
- Add negative assertion that `.cycle/workflows` dir does not exist (proves the init switched to single-file copy).

### Success Criteria
- [ ] All 9 run-cycle tests pass.
- [ ] Init test passes; new negative assertion confirms `.cycle/workflows` is gone.
- [ ] Grep for `workflows/feature.yaml` across `tests/` returns zero hits.

---

## Task 6: Create `src/defaults/workflows.yml`, delete old dir

### Overview
Author the single config file per RFC-001 §4. Steps byte-equivalent to the current `feature.yaml` (no `reflection`). Delete the empty `src/defaults/workflows/` directory.

### Changes Required
**File** (new): `src/defaults/workflows.yml`

```yaml
engine:
  max_consecutive_failures: 2
  base_branch: master

triage:
  agent: claudecode
  prompt: prompts/triage.md
  max_turns: 10

workflows:
  - name: feature
    description: Full SDLC pass for a single cycle of work.
    max_cycle_attempts: 3
    steps:
      - { name: spec,     agent: claudecode, prompt: prompts/spec.md }
      - { name: research, agent: claudecode, prompt: prompts/research.md }
      - { name: plan,     agent: claudecode, prompt: prompts/plan.md }
      - { name: build,    agent: claudecode, prompt: prompts/build.md }
      - { name: review,   agent: claudecode, prompt: prompts/review.md }
      - { name: fix,      agent: claudecode, prompt: prompts/fix.md, skip_unless: MUST-FIX.md }
      - { name: verify,   agent: bash,       command: scripts/verify.sh }
      - { name: commit,   agent: bash,       command: scripts/commit.sh }
      - { name: pr,       agent: bash,       command: scripts/pr.sh }
```

**Delete**: `src/defaults/workflows/feature.yaml`, then `rmdir src/defaults/workflows`.

Note: `prompts/triage.md` does not exist on disk yet — that's BB-4's job. The `triage:` section refers to a path that will be created later; nothing in BB-2 reads it.

### Success Criteria
- [ ] `src/defaults/workflows.yml` parses with `YAML.parse` to the expected shape.
- [ ] `src/defaults/workflows/` does not exist.
- [ ] `tests/defaults/feature-yaml.test.ts` + `feature-loadable.test.ts` pass.

---

## Task 7: Update `scripts/sync-defaults.mjs`

### Overview
Switch from a three-pair dir-copy loop to: one single-file copy for `workflows.yml`, plus the two dir-copies for `prompts/` and `scripts/`. Also `rm -rf .cycle/workflows` so the stale dir is torn down.

### Changes Required
**File**: `scripts/sync-defaults.mjs`

```js
import { cp, rm } from "node:fs/promises";

// File copy: src/defaults/workflows.yml → .cycle/workflows.yml
await rm(".cycle/workflows.yml", { force: true });
await rm(".cycle/workflows", { recursive: true, force: true });  // idempotent teardown
await cp("src/defaults/workflows.yml", ".cycle/workflows.yml");
console.log("synced src/defaults/workflows.yml → .cycle/workflows.yml");

const dirs = [
  ["src/defaults/prompts", ".cycle/prompts"],
  ["src/defaults/scripts", ".cycle/scripts"],
];

for (const [from, to] of dirs) {
  await rm(to, { recursive: true, force: true });
  await cp(from, to, { recursive: true });
  console.log(`synced ${from} → ${to}`);
}
```

### Success Criteria
- [ ] `npm run sync-defaults` exits 0.
- [ ] After run: `.cycle/workflows.yml` exists, `.cycle/workflows/` does not exist.
- [ ] Idempotent: second run works even though `.cycle/workflows/` already gone.

---

## Task 8: Update `src/cli/init.ts` to copy the single file

### Overview
The directory copy of `defaults/workflows` becomes a `copyFile` of `defaults/workflows.yml`.

### Changes Required
**File**: `src/cli/init.ts`

Replace line 17:
```ts
await cp(join(defaults, "workflows"), join(t, ".cycle/workflows"), { recursive: true });
```
with:
```ts
await copyFile(join(defaults, "workflows.yml"), join(t, ".cycle/workflows.yml"));
```

(`copyFile` already imported at line 1.)

### Success Criteria
- [ ] `tests/cli/init.test.ts` passes (single-file stat + dir-absence assertion).
- [ ] `npm run build && node dist/cycle.js init <tmp>` produces `.cycle/workflows.yml` and no `.cycle/workflows/`. (Manual smoke; not required to automate.)

---

## Task 9: Dogfood sync + commit `.cycle/workflows.yml`

### Overview
Run `npm run sync-defaults` so the cycle repo's own `.cycle/` matches the new shape. Commit the synced file (and the deletion of `.cycle/workflows/`).

### Changes Required
- Run `npm run sync-defaults` from repo root.
- `git add .cycle/workflows.yml` and `git rm -r .cycle/workflows` (sync-defaults already removed the dir on disk).

### Success Criteria
- [ ] `.cycle/workflows.yml` present and committed at the new path.
- [ ] `.cycle/workflows/` no longer in git tree.

---

## Task 10: CLAUDE.md one-line edit

### Overview
Update the architecture quick-reference bullet to name `workflows.yml`.

### Changes Required
**File**: `CLAUDE.md`

Edit the bullet under "Architecture quick reference" that currently says "Default workflow + prompts + scripts that ship into consumer repos: `src/defaults/`." → add a sub-bullet or extend in place:

```
- Default workflow + prompts + scripts that ship into consumer repos: `src/defaults/`.
  Workflow + engine + triage config now live in a single `workflows.yml` (replaces the `workflows/` subdirectory).
```

### Success Criteria
- [ ] CLAUDE.md grep for `workflows.yml` returns the new line.
- [ ] No other CLAUDE.md content modified.

---

## Testing Strategy

### Unit Tests
- Loader (`tests/engine/workflow.test.ts`): 9 cases covering happy path, array-pick, engine+triage exposure, and 6 distinct error paths (missing file, missing engine, missing triage, workflows not array, entry missing steps, unknown workflow name). Use real filesystem via `mkdtemp` — no mocking.
- Defaults shape (`tests/defaults/feature-yaml.test.ts`): on-disk YAML traverse, asserts nine-step name sequence + regression guard on step count.
- Defaults round-trip (`tests/defaults/feature-loadable.test.ts`): copy the on-disk default into a tmp `.cycle/workflows.yml`, load via the real loader, assert nine steps and agent types.
- Mocking strategy: none. Filesystem is real; YAML parser is real; loader is real. SPEC §Testing Strategy explicitly says no mocks here.

### Integration / E2E Tests
- `tests/engine/run-cycle.test.ts` (9 sites): all rewritten to write `.cycle/workflows.yml` with the new shape. Exercises `runCycle → loadWorkflow` end-to-end; verifies the loader's return type is byte-compatible with what `runCycle` consumes. No new test needed — the existing tests are the regression net.
- `tests/cli/init.test.ts`: scaffolds an init target, asserts `.cycle/workflows.yml` exists and `.cycle/workflows/` does not — proves the init's single-file switch.

### Coverage
- New error-path tests increase branch coverage on `workflow.ts` (today's loader has one happy path; new loader has 6 error branches all covered). Net coverage should rise, not fall.
- Targets: line ≥ 95, branch ≥ 75, function ≥ 90. Report in BUILD.md.

## Risk Assessment

- **Loader signature change cascades.** Adding `max_cycle_attempts` to `Workflow` as a required field could break callers if any test fixture omits it. Mitigation: make `max_cycle_attempts` required on `Workflow` but include it in every fixture (and in the default file). The 9 run-cycle test fixtures all add it. If a fixture omits it, TypeScript flags the gap (loader returns the parsed object as `CycleConfig`, but at runtime the field is just absent; consumers don't read it yet in BB-2, so no runtime break — but the typecheck-time guarantee is preserved through fixture updates).
- **`triage.prompt` path doesn't exist yet.** `prompts/triage.md` is BB-4's file. BB-2's loader only parses the path string; nothing dereferences it. No risk in BB-2; flag in PR description so reviewer doesn't think it's a missing file.
- **Dogfood `.cycle/` drift mid-cycle.** If a later step (commit/pr) runs against a stale `.cycle/workflows/feature.yaml`, the running engine could fail. Mitigation: `sync-defaults` runs in Task 9 (before the build step that re-bundles), and the in-flight cycle started before the rewrite so its `.cycle/` is still the old shape — engine for *this* cycle uses the pre-merge `loadWorkflow` from master. New shape only takes effect on the *next* cycle after merge.
- **`init.test.ts:23-28` legacy negative assertion.** That block tests for `tbd/queued/triaged` absence — unrelated to BB-2, leave intact. Adding a parallel `.cycle/workflows` absence assertion fits the same pattern.
- **`yaml` parser quirks.** `YAML.parse` of the inline-object syntax (`{ name: spec, agent: claudecode, prompt: prompts/spec.md }`) is valid yaml — confirmed by `yaml` v2 spec compliance. If anything trips, fall back to block style (the file in Task 6 can use either; inline is shorter and matches RFC-001 §4 exactly).
- **Forgotten files.** Run `grep -rn 'workflows/feature' src tests scripts` after Task 5 — must return zero hits before Task 9. (`docs/` may still reference the old path; deferred per SPEC line 61.)
```
