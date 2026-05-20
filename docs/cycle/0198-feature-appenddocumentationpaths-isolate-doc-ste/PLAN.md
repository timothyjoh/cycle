I have all the information I need. Open questions resolved:
1. Pre-snapshot guarded with `if (step.name === "documentation")` — no extra `spawnSync` on other steps.
2. `preSnapshot` declared inside the loop, not hoisted.
3. New test uses a bespoke build fake that stages an extra undeclared file; no extension to `setupBuildDocWorkflow`.

Now writing the plan to stdout.

# Implementation Plan: Cycle 0198

## Overview
Add `preSnapshot: string` to `appendDocumentationPaths` and capture `git status --porcelain` immediately before the documentation step in `run-cycle.ts`, so only paths the doc step itself modified are appended to `BUILD.md ## Touched Files`.

## Current State (from Research)
- `appendDocumentationPaths` (`src/engine/run-cycle.ts:47–100`) calls `spawnSync("git", ["status", "--porcelain"])` internally after the doc step completes, then appends all non-denied, non-deduped paths — including any dirty paths left over from prior steps.
- Call site at `run-cycle.ts:336–339` passes `repoRoot`, `buildMdPath`, `log`, `cycleId`.
- `spawnSync` already imported at line 24 from `node:child_process`; same pattern used at lines 66–71 and 321–325.
- Test suite: `tests/engine/run-cycle.documentation.test.ts`, 10 tests, all exercising `appendDocumentationPaths` end-to-end via `runCycle` (function is not exported). Existing tests need no caller-level change since the pre-snapshot is captured inside `runCycle` at the call site.

## Desired End State
- `appendDocumentationPaths` signature: `(repoRoot, buildMdPath, log, cycleId, preSnapshot: string)`.
- Inside the function: a `prePaths` set built from `preSnapshot` using the same porcelain parsing logic; paths in `prePaths` are excluded from `toAppend`.
- In the step loop: `let preSnapshot = ""` captured via `spawnSync` immediately after `step.start` emission, guarded by `if (step.name === "documentation")`.
- New test: build fake stages an extra undeclared file before doc step; test asserts only the doc-step file is appended.
- `npm test`, `npm run typecheck`, and `npm run test:coverage` all pass.

## What We're NOT Doing
- Fixing the build agent's Touched Files declaration (tracked in refl-0187).
- Changing `scopeGuard` logic.
- Changing `isDocAppendDenied` logic or the denylist.
- Modifying any step type other than `documentation`.
- Exporting `appendDocumentationPaths`.

## Implementation Approach
Three localized edits in `src/engine/run-cycle.ts`: (1) add `preSnapshot` param + `prePaths` set to `appendDocumentationPaths`, (2) capture pre-snapshot at the call site in the step loop, (3) thread it through. One new test in `run-cycle.documentation.test.ts`. One prose update in `docs/ENGINE.md`. No new imports, no new types, no new files.

---

## Task 1: Add `preSnapshot` parameter and pre/post diff logic to `appendDocumentationPaths`

### Overview
Update the function signature to accept `preSnapshot: string`. Parse it into a `prePaths` set using the same porcelain-line logic as the post-snapshot iteration. Add `prePaths.has(p)` as a skip condition in the `toAppend` loop.

### Changes Required

**File**: `src/engine/run-cycle.ts`

**Change A — signature** (line 47):
```ts
// Before:
async function appendDocumentationPaths(repoRoot: string, buildMdPath: string, log: Logger, cycleId: string): Promise<void> {

// After:
async function appendDocumentationPaths(repoRoot: string, buildMdPath: string, log: Logger, cycleId: string, preSnapshot: string): Promise<void> {
```

**Change B — build `prePaths` set** (insert after line 64, before the `spawnSync` call):
```ts
const prePaths = new Set<string>();
for (const raw of preSnapshot.split("\n")) {
  if (!raw) continue;
  const xy = raw.slice(0, 2);
  if (xy === "??") continue;
  let p = raw.slice(3);
  if (xy[0] === "R" || xy[0] === "C") {
    const arrow = p.lastIndexOf(" -> ");
    if (arrow !== -1) p = p.slice(arrow + 4);
  }
  p = p.replace(/^"/, "").replace(/"$/, "");
  prePaths.add(p);
}
```

**Change C — filter pre-existing paths** (line 83–84 area):
```ts
// Before:
    if (isDocAppendDenied(p)) continue;
    if (!touchedSet.has(p)) toAppend.push(p);

// After:
    if (isDocAppendDenied(p)) continue;
    if (prePaths.has(p)) continue;
    if (!touchedSet.has(p)) toAppend.push(p);
```

### Success Criteria
- [ ] TypeScript compiles with zero errors (`npm run typecheck`)
- [ ] `appendDocumentationPaths` signature matches SPEC (parameter present)
- [ ] `prePaths` set built from `preSnapshot` using same rename/quote-strip logic as post-snapshot

---

## Task 2: Capture pre-snapshot at call site and thread it through

### Overview
In the step loop, declare `preSnapshot` (local, scoped to the iteration) and populate it via `spawnSync` if `step.name === "documentation"`. Pass `preSnapshot` to `appendDocumentationPaths`.

### Changes Required

**File**: `src/engine/run-cycle.ts`

**Change A — capture pre-snapshot** (insert after `step.start` emission at line 282, before `let r: StepResult`):
```ts
let preSnapshot = "";
if (step.name === "documentation") {
  const snap = spawnSync("git", ["status", "--porcelain"], { cwd: repoRoot, encoding: "utf8", shell: false });
  preSnapshot = snap.stdout ?? "";
}
```

**Change B — thread to call site** (line 338):
```ts
// Before:
      await appendDocumentationPaths(repoRoot, join(artifactDir, "BUILD.md"), log, cycleId);

// After:
      await appendDocumentationPaths(repoRoot, join(artifactDir, "BUILD.md"), log, cycleId, preSnapshot);
```

### Success Criteria
- [ ] `preSnapshot` declared inside step loop body (not hoisted above loop)
- [ ] `spawnSync` only called when `step.name === "documentation"`
- [ ] Existing tests still pass (`npm test`) — no caller-level change needed since tests run via `runCycle`
- [ ] `npm run typecheck` zero errors

---

## Task 3: Add test — pre-existing dirty paths excluded

### Overview
New end-to-end test: build fake stages `src/dummy.ts` (declared in Touched Files) AND `docs/extra.md` (undeclared, simulating a build-agent dirty file). Doc fake modifies `README.md`. Assert `README.md` is appended; `docs/extra.md` is NOT appended.

### Changes Required

**File**: `tests/engine/run-cycle.documentation.test.ts`

Add new test after the `"documentation.paths_appended not emitted when toAppend is empty"` test (line 560):

```ts
test("runCycle: documentation step excludes pre-existing dirty paths staged by prior steps", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-doc-pre-"));
  const bin = await mkdtemp(join(tmpdir(), "cycle-doc-pre-bin-"));
  try {
    await setupGitRepoWithReadme(root);

    // Prompts
    await mkdir(join(root, ".cycle/prompts"), { recursive: true });
    await writeFile(join(root, ".cycle/prompts/build.md"), "BUILD_STEP_PROMPT", "utf8");
    await writeFile(join(root, ".cycle/prompts/documentation.md"), "DOCUMENTATION_STEP_PROMPT", "utf8");
    await writeFile(
      join(root, ".cycle/workflows.yml"),
      workflowYml(
        `      - name: build\n        agent: claudecode\n        prompt: prompts/build.md\n` +
        `      - name: documentation\n        agent: claudecode\n        prompt: prompts/documentation.md\n`,
      ),
      "utf8",
    );

    // Build fake: stages src/dummy.ts AND docs/extra.md (undeclared in Touched Files)
    const fakeBuild = join(bin, "claude-build");
    await writeFile(
      fakeBuild,
      `#!/bin/bash\n` +
      `mkdir -p "${root}/src" "${root}/docs"\n` +
      `echo '// marker' > "${root}/src/dummy.ts"\n` +
      `echo 'extra' > "${root}/docs/extra.md"\n` +
      `git -C "${root}" add src/dummy.ts docs/extra.md\n` +
      `printf '## Touched Files\\n- src/dummy.ts\\n'`,
      "utf8",
    );
    await chmod(fakeBuild, 0o755);

    // Doc fake: modifies README.md only
    const fakeDoc = join(bin, "claude-doc");
    await writeFile(
      fakeDoc,
      `#!/bin/bash\necho 'Updated.' >> "${root}/README.md"\nprintf 'Updated README.md'`,
      "utf8",
    );
    await chmod(fakeDoc, 0o755);

    // Dispatcher
    const fakeWrapper = join(bin, "claude");
    await writeFile(
      fakeWrapper,
      `#!/bin/bash\nif [[ "$3" == *DOCUMENTATION_STEP_PROMPT* ]]; then exec "${fakeDoc}" "$@"; fi\nexec "${fakeBuild}" "$@"\n`,
      "utf8",
    );
    await chmod(fakeWrapper, 0o755);

    const r = await runCycle(root, {
      issueId: "PRE-SNAP-1",
      title: "pre snap exclude",
      workflow: "feature",
      env: { PATH: `${bin}:${process.env.PATH}`, CYCLE_BASE: "main" },
    });
    assert.equal(r.status, "ok");

    const buildMd = join(root, "docs/cycle", `${r.cycleId}-feature-pre-snap-exclude`, "BUILD.md");
    const content = await readFile(buildMd, "utf8");
    assert.match(content, /- README\.md/, "doc-step file must be appended");
    assert.doesNotMatch(content, /- docs\/extra\.md/, "pre-existing staged file must not be appended");
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(bin, { recursive: true, force: true });
  }
});
```

### Success Criteria
- [ ] New test passes
- [ ] `docs/extra.md` is NOT present in Touched Files section of BUILD.md
- [ ] `README.md` IS present in Touched Files section
- [ ] All 559+ tests pass (`npm test`)
- [ ] `npm run test:coverage` passes all per-file coverage gates

---

## Task 4: Update ENGINE.md documentation

### Overview
Replace the current single-snapshot description (line 76) with a description of pre/post snapshot diffing.

### Changes Required

**File**: `docs/ENGINE.md` (line 76)

```markdown
# Before:
After a successful run, `run-cycle.ts` reads `git status --porcelain` and appends any modified tracked paths absent from `BUILD.md ## Touched Files` as `- <path>` bullets, so `scopeGuard` does not block the subsequent commit. Untracked files (`??`) and denylisted paths (`.claude/`, `dist/`, `node_modules/`, `.cycle/cycle.pid`, `*.lock`) are excluded. The append is best-effort and silently skipped when BUILD.md is absent or has no `## Touched Files` section. After a successful auto-append, `documentation.paths_appended { cycle_id, appended: string[] }` is emitted with the list of paths that were written; no event is emitted when all touched paths were already listed (no-op case).

# After:
After a successful run, `run-cycle.ts` diffs a pre-step `git status --porcelain` snapshot (captured immediately before the documentation step dispatches) against a post-step snapshot (captured inside `appendDocumentationPaths`) and appends only the delta paths — those present in the post-step snapshot but absent from the pre-step snapshot — to `BUILD.md ## Touched Files` as `- <path>` bullets. This isolates paths the documentation step itself modified from paths left dirty by prior steps (e.g., staged files from the build agent). Untracked files (`??`), denylisted paths (`.claude/`, `dist/`, `node_modules/`, `.cycle/cycle.pid`, `*.lock`), and paths already listed in `## Touched Files` are excluded. The append is best-effort and silently skipped when BUILD.md is absent or has no `## Touched Files` section. After a successful auto-append, `documentation.paths_appended { cycle_id, appended: string[] }` is emitted with the list of paths that were written; no event is emitted when the delta is empty.
```

### Success Criteria
- [ ] ENGINE.md line 76 describes pre/post snapshot diffing
- [ ] Prose mentions "pre-step snapshot", "post-step snapshot", and "delta"

---

## SPEC Acceptance Traceability

| SPEC Acceptance Bullet (verbatim) | Covering Task | Notes |
|---|---|---|
| `[ ] \`appendDocumentationPaths\` signature includes \`preSnapshot: string\` parameter` | Task 1 | Change A to signature |
| `[ ] Pre-step snapshot is captured via \`spawnSync("git", ["status", "--porcelain"])\` in \`run-cycle.ts\` immediately before dispatching the documentation step` | Task 2 | Change A, guarded by `step.name === "documentation"` |
| `[ ] Pre-snapshot is threaded through to \`appendDocumentationPaths\` at the call site` | Task 2 | Change B |
| `[ ] A test with pre-existing dirty paths (simulating build-agent staged files) confirms those paths are excluded from the appended set` | Task 3 | New test; `docs/extra.md` staged by build fake, asserted absent from Touched Files |
| `[ ] All existing \`appendDocumentationPaths\` tests updated to pass a pre-snapshot argument and still pass` | Task 2 | No caller change needed — tests run via `runCycle`; pre-snapshot captured automatically inside the engine |
| `[ ] \`npm test\` passes with no failures` | Tasks 1–3 | Verified after each task |
| `[ ] \`npm run test:coverage\` passes all per-file coverage gates` | Tasks 1–3 | Verified in Task 3 |
| `[ ] \`npm run typecheck\` reports zero errors` | Tasks 1–2 | Verified after Task 2 |

---

## Testing Strategy

### Unit Tests
- All tests exercise `appendDocumentationPaths` indirectly via `runCycle` (function is not exported).
- Existing tests: passing an empty `preSnapshot` (nothing staged before doc step) — behavior unchanged.
- New test: build fake stages an extra file not in Touched Files before doc step runs; asserts it is excluded post-delta.
- Key edge cases already covered by existing tests: rename porcelain (`R` prefix), no `## Touched Files` header, BUILD.md absent, `documentation.paths_appended` event emission and non-emission.

### Integration / E2E Tests
- All tests are integration-level: real git repo (`mkdtemp`), real `spawnSync`, real file writes, real `runCycle` call.
- No mocking; no stubs. `appendDocumentationPaths` behavior validated through full engine execution.

## Risk Assessment
- **`preSnapshot` stale if step loop order changes**: Mitigated by declaring `preSnapshot` inside the loop, guarded by `step.name === "documentation"` — always captured for the current iteration.
- **Empty `preSnapshot` when `spawnSync` fails**: `snap.stdout ?? ""` produces an empty string; `prePaths` set is empty; behavior degrades to pre-cycle-0198 behavior (appends all non-denied, non-duplicate paths). Acceptable: same as before, no regression.
- **Rename handling in `prePaths`**: Same `R`/`C` prefix + ` -> ` extraction used in post-snapshot iteration — consistent treatment.
