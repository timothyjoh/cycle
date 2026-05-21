import { test } from "node:test";
import { strict as assert } from "node:assert";
import { mkdtemp, mkdir, writeFile, readFile, rm, chmod, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { runCycle } from "../../src/engine/run-cycle.ts";

function git(cwd: string, args: string[]) {
  const r = spawnSync("git", args, { cwd, encoding: "utf8" });
  if (r.status !== 0) throw new Error(`git ${args.join(" ")}: ${r.stderr}`);
  return r.stdout;
}

function workflowYml(stepsBody: string): string {
  return `engine:
  max_consecutive_failures: 2
  base_branch: main
  commit:
    mode: trunk
    push: false
triage:
  agent: claudecode
  prompt: prompts/triage.md
  max_turns: 10
workflows:
  - name: feature
    max_cycle_attempts: 3
    steps:
${stepsBody}`;
}

async function setupGitRepo(root: string): Promise<void> {
  git(root, ["init", "-b", "main"]);
  git(root, ["config", "user.email", "t@t"]);
  git(root, ["config", "user.name", "t"]);
  await mkdir(join(root, "src"), { recursive: true });
  await writeFile(join(root, "src/existing.ts"), "export const e = 0;\n", "utf8");
  git(root, ["add", "src/existing.ts"]);
  git(root, ["commit", "-m", "init"]);
}

async function findTouchedJson(root: string, cycleId: string): Promise<{ files: string[] }> {
  const entries = await readdir(join(root, "docs/cycle"));
  const dir = entries.find((e) => e.startsWith(`${cycleId}-`));
  assert.ok(dir, `no artifact dir found for cycle ${cycleId}`);
  const raw = await readFile(join(root, "docs/cycle", dir, "touched.json"), "utf8");
  return JSON.parse(raw) as { files: string[] };
}

test("runCycle touched.json: single build step accumulates dirtied files, excludes pre-existing dirty", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-touch-single-"));
  const bin = await mkdtemp(join(tmpdir(), "cycle-touch-single-bin-"));
  try {
    await setupGitRepo(root);

    // Dirty src/existing.ts BEFORE the step — must be excluded from touched.json
    await writeFile(join(root, "src/existing.ts"), "export const e = 1;\n", "utf8");

    await mkdir(join(root, ".cycle/prompts"), { recursive: true });
    await writeFile(join(root, ".cycle/prompts/build.md"), "BUILD_STEP_PROMPT", "utf8");
    await writeFile(
      join(root, ".cycle/workflows.yml"),
      workflowYml("      - name: build\n        agent: claudecode\n        prompt: prompts/build.md\n"),
      "utf8",
    );

    const fakeClaude = join(bin, "claude");
    await writeFile(
      fakeClaude,
      `#!/bin/bash\nmkdir -p "${root}/src"\necho '// new' > "${root}/src/new-module.ts"\ngit -C "${root}" add src/new-module.ts\nprintf '## Summary\\nBuild done.\\n\\n## Touched Files\\n- src/new-module.ts\\n'`,
      "utf8",
    );
    await chmod(fakeClaude, 0o755);

    const r = await runCycle(root, {
      issueId: "TOUCH-1",
      title: "single build touched",
      workflow: "feature",
      env: { PATH: `${bin}:${process.env.PATH}`, CYCLE_BASE: "main" },
    });
    assert.equal(r.status, "ok");

    const content = await findTouchedJson(root, r.cycleId);
    assert.ok(content.files.includes("src/new-module.ts"), "should include file dirtied during step");
    assert.ok(!content.files.includes("src/existing.ts"), "should not include file dirty before step");
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(bin, { recursive: true, force: true });
  }
});

test("runCycle touched.json: untracked ?? src/ file included when not staged by agent", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-touch-untracked-"));
  const bin = await mkdtemp(join(tmpdir(), "cycle-touch-untracked-bin-"));
  try {
    await setupGitRepo(root);

    await mkdir(join(root, ".cycle/prompts"), { recursive: true });
    await writeFile(join(root, ".cycle/prompts/build.md"), "BUILD_STEP_PROMPT", "utf8");
    await writeFile(
      join(root, ".cycle/workflows.yml"),
      workflowYml("      - name: build\n        agent: claudecode\n        prompt: prompts/build.md\n"),
      "utf8",
    );

    const fakeClaude = join(bin, "claude");
    // Creates src/untracked.ts but does NOT git add — file stays ?? in git status
    await writeFile(
      fakeClaude,
      `#!/bin/bash\nmkdir -p "${root}/src"\necho '// untracked' > "${root}/src/untracked.ts"\nprintf '## Summary\\nBuild done.\\n\\n## Touched Files\\n- src/untracked.ts\\n'`,
      "utf8",
    );
    await chmod(fakeClaude, 0o755);

    const r = await runCycle(root, {
      issueId: "TOUCH-UT",
      title: "untracked file in touched.json",
      workflow: "feature",
      env: { PATH: `${bin}:${process.env.PATH}`, CYCLE_BASE: "main" },
    });
    assert.equal(r.status, "ok");

    const content = await findTouchedJson(root, r.cycleId);
    assert.ok(content.files.includes("src/untracked.ts"), "untracked src/ file must appear in touched.json");
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(bin, { recursive: true, force: true });
  }
});

test("runCycle touched.json: two sequential build+fix steps produce sorted union", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-touch-two-"));
  const bin = await mkdtemp(join(tmpdir(), "cycle-touch-two-bin-"));
  try {
    await setupGitRepo(root);

    await mkdir(join(root, ".cycle/prompts"), { recursive: true });
    await writeFile(join(root, ".cycle/prompts/build.md"), "BUILD_STEP_PROMPT", "utf8");
    await writeFile(join(root, ".cycle/prompts/fix.md"), "FIX_STEP_PROMPT", "utf8");
    await writeFile(
      join(root, ".cycle/workflows.yml"),
      workflowYml(
        "      - name: build\n        agent: claudecode\n        prompt: prompts/build.md\n" +
        "      - name: fix\n        agent: claudecode\n        prompt: prompts/fix.md\n",
      ),
      "utf8",
    );

    const fakeBuild = join(bin, "claude-build");
    await writeFile(
      fakeBuild,
      `#!/bin/bash\nmkdir -p "${root}/src"\necho '// a' > "${root}/src/a.ts"\ngit -C "${root}" add src/a.ts\nprintf '## Summary\\nBuild done.\\n\\n## Touched Files\\n- src/a.ts\\n'`,
      "utf8",
    );
    await chmod(fakeBuild, 0o755);

    const fakeFix = join(bin, "claude-fix");
    await writeFile(
      fakeFix,
      `#!/bin/bash\nmkdir -p "${root}/src"\necho '// b' > "${root}/src/b.ts"\ngit -C "${root}" add src/b.ts\nprintf '## Summary\\nFix done.\\n\\n## Touched Files\\n- src/b.ts\\n'`,
      "utf8",
    );
    await chmod(fakeFix, 0o755);

    const fakeWrapper = join(bin, "claude");
    await writeFile(
      fakeWrapper,
      `#!/bin/bash\nfor last; do :; done\nif [[ "$last" == *FIX_STEP_PROMPT* ]]; then exec "${fakeFix}" "$@"; fi\nexec "${fakeBuild}" "$@"\n`,
      "utf8",
    );
    await chmod(fakeWrapper, 0o755);

    const r = await runCycle(root, {
      issueId: "TOUCH-2",
      title: "two step union",
      workflow: "feature",
      env: { PATH: `${bin}:${process.env.PATH}`, CYCLE_BASE: "main" },
    });
    assert.equal(r.status, "ok");

    const content = await findTouchedJson(root, r.cycleId);
    assert.ok(content.files.includes("src/a.ts"), "should include file from build step");
    assert.ok(content.files.includes("src/b.ts"), "should include file from fix step");
    // files must be sorted and deduplicated
    const srcFiles = content.files.filter((f) => f === "src/a.ts" || f === "src/b.ts");
    assert.deepEqual(srcFiles, ["src/a.ts", "src/b.ts"]);
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(bin, { recursive: true, force: true });
  }
});
