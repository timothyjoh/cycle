import { test } from "node:test";
import { strict as assert } from "node:assert";
import { mkdtemp, mkdir, writeFile, readFile, rm, chmod, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { runCycle } from "../../src/engine/run-cycle.ts";
import { expectExactlyOne } from "../helpers.ts";

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
function workflowYmlNoBranch(stepsBody: string): string {
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
    no_branch: true
    max_cycle_attempts: 3
    steps:
${stepsBody}`;
}

function parseLog(logStr: string): Record<string, unknown>[] {
  return logStr.trim().split('\n').map((l) => JSON.parse(l));
}

async function fileExists(p: string): Promise<boolean> {
  try { await stat(p); return true; } catch { return false; }
}

async function setupGitRepo(root: string): Promise<void> {
  git(root, ["init", "-b", "main"]);
  git(root, ["config", "user.email", "t@t"]);
  git(root, ["config", "user.name", "t"]);
  git(root, ["commit", "--allow-empty", "-m", "init"]);
}

async function setupGitRepoWithReadme(root: string): Promise<void> {
  git(root, ["init", "-b", "main"]);
  git(root, ["config", "user.email", "t@t"]);
  git(root, ["config", "user.name", "t"]);
  await writeFile(join(root, "README.md"), "# README\n", "utf8");
  git(root, ["add", "README.md"]);
  git(root, ["commit", "-m", "init"]);
}

test("runCycle: documentation step success writes DOCUMENTATION.md verbatim", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-doc-rc-"));
  const bin = await mkdtemp(join(tmpdir(), "cycle-doc-bin-"));
  try {
    await setupGitRepo(root);
    await mkdir(join(root, ".cycle/prompts"), { recursive: true });
    await writeFile(
      join(root, ".cycle/workflows.yml"),
      workflowYml(`      - name: documentation
        agent: claudecode
        prompt: prompts/documentation.md
`),
      "utf8",
    );
    await writeFile(join(root, ".cycle/prompts/documentation.md"), "noop", "utf8");

    const summary = "Updated README.md to mention the new flag.";
    const fake = join(bin, "claude");
    await writeFile(fake, `#!/bin/bash\nprintf '%s' '${summary}'\n`, "utf8");
    await chmod(fake, 0o755);

    const r = await runCycle(root, {
      issueId: "DOC-1",
      title: "doc happy",
      workflow: "feature",
      env: { PATH: `${bin}:${process.env.PATH}`, CYCLE_BASE: "main" },
    });
    assert.equal(r.status, "ok");

    const artifactDir = join(root, "docs/cycle", `${r.cycleId}-feature-doc-happy`);
    const docFile = join(artifactDir, "DOCUMENTATION.md");
    assert.ok(await fileExists(docFile), `expected ${docFile}`);
    assert.equal(await readFile(docFile, "utf8"), summary + "\n");

    const log = await readFile(join(root, ".cycle/log.jsonl"), "utf8");
    assert.doesNotMatch(log, /"event":"documentation.skipped"/);
    assert.match(log, /"event":"cycle.end","cycle_id":"\d+","status":"ok"/);
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(bin, { recursive: true, force: true });
  }
});

test("runCycle: documentation step exit-non-zero is non-fatal; cycle.end ok; documentation.skipped emitted", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-doc-rc-"));
  const bin = await mkdtemp(join(tmpdir(), "cycle-doc-bin-"));
  try {
    await setupGitRepo(root);
    await mkdir(join(root, ".cycle/prompts"), { recursive: true });
    await writeFile(
      join(root, ".cycle/workflows.yml"),
      workflowYml(`      - name: documentation
        agent: claudecode
        prompt: prompts/documentation.md
`),
      "utf8",
    );
    await writeFile(join(root, ".cycle/prompts/documentation.md"), "boom", "utf8");

    const fake = join(bin, "claude");
    await writeFile(fake, `#!/bin/bash\necho boom 1>&2\nexit 2\n`, "utf8");
    await chmod(fake, 0o755);

    const r = await runCycle(root, {
      issueId: "DOC-2",
      title: "doc fail",
      workflow: "feature",
      env: { PATH: `${bin}:${process.env.PATH}`, CYCLE_BASE: "main" },
    });
    assert.equal(r.status, "ok");

    const log = await readFile(join(root, ".cycle/log.jsonl"), "utf8");
    assert.match(log, /"event":"documentation.skipped".*"reason":"exec_failed".*"exit_code":2/);
    assert.match(log, /"event":"cycle.end","cycle_id":"\d+","status":"ok"/);

    const artifactDir = join(root, "docs/cycle", `${r.cycleId}-feature-doc-fail`);
    const docFile = join(artifactDir, "DOCUMENTATION.md");
    assert.equal(await fileExists(docFile), false, "DOCUMENTATION.md must not be written on failure");
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(bin, { recursive: true, force: true });
  }
});

test("runCycle: documentation step success in no_branch workflow writes DOCUMENTATION.md; step.start has no head_sha", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-doc-nb-"));
  const bin = await mkdtemp(join(tmpdir(), "cycle-doc-nb-bin-"));
  try {
    await setupGitRepo(root);
    await mkdir(join(root, ".cycle/prompts"), { recursive: true });
    await writeFile(
      join(root, ".cycle/workflows.yml"),
      workflowYmlNoBranch("      - name: documentation\n        agent: claudecode\n        prompt: prompts/documentation.md\n"),
      "utf8",
    );
    await writeFile(join(root, ".cycle/prompts/documentation.md"), "noop", "utf8");

    const summary = "Documented the no_branch workflow path.";
    const fake = join(bin, "claude");
    await writeFile(fake, "#!/bin/bash\nprintf '%s' '" + summary + "'\n", "utf8");
    await chmod(fake, 0o755);

    const r = await runCycle(root, {
      issueId: "DOC-NB-1",
      title: "doc no branch happy",
      workflow: "feature",
      env: { PATH: bin + ":" + process.env.PATH, CYCLE_BASE: "main" },
    });
    assert.equal(r.status, "ok");

    const artifactDir = join(root, "docs/cycle", r.cycleId + "-feature-doc-no-branch-happy");
    const docFile = join(artifactDir, "DOCUMENTATION.md");
    assert.ok(await fileExists(docFile), "expected " + docFile);
    assert.equal(await readFile(docFile, "utf8"), summary + "\n");

    const log = await readFile(join(root, ".cycle/log.jsonl"), "utf8");
    const events = parseLog(log);

    const stepStart = expectExactlyOne(events, "step.start");
    assert.equal(stepStart.head_sha, undefined, "documentation step.start must not carry head_sha");

    const stepEnd = expectExactlyOne(events, "step.end");
    assert.equal(stepEnd.status, "ok");

    const cycleEnd = expectExactlyOne(events, "cycle.end");
    assert.equal(cycleEnd.status, "ok");
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(bin, { recursive: true, force: true });
  }
});

test("runCycle: documentation step exec-failure in no_branch workflow emits documentation.skipped; cycle.end ok", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-doc-nb-"));
  const bin = await mkdtemp(join(tmpdir(), "cycle-doc-nb-bin-"));
  try {
    await setupGitRepo(root);
    await mkdir(join(root, ".cycle/prompts"), { recursive: true });
    await writeFile(
      join(root, ".cycle/workflows.yml"),
      workflowYmlNoBranch("      - name: documentation\n        agent: claudecode\n        prompt: prompts/documentation.md\n"),
      "utf8",
    );
    await writeFile(join(root, ".cycle/prompts/documentation.md"), "boom", "utf8");

    const fake = join(bin, "claude");
    await writeFile(fake, "#!/bin/bash\necho boom 1>&2\nexit 2\n", "utf8");
    await chmod(fake, 0o755);

    const r = await runCycle(root, {
      issueId: "DOC-NB-2",
      title: "doc no branch fail",
      workflow: "feature",
      env: { PATH: bin + ":" + process.env.PATH, CYCLE_BASE: "main" },
    });
    assert.equal(r.status, "ok");

    const log = await readFile(join(root, ".cycle/log.jsonl"), "utf8");
    const events = parseLog(log);

    const skipped = expectExactlyOne(events, "documentation.skipped");
    assert.equal(skipped.reason, "exec_failed");
    assert.equal(skipped.exit_code, 2);

    const cycleEnd = expectExactlyOne(events, "cycle.end");
    assert.equal(cycleEnd.status, "ok");

    const artifactDir = join(root, "docs/cycle", r.cycleId + "-feature-doc-no-branch-fail");
    const docFile = join(artifactDir, "DOCUMENTATION.md");
    assert.equal(await fileExists(docFile), false, "DOCUMENTATION.md must not be written on failure");
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(bin, { recursive: true, force: true });
  }
});

// Helper: write a two-step build→documentation workflow and dispatcher claude binary.
// The build fake stages src/dummy.ts (satisfying the empty-diff guard) and emits buildTouchedFiles.
// The doc fake appends to README.md.
async function setupBuildDocWorkflow(
  root: string,
  bin: string,
  buildTouchedFiles: string,
): Promise<void> {
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

  const fakeBuild = join(bin, "claude-build");
  await writeFile(
    fakeBuild,
    `#!/bin/bash\nmkdir -p "${root}/src"\necho '// marker' > "${root}/src/dummy.ts"\ngit -C "${root}" add src/dummy.ts\nprintf '${buildTouchedFiles}'`,
    "utf8",
  );
  await chmod(fakeBuild, 0o755);

  const fakeDoc = join(bin, "claude-doc");
  await writeFile(
    fakeDoc,
    `#!/bin/bash\necho 'Updated.' >> "${root}/README.md"\nprintf 'Updated README.md'`,
    "utf8",
  );
  await chmod(fakeDoc, 0o755);

  // Dispatch on last arg (the prompt content passed as final argv element by exec-claudecode)
  const fakeWrapper = join(bin, "claude");
  await writeFile(
    fakeWrapper,
    `#!/bin/bash\nfor last; do :; done\nif [[ "$last" == *DOCUMENTATION_STEP_PROMPT* ]]; then exec "${fakeDoc}" "$@"; fi\nexec "${fakeBuild}" "$@"\n`,
    "utf8",
  );
  await chmod(fakeWrapper, 0o755);
}

test("runCycle: documentation step appends modified tracked file absent from BUILD.md Touched Files", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-doc-append-"));
  const bin = await mkdtemp(join(tmpdir(), "cycle-doc-append-bin-"));
  try {
    await setupGitRepoWithReadme(root);
    await setupBuildDocWorkflow(root, bin, "## Touched Files\\n- src/dummy.ts\\n");

    const r = await runCycle(root, {
      issueId: "APPEND-1",
      title: "doc append new",
      workflow: "feature",
      env: { PATH: `${bin}:${process.env.PATH}`, CYCLE_BASE: "main" },
    });
    assert.equal(r.status, "ok");

    const buildMd = join(root, "docs/cycle", `${r.cycleId}-feature-doc-append-new`, "BUILD.md");
    const content = await readFile(buildMd, "utf8");
    assert.match(content, /## Touched Files/);
    assert.match(content, /- README\.md/);
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(bin, { recursive: true, force: true });
  }
});

test("runCycle: documentation step does not duplicate path already listed in BUILD.md Touched Files", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-doc-dup-"));
  const bin = await mkdtemp(join(tmpdir(), "cycle-doc-dup-bin-"));
  try {
    await setupGitRepoWithReadme(root);
    await setupBuildDocWorkflow(root, bin, "## Touched Files\\n- src/dummy.ts\\n- README.md\\n");

    const r = await runCycle(root, {
      issueId: "APPEND-2",
      title: "doc append dup",
      workflow: "feature",
      env: { PATH: `${bin}:${process.env.PATH}`, CYCLE_BASE: "main" },
    });
    assert.equal(r.status, "ok");

    const buildMd = join(root, "docs/cycle", `${r.cycleId}-feature-doc-append-dup`, "BUILD.md");
    const content = await readFile(buildMd, "utf8");
    const occurrences = content.match(/- README\.md/g);
    assert.equal(occurrences?.length ?? 0, 1, "README.md must appear exactly once in Touched Files");
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(bin, { recursive: true, force: true });
  }
});

test("runCycle: workflow without documentation step leaves BUILD.md unchanged", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-doc-nostep-"));
  const bin = await mkdtemp(join(tmpdir(), "cycle-doc-nostep-bin-"));
  try {
    await setupGitRepoWithReadme(root);
    await mkdir(join(root, ".cycle/prompts"), { recursive: true });
    await writeFile(join(root, ".cycle/prompts/build.md"), "BUILD_STEP_PROMPT", "utf8");
    await writeFile(
      join(root, ".cycle/workflows.yml"),
      workflowYml("      - name: build\n        agent: claudecode\n        prompt: prompts/build.md\n"),
      "utf8",
    );

    const fake = join(bin, "claude");
    await writeFile(
      fake,
      `#!/bin/bash\nmkdir -p "${root}/src"\necho '// marker' > "${root}/src/dummy.ts"\ngit -C "${root}" add src/dummy.ts\nprintf '## Touched Files\\n- src/dummy.ts\\n'`,
      "utf8",
    );
    await chmod(fake, 0o755);

    const r = await runCycle(root, {
      issueId: "APPEND-3",
      title: "doc no step",
      workflow: "feature",
      env: { PATH: `${bin}:${process.env.PATH}`, CYCLE_BASE: "main" },
    });
    assert.equal(r.status, "ok");

    const buildMd = join(root, "docs/cycle", `${r.cycleId}-feature-doc-no-step`, "BUILD.md");
    const content = await readFile(buildMd, "utf8");
    assert.doesNotMatch(content, /- README\.md/, "README.md must not appear — no documentation step ran");
    assert.match(content, /- src\/dummy\.ts/, "src/dummy.ts must still be present");
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(bin, { recursive: true, force: true });
  }
});

test("runCycle: documentation step appends rename destination from R-prefix porcelain line", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-doc-rename-"));
  const bin = await mkdtemp(join(tmpdir(), "cycle-doc-rename-bin-"));
  try {
    await setupGitRepoWithReadme(root);
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

    const fakeBuild = join(bin, "claude-build");
    await writeFile(
      fakeBuild,
      `#!/bin/bash\nmkdir -p "${root}/src"\necho '// marker' > "${root}/src/dummy.ts"\ngit -C "${root}" add src/dummy.ts\nprintf '## Touched Files\\n- src/dummy.ts\\n'`,
      "utf8",
    );
    await chmod(fakeBuild, 0o755);

    const fakeDoc = join(bin, "claude-doc");
    await writeFile(
      fakeDoc,
      `#!/bin/bash\ngit -C "${root}" mv README.md RENAMED.md\nprintf 'Renamed README.md to RENAMED.md'`,
      "utf8",
    );
    await chmod(fakeDoc, 0o755);

    const fakeWrapper = join(bin, "claude");
    await writeFile(
      fakeWrapper,
      `#!/bin/bash\nfor last; do :; done\nif [[ "$last" == *DOCUMENTATION_STEP_PROMPT* ]]; then exec "${fakeDoc}" "$@"; fi\nexec "${fakeBuild}" "$@"\n`,
      "utf8",
    );
    await chmod(fakeWrapper, 0o755);

    const r = await runCycle(root, {
      issueId: "RENAME-1",
      title: "doc rename porcelain",
      workflow: "feature",
      env: { PATH: `${bin}:${process.env.PATH}`, CYCLE_BASE: "main" },
    });
    assert.equal(r.status, "ok");

    const buildMd = join(root, "docs/cycle", `${r.cycleId}-feature-doc-rename-porcelain`, "BUILD.md");
    const content = await readFile(buildMd, "utf8");
    assert.match(content, /## Touched Files/);
    assert.match(content, /- RENAMED\.md/, "RENAMED.md must appear as the rename destination");
    assert.doesNotMatch(content, /- README\.md/, "README.md must not appear — it is the rename source, not destination");
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(bin, { recursive: true, force: true });
  }
});

test("runCycle: documentation step with BUILD.md having no Touched Files section does not throw", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-doc-notf-"));
  const bin  = await mkdtemp(join(tmpdir(), "cycle-doc-notf-bin-"));
  try {
    await setupGitRepoWithReadme(root);
    await setupBuildDocWorkflow(root, bin, "Build complete. No section here.\\n");
    const r = await runCycle(root, {
      issueId: "NOTF-1",
      title: "doc no touched files section",
      workflow: "feature",
      env: { PATH: `${bin}:${process.env.PATH}`, CYCLE_BASE: "main" },
    });
    assert.equal(r.status, "ok");
    const log = await readFile(join(root, ".cycle/log.jsonl"), "utf8");
    const events = parseLog(log);
    const cycleEnd = expectExactlyOne(events, "cycle.end");
    assert.equal(cycleEnd.status, "ok");

    const buildMd = join(root, "docs/cycle", `${r.cycleId}-feature-doc-no-touched-files-section`, "BUILD.md");
    const content = await readFile(buildMd, "utf8");
    assert.doesNotMatch(content, /- README\.md/, "README.md must not appear — append skipped when no Touched Files section");
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(bin,  { recursive: true, force: true });
  }
});

test("runCycle: documentation step with no BUILD.md present does not throw; cycle.end ok", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-doc-nobuildmd-"));
  const bin = await mkdtemp(join(tmpdir(), "cycle-doc-nobuildmd-bin-"));
  try {
    await setupGitRepo(root);
    await mkdir(join(root, ".cycle/prompts"), { recursive: true });
    await writeFile(
      join(root, ".cycle/workflows.yml"),
      workflowYml("      - name: documentation\n        agent: claudecode\n        prompt: prompts/documentation.md\n"),
      "utf8",
    );
    await writeFile(join(root, ".cycle/prompts/documentation.md"), "DOCUMENTATION_STEP_PROMPT", "utf8");

    const fake = join(bin, "claude");
    await writeFile(fake, "#!/bin/bash\nprintf 'Updated docs'\n", "utf8");
    await chmod(fake, 0o755);

    const r = await runCycle(root, {
      issueId: "APPEND-4",
      title: "doc no build md",
      workflow: "feature",
      env: { PATH: `${bin}:${process.env.PATH}`, CYCLE_BASE: "main" },
    });
    assert.equal(r.status, "ok");

    const log = await readFile(join(root, ".cycle/log.jsonl"), "utf8");
    const events = parseLog(log);
    const cycleEnd = expectExactlyOne(events, "cycle.end");
    assert.equal(cycleEnd.status, "ok");
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(bin, { recursive: true, force: true });
  }
});

test("documentation.paths_appended emitted when paths are appended", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-doc-pa-emit-"));
  const bin = await mkdtemp(join(tmpdir(), "cycle-doc-pa-emit-bin-"));
  try {
    await setupGitRepoWithReadme(root);
    await setupBuildDocWorkflow(root, bin, "## Touched Files\\n- src/dummy.ts\\n");

    const r = await runCycle(root, {
      issueId: "PATHS-APPENDED-1",
      cycleId: "PATHS-APPENDED-1",
      title: "emit test",
      workflow: "feature",
      env: { PATH: `${bin}:${process.env.PATH}`, CYCLE_BASE: "main" },
    });
    assert.equal(r.status, "ok");

    const rawLog = await readFile(join(root, ".cycle/log.jsonl"), "utf8");
    const events = parseLog(rawLog);
    const ev = expectExactlyOne(events, "documentation.paths_appended");
    assert.equal(ev.cycle_id, "PATHS-APPENDED-1");
    assert.ok(Array.isArray(ev.appended));
    assert.ok((ev.appended as string[]).includes("README.md"));
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(bin, { recursive: true, force: true });
  }
});

test("documentation.paths_appended not emitted when toAppend is empty", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-doc-pa-noop-"));
  const bin = await mkdtemp(join(tmpdir(), "cycle-doc-pa-noop-bin-"));
  try {
    await setupGitRepoWithReadme(root);
    await setupBuildDocWorkflow(root, bin, "## Touched Files\\n- src/dummy.ts\\n- README.md\\n");

    const r = await runCycle(root, {
      issueId: "PATHS-APPENDED-2",
      title: "no-op test",
      workflow: "feature",
      env: { PATH: `${bin}:${process.env.PATH}`, CYCLE_BASE: "main" },
    });
    assert.equal(r.status, "ok");

    const rawLog = await readFile(join(root, ".cycle/log.jsonl"), "utf8");
    const events = parseLog(rawLog);
    const absent = events.filter((e: { event?: string }) => e.event === "documentation.paths_appended");
    assert.equal(absent.length, 0);
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(bin, { recursive: true, force: true });
  }
});

test("runCycle: documentation step appends under a present-but-empty Touched Files header (no bullets)", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-doc-empty-hdr-"));
  const bin = await mkdtemp(join(tmpdir(), "cycle-doc-empty-hdr-bin-"));
  try {
    await setupGitRepoWithReadme(root);
    // BUILD.md emits a `## Touched Files` header followed immediately by another
    // `##` section — header present, zero `- ` bullets. The doc step modifies
    // README.md (out of scope of the empty header) which must still be appended.
    await setupBuildDocWorkflow(root, bin, "## Touched Files\\n## Notes\\nbuild done\\n");

    const r = await runCycle(root, {
      issueId: "EMPTY-HDR-1",
      cycleId: "EMPTY-HDR-1",
      title: "doc empty header append",
      workflow: "feature",
      env: { PATH: `${bin}:${process.env.PATH}`, CYCLE_BASE: "main" },
    });
    assert.equal(r.status, "ok");

    const buildMd = join(root, "docs/cycle", `${r.cycleId}-feature-doc-empty-header-append`, "BUILD.md");
    const content = await readFile(buildMd, "utf8");
    assert.match(content, /## Touched Files/);
    assert.match(content, /- README\.md/, "discovered out-of-scope path must be appended under the empty header");

    const rawLog = await readFile(join(root, ".cycle/log.jsonl"), "utf8");
    const events = parseLog(rawLog);
    const ev = expectExactlyOne(events, "documentation.paths_appended");
    assert.equal(ev.cycle_id, "EMPTY-HDR-1");
    assert.ok((ev.appended as string[]).includes("README.md"));
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(bin, { recursive: true, force: true });
  }
});

test("runCycle: documentation step excludes pre-existing dirty paths staged by prior steps", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-doc-pre-"));
  const bin = await mkdtemp(join(tmpdir(), "cycle-doc-pre-bin-"));
  try {
    await setupGitRepoWithReadme(root);

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

    // Build fake: stages src/dummy.ts (declared) AND docs/extra.md (undeclared, simulating prior-step dirty file)
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

    // Doc fake: modifies only README.md
    const fakeDoc = join(bin, "claude-doc");
    await writeFile(
      fakeDoc,
      `#!/bin/bash\necho 'Updated.' >> "${root}/README.md"\nprintf 'Updated README.md'`,
      "utf8",
    );
    await chmod(fakeDoc, 0o755);

    const fakeWrapper = join(bin, "claude");
    await writeFile(
      fakeWrapper,
      `#!/bin/bash\nfor last; do :; done\nif [[ "$last" == *DOCUMENTATION_STEP_PROMPT* ]]; then exec "${fakeDoc}" "$@"; fi\nexec "${fakeBuild}" "$@"\n`,
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
