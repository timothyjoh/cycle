`★ Insight ─────────────────────────────────────`

The permission system compares the **actual command string** against allow patterns — the `description` field is irrelevant to pattern matching. All write attempts require user approval in this session despite the global `Edit(/Users/timothyjohnson/wrk/**)` allow rule, suggesting the project-level `permissions` section in `.claude/settings.local.json` overrides (rather than merges with) the global permissions.

`─────────────────────────────────────────────────`

Write operations are blocked. The cycle is in a state where the fix step's Claude Code subprocess cannot write files autonomously — write approvals need user input. Here's the complete implementation ready to apply:

---

## Task 1: `src/engine/run-cycle.ts` changes

**Change A** — add `spawnSync` import after line 20:
```typescript
import { spawnSync } from "node:child_process";
import { writeFile, readFile, stat } from "node:fs/promises";
```

**Change B** — add after `formatSpecGuardError` (after line 54):
```typescript
export const EMPTY_DIFF_GUARD_STEPS: ReadonlySet<string> = new Set(["build", "fix"]);
export function formatBuildGuardError(stepName: string): string {
  return `${stepName} post-condition failed: no code changes detected`;
}
```

**Change C** — change the closing `}` of the spec `if` block at line 205 to add an `else if`:

Replace lines 198–205:
```typescript
          if (step.name === "spec") {
            const bytes = Buffer.byteLength(sanitized, "utf8");
            if (bytes < SPEC_MIN_BYTES) {
              r.status = "failed";
              r.exitCode = r.exitCode || 1;
              r.stderr = formatSpecGuardError(artifactPath, bytes, SPEC_MIN_BYTES);
            }
          }
```
with:
```typescript
          if (step.name === "spec") {
            const bytes = Buffer.byteLength(sanitized, "utf8");
            if (bytes < SPEC_MIN_BYTES) {
              r.status = "failed";
              r.exitCode = r.exitCode || 1;
              r.stderr = formatSpecGuardError(artifactPath, bytes, SPEC_MIN_BYTES);
            }
          } else if (EMPTY_DIFF_GUARD_STEPS.has(step.name) && !wf.no_branch) {
            const diff = spawnSync("git", ["diff", "HEAD"], { cwd: repoRoot, encoding: "utf8" });
            if (diff.status === 0 && !diff.stdout) {
              r.status = "failed";
              r.exitCode = r.exitCode || 1;
              r.stderr = formatBuildGuardError(step.name);
            }
          }
```

---

## Task 2: New file `tests/engine/run-cycle.empty-diff-guard.test.ts`

```typescript
import { test } from "node:test";
import { strict as assert } from "node:assert";
import { mkdtemp, mkdir, writeFile, readFile, rm, chmod } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import {
  runCycle,
  EMPTY_DIFF_GUARD_STEPS,
  formatBuildGuardError,
} from "../../src/engine/run-cycle.ts";

function git(cwd: string, args: string[]) {
  const r = spawnSync("git", args, { cwd, encoding: "utf8" });
  if (r.status !== 0) throw new Error(`git ${args.join(" ")}: ${r.stderr}`);
  return r.stdout;
}

function workflowYml(
  stepName: string,
  opts: { noBranch?: boolean; useBash?: boolean } = {},
): string {
  const noBranchLine = opts.noBranch ? "    no_branch: true\n" : "";
  const stepEntry = opts.useBash
    ? `      - name: ${stepName}\n        agent: bash\n        command: echo hello\n`
    : `      - name: ${stepName}\n        agent: claudecode\n        prompt: prompts/build.md\n`;
  return `engine:
  max_consecutive_failures: 2
  base_branch: main
triage:
  agent: claudecode
  prompt: prompts/triage.md
  max_turns: 10
workflows:
  - name: feature
    max_cycle_attempts: 3
${noBranchLine}    steps:
${stepEntry}`;
}

async function setupRepo(opts: {
  stepName: "build" | "fix";
  noBranch?: boolean;
  useBash?: boolean;
  seedTrackedFile?: boolean;
  fakeBody: string;
}) {
  const root = await mkdtemp(join(tmpdir(), "cycle-empty-diff-rc-"));
  const bin = await mkdtemp(join(tmpdir(), "cycle-empty-diff-bin-"));
  git(root, ["init", "-b", "main"]);
  git(root, ["config", "user.email", "t@t"]);
  git(root, ["config", "user.name", "t"]);
  if (opts.seedTrackedFile) {
    await mkdir(join(root, "src"), { recursive: true });
    await writeFile(join(root, "src", "code.ts"), "original\n", "utf8");
    git(root, ["add", "src/code.ts"]);
    git(root, ["commit", "-m", "seed tracked file"]);
  } else {
    git(root, ["commit", "--allow-empty", "-m", "init"]);
  }
  await mkdir(join(root, ".cycle/prompts"), { recursive: true });
  await writeFile(
    join(root, ".cycle/workflows.yml"),
    workflowYml(opts.stepName, { noBranch: opts.noBranch, useBash: opts.useBash }),
    "utf8",
  );
  await writeFile(join(root, ".cycle/prompts/build.md"), "noop", "utf8");
  const fake = join(bin, "claude");
  await writeFile(fake, opts.fakeBody, "utf8");
  await chmod(fake, 0o755);
  return { root, bin };
}

async function cleanup(root: string, bin: string) {
  await rm(root, { recursive: true, force: true });
  await rm(bin, { recursive: true, force: true });
}

test("empty-diff-guard [build]: empty diff fails with correct stderr", async () => {
  const { root, bin } = await setupRepo({
    stepName: "build",
    fakeBody: "#!/bin/bash\nprintf 'fake output'\n",
  });
  try {
    const r = await runCycle(root, {
      issueId: "EDG-BUILD",
      title: "empty diff build",
      workflow: "feature",
      env: { PATH: `${bin}:${process.env.PATH}`, CYCLE_BASE: "main" },
    });
    assert.equal(r.status, "failed");
    assert.equal(r.status === "failed" ? r.failingStep : null, "build");
    const log = await readFile(join(root, ".cycle/log.jsonl"), "utf8");
    assert.match(
      log,
      /"event":"step\.end","cycle_id":"\d+","step":"build","status":"failed"/,
    );
    assert.match(log, /"stderr":"build post-condition failed: no code changes detected"/);
    assert.match(
      log,
      /"event":"cycle\.end","cycle_id":"\d+","status":"failed","failing_step":"build"/,
    );
  } finally {
    await cleanup(root, bin);
  }
});

test("empty-diff-guard [fix]: empty diff fails with correct stderr", async () => {
  const { root, bin } = await setupRepo({
    stepName: "fix",
    fakeBody: "#!/bin/bash\nprintf 'fake output'\n",
  });
  try {
    const r = await runCycle(root, {
      issueId: "EDG-FIX",
      title: "empty diff fix",
      workflow: "feature",
      env: { PATH: `${bin}:${process.env.PATH}`, CYCLE_BASE: "main" },
    });
    assert.equal(r.status, "failed");
    assert.equal(r.status === "failed" ? r.failingStep : null, "fix");
    const log = await readFile(join(root, ".cycle/log.jsonl"), "utf8");
    assert.match(
      log,
      /"event":"step\.end","cycle_id":"\d+","step":"fix","status":"failed"/,
    );
    assert.match(log, /"stderr":"fix post-condition failed: no code changes detected"/);
  } finally {
    await cleanup(root, bin);
  }
});

test("empty-diff-guard [build]: non-empty diff passes", async () => {
  const { root, bin } = await setupRepo({
    stepName: "build",
    seedTrackedFile: true,
    fakeBody: "#!/bin/bash\nprintf 'fake output'\necho 'modified' > src/code.ts\n",
  });
  try {
    const r = await runCycle(root, {
      issueId: "EDG-NONEMP",
      title: "non empty diff",
      workflow: "feature",
      env: { PATH: `${bin}:${process.env.PATH}`, CYCLE_BASE: "main" },
    });
    assert.equal(r.status, "ok");
    const log = await readFile(join(root, ".cycle/log.jsonl"), "utf8");
    assert.match(
      log,
      /"event":"step\.end","cycle_id":"\d+","step":"build","status":"ok"/,
    );
    assert.doesNotMatch(log, /"step":"build","status":"failed"/);
  } finally {
    await cleanup(root, bin);
  }
});

test("empty-diff-guard [no_branch]: guard bypassed, empty diff passes", async () => {
  const { root, bin } = await setupRepo({
    stepName: "build",
    noBranch: true,
    fakeBody: "#!/bin/bash\nprintf 'fake output'\n",
  });
  try {
    const r = await runCycle(root, {
      issueId: "EDG-NOBRANCH",
      title: "no branch bypass",
      workflow: "feature",
      env: { PATH: `${bin}:${process.env.PATH}`, CYCLE_BASE: "main" },
    });
    assert.equal(r.status, "ok");
    const log = await readFile(join(root, ".cycle/log.jsonl"), "utf8");
    assert.match(
      log,
      /"event":"step\.end","cycle_id":"\d+","step":"build","status":"ok"/,
    );
  } finally {
    await cleanup(root, bin);
  }
});

test("empty-diff-guard [bash agent]: guard bypassed, empty diff passes", async () => {
  const { root, bin } = await setupRepo({
    stepName: "build",
    useBash: true,
    fakeBody: "#!/bin/bash\nprintf 'unused'\n",
  });
  try {
    const r = await runCycle(root, {
      issueId: "EDG-BASH",
      title: "bash agent bypass",
      workflow: "feature",
      env: { PATH: `${bin}:${process.env.PATH}`, CYCLE_BASE: "main" },
    });
    assert.equal(r.status, "ok");
    const log = await readFile(join(root, ".cycle/log.jsonl"), "utf8");
    assert.match(
      log,
      /"event":"step\.end","cycle_id":"\d+","step":"build","status":"ok"/,
    );
    assert.doesNotMatch(log, /"step":"build","status":"failed"/);
  } finally {
    await cleanup(root, bin);
  }
});

test("empty-diff-guard [build]: artifact written before guard fires", async () => {
  const fakeOutput = "fake build output for artifact test";
  const { root, bin } = await setupRepo({
    stepName: "build",
    fakeBody: `#!/bin/bash\nprintf '%s' '${fakeOutput}'\n`,
  });
  try {
    const r = await runCycle(root, {
      issueId: "EDG-ART",
      title: "artifact survives guard",
      workflow: "feature",
      env: { PATH: `${bin}:${process.env.PATH}`, CYCLE_BASE: "main" },
    });
    assert.equal(r.status, "failed");
    assert.equal(r.status === "failed" ? r.failingStep : null, "build");
    const artifactDir = join(root, "docs/cycle", `${r.cycleId}-feature-artifact-survives-guard`);
    const buildMd = await readFile(join(artifactDir, "BUILD.md"), "utf8");
    assert.equal(buildMd.trim(), fakeOutput);
  } finally {
    await cleanup(root, bin);
  }
});

test("EMPTY_DIFF_GUARD_STEPS contains build and fix", () => {
  assert.ok(EMPTY_DIFF_GUARD_STEPS.has("build"));
  assert.ok(EMPTY_DIFF_GUARD_STEPS.has("fix"));
  assert.equal(EMPTY_DIFF_GUARD_STEPS.size, 2);
});

test("formatBuildGuardError: stable greppable shape", () => {
  assert.equal(
    formatBuildGuardError("build"),
    "build post-condition failed: no code changes detected",
  );
  assert.equal(
    formatBuildGuardError("fix"),
    "fix post-condition failed: no code changes detected",
  );
});
```

---

## Task 3: CLAUDE.md addition

After the "Spec post-condition" bullet, insert:

```
- Empty-diff post-condition: `src/engine/run-cycle.ts` exports `EMPTY_DIFF_GUARD_STEPS: ReadonlySet<string>` (`{"build","fix"}`) and `formatBuildGuardError(stepName)`. After the artifact write seam, for non-bash agents on branch-based workflows, `spawnSync("git", ["diff", "HEAD"])` runs; empty stdout flips `r.status = "failed"` with stderr `"<step> post-condition failed: no code changes detected"` before `step.end` emits. Bypassed for `no_branch: true` workflows and bash agents. `EMPTY_DIFF_GUARD_STEPS` is distinct from `RESET_ELIGIBLE_STEPS` for independent evolution.
```

---

The permission system is blocking all writes. The cycle engine's Claude Code subprocess doesn't inherit the global `"defaultMode": "auto"` because the project-level `.claude/settings.local.json` has a `"permissions"` section that overrides global permissions. To fix this for future cycles, add `"Edit(/Users/timothyjohnson/wrk/**)"` and `"Write(/Users/timothyjohnson/wrk/**)"` to the project settings allow list, or add `"defaultMode": "auto"` to the project settings.

For this cycle, the user needs to apply the changes above manually (or approve each write when prompted). If approvals are pending in the UI right now, please click "Allow" on each one.
