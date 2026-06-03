import { test } from "node:test";
import { strict as assert } from "node:assert";
import { mkdtemp, mkdir, writeFile, readFile, rm, chmod, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import {
  parseTouchedFilesSection,
  recoverTouchedFiles,
  runCycle,
} from "../../src/engine/run-cycle.ts";
import type { Logger } from "../../src/engine/log.ts";
import { expectExactlyOne } from "../helpers.ts";

function git(cwd: string, args: string[]) {
  const r = spawnSync("git", args, { cwd, encoding: "utf8" });
  if (r.status !== 0) throw new Error(`git ${args.join(" ")}: ${r.stderr}`);
  return r.stdout;
}

type Emitted = { event: string } & Record<string, unknown>;
function fakeLogger(): { log: Logger; events: Emitted[] } {
  const events: Emitted[] = [];
  const log: Logger = {
    async emit(event, fields) {
      events.push({ event, ...fields });
    },
  };
  return { log, events };
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

async function readTouched(artifactDir: string): Promise<{ files: string[] }> {
  const raw = await readFile(join(artifactDir, "touched.json"), "utf8");
  return JSON.parse(raw) as { files: string[] };
}

// ---------------------------------------------------------------------------
// parseTouchedFilesSection (pure)
// ---------------------------------------------------------------------------

test("parseTouchedFilesSection: parses bullets under the header", () => {
  const text = "## Summary\nx\n\n## Touched Files\n- src/a.ts\n-   src/b.ts\n";
  const set = parseTouchedFilesSection(text);
  assert.deepEqual([...set].sort(), ["src/a.ts", "src/b.ts"]);
});

test("parseTouchedFilesSection: absent header returns empty set", () => {
  assert.equal(parseTouchedFilesSection("## Summary\n- not touched\n").size, 0);
});

test("parseTouchedFilesSection: stops at the next ## header", () => {
  const text = "## Touched Files\n- src/a.ts\n## Next\n- src/should-not.ts\n";
  const set = parseTouchedFilesSection(text);
  assert.deepEqual([...set], ["src/a.ts"]);
});

// ---------------------------------------------------------------------------
// recoverTouchedFiles
// ---------------------------------------------------------------------------

test("recoverTouchedFiles: happy path recovers from BUILD.md + untracked files", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-recover-happy-"));
  try {
    await setupGitRepo(root);
    const artifactDir = join(root, "docs/cycle/0001-feature-x");
    await mkdir(artifactDir, { recursive: true });
    await writeFile(
      join(artifactDir, "BUILD.md"),
      "## Summary\nBuild.\n\n## Touched Files\n- src/a.ts\n- src/b.ts\n",
      "utf8",
    );
    // Make the declared files exist + untracked so git status lists them too.
    await writeFile(join(root, "src/a.ts"), "// a\n", "utf8");
    await writeFile(join(root, "src/b.ts"), "// b\n", "utf8");

    const { log, events } = fakeLogger();
    await recoverTouchedFiles(root, artifactDir, log, "0001");

    const content = await readTouched(artifactDir);
    assert.deepEqual(content.files, ["src/a.ts", "src/b.ts"]);
    const ev = expectExactlyOne(events, "touched.recovered");
    assert.equal(ev.source, "BUILD.md");
    assert.equal(ev.count, 2);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("recoverTouchedFiles: verify-only path (clean tree) recovers from declared set", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-recover-verify-"));
  try {
    await setupGitRepo(root);
    const artifactDir = join(root, "docs/cycle/0002-feature-x");
    await mkdir(artifactDir, { recursive: true });
    await writeFile(
      join(artifactDir, "BUILD.md"),
      "## Touched Files\n- src/committed.ts\n",
      "utf8",
    );
    // Commit the file so the working tree is clean (git status --porcelain empty).
    await writeFile(join(root, "src/committed.ts"), "// c\n", "utf8");
    git(root, ["add", "src/committed.ts"]);
    git(root, ["commit", "-m", "land"]);

    const { log, events } = fakeLogger();
    await recoverTouchedFiles(root, artifactDir, log, "0002");

    const content = await readTouched(artifactDir);
    assert.deepEqual(content.files, ["src/committed.ts"]);
    expectExactlyOne(events, "touched.recovered");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("recoverTouchedFiles: no BUILD.md, clean tree → touched_recovery_empty, file untouched", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-recover-nobuild-"));
  try {
    await setupGitRepo(root);
    const artifactDir = join(root, "docs/cycle/0003-feature-x");
    await mkdir(artifactDir, { recursive: true });

    const { log, events } = fakeLogger();
    await recoverTouchedFiles(root, artifactDir, log, "0003");

    const warn = expectExactlyOne(events, "engine.warning");
    assert.equal(warn.reason, "touched_recovery_empty");
    await assert.rejects(stat(join(artifactDir, "touched.json")));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("recoverTouchedFiles: BUILD.md without Touched Files header, clean tree → touched_recovery_empty", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-recover-noheader-"));
  try {
    await setupGitRepo(root);
    const artifactDir = join(root, "docs/cycle/0004-feature-x");
    await mkdir(artifactDir, { recursive: true });
    await writeFile(join(artifactDir, "BUILD.md"), "## Summary\nNo footprint here.\n", "utf8");

    const { log, events } = fakeLogger();
    await recoverTouchedFiles(root, artifactDir, log, "0004");

    const warn = expectExactlyOne(events, "engine.warning");
    assert.equal(warn.reason, "touched_recovery_empty");
    await assert.rejects(stat(join(artifactDir, "touched.json")));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("recoverTouchedFiles: already-populated touched.json is a no-op (no event, no clobber)", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-recover-populated-"));
  try {
    await setupGitRepo(root);
    const artifactDir = join(root, "docs/cycle/0005-feature-x");
    await mkdir(artifactDir, { recursive: true });
    const seeded = JSON.stringify({ files: ["src/x.ts"] }, null, 2) + "\n";
    await writeFile(join(artifactDir, "touched.json"), seeded, "utf8");
    await writeFile(join(artifactDir, "BUILD.md"), "## Touched Files\n- src/other.ts\n", "utf8");

    const { log, events } = fakeLogger();
    await recoverTouchedFiles(root, artifactDir, log, "0005");

    assert.equal(events.length, 0, "no event on populated-guard no-op");
    assert.equal(await readFile(join(artifactDir, "touched.json"), "utf8"), seeded);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("recoverTouchedFiles: write failure → touched_recovery_write_failed, no throw", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-recover-writefail-"));
  try {
    await setupGitRepo(root);
    const artifactDir = join(root, "docs/cycle/0006-feature-x");
    await mkdir(artifactDir, { recursive: true });
    await writeFile(join(artifactDir, "BUILD.md"), "## Touched Files\n- src/a.ts\n", "utf8");
    // Make touched.json a directory so writeFile(file) fails with EISDIR — works
    // even as root (chmod is bypassed by root, so a perms-based failure is unreliable).
    await mkdir(join(artifactDir, "touched.json"), { recursive: true });

    const { log, events } = fakeLogger();
    await recoverTouchedFiles(root, artifactDir, log, "0006");

    const warn = expectExactlyOne(events, "engine.warning");
    assert.equal(warn.reason, "touched_recovery_write_failed");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("recoverTouchedFiles: isDenied paths in BUILD.md are excluded", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-recover-denied-"));
  try {
    await setupGitRepo(root);
    const artifactDir = join(root, "docs/cycle/0007-feature-x");
    await mkdir(artifactDir, { recursive: true });
    await writeFile(
      join(artifactDir, "BUILD.md"),
      "## Touched Files\n- src/keep.ts\n- dist/bundle.js\n",
      "utf8",
    );

    const { log, events } = fakeLogger();
    await recoverTouchedFiles(root, artifactDir, log, "0007");

    const content = await readTouched(artifactDir);
    assert.deepEqual(content.files, ["src/keep.ts"]);
    expectExactlyOne(events, "touched.recovered");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("recoverTouchedFiles: git status non-zero contributes nothing but BUILD.md still recovers", async () => {
  // cwd is not a git repo → git status --porcelain exits non-zero.
  const nonRepo = await mkdtemp(join(tmpdir(), "cycle-recover-nonrepo-"));
  try {
    const artifactDir = join(nonRepo, "artifacts");
    await mkdir(artifactDir, { recursive: true });
    await writeFile(join(artifactDir, "BUILD.md"), "## Touched Files\n- src/a.ts\n", "utf8");

    const { log, events } = fakeLogger();
    await recoverTouchedFiles(nonRepo, artifactDir, log, "0008");

    const content = await readTouched(artifactDir);
    assert.deepEqual(content.files, ["src/a.ts"]);
    expectExactlyOne(events, "touched.recovered");
  } finally {
    await rm(nonRepo, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// runCycle wiring (integration + regression)
// ---------------------------------------------------------------------------

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

test("runCycle: resume past build recovers touched.json from BUILD.md (exactly one touched.recovered)", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-recover-resume-"));
  const bin = await mkdtemp(join(tmpdir(), "cycle-recover-resume-bin-"));
  try {
    await setupGitRepo(root);

    await mkdir(join(root, ".cycle/prompts"), { recursive: true });
    await writeFile(join(root, ".cycle/prompts/build.md"), "BUILD_PROMPT", "utf8");
    await writeFile(join(root, ".cycle/prompts/review.md"), "REVIEW_PROMPT", "utf8");
    await writeFile(
      join(root, ".cycle/workflows.yml"),
      workflowYml(
        "      - name: build\n        agent: claudecode\n        prompt: prompts/build.md\n" +
        "      - name: review\n        agent: claudecode\n        prompt: prompts/review.md\n",
      ),
      "utf8",
    );

    // Seed the artifact dir as if build already ran, with a declared footprint.
    const artifactDir = join(root, "docs/cycle/0010-feature-resume-past-build");
    await mkdir(artifactDir, { recursive: true });
    await writeFile(
      join(artifactDir, "BUILD.md"),
      "## Summary\nBuilt earlier.\n\n## Touched Files\n- src/recovered.ts\n",
      "utf8",
    );

    // Fake agent for the review step (resume entry) — emits a non-empty REVIEW.md.
    const fakeClaude = join(bin, "claude");
    await writeFile(fakeClaude, `#!/bin/bash\nprintf '## Review\\nLooks good.\\n'`, "utf8");
    await chmod(fakeClaude, 0o755);

    const r = await runCycle(root, {
      issueId: "RESUME-1",
      title: "resume past build",
      cycleId: "0010",
      workflow: "feature",
      resume: { startStepIndex: 1 }, // past build (index 0)
      env: { PATH: `${bin}:${process.env.PATH}`, CYCLE_BASE: "main" },
    });
    assert.equal(r.status, "ok");

    const content = await readTouched(artifactDir);
    assert.deepEqual(content.files, ["src/recovered.ts"]);

    const log = await readFile(join(root, ".cycle/log.jsonl"), "utf8");
    const recovered = log.split("\n").filter(Boolean).map((l) => JSON.parse(l))
      .filter((e: { event?: string }) => e.event === "touched.recovered");
    assert.equal(recovered.length, 1, "exactly one touched.recovered");
    assert.equal(recovered[0].source, "BUILD.md");
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(bin, { recursive: true, force: true });
  }
});

test("runCycle: normal (non-resume) build writes touched.json without a touched.recovered event", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-recover-normal-"));
  const bin = await mkdtemp(join(tmpdir(), "cycle-recover-normal-bin-"));
  try {
    await setupGitRepo(root);

    await mkdir(join(root, ".cycle/prompts"), { recursive: true });
    await writeFile(join(root, ".cycle/prompts/build.md"), "BUILD_PROMPT", "utf8");
    await writeFile(
      join(root, ".cycle/workflows.yml"),
      workflowYml("      - name: build\n        agent: claudecode\n        prompt: prompts/build.md\n"),
      "utf8",
    );

    const fakeClaude = join(bin, "claude");
    await writeFile(
      fakeClaude,
      `#!/bin/bash\nmkdir -p "${root}/src"\necho '// new' > "${root}/src/n.ts"\ngit -C "${root}" add src/n.ts\nprintf '## Summary\\nDone.\\n\\n## Touched Files\\n- src/n.ts\\n'`,
      "utf8",
    );
    await chmod(fakeClaude, 0o755);

    const r = await runCycle(root, {
      issueId: "NORMAL-1",
      title: "normal build no recovery",
      cycleId: "0011",
      workflow: "feature",
      env: { PATH: `${bin}:${process.env.PATH}`, CYCLE_BASE: "main" },
    });
    assert.equal(r.status, "ok");

    const content = await readTouched(join(root, "docs/cycle/0011-feature-normal-build-no-recovery"));
    assert.ok(content.files.includes("src/n.ts"));

    const log = await readFile(join(root, ".cycle/log.jsonl"), "utf8");
    const recovered = log.split("\n").filter(Boolean).map((l) => JSON.parse(l))
      .filter((e: { event?: string }) => e.event === "touched.recovered");
    assert.equal(recovered.length, 0, "no touched.recovered on the normal path");
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(bin, { recursive: true, force: true });
  }
});
