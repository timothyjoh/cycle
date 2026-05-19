# Implementation Plan: Cycle 0188

## Overview

Add a post-documentation-step hook in `run-cycle.ts` that reads `git status --porcelain`, diffs the results against `BUILD.md ## Touched Files`, and appends any undeclared paths as `- <path>` bullets — eliminating recurring `scopeGuard` commit failures caused by `README.md` and `docs/ARCHITECTURE.md` being written by the documentation step but never declared in BUILD.md.

## Current State (from Research)

- `run-cycle.ts:265` — after the main artifact-write block, `if (r.status === "ok" && step.name === "reflection")` calls `ingestReflection`. The documentation append follows the same pattern.
- `run-cycle.ts:283–286` — documentation failure path emits `documentation.skipped` and `continue`s. No `ok`-path hook exists today.
- `run-cycle.ts:21,24` — `readFile`, `writeFile`, and `spawnSync` are already imported.
- `commit-cycle.ts:27–45` — `parseTouchedFiles` is exported and available. However, the append needs both the file text and the touched set, so re-reading the file twice is wasteful. The append function inlines an equivalent read+parse to do a single file read.
- `commit-cycle.ts:14–25` — `isDenied` is **not exported**. The append will inline equivalent denylist constants locally rather than coupling the two modules.
- `tests/engine/run-cycle.documentation.test.ts` — 4 existing tests; new tests extend this file following the exact same fake-binary + tmpdir pattern.

## Desired End State

After this cycle:

1. `run-cycle.ts` exports (or module-private) `appendDocumentationPaths(repoRoot, buildMdPath)`.
2. After documentation step `ok`, `appendDocumentationPaths` is called; any git-tracked modified path absent from BUILD.md Touched Files is appended.
3. Four new tests in `tests/engine/run-cycle.documentation.test.ts` cover all four SPEC cases.
4. `docs/ENGINE.md` documentation-step section notes the auto-append.

Verify: `npm run build && npm test && npm run typecheck` all pass. Read `docs/cycle/0188-feature-auto-append-documentation-step-output-pa/BUILD.md` — it has a `## Touched Files` entry for any file this documentation step modified.

## What We're NOT Doing

- No changes to `scopeGuard` or `commit-cycle.ts`.
- No reordering of the documentation step (tracked as `refl-0055`).
- No auto-population of Touched Files from the full diff at build time.
- No exporting `isDenied` from `commit-cycle.ts`.
- No new `scopeGuard` acceptance test (existing tests are sufficient per SPEC).

## Implementation Approach

Mirror the `reflection` pattern: a standalone `if (r.status === "ok" && step.name === "documentation")` block placed immediately after the reflection block (run-cycle.ts:265–267). A private helper `appendDocumentationPaths` encapsulates all file I/O. Any error (including permission failures during `writeFile`) is swallowed silently so the append is always best-effort. Untracked files (`??`) and denylist-exempt paths are excluded — consistent with `scopeGuard` behavior.

---

## Task 1: Add `appendDocumentationPaths` to `run-cycle.ts`

### Overview

Private async helper that reads BUILD.md, parses `## Touched Files`, runs `git status --porcelain`, and appends any missing non-denied non-untracked paths as `- <path>` bullets.

### Changes Required

**File**: `src/engine/run-cycle.ts`

**Add after existing constants (around line 32), before `export async function shouldSkipForArtifact`:**

```typescript
const DOC_APPEND_DENYLIST_PREFIXES = [".claude", "dist", "node_modules"];
const DOC_APPEND_DENYLIST_EXACT = [".cycle/cycle.pid"];

function isDocAppendDenied(p: string): boolean {
  const q = p.replace(/\/$/, "");
  for (const prefix of DOC_APPEND_DENYLIST_PREFIXES) {
    if (q === prefix || q.startsWith(prefix + "/")) return true;
  }
  if (DOC_APPEND_DENYLIST_EXACT.includes(q)) return true;
  if (q.endsWith(".lock")) return true;
  return false;
}

async function appendDocumentationPaths(repoRoot: string, buildMdPath: string): Promise<void> {
  let text: string;
  try {
    text = await readFile(buildMdPath, "utf8");
  } catch {
    return; // BUILD.md absent — skip silently
  }

  const lines = text.split("\n");
  const headerIdx = lines.findIndex((l) => l.trim() === "## Touched Files");
  if (headerIdx === -1) return; // no Touched Files section — skip silently

  const touchedSet = new Set<string>();
  for (let i = headerIdx + 1; i < lines.length; i++) {
    if (lines[i].startsWith("##")) break;
    const m = /^\s*-\s+(.+)/.exec(lines[i]);
    if (m) touchedSet.add(m[1].trim());
  }

  const result = spawnSync("git", ["status", "--porcelain"], {
    cwd: repoRoot,
    encoding: "utf8",
    shell: false,
  });

  const toAppend: string[] = [];
  for (const raw of (result.stdout ?? "").split("\n")) {
    if (!raw) continue;
    const xy = raw.slice(0, 2);
    if (xy === "??") continue; // skip untracked
    let p = raw.slice(3);
    if (xy[0] === "R" || xy[0] === "C") {
      const arrow = p.lastIndexOf(" -> ");
      if (arrow !== -1) p = p.slice(arrow + 4);
    }
    p = p.replace(/^"/, "").replace(/"$/, "");
    if (isDocAppendDenied(p)) continue;
    if (!touchedSet.has(p)) toAppend.push(p);
  }

  if (toAppend.length === 0) return;

  // Insert before next ## section header, walking back past blank separator lines
  let insertIdx = lines.length;
  for (let i = headerIdx + 1; i < lines.length; i++) {
    if (lines[i].startsWith("##")) { insertIdx = i; break; }
  }
  while (insertIdx > headerIdx + 1 && lines[insertIdx - 1].trim() === "") {
    insertIdx--;
  }

  lines.splice(insertIdx, 0, ...toAppend.map((p) => `- ${p}`));
  await writeFile(buildMdPath, lines.join("\n"), "utf8");
}
```

### Success Criteria
- [ ] `npm run typecheck` passes — no new type errors
- [ ] `isDocAppendDenied` rejects `.claude/`, `dist/`, `node_modules/`, `.cycle/cycle.pid`, `*.lock` paths
- [ ] `appendDocumentationPaths` returns without throwing when BUILD.md absent
- [ ] `appendDocumentationPaths` returns without throwing when `## Touched Files` absent

---

## Task 2: Wire `appendDocumentationPaths` into documentation step ok-path

### Overview

Call the helper in the step loop immediately after the reflection ingest block, inside a try/catch so errors never propagate.

### Changes Required

**File**: `src/engine/run-cycle.ts`

**After line 267 (`}` closing the reflection block), add:**

```typescript
        if (r.status === "ok" && step.name === "documentation") {
          try {
            await appendDocumentationPaths(repoRoot, join(artifactDir, "BUILD.md"));
          } catch { /* best-effort append; never fail the cycle */ }
        }
```

Context for the Edit: the insertion point is between the closing `}` of the reflection block and the `step.end` `await log.emit(...)` call:

```
        if (r.status === "ok" && step.name === "reflection") {
          await ingestReflection(repoRoot, cycleId, slug, r.stdout, log);
        }
        // ← INSERT NEW BLOCK HERE
      }
      await log.emit("step.end", {
```

### Success Criteria
- [ ] `npm run build` produces no bundle errors
- [ ] `npm run typecheck` clean
- [ ] Existing 4 documentation-step tests still pass (`npm test -- --grep "documentation"`)

---

## Task 3: Add 4 unit tests to `tests/engine/run-cycle.documentation.test.ts`

### Overview

Four new tests using the existing fake-binary + tmpdir pattern. Tests 1–3 use a two-step workflow (build → documentation) so the engine writes BUILD.md from the build step's stdout before the documentation step runs. Test 4 uses a documentation-only workflow with no pre-existing BUILD.md.

### Changes Required

**File**: `tests/engine/run-cycle.documentation.test.ts`

**Add a local helper before the first `test(...)` call:**

```typescript
async function setupGitRepoWithReadme(root: string): Promise<void> {
  git(root, ["init", "-b", "main"]);
  git(root, ["config", "user.email", "t@t"]);
  git(root, ["config", "user.name", "t"]);
  await writeFile(join(root, "README.md"), "# README\n", "utf8");
  git(root, ["add", "README.md"]);
  git(root, ["commit", "-m", "init"]);
}
```

**Test 1 — documentation step succeeds + new path → appended to Touched Files:**

```typescript
test("runCycle: documentation step appends modified file absent from BUILD.md Touched Files", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-doc-append-"));
  const bin  = await mkdtemp(join(tmpdir(), "cycle-doc-append-bin-"));
  try {
    await setupGitRepoWithReadme(root);
    await mkdir(join(root, ".cycle/prompts"), { recursive: true });
    await mkdir(join(root, "src"), { recursive: true });
    await writeFile(join(root, ".cycle/prompts/build.md"),         "noop", "utf8");
    await writeFile(join(root, ".cycle/prompts/documentation.md"), "noop", "utf8");
    await writeFile(
      join(root, ".cycle/workflows.yml"),
      workflowYml(
        `      - name: build\n        agent: claudecode\n        prompt: prompts/build.md\n` +
        `      - name: documentation\n        agent: claudecode\n        prompt: prompts/documentation.md\n`
      ),
      "utf8",
    );

    // Fake build: write a src/ file (satisfies empty-diff guard) + emit BUILD.md content
    const fakeBuild = join(bin, "claude-build");
    await writeFile(
      fakeBuild,
      `#!/bin/bash\necho '// marker' > "${root}/src/dummy.ts"\n` +
      `printf '## Touched Files\\n- src/dummy.ts\\n'`,
      "utf8",
    );
    await chmod(fakeBuild, 0o755);

    // Fake documentation: modify the tracked README.md
    const fakeDoc = join(bin, "claude-doc");
    await writeFile(
      fakeDoc,
      `#!/bin/bash\necho 'Updated.' >> "${root}/README.md"\nprintf 'Updated README.md'`,
      "utf8",
    );
    await chmod(fakeDoc, 0o755);

    // Use a wrapper script that dispatches to per-step fakes based on the prompt path
    const fakeWrapper = join(bin, "claude");
    await writeFile(
      fakeWrapper,
      `#!/bin/bash\n` +
      `if [[ "$*" == *documentation* ]]; then exec "${fakeDoc}" "$@"; fi\n` +
      `exec "${fakeBuild}" "$@"\n`,
      "utf8",
    );
    await chmod(fakeWrapper, 0o755);

    const r = await runCycle(root, {
      issueId: "APPEND-1",
      title: "append test",
      workflow: "feature",
      env: { PATH: `${bin}:${process.env.PATH}`, CYCLE_BASE: "main" },
    });
    assert.equal(r.status, "ok");

    const buildMd = join(root, "docs/cycle", `${r.cycleId}-feature-append-test`, "BUILD.md");
    const content = await readFile(buildMd, "utf8");
    assert.match(content, /## Touched Files/);
    assert.match(content, /- README\.md/);
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(bin,  { recursive: true, force: true });
  }
});
```

**Test 2 — already-listed path not duplicated:**

Same structure as Test 1 but the fake build step emits `## Touched Files\n- README.md\n` (README.md already listed). After runCycle, count occurrences of `README.md` bullets — must equal 1.

```typescript
test("runCycle: documentation step does not duplicate path already in BUILD.md Touched Files", async () => {
  // ... same scaffold as Test 1 but fake build emits "## Touched Files\n- README.md\n"
  // assertion: content.match(/- README\.md/g)?.length === 1
});
```

**Test 3 — no documentation step → BUILD.md unchanged:**

Single-step workflow (build only). Fake build emits `## Touched Files\n- src/dummy.ts\n`. After runCycle, BUILD.md must contain exactly that content — no extra bullets.

```typescript
test("runCycle: workflow without documentation step leaves BUILD.md unchanged", async () => {
  // Workflow has only a build step.
  // Fake build emits "## Touched Files\n- src/dummy.ts\n"
  // After runCycle: read BUILD.md, verify no paths beyond src/dummy.ts in Touched Files
});
```

**Test 4 — BUILD.md missing → no error, cycle ok:**

Documentation-only workflow, no prior build step, no BUILD.md in artifactDir.

```typescript
test("runCycle: documentation step with no BUILD.md present does not throw; cycle.end ok", async () => {
  // Same as existing test 1 but with no pre-created BUILD.md
  // Verify r.status === "ok" and cycle.end event has status "ok"
  // No BUILD.md existence assertion needed
});
```

Note: for the dispatch wrapper approach, an alternative is two separate fake binaries placed in different subdirectories on PATH, but the wrapper script is simpler to reason about. The implementor may choose either.

### Success Criteria
- [ ] All 4 new tests pass individually
- [ ] All 8 documentation-step tests pass together
- [ ] Full suite (`npm test`) passes

---

## Task 4: Update `docs/ENGINE.md` documentation step section

### Overview

Add one sentence noting the auto-append behavior after a successful documentation step run.

### Changes Required

**File**: `docs/ENGINE.md`

Find the documentation step section (around line 70–73 per RESEARCH). After the existing description of the documentation step, add:

> After a successful run, `run-cycle.ts` reads `git status --porcelain` and appends any modified tracked paths absent from `BUILD.md ## Touched Files` as `- <path>` bullets, so `scopeGuard` does not block the subsequent commit.

### Success Criteria
- [ ] Section describes the auto-append
- [ ] No other ENGINE.md sections changed

---

## SPEC Acceptance Traceability

| SPEC Acceptance Bullet (verbatim) | Covering Task | Notes |
|---|---|---|
| `[ ] After documentation step succeeds and modifies files absent from Touched Files, those paths appear in BUILD.md \`## Touched Files\`` | Task 1 + Task 2 + Task 3 (Test 1) | `appendDocumentationPaths` implements; Test 1 verifies |
| `[ ] A path already listed in Touched Files is not duplicated after the append` | Task 1 + Task 3 (Test 2) | `touchedSet` membership check; Test 2 verifies |
| `[ ] A workflow with no documentation step leaves BUILD.md unchanged` | Task 2 + Task 3 (Test 3) | Guard `step.name === "documentation"` ensures no-op; Test 3 verifies |
| `[ ] If BUILD.md is missing or has no \`## Touched Files\` section, no error is thrown` | Task 1 + Task 3 (Test 4) | `readFile` catch + `headerIdx === -1` guard; Test 4 verifies |
| `[ ] \`scopeGuard\` passes on a subsequent commit when documentation-step paths have been auto-appended` | Task 1 + Task 2 | No dedicated E2E test per SPEC; covered implicitly by the end-to-end cycle behavior; unit tests verify the path set produced |
| `[ ] All existing tests continue to pass` | Task 2 | Confirmed by running full suite post-implementation |
| `[ ] No compiler/linter warnings introduced` | Task 1 + Task 2 | `npm run typecheck` clean |

---

## Testing Strategy

### Unit Tests

- **Framework**: `node:test` + `node:assert/strict` — NOT Vitest (SPEC erroneously names Vitest; existing suite uses `node:test`).
- **File**: `tests/engine/run-cycle.documentation.test.ts` — extend existing file.
- **Approach**: Two-step workflow (build → documentation) for Tests 1–3, to exercise the append path with a real BUILD.md written by the build step. Documentation-only workflow for Test 4.
- **Mutation pattern**: fake claude bash script writes tracked files (README.md) to the repo root using hardcoded `root` path embedded at writeFile time.
- **Empty-diff guard**: fake build step creates `src/dummy.ts` in the working tree (via embedded `root` path) to satisfy `git diff HEAD -- src/` check.
- **Idempotency**: Test 2 counts regex matches to assert exactly one occurrence.
- **No mocking**: real `spawnSync("git", ...)` on a real tmpdir git repo.

### Integration / E2E Tests

None required per SPEC. The unit tests exercise all four acceptance-criteria cases end-to-end through `runCycle`.

## Risk Assessment

- **Empty-diff guard on build step**: the two-step workflow's fake build step MUST write to `src/` before exiting; if $PWD is not repoRoot in the subprocess, `$PWD/src/dummy.ts` will be written to the wrong location. Mitigation: embed `root` explicitly in the fake script (known at test setup time) rather than relying on `$PWD`.
- **Rename/copy porcelain parsing**: the append mirrors `scopeGuard`'s `R`/`C` handling (takes the destination path). Mitigation: same code path, same tests pass.
- **Concurrent tests writing to same tmpdir**: each test uses `mkdtemp` with a unique prefix; fully isolated.
- **Trailing-newline edge case in BUILD.md**: the walkback-past-blank-lines logic in `appendDocumentationPaths` prevents inserting extra blank lines between existing bullets and appended ones. Verify with a BUILD.md that has a trailing `\n`.
