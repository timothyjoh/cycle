import { test } from "node:test";
import { strict as assert } from "node:assert";
import { mkdtemp, mkdir, writeFile, readFile, rm, chmod, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { runCycle, findPriorBuildHeadSha, findPriorStepHeadSha } from "../../src/engine/run-cycle.ts";

function git(cwd: string, args: string[]) {
  const r = spawnSync("git", args, { cwd, encoding: "utf8" });
  if (r.status !== 0) throw new Error(`git ${args.join(" ")}: ${r.stderr}`);
  return r.stdout;
}

function workflowYmlBranch(stepsBody: string): string {
  return `engine:
  max_consecutive_failures: 2
  base_branch: main
  commit:
    mode: worktree-pr
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

test("runs a 2-step workflow end-to-end and writes log + artifacts", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-test-"));
  const bin = await mkdtemp(join(tmpdir(), "cycle-bin-"));
  try {
    git(root, ["init", "-b", "main"]);
    git(root, ["config", "user.email", "t@t"]);
    git(root, ["config", "user.name", "t"]);
    git(root, ["commit", "--allow-empty", "-m", "init"]);

    await mkdir(join(root, ".cycle/prompts"), { recursive: true });
    await mkdir(join(root, ".cycle/scripts"), { recursive: true });

    await writeFile(join(root, ".cycle/workflows.yml"),
      workflowYml(`      - name: spec
        agent: claudecode
        prompt: prompts/spec.md
      - name: note
        agent: bash
        command: scripts/note.sh
`), "utf8");
    await writeFile(join(root, ".cycle/prompts/spec.md"), "spec body", "utf8");
    const note = join(root, ".cycle/scripts/note.sh");
    await writeFile(note, "#!/bin/bash\necho NOTED ${CYCLE_ID} ${CYCLE_TITLE}\n", "utf8");
    await chmod(note, 0o755);

    const fake = join(bin, "claude");
    await writeFile(fake, "#!/bin/bash\nyes FAKED | head -50\n", "utf8");
    await chmod(fake, 0o755);

    const r = await runCycle(root, {
      issueId: "TEST-1",
      title: "spec the thing",
      workflow: "feature",
      env: { PATH: `${bin}:${process.env.PATH}`, CYCLE_BASE: "main" },
    });
    assert.equal(r.cycleId, "0001");
    assert.equal(r.status, "ok");

    const log = await readFile(join(root, ".cycle/log.jsonl"), "utf8");
    assert.match(log, /"event":"cycle.start"/);
    assert.match(log, /"event":"step.start","cycle_id":"0001","step":"spec"/);
    assert.match(log, /"event":"step.end","cycle_id":"0001","step":"spec","status":"ok"/);
    assert.match(log, /"event":"cycle.end","cycle_id":"0001","status":"ok"/);
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(bin, { recursive: true, force: true });
  }
});

test("checks out base branch after successful cycle", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-test-"));
  const bin = await mkdtemp(join(tmpdir(), "cycle-bin-"));
  try {
    git(root, ["init", "-b", "main"]);
    git(root, ["config", "user.email", "t@t"]);
    git(root, ["config", "user.name", "t"]);
    git(root, ["commit", "--allow-empty", "-m", "init"]);

    await mkdir(join(root, ".cycle/prompts"), { recursive: true });

    await writeFile(join(root, ".cycle/workflows.yml"),
      workflowYmlBranch(`      - name: spec
        agent: claudecode
        prompt: prompts/spec.md
`), "utf8");
    await writeFile(join(root, ".cycle/prompts/spec.md"), "spec body", "utf8");

    const fake = join(bin, "claude");
    await writeFile(fake, "#!/bin/bash\nyes FAKED | head -50\n", "utf8");
    await chmod(fake, 0o755);

    const r = await runCycle(root, {
      issueId: "TEST-1",
      title: "spec the thing",
      workflow: "feature",
      env: { PATH: `${bin}:${process.env.PATH}`, CYCLE_BASE: "main" },
    });
    assert.equal(r.status, "ok");

    const head = git(root, ["rev-parse", "--abbrev-ref", "HEAD"]).trim();
    assert.equal(head, "main");

    const log = await readFile(join(root, ".cycle/log.jsonl"), "utf8");
    const lines = log.trim().split("\n");
    const endIdx = lines.findIndex(l => l.includes('"event":"cycle.end"'));
    const checkoutIdx = lines.findIndex(l => l.includes('"event":"cycle.checkout"'));
    assert.ok(endIdx !== -1 && checkoutIdx !== -1, "both events emitted");
    assert.ok(endIdx < checkoutIdx, `cycle.end (line ${endIdx}) must precede cycle.checkout (line ${checkoutIdx})`);
    assert.match(log, /"event":"cycle.end","cycle_id":"0001","status":"ok"/);
    assert.match(log, /"event":"cycle.checkout","cycle_id":"0001","status":"ok","base":"main","head_before":"cycle\/feature\/spec-the-thing"/);
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(bin, { recursive: true, force: true });
  }
});

test("checks out base branch after failed cycle", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-test-"));
  const bin = await mkdtemp(join(tmpdir(), "cycle-bin-"));
  try {
    git(root, ["init", "-b", "main"]);
    git(root, ["config", "user.email", "t@t"]);
    git(root, ["config", "user.name", "t"]);
    git(root, ["commit", "--allow-empty", "-m", "init"]);

    await mkdir(join(root, ".cycle/prompts"), { recursive: true });
    await mkdir(join(root, ".cycle/scripts"), { recursive: true });

    await writeFile(join(root, ".cycle/workflows.yml"),
      workflowYmlBranch(`      - name: spec
        agent: claudecode
        prompt: prompts/spec.md
      - name: boom
        agent: bash
        command: scripts/boom.sh
`), "utf8");
    await writeFile(join(root, ".cycle/prompts/spec.md"), "spec body", "utf8");
    const boom = join(root, ".cycle/scripts/boom.sh");
    await writeFile(boom, "#!/bin/bash\necho boom\nexit 1\n", "utf8");
    await chmod(boom, 0o755);

    const fake = join(bin, "claude");
    await writeFile(fake, "#!/bin/bash\nyes FAKED | head -50\n", "utf8");
    await chmod(fake, 0o755);

    const r = await runCycle(root, {
      issueId: "TEST-1",
      title: "spec the thing",
      workflow: "feature",
      env: { PATH: `${bin}:${process.env.PATH}`, CYCLE_BASE: "main" },
    });
    assert.equal(r.status, "failed");
    assert.equal(r.failingStep, "boom");

    const head = git(root, ["rev-parse", "--abbrev-ref", "HEAD"]).trim();
    assert.equal(head, "main");

    const log = await readFile(join(root, ".cycle/log.jsonl"), "utf8");
    const lines = log.trim().split("\n");
    const endIdx = lines.findIndex(l => l.includes('"event":"cycle.end"'));
    const checkoutIdx = lines.findIndex(l => l.includes('"event":"cycle.checkout"'));
    assert.ok(endIdx !== -1 && checkoutIdx !== -1, "both events emitted");
    assert.ok(endIdx < checkoutIdx, `cycle.end (line ${endIdx}) must precede cycle.checkout (line ${checkoutIdx})`);
    assert.match(log, /"event":"cycle.end","cycle_id":"0001","status":"failed","failing_step":"boom"/);
    assert.match(log, /"event":"cycle.checkout","cycle_id":"0001","status":"ok","base":"main","head_before":"cycle\/feature\/spec-the-thing"/);
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(bin, { recursive: true, force: true });
  }
});

test("injects CYCLE_ISSUE_ID into bash step env", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-test-"));
  const bin = await mkdtemp(join(tmpdir(), "cycle-bin-"));
  try {
    git(root, ["init", "-b", "main"]);
    git(root, ["config", "user.email", "t@t"]);
    git(root, ["config", "user.name", "t"]);
    git(root, ["commit", "--allow-empty", "-m", "init"]);

    await mkdir(join(root, ".cycle/scripts"), { recursive: true });
    await writeFile(
      join(root, ".cycle/workflows.yml"),
      workflowYml(`      - name: echo
        agent: bash
        command: scripts/echo.sh
`),
      "utf8",
    );
    const echo = join(root, ".cycle/scripts/echo.sh");
    await writeFile(echo, "#!/bin/bash\necho ISSUE=${CYCLE_ISSUE_ID:-MISSING}\n", "utf8");
    await chmod(echo, 0o755);

    const fake = join(bin, "claude");
    await writeFile(fake, "#!/bin/bash\nyes FAKED | head -50\n", "utf8");
    await chmod(fake, 0o755);

    const r = await runCycle(root, {
      issueId: "ISSUE-42",
      title: "echo env",
      workflow: "feature",
      env: { PATH: `${bin}:${process.env.PATH}`, CYCLE_BASE: "main" },
    });
    assert.equal(r.status, "ok");
    // The bash step's stdout isn't written to disk by execBashStep — assert via log
    // that the step completed ok, then verify env reached the shell by re-running
    // with a check script that exits non-zero when the value is missing.
    const log = await readFile(join(root, ".cycle/log.jsonl"), "utf8");
    assert.match(log, /"event":"step.end","cycle_id":"0001","step":"echo","status":"ok"/);

    // Second cycle: assert echo.sh exits non-zero when CYCLE_ISSUE_ID is empty
    // (the env injection actually fires only when opts.issueId is non-empty).
    const check = join(root, ".cycle/scripts/check.sh");
    await writeFile(
      check,
      "#!/bin/bash\nset -e\n[ -n \"${CYCLE_ISSUE_ID:-}\" ] || { echo MISSING_ID >&2; exit 7; }\necho \"$CYCLE_ISSUE_ID\"\n",
      "utf8",
    );
    await chmod(check, 0o755);
    await writeFile(
      join(root, ".cycle/workflows.yml"),
      workflowYml(`      - name: check
        agent: bash
        command: scripts/check.sh
`),
      "utf8",
    );
    const r2 = await runCycle(root, {
      issueId: "ISSUE-99",
      title: "check env",
      workflow: "feature",
      env: { PATH: `${bin}:${process.env.PATH}`, CYCLE_BASE: "main" },
    });
    assert.equal(r2.status, "ok", "check.sh should see CYCLE_ISSUE_ID and exit 0");
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(bin, { recursive: true, force: true });
  }
});

test("logs cycle.checkout status=failed when base branch does not exist", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-test-"));
  const bin = await mkdtemp(join(tmpdir(), "cycle-bin-"));
  try {
    git(root, ["init", "-b", "main"]);
    git(root, ["config", "user.email", "t@t"]);
    git(root, ["config", "user.name", "t"]);
    git(root, ["commit", "--allow-empty", "-m", "init"]);

    await mkdir(join(root, ".cycle/prompts"), { recursive: true });
    await writeFile(join(root, ".cycle/workflows.yml"),
      workflowYmlBranch(`      - name: spec
        agent: claudecode
        prompt: prompts/spec.md
`), "utf8");
    await writeFile(join(root, ".cycle/prompts/spec.md"), "spec body", "utf8");

    const fake = join(bin, "claude");
    await writeFile(fake, "#!/bin/bash\nyes FAKED | head -50\n", "utf8");
    await chmod(fake, 0o755);

    const r = await runCycle(root, {
      issueId: "TEST-1",
      title: "spec the thing",
      workflow: "feature",
      env: { PATH: `${bin}:${process.env.PATH}`, CYCLE_BASE: "no-such-base" },
    });
    assert.equal(r.status, "ok");

    const head = git(root, ["rev-parse", "--abbrev-ref", "HEAD"]).trim();
    assert.equal(head, "cycle/feature/spec-the-thing");

    const log = await readFile(join(root, ".cycle/log.jsonl"), "utf8");
    assert.match(log, /"event":"cycle.checkout","cycle_id":"0001","status":"failed","base":"no-such-base"/);
    assert.match(log, /"reason":"git checkout no-such-base failed:/);
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(bin, { recursive: true, force: true });
  }
});

test("pulls origin/<CYCLE_BASE> between cycles so second cycle branches off refreshed base", async () => {
  const originRoot = await mkdtemp(join(tmpdir(), "cycle-origin-"));
  const workRoot = await mkdtemp(join(tmpdir(), "cycle-test-"));
  const bin = await mkdtemp(join(tmpdir(), "cycle-bin-"));
  try {
    git(originRoot, ["init", "-b", "main"]);
    git(originRoot, ["config", "user.email", "t@t"]);
    git(originRoot, ["config", "user.name", "t"]);
    git(originRoot, ["config", "receive.denyCurrentBranch", "ignore"]);
    git(originRoot, ["commit", "--allow-empty", "-m", "init"]);

    // Clone origin into workRoot. Remove the empty mkdtemp dir first so clone can create it.
    await rm(workRoot, { recursive: true, force: true });
    const clone = spawnSync("git", ["clone", originRoot, workRoot], { encoding: "utf8" });
    if (clone.status !== 0) throw new Error(`clone failed: ${clone.stderr}`);
    git(workRoot, ["config", "user.email", "t@t"]);
    git(workRoot, ["config", "user.name", "t"]);

    await mkdir(join(workRoot, ".cycle/prompts"), { recursive: true });
    await writeFile(join(workRoot, ".cycle/workflows.yml"),
      workflowYmlBranch(`      - name: spec
        agent: claudecode
        prompt: prompts/spec.md
`), "utf8");
    await writeFile(join(workRoot, ".cycle/prompts/spec.md"), "spec body", "utf8");

    const fake = join(bin, "claude");
    await writeFile(fake, "#!/bin/bash\nyes FAKED | head -50\n", "utf8");
    await chmod(fake, 0o755);

    const sharedEnv = { PATH: `${bin}:${process.env.PATH}`, CYCLE_BASE: "main" };

    // Advance origin BEFORE cycle 1 finishes so cycle 1's post-cycle pull
    // moves local main forward. (Mirrors the real bug: a prior cycle's PR
    // gets merged remotely before the next cycle starts locally.)
    git(originRoot, ["commit", "--allow-empty", "-m", "advance"]);
    const originTip = git(originRoot, ["rev-parse", "main"]).trim();
    const localBeforeCycle1 = git(workRoot, ["rev-parse", "main"]).trim();
    assert.notEqual(localBeforeCycle1, originTip);

    const r1 = await runCycle(workRoot, { issueId: "T1", title: "first", workflow: "feature", env: sharedEnv });
    assert.equal(r1.status, "ok");

    // After cycle 1's finally-block pull, local main must equal origin tip.
    const localMainAfterCycle1 = git(workRoot, ["rev-parse", "main"]).trim();
    assert.equal(localMainAfterCycle1, originTip, "local main refreshed to origin tip after cycle 1 pull");

    const r2 = await runCycle(workRoot, { issueId: "T2", title: "second", workflow: "feature", env: sharedEnv });
    assert.equal(r2.status, "ok");

    // Cycle 2's branch must descend from the refreshed origin tip, not the stale pre-pull SHA.
    const cycle2Branch = "cycle/feature/second";
    const mergeBase = git(workRoot, ["merge-base", cycle2Branch, "main"]).trim();
    assert.equal(mergeBase, originTip,
      "cycle 2 branched from refreshed main, not the stale local tip");

    const log = await readFile(join(workRoot, ".cycle/log.jsonl"), "utf8");
    assert.match(log, /"event":"cycle.base_pull","cycle_id":"0001","status":"ok","base":"main"/);
    assert.match(log, /"event":"cycle.base_pull","cycle_id":"0002","status":"ok","base":"main"/);
  } finally {
    await rm(originRoot, { recursive: true, force: true });
    await rm(workRoot, { recursive: true, force: true });
    await rm(bin, { recursive: true, force: true });
  }
});

test("logs cycle.base_pull status=failed when origin remote is missing", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-test-"));
  const bin = await mkdtemp(join(tmpdir(), "cycle-bin-"));
  try {
    git(root, ["init", "-b", "main"]);
    git(root, ["config", "user.email", "t@t"]);
    git(root, ["config", "user.name", "t"]);
    git(root, ["commit", "--allow-empty", "-m", "init"]);

    await mkdir(join(root, ".cycle/prompts"), { recursive: true });
    await writeFile(join(root, ".cycle/workflows.yml"),
      workflowYmlBranch(`      - name: spec
        agent: claudecode
        prompt: prompts/spec.md
`), "utf8");
    await writeFile(join(root, ".cycle/prompts/spec.md"), "spec body", "utf8");

    const fake = join(bin, "claude");
    await writeFile(fake, "#!/bin/bash\nyes FAKED | head -50\n", "utf8");
    await chmod(fake, 0o755);

    const r = await runCycle(root, {
      issueId: "TEST-1",
      title: "spec the thing",
      workflow: "feature",
      env: { PATH: `${bin}:${process.env.PATH}`, CYCLE_BASE: "main" },
    });
    assert.equal(r.status, "ok");

    const log = await readFile(join(root, ".cycle/log.jsonl"), "utf8");
    assert.match(log, /"event":"cycle.checkout","cycle_id":"0001","status":"ok","base":"main"/);
    assert.match(log, /"event":"cycle.base_pull","cycle_id":"0001","status":"failed","base":"main"/);
    assert.match(log, /"reason":"git fetch origin main failed:/);
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(bin, { recursive: true, force: true });
  }
});

test("honors cycleId opt when caller provides it", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-test-"));
  const bin = await mkdtemp(join(tmpdir(), "cycle-bin-"));
  try {
    git(root, ["init", "-b", "main"]);
    git(root, ["config", "user.email", "t@t"]);
    git(root, ["config", "user.name", "t"]);
    git(root, ["commit", "--allow-empty", "-m", "init"]);

    await mkdir(join(root, ".cycle/scripts"), { recursive: true });
    await writeFile(
      join(root, ".cycle/workflows.yml"),
      workflowYml(`      - name: noop
        agent: bash
        command: scripts/noop.sh
`),
      "utf8",
    );
    const noop = join(root, ".cycle/scripts/noop.sh");
    await writeFile(noop, "#!/bin/bash\nexit 0\n", "utf8");
    await chmod(noop, 0o755);

    const fake = join(bin, "claude");
    await writeFile(fake, "#!/bin/bash\nyes FAKED | head -50\n", "utf8");
    await chmod(fake, 0o755);

    const r = await runCycle(root, {
      cycleId: "0042",
      issueId: "TEST-1",
      title: "explicit id",
      workflow: "feature",
      env: { PATH: `${bin}:${process.env.PATH}`, CYCLE_BASE: "main" },
    });
    assert.equal(r.cycleId, "0042");
    const log = await readFile(join(root, ".cycle/log.jsonl"), "utf8");
    assert.match(log, /"cycle_id":"0042"/);
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(bin, { recursive: true, force: true });
  }
});

test("resume mode skips cycle.start, calls checkoutCycleBranch, starts at startStepIndex", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-test-"));
  const bin = await mkdtemp(join(tmpdir(), "cycle-bin-"));
  try {
    git(root, ["init", "-b", "main"]);
    git(root, ["config", "user.email", "t@t"]);
    git(root, ["config", "user.name", "t"]);
    git(root, ["commit", "--allow-empty", "-m", "init"]);

    await mkdir(join(root, ".cycle/prompts"), { recursive: true });
    await mkdir(join(root, ".cycle/scripts"), { recursive: true });
    const counter = join(bin, "counter.txt");
    await writeFile(counter, "0", "utf8");

    await writeFile(join(root, ".cycle/workflows.yml"),
      workflowYml(`      - name: spec
        agent: claudecode
        prompt: prompts/spec.md
      - name: build
        agent: bash
        command: scripts/build.sh
      - name: verify
        agent: bash
        command: scripts/verify.sh
`), "utf8");
    await writeFile(join(root, ".cycle/prompts/spec.md"), "spec body", "utf8");
    const buildScript = join(root, ".cycle/scripts/build.sh");
    await writeFile(buildScript, "#!/bin/bash\necho build\n", "utf8");
    await chmod(buildScript, 0o755);
    const verifyScript = join(root, ".cycle/scripts/verify.sh");
    await writeFile(verifyScript, "#!/bin/bash\necho verify\n", "utf8");
    await chmod(verifyScript, 0o755);

    // Pre-create the cycle branch (as if a prior crashed cycle had started).
    git(root, ["checkout", "-b", "cycle/feature/resume-me"]);
    git(root, ["checkout", "main"]);

    const fake = join(bin, "claude");
    await writeFile(fake,
      `#!/bin/bash\nn=$(cat "${counter}")\nn=$((n+1))\necho -n "$n" > "${counter}"\necho CLAUDE_CALL_$n\n`,
      "utf8");
    await chmod(fake, 0o755);

    const r = await runCycle(root, {
      cycleId: "0042",
      issueId: "TEST-1",
      title: "resume me",
      workflow: "feature",
      resume: { startStepIndex: 1 },
      env: { PATH: `${bin}:${process.env.PATH}`, CYCLE_BASE: "main" },
    });
    assert.equal(r.cycleId, "0042");
    assert.equal(r.status, "ok");

    const log = await readFile(join(root, ".cycle/log.jsonl"), "utf8");
    assert.doesNotMatch(log, /"event":"cycle.start"/);
    assert.match(log, /"event":"cycle.resume","cycle_id":"0042","workflow":"feature","title":"resume me","issue_id":"TEST-1","start_step_index":1/);
    assert.doesNotMatch(log, /"event":"step.start","cycle_id":"0042","step":"spec"/);
    assert.match(log, /"event":"step.start","cycle_id":"0042","step":"build"/);
    assert.match(log, /"event":"step.start","cycle_id":"0042","step":"verify"/);
    assert.match(log, /"event":"cycle.end","cycle_id":"0042","status":"ok"/);

    // Claude (spec step) must not have been invoked under resume.
    const final = await readFile(counter, "utf8");
    assert.equal(final, "0", "claude not invoked when spec is skipped");
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(bin, { recursive: true, force: true });
  }
});

test("resume mode fails cleanly when cycle branch is missing (no cycle.end emitted)", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-test-"));
  const bin = await mkdtemp(join(tmpdir(), "cycle-bin-"));
  try {
    git(root, ["init", "-b", "main"]);
    git(root, ["config", "user.email", "t@t"]);
    git(root, ["config", "user.name", "t"]);
    git(root, ["commit", "--allow-empty", "-m", "init"]);

    await mkdir(join(root, ".cycle/prompts"), { recursive: true });
    await writeFile(join(root, ".cycle/workflows.yml"),
      workflowYmlBranch(`      - name: spec
        agent: claudecode
        prompt: prompts/spec.md
`), "utf8");
    await writeFile(join(root, ".cycle/prompts/spec.md"), "spec body", "utf8");

    const fake = join(bin, "claude");
    await writeFile(fake, "#!/bin/bash\nyes FAKED | head -50\n", "utf8");
    await chmod(fake, 0o755);

    await assert.rejects(
      () => runCycle(root, {
        cycleId: "0042",
        issueId: "TEST-1",
        title: "no branch",
        workflow: "feature",
        resume: { startStepIndex: 0 },
        env: { PATH: `${bin}:${process.env.PATH}`, CYCLE_BASE: "main" },
      }),
      (err: Error) => /git checkout cycle\/feature\/no-branch failed/.test(err.message),
    );

    const log = await readFile(join(root, ".cycle/log.jsonl"), "utf8");
    assert.doesNotMatch(log, /"event":"cycle.start"/);
    assert.match(log, /"event":"cycle.resume"/);
    assert.doesNotMatch(log, /"event":"cycle.end"/);
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(bin, { recursive: true, force: true });
  }
});

test("resume with startStepIndex == steps.length emits cycle.end ok and runs no steps", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-test-"));
  const bin = await mkdtemp(join(tmpdir(), "cycle-bin-"));
  try {
    git(root, ["init", "-b", "main"]);
    git(root, ["config", "user.email", "t@t"]);
    git(root, ["config", "user.name", "t"]);
    git(root, ["commit", "--allow-empty", "-m", "init"]);

    await mkdir(join(root, ".cycle/prompts"), { recursive: true });
    await mkdir(join(root, ".cycle/scripts"), { recursive: true });
    await writeFile(join(root, ".cycle/workflows.yml"),
      workflowYml(`      - name: spec
        agent: claudecode
        prompt: prompts/spec.md
      - name: build
        agent: bash
        command: scripts/build.sh
`), "utf8");
    await writeFile(join(root, ".cycle/prompts/spec.md"), "spec body", "utf8");
    const buildScript = join(root, ".cycle/scripts/build.sh");
    await writeFile(buildScript, "#!/bin/bash\necho build\nexit 7\n", "utf8");
    await chmod(buildScript, 0o755);

    git(root, ["checkout", "-b", "cycle/feature/done-already"]);
    git(root, ["checkout", "main"]);

    const fake = join(bin, "claude");
    await writeFile(fake, "#!/bin/bash\nexit 1\n", "utf8");
    await chmod(fake, 0o755);

    const r = await runCycle(root, {
      cycleId: "0099",
      issueId: "TEST-1",
      title: "done already",
      workflow: "feature",
      resume: { startStepIndex: 2 },
      env: { PATH: `${bin}:${process.env.PATH}`, CYCLE_BASE: "main" },
    });
    assert.equal(r.status, "ok");

    const log = await readFile(join(root, ".cycle/log.jsonl"), "utf8");
    assert.doesNotMatch(log, /"event":"step.start"/);
    assert.match(log, /"event":"cycle.end","cycle_id":"0099","status":"ok"/);
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(bin, { recursive: true, force: true });
  }
});

test("logs cycle.base_pull status=skipped when prior checkout failed", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-test-"));
  const bin = await mkdtemp(join(tmpdir(), "cycle-bin-"));
  try {
    git(root, ["init", "-b", "main"]);
    git(root, ["config", "user.email", "t@t"]);
    git(root, ["config", "user.name", "t"]);
    git(root, ["commit", "--allow-empty", "-m", "init"]);

    await mkdir(join(root, ".cycle/prompts"), { recursive: true });
    await writeFile(join(root, ".cycle/workflows.yml"),
      workflowYmlBranch(`      - name: spec
        agent: claudecode
        prompt: prompts/spec.md
`), "utf8");
    await writeFile(join(root, ".cycle/prompts/spec.md"), "spec body", "utf8");

    const fake = join(bin, "claude");
    await writeFile(fake, "#!/bin/bash\nyes FAKED | head -50\n", "utf8");
    await chmod(fake, 0o755);

    const r = await runCycle(root, {
      issueId: "TEST-1",
      title: "spec the thing",
      workflow: "feature",
      env: { PATH: `${bin}:${process.env.PATH}`, CYCLE_BASE: "no-such-base" },
    });
    assert.equal(r.status, "ok");

    const log = await readFile(join(root, ".cycle/log.jsonl"), "utf8");
    assert.match(log, /"event":"cycle.checkout","cycle_id":"0001","status":"failed","base":"no-such-base"/);
    assert.match(log, /"event":"cycle.base_pull","cycle_id":"0001","status":"skipped","base":"no-such-base","reason":"checkout failed"/);
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(bin, { recursive: true, force: true });
  }
});

// =====================================================================
// Build-step restart policy (cycle 0040): head_sha capture + resume reset
// =====================================================================

test("findPriorBuildHeadSha: returns null when .cycle/log.jsonl is missing", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-test-"));
  try {
    const got = await findPriorBuildHeadSha(root, "0042");
    assert.equal(got, null);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("findPriorBuildHeadSha: returns 'missing' when prior build step.start has no head_sha", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-test-"));
  try {
    await mkdir(join(root, ".cycle"), { recursive: true });
    const lines = [
      JSON.stringify({ event: "step.start", cycle_id: "0042", step: "build", agent: "claudecode" }),
    ];
    await writeFile(join(root, ".cycle/log.jsonl"), lines.join("\n") + "\n", "utf8");
    const got = await findPriorBuildHeadSha(root, "0042");
    assert.equal(got, "missing");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("findPriorBuildHeadSha: returns the SHA when present and skips garbage lines", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-test-"));
  try {
    await mkdir(join(root, ".cycle"), { recursive: true });
    const lines = [
      "not json",
      "",
      JSON.stringify({ event: "step.start", cycle_id: "0042", step: "spec" }),
      JSON.stringify({ event: "step.start", cycle_id: "0042", step: "build", agent: "claudecode", head_sha: "abcdef1234567890abcdef1234567890abcdef12" }),
      "{still garbage",
    ];
    await writeFile(join(root, ".cycle/log.jsonl"), lines.join("\n") + "\n", "utf8");
    const got = await findPriorBuildHeadSha(root, "0042");
    assert.equal(got, "abcdef1234567890abcdef1234567890abcdef12");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("findPriorBuildHeadSha: returns null when no matching build step.start exists for cycle", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-test-"));
  try {
    await mkdir(join(root, ".cycle"), { recursive: true });
    const lines = [
      JSON.stringify({ event: "step.start", cycle_id: "0099", step: "build", head_sha: "abc" }),
      JSON.stringify({ event: "step.start", cycle_id: "0042", step: "spec" }),
    ];
    await writeFile(join(root, ".cycle/log.jsonl"), lines.join("\n") + "\n", "utf8");
    const got = await findPriorBuildHeadSha(root, "0042");
    assert.equal(got, null);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("findPriorStepHeadSha('fix'): returns null when .cycle/log.jsonl is missing", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-test-"));
  try {
    const got = await findPriorStepHeadSha(root, "0042", "fix");
    assert.equal(got, null);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("findPriorStepHeadSha('fix'): returns 'missing' when prior fix step.start has no head_sha", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-test-"));
  try {
    await mkdir(join(root, ".cycle"), { recursive: true });
    const lines = [
      JSON.stringify({ event: "step.start", cycle_id: "0042", step: "fix", agent: "claudecode" }),
    ];
    await writeFile(join(root, ".cycle/log.jsonl"), lines.join("\n") + "\n", "utf8");
    const got = await findPriorStepHeadSha(root, "0042", "fix");
    assert.equal(got, "missing");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("findPriorStepHeadSha('fix'): returns the SHA when present and ignores build rows", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-test-"));
  try {
    await mkdir(join(root, ".cycle"), { recursive: true });
    const lines = [
      JSON.stringify({ event: "step.start", cycle_id: "0042", step: "build", head_sha: "buildbuildbuildbuildbuildbuildbuildbuild" }),
      JSON.stringify({ event: "step.start", cycle_id: "0042", step: "fix", agent: "claudecode", head_sha: "fixfixfixfixfixfixfixfixfixfixfixfixfix0" }),
    ];
    await writeFile(join(root, ".cycle/log.jsonl"), lines.join("\n") + "\n", "utf8");
    assert.equal(await findPriorStepHeadSha(root, "0042", "fix"), "fixfixfixfixfixfixfixfixfixfixfixfixfix0");
    assert.equal(await findPriorStepHeadSha(root, "0042", "build"), "buildbuildbuildbuildbuildbuildbuildbuild");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("findPriorStepHeadSha('fix'): returns null when no matching fix step.start exists for cycle", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-test-"));
  try {
    await mkdir(join(root, ".cycle"), { recursive: true });
    const lines = [
      JSON.stringify({ event: "step.start", cycle_id: "0099", step: "fix", head_sha: "abc" }),
      JSON.stringify({ event: "step.start", cycle_id: "0042", step: "build", head_sha: "def" }),
    ];
    await writeFile(join(root, ".cycle/log.jsonl"), lines.join("\n") + "\n", "utf8");
    assert.equal(await findPriorStepHeadSha(root, "0042", "fix"), null);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("fresh build step.start records head_sha; non-build step.start does not", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-test-"));
  const bin = await mkdtemp(join(tmpdir(), "cycle-bin-"));
  try {
    git(root, ["init", "-b", "main"]);
    git(root, ["config", "user.email", "t@t"]);
    git(root, ["config", "user.name", "t"]);
    git(root, ["commit", "--allow-empty", "-m", "init"]);

    await mkdir(join(root, ".cycle/prompts"), { recursive: true });
    await writeFile(join(root, ".cycle/workflows.yml"),
      workflowYmlBranch(`      - name: spec
        agent: claudecode
        prompt: prompts/spec.md
      - name: build
        agent: claudecode
        prompt: prompts/build.md
`), "utf8");
    await writeFile(join(root, ".cycle/prompts/spec.md"), "spec body", "utf8");
    await writeFile(join(root, ".cycle/prompts/build.md"), "build body", "utf8");

    const fake = join(bin, "claude");
    await writeFile(fake, "#!/bin/bash\nyes FAKED | head -50\n", "utf8");
    await chmod(fake, 0o755);

    const baseSha = git(root, ["rev-parse", "HEAD"]).trim();

    const r = await runCycle(root, {
      issueId: "TEST-1",
      title: "build sha",
      workflow: "feature",
      env: { PATH: `${bin}:${process.env.PATH}`, CYCLE_BASE: "main" },
    });
    assert.equal(r.status, "ok");

    const log = await readFile(join(root, ".cycle/log.jsonl"), "utf8");
    assert.match(log, new RegExp(`"event":"step\\.start","cycle_id":"0001","step":"build","agent":"claudecode","head_sha":"${baseSha}"`));
    const specStart = log.split("\n").find(l => l.includes('"step":"spec"') && l.includes('"event":"step.start"'));
    assert.ok(specStart, "spec step.start should be present");
    assert.doesNotMatch(specStart!, /"head_sha"/);
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(bin, { recursive: true, force: true });
  }
});

test("no_branch workflow: build step.start omits head_sha (fresh + resume)", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-test-"));
  const bin = await mkdtemp(join(tmpdir(), "cycle-bin-"));
  try {
    git(root, ["init", "-b", "main"]);
    git(root, ["config", "user.email", "t@t"]);
    git(root, ["config", "user.name", "t"]);
    git(root, ["commit", "--allow-empty", "-m", "init"]);

    await mkdir(join(root, ".cycle/prompts"), { recursive: true });
    await mkdir(join(root, ".cycle/scripts"), { recursive: true });
    const trunkWorkflow = `engine:
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
    no_branch: true
    steps:
      - name: build
        agent: bash
        command: scripts/build.sh
`;
    await writeFile(join(root, ".cycle/workflows.yml"), trunkWorkflow, "utf8");
    const buildScript = join(root, ".cycle/scripts/build.sh");
    await writeFile(buildScript, "#!/bin/bash\necho built\n", "utf8");
    await chmod(buildScript, 0o755);

    const fake = join(bin, "claude");
    await writeFile(fake, "#!/bin/bash\nyes FAKED | head -50\n", "utf8");
    await chmod(fake, 0o755);

    // Fresh run: build step.start must omit head_sha.
    const r = await runCycle(root, {
      cycleId: "0042",
      issueId: "TEST-1",
      title: "trunk build",
      workflow: "feature",
      env: { PATH: `${bin}:${process.env.PATH}`, CYCLE_BASE: "main" },
    });
    assert.equal(r.status, "ok");

    let log = await readFile(join(root, ".cycle/log.jsonl"), "utf8");
    const freshBuildStart = log.split("\n").find(l => l.includes('"cycle_id":"0042"') && l.includes('"step":"build"') && l.includes('"event":"step.start"'));
    assert.ok(freshBuildStart, "fresh build step.start present");
    assert.doesNotMatch(freshBuildStart!, /"head_sha"/);

    // Resume entry on no_branch: dirty the trunk, resume at build — no reset should fire.
    await writeFile(join(root, "dirty.txt"), "agent garbage", "utf8");
    const r2 = await runCycle(root, {
      cycleId: "0043",
      issueId: "TEST-2",
      title: "trunk resume",
      workflow: "feature",
      resume: { startStepIndex: 0 },
      env: { PATH: `${bin}:${process.env.PATH}`, CYCLE_BASE: "main" },
    });
    assert.equal(r2.status, "ok");

    log = await readFile(join(root, ".cycle/log.jsonl"), "utf8");
    const resumeBuildStart = log.split("\n").find(l => l.includes('"cycle_id":"0043"') && l.includes('"step":"build"') && l.includes('"event":"step.start"'));
    assert.ok(resumeBuildStart, "resumed build step.start present");
    assert.doesNotMatch(resumeBuildStart!, /"head_sha"/);
    // No reset, no warning under no_branch.
    const resumeWarning = log.split("\n").find(l => l.includes('"cycle_id":"0043"') && l.includes('"event":"step.warning"'));
    assert.equal(resumeWarning, undefined, "no step.warning emitted under no_branch");
    // Dirty trunk file untouched (no_branch never resets).
    const stillDirty = await readFile(join(root, "dirty.txt"), "utf8");
    assert.equal(stillDirty, "agent garbage");
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(bin, { recursive: true, force: true });
  }
});

test("fresh fix step.start records head_sha; spec/review step.start does not", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-test-"));
  const bin = await mkdtemp(join(tmpdir(), "cycle-bin-"));
  try {
    git(root, ["init", "-b", "main"]);
    git(root, ["config", "user.email", "t@t"]);
    git(root, ["config", "user.name", "t"]);
    git(root, ["commit", "--allow-empty", "-m", "init"]);

    await mkdir(join(root, ".cycle/prompts"), { recursive: true });
    await writeFile(join(root, ".cycle/workflows.yml"),
      workflowYmlBranch(`      - name: spec
        agent: claudecode
        prompt: prompts/spec.md
      - name: review
        agent: claudecode
        prompt: prompts/review.md
      - name: fix
        agent: claudecode
        prompt: prompts/fix.md
`), "utf8");
    await writeFile(join(root, ".cycle/prompts/spec.md"), "spec body", "utf8");
    await writeFile(join(root, ".cycle/prompts/review.md"), "review body", "utf8");
    await writeFile(join(root, ".cycle/prompts/fix.md"), "fix body", "utf8");

    const fake = join(bin, "claude");
    await writeFile(fake, "#!/bin/bash\nyes FAKED | head -50\n", "utf8");
    await chmod(fake, 0o755);

    const baseSha = git(root, ["rev-parse", "HEAD"]).trim();

    const r = await runCycle(root, {
      issueId: "TEST-1",
      title: "fix sha",
      workflow: "feature",
      env: { PATH: `${bin}:${process.env.PATH}`, CYCLE_BASE: "main" },
    });
    assert.equal(r.status, "ok");

    const log = await readFile(join(root, ".cycle/log.jsonl"), "utf8");
    assert.match(log, new RegExp(`"event":"step\\.start","cycle_id":"0001","step":"fix","agent":"claudecode","head_sha":"${baseSha}"`));
    for (const stepName of ["spec", "review"]) {
      const line = log.split("\n").find(l => l.includes(`"step":"${stepName}"`) && l.includes('"event":"step.start"'));
      assert.ok(line, `${stepName} step.start present`);
      assert.doesNotMatch(line!, /"head_sha"/);
    }
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(bin, { recursive: true, force: true });
  }
});

test("no_branch workflow: fix step.start omits head_sha (fresh + resume)", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-test-"));
  const bin = await mkdtemp(join(tmpdir(), "cycle-bin-"));
  try {
    git(root, ["init", "-b", "main"]);
    git(root, ["config", "user.email", "t@t"]);
    git(root, ["config", "user.name", "t"]);
    git(root, ["commit", "--allow-empty", "-m", "init"]);

    await mkdir(join(root, ".cycle/prompts"), { recursive: true });
    await mkdir(join(root, ".cycle/scripts"), { recursive: true });
    const trunkWorkflow = `engine:
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
    no_branch: true
    steps:
      - name: fix
        agent: bash
        command: scripts/fix.sh
`;
    await writeFile(join(root, ".cycle/workflows.yml"), trunkWorkflow, "utf8");
    const fixScript = join(root, ".cycle/scripts/fix.sh");
    await writeFile(fixScript, "#!/bin/bash\necho fixed\n", "utf8");
    await chmod(fixScript, 0o755);

    const fake = join(bin, "claude");
    await writeFile(fake, "#!/bin/bash\nyes FAKED | head -50\n", "utf8");
    await chmod(fake, 0o755);

    const r = await runCycle(root, {
      cycleId: "0042",
      issueId: "TEST-1",
      title: "trunk fix",
      workflow: "feature",
      env: { PATH: `${bin}:${process.env.PATH}`, CYCLE_BASE: "main" },
    });
    assert.equal(r.status, "ok");

    let log = await readFile(join(root, ".cycle/log.jsonl"), "utf8");
    const freshFixStart = log.split("\n").find(l => l.includes('"cycle_id":"0042"') && l.includes('"step":"fix"') && l.includes('"event":"step.start"'));
    assert.ok(freshFixStart, "fresh fix step.start present");
    assert.doesNotMatch(freshFixStart!, /"head_sha"/);

    await writeFile(join(root, "dirty.txt"), "agent garbage", "utf8");
    const r2 = await runCycle(root, {
      cycleId: "0043",
      issueId: "TEST-2",
      title: "trunk resume",
      workflow: "feature",
      resume: { startStepIndex: 0 },
      env: { PATH: `${bin}:${process.env.PATH}`, CYCLE_BASE: "main" },
    });
    assert.equal(r2.status, "ok");

    log = await readFile(join(root, ".cycle/log.jsonl"), "utf8");
    const resumeFixStart = log.split("\n").find(l => l.includes('"cycle_id":"0043"') && l.includes('"step":"fix"') && l.includes('"event":"step.start"'));
    assert.ok(resumeFixStart, "resumed fix step.start present");
    assert.doesNotMatch(resumeFixStart!, /"head_sha"/);
    const resumeWarning = log.split("\n").find(l => l.includes('"cycle_id":"0043"') && l.includes('"event":"step.warning"'));
    assert.equal(resumeWarning, undefined, "no step.warning emitted under no_branch");
    const stillDirty = await readFile(join(root, "dirty.txt"), "utf8");
    assert.equal(stillDirty, "agent garbage");
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(bin, { recursive: true, force: true });
  }
});

test("resume at build hard-resets to prior step.start head_sha", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-test-"));
  const bin = await mkdtemp(join(tmpdir(), "cycle-bin-"));
  try {
    git(root, ["init", "-b", "main"]);
    git(root, ["config", "user.email", "t@t"]);
    git(root, ["config", "user.name", "t"]);
    await writeFile(join(root, ".gitignore"), ".cycle/\n", "utf8");
    await writeFile(join(root, "tracked.txt"), "v1", "utf8");
    git(root, ["add", "."]);
    git(root, ["commit", "-m", "init"]);

    await mkdir(join(root, ".cycle/prompts"), { recursive: true });
    await mkdir(join(root, ".cycle/scripts"), { recursive: true });
    await writeFile(join(root, ".cycle/workflows.yml"),
      workflowYmlBranch(`      - name: spec
        agent: claudecode
        prompt: prompts/spec.md
      - name: build
        agent: claudecode
        prompt: prompts/build.md
      - name: verify
        agent: bash
        command: scripts/verify.sh
`), "utf8");
    await writeFile(join(root, ".cycle/prompts/spec.md"), "spec body", "utf8");
    await writeFile(join(root, ".cycle/prompts/build.md"), "build body", "utf8");
    const verifyScript = join(root, ".cycle/scripts/verify.sh");
    await writeFile(verifyScript, "#!/bin/bash\nexit 0\n", "utf8");
    await chmod(verifyScript, 0o755);

    git(root, ["checkout", "-b", "cycle/feature/resume-build"]);
    await mkdir(join(root, "docs", "cycle", "0042-feature-resume-build"), { recursive: true });
    await writeFile(join(root, "docs", "cycle", "0042-feature-resume-build", ".gitkeep"), "", "utf8");
    git(root, ["add", "docs"]);
    git(root, ["commit", "-m", "cycle artifact dir"]);
    const shaBuildStart = git(root, ["rev-parse", "HEAD"]).trim();

    const seedLines = [
      JSON.stringify({ ts: "2026-01-01T00:00:00.000Z", event: "cycle.start", cycle_id: "0042", workflow: "feature", title: "resume build", issue_id: "TEST-1" }),
      JSON.stringify({ ts: "2026-01-01T00:00:01.000Z", event: "step.start", cycle_id: "0042", step: "spec", agent: "claudecode" }),
      JSON.stringify({ ts: "2026-01-01T00:00:02.000Z", event: "step.end", cycle_id: "0042", step: "spec", status: "ok", exit_code: 0 }),
      JSON.stringify({ ts: "2026-01-01T00:00:03.000Z", event: "step.start", cycle_id: "0042", step: "build", agent: "claudecode", head_sha: shaBuildStart }),
    ];
    await mkdir(join(root, ".cycle"), { recursive: true });
    await writeFile(join(root, ".cycle/log.jsonl"), seedLines.join("\n") + "\n", "utf8");

    await writeFile(join(root, "partial.txt"), "agent garbage", "utf8");
    git(root, ["add", "partial.txt"]);
    git(root, ["commit", "-m", "partial build"]);
    await writeFile(join(root, "tracked.txt"), "v2-dirty", "utf8");
    await writeFile(join(root, "untracked.txt"), "uncommitted", "utf8");
    assert.notEqual(git(root, ["rev-parse", "HEAD"]).trim(), shaBuildStart);

    const statusFile = join(bin, "status.txt");
    const fake = join(bin, "claude");
    await writeFile(fake, `#!/bin/bash\ngit -C "${root}" status --porcelain > "${statusFile}"\nyes FAKED | head -50\n`, "utf8");
    await chmod(fake, 0o755);

    git(root, ["checkout", "main"]);

    const r = await runCycle(root, {
      cycleId: "0042",
      issueId: "TEST-1",
      title: "resume build",
      workflow: "feature",
      resume: { startStepIndex: 1 },
      env: { PATH: `${bin}:${process.env.PATH}`, CYCLE_BASE: "main" },
    });
    assert.equal(r.status, "ok");

    git(root, ["checkout", "cycle/feature/resume-build"]);
    assert.equal(git(root, ["rev-parse", "HEAD"]).trim(), shaBuildStart);
    const tracked = await readFile(join(root, "tracked.txt"), "utf8");
    assert.equal(tracked, "v1");
    const partialGone = await stat(join(root, "partial.txt")).then(() => false, () => true);
    assert.equal(partialGone, true);
    const untrackedGone = await stat(join(root, "untracked.txt")).then(() => false, () => true);
    assert.equal(untrackedGone, true, "untracked file removed by git clean -fd after build reset");

    const observed = await readFile(statusFile, "utf8");
    assert.doesNotMatch(observed, /^.M tracked\.txt/m);
    assert.doesNotMatch(observed, /^M  tracked\.txt/m);

    const log = await readFile(join(root, ".cycle/log.jsonl"), "utf8");
    const buildStarts = log.split("\n").filter(l => l.includes('"event":"step.start"') && l.includes('"step":"build"'));
    assert.equal(buildStarts.length, 2, "one seeded + one fresh build step.start");
    assert.match(buildStarts[1], new RegExp(`"head_sha":"${shaBuildStart}"`));
    assert.doesNotMatch(log, /"event":"step\.warning"/);
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(bin, { recursive: true, force: true });
  }
});

test("resume at build with no prior head_sha emits build_pre_sha_missing and skips reset", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-test-"));
  const bin = await mkdtemp(join(tmpdir(), "cycle-bin-"));
  try {
    git(root, ["init", "-b", "main"]);
    git(root, ["config", "user.email", "t@t"]);
    git(root, ["config", "user.name", "t"]);
    await writeFile(join(root, ".gitignore"), ".cycle/\n", "utf8");
    await writeFile(join(root, "tracked.txt"), "v1", "utf8");
    git(root, ["add", "."]);
    git(root, ["commit", "-m", "init"]);

    await mkdir(join(root, ".cycle/prompts"), { recursive: true });
    await writeFile(join(root, ".cycle/workflows.yml"),
      workflowYmlBranch(`      - name: spec
        agent: claudecode
        prompt: prompts/spec.md
      - name: build
        agent: claudecode
        prompt: prompts/build.md
`), "utf8");
    await writeFile(join(root, ".cycle/prompts/spec.md"), "spec body", "utf8");
    await writeFile(join(root, ".cycle/prompts/build.md"), "build body", "utf8");

    git(root, ["checkout", "-b", "cycle/feature/legacy-log"]);
    await writeFile(join(root, "tracked.txt"), "v2-partial", "utf8");
    git(root, ["add", "tracked.txt"]);
    git(root, ["commit", "-m", "partial"]);
    const dirtyHead = git(root, ["rev-parse", "HEAD"]).trim();

    const seedLines = [
      JSON.stringify({ ts: "2026-01-01T00:00:00.000Z", event: "cycle.start", cycle_id: "0042", workflow: "feature", title: "legacy log", issue_id: "TEST-1" }),
      JSON.stringify({ ts: "2026-01-01T00:00:01.000Z", event: "step.start", cycle_id: "0042", step: "spec", agent: "claudecode" }),
      JSON.stringify({ ts: "2026-01-01T00:00:02.000Z", event: "step.end", cycle_id: "0042", step: "spec", status: "ok", exit_code: 0 }),
      JSON.stringify({ ts: "2026-01-01T00:00:03.000Z", event: "step.start", cycle_id: "0042", step: "build", agent: "claudecode" }),
    ];
    await writeFile(join(root, ".cycle/log.jsonl"), seedLines.join("\n") + "\n", "utf8");

    const fake = join(bin, "claude");
    await writeFile(fake, "#!/bin/bash\nyes FAKED | head -50\n", "utf8");
    await chmod(fake, 0o755);

    git(root, ["checkout", "main"]);

    const r = await runCycle(root, {
      cycleId: "0042",
      issueId: "TEST-1",
      title: "legacy log",
      workflow: "feature",
      resume: { startStepIndex: 1 },
      env: { PATH: `${bin}:${process.env.PATH}`, CYCLE_BASE: "main" },
    });
    assert.equal(r.status, "ok");

    git(root, ["checkout", "cycle/feature/legacy-log"]);
    assert.equal(git(root, ["rev-parse", "HEAD"]).trim(), dirtyHead, "no reset ran: HEAD preserved");
    const tracked = await readFile(join(root, "tracked.txt"), "utf8");
    assert.equal(tracked, "v2-partial");

    const log = await readFile(join(root, ".cycle/log.jsonl"), "utf8");
    assert.match(log, /"event":"step\.warning","cycle_id":"0042","step":"build","reason":"build_pre_sha_missing"/);
    assert.match(log, new RegExp(`"event":"step\\.start","cycle_id":"0042","step":"build","agent":"claudecode","head_sha":"${dirtyHead}"`));
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(bin, { recursive: true, force: true });
  }
});

test("resume at build with unreachable head_sha emits build_pre_sha_unreachable and skips reset", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-test-"));
  const bin = await mkdtemp(join(tmpdir(), "cycle-bin-"));
  try {
    git(root, ["init", "-b", "main"]);
    git(root, ["config", "user.email", "t@t"]);
    git(root, ["config", "user.name", "t"]);
    await writeFile(join(root, "tracked.txt"), "v1", "utf8");
    git(root, ["add", "tracked.txt"]);
    git(root, ["commit", "-m", "init"]);

    await mkdir(join(root, ".cycle/prompts"), { recursive: true });
    await writeFile(join(root, ".cycle/workflows.yml"),
      workflowYmlBranch(`      - name: spec
        agent: claudecode
        prompt: prompts/spec.md
      - name: build
        agent: claudecode
        prompt: prompts/build.md
`), "utf8");
    await writeFile(join(root, ".cycle/prompts/spec.md"), "spec body", "utf8");
    await writeFile(join(root, ".cycle/prompts/build.md"), "build body", "utf8");

    git(root, ["checkout", "-b", "cycle/feature/lost-sha"]);
    await writeFile(join(root, "tracked.txt"), "v2-partial", "utf8");
    git(root, ["add", "tracked.txt"]);
    git(root, ["commit", "-m", "partial"]);
    const dirtyHead = git(root, ["rev-parse", "HEAD"]).trim();

    const lostSha = "deadbeefdeadbeefdeadbeefdeadbeefdeadbeef";
    const seedLines = [
      JSON.stringify({ ts: "2026-01-01T00:00:00.000Z", event: "cycle.start", cycle_id: "0042", workflow: "feature", title: "lost sha", issue_id: "TEST-1" }),
      JSON.stringify({ ts: "2026-01-01T00:00:01.000Z", event: "step.start", cycle_id: "0042", step: "spec", agent: "claudecode" }),
      JSON.stringify({ ts: "2026-01-01T00:00:02.000Z", event: "step.end", cycle_id: "0042", step: "spec", status: "ok", exit_code: 0 }),
      JSON.stringify({ ts: "2026-01-01T00:00:03.000Z", event: "step.start", cycle_id: "0042", step: "build", agent: "claudecode", head_sha: lostSha }),
    ];
    await writeFile(join(root, ".cycle/log.jsonl"), seedLines.join("\n") + "\n", "utf8");

    const fake = join(bin, "claude");
    await writeFile(fake, "#!/bin/bash\nyes FAKED | head -50\n", "utf8");
    await chmod(fake, 0o755);

    git(root, ["checkout", "main"]);

    const r = await runCycle(root, {
      cycleId: "0042",
      issueId: "TEST-1",
      title: "lost sha",
      workflow: "feature",
      resume: { startStepIndex: 1 },
      env: { PATH: `${bin}:${process.env.PATH}`, CYCLE_BASE: "main" },
    });
    assert.equal(r.status, "ok");

    git(root, ["checkout", "cycle/feature/lost-sha"]);
    assert.equal(git(root, ["rev-parse", "HEAD"]).trim(), dirtyHead);
    const tracked = await readFile(join(root, "tracked.txt"), "utf8");
    assert.equal(tracked, "v2-partial");

    const log = await readFile(join(root, ".cycle/log.jsonl"), "utf8");
    assert.match(log, new RegExp(`"event":"step\\.warning","cycle_id":"0042","step":"build","reason":"build_pre_sha_unreachable","sha":"${lostSha}"`));
    assert.match(log, new RegExp(`"event":"step\\.start","cycle_id":"0042","step":"build","agent":"claudecode","head_sha":"${dirtyHead}"`));
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(bin, { recursive: true, force: true });
  }
});

test("resume at fix hard-resets to prior step.start head_sha", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-test-"));
  const bin = await mkdtemp(join(tmpdir(), "cycle-bin-"));
  try {
    git(root, ["init", "-b", "main"]);
    git(root, ["config", "user.email", "t@t"]);
    git(root, ["config", "user.name", "t"]);
    await writeFile(join(root, "tracked.txt"), "v1", "utf8");
    await writeFile(join(root, ".gitignore"), ".cycle/\n", "utf8");
    git(root, ["add", "."]);
    git(root, ["commit", "-m", "init"]);

    await mkdir(join(root, ".cycle/prompts"), { recursive: true });
    await writeFile(join(root, ".cycle/workflows.yml"),
      workflowYmlBranch(`      - name: spec
        agent: claudecode
        prompt: prompts/spec.md
      - name: research
        agent: claudecode
        prompt: prompts/research.md
      - name: plan
        agent: claudecode
        prompt: prompts/plan.md
      - name: build
        agent: claudecode
        prompt: prompts/build.md
      - name: review
        agent: claudecode
        prompt: prompts/review.md
      - name: fix
        agent: claudecode
        prompt: prompts/fix.md
`), "utf8");
    for (const p of ["spec", "research", "plan", "build", "review", "fix"]) {
      await writeFile(join(root, `.cycle/prompts/${p}.md`), `${p} body`, "utf8");
    }

    git(root, ["checkout", "-b", "cycle/feature/resume-fix"]);
    await mkdir(join(root, "docs", "cycle", "0042-feature-resume-fix"), { recursive: true });
    await writeFile(join(root, "docs", "cycle", "0042-feature-resume-fix", ".gitkeep"), "", "utf8");
    git(root, ["add", "docs"]);
    git(root, ["commit", "-m", "cycle artifact dir"]);
    const shaFixStart = git(root, ["rev-parse", "HEAD"]).trim();

    const seedLines = [
      JSON.stringify({ ts: "2026-01-01T00:00:00.000Z", event: "cycle.start", cycle_id: "0042", workflow: "feature", title: "resume fix", issue_id: "TEST-1" }),
      JSON.stringify({ ts: "2026-01-01T00:00:01.000Z", event: "step.start", cycle_id: "0042", step: "spec", agent: "claudecode" }),
      JSON.stringify({ ts: "2026-01-01T00:00:02.000Z", event: "step.end", cycle_id: "0042", step: "spec", status: "ok", exit_code: 0 }),
      JSON.stringify({ ts: "2026-01-01T00:00:03.000Z", event: "step.start", cycle_id: "0042", step: "research", agent: "claudecode" }),
      JSON.stringify({ ts: "2026-01-01T00:00:04.000Z", event: "step.end", cycle_id: "0042", step: "research", status: "ok", exit_code: 0 }),
      JSON.stringify({ ts: "2026-01-01T00:00:05.000Z", event: "step.start", cycle_id: "0042", step: "plan", agent: "claudecode" }),
      JSON.stringify({ ts: "2026-01-01T00:00:06.000Z", event: "step.end", cycle_id: "0042", step: "plan", status: "ok", exit_code: 0 }),
      JSON.stringify({ ts: "2026-01-01T00:00:07.000Z", event: "step.start", cycle_id: "0042", step: "build", agent: "claudecode", head_sha: shaFixStart }),
      JSON.stringify({ ts: "2026-01-01T00:00:08.000Z", event: "step.end", cycle_id: "0042", step: "build", status: "ok", exit_code: 0 }),
      JSON.stringify({ ts: "2026-01-01T00:00:09.000Z", event: "step.start", cycle_id: "0042", step: "review", agent: "claudecode" }),
      JSON.stringify({ ts: "2026-01-01T00:00:10.000Z", event: "step.end", cycle_id: "0042", step: "review", status: "ok", exit_code: 0 }),
      JSON.stringify({ ts: "2026-01-01T00:00:11.000Z", event: "step.start", cycle_id: "0042", step: "fix", agent: "claudecode", head_sha: shaFixStart }),
    ];
    await mkdir(join(root, ".cycle"), { recursive: true });
    await writeFile(join(root, ".cycle/log.jsonl"), seedLines.join("\n") + "\n", "utf8");

    await writeFile(join(root, "partial.txt"), "agent garbage", "utf8");
    git(root, ["add", "partial.txt"]);
    git(root, ["commit", "-m", "partial fix"]);
    await writeFile(join(root, "tracked.txt"), "v2-dirty", "utf8");
    await writeFile(join(root, "untracked.txt"), "uncommitted", "utf8");
    assert.notEqual(git(root, ["rev-parse", "HEAD"]).trim(), shaFixStart);

    const statusFile = join(bin, "status.txt");
    const fake = join(bin, "claude");
    await writeFile(fake, `#!/bin/bash\ngit -C "${root}" status --porcelain > "${statusFile}"\nyes FAKED | head -50\n`, "utf8");
    await chmod(fake, 0o755);

    git(root, ["checkout", "main"]);

    const r = await runCycle(root, {
      cycleId: "0042",
      issueId: "TEST-1",
      title: "resume fix",
      workflow: "feature",
      resume: { startStepIndex: 5 },
      env: { PATH: `${bin}:${process.env.PATH}`, CYCLE_BASE: "main" },
    });
    assert.equal(r.status, "ok");

    git(root, ["checkout", "cycle/feature/resume-fix"]);
    assert.equal(git(root, ["rev-parse", "HEAD"]).trim(), shaFixStart);
    const tracked = await readFile(join(root, "tracked.txt"), "utf8");
    assert.equal(tracked, "v1");
    const partialGone = await stat(join(root, "partial.txt")).then(() => false, () => true);
    assert.equal(partialGone, true);
    const untrackedGone = await stat(join(root, "untracked.txt")).then(() => false, () => true);
    assert.equal(untrackedGone, true, "untracked file removed by git clean -fd after fix reset");

    const observed = await readFile(statusFile, "utf8");
    assert.doesNotMatch(observed, /^.M tracked\.txt/m);
    assert.doesNotMatch(observed, /^M  tracked\.txt/m);

    const log = await readFile(join(root, ".cycle/log.jsonl"), "utf8");
    const fixStarts = log.split("\n").filter(l => l.includes('"event":"step.start"') && l.includes('"step":"fix"'));
    assert.equal(fixStarts.length, 2, "one seeded + one fresh fix step.start");
    assert.match(fixStarts[1], new RegExp(`"head_sha":"${shaFixStart}"`));
    assert.doesNotMatch(log, /"event":"step\.warning"/);
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(bin, { recursive: true, force: true });
  }
});

test("resume at fix with no prior head_sha emits fix_pre_sha_missing and skips reset", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-test-"));
  const bin = await mkdtemp(join(tmpdir(), "cycle-bin-"));
  try {
    git(root, ["init", "-b", "main"]);
    git(root, ["config", "user.email", "t@t"]);
    git(root, ["config", "user.name", "t"]);
    await writeFile(join(root, "tracked.txt"), "v1", "utf8");
    git(root, ["add", "tracked.txt"]);
    git(root, ["commit", "-m", "init"]);

    await mkdir(join(root, ".cycle/prompts"), { recursive: true });
    await writeFile(join(root, ".cycle/workflows.yml"),
      workflowYmlBranch(`      - name: spec
        agent: claudecode
        prompt: prompts/spec.md
      - name: research
        agent: claudecode
        prompt: prompts/research.md
      - name: plan
        agent: claudecode
        prompt: prompts/plan.md
      - name: build
        agent: claudecode
        prompt: prompts/build.md
      - name: review
        agent: claudecode
        prompt: prompts/review.md
      - name: fix
        agent: claudecode
        prompt: prompts/fix.md
`), "utf8");
    for (const p of ["spec", "research", "plan", "build", "review", "fix"]) {
      await writeFile(join(root, `.cycle/prompts/${p}.md`), `${p} body`, "utf8");
    }

    git(root, ["checkout", "-b", "cycle/feature/legacy-fix-log"]);
    await writeFile(join(root, "tracked.txt"), "v2-partial", "utf8");
    git(root, ["add", "tracked.txt"]);
    git(root, ["commit", "-m", "partial"]);
    const dirtyHead = git(root, ["rev-parse", "HEAD"]).trim();

    const seedLines = [
      JSON.stringify({ ts: "2026-01-01T00:00:00.000Z", event: "cycle.start", cycle_id: "0042", workflow: "feature", title: "legacy fix log", issue_id: "TEST-1" }),
      JSON.stringify({ ts: "2026-01-01T00:00:01.000Z", event: "step.start", cycle_id: "0042", step: "spec", agent: "claudecode" }),
      JSON.stringify({ ts: "2026-01-01T00:00:02.000Z", event: "step.end", cycle_id: "0042", step: "spec", status: "ok", exit_code: 0 }),
      JSON.stringify({ ts: "2026-01-01T00:00:03.000Z", event: "step.start", cycle_id: "0042", step: "research", agent: "claudecode" }),
      JSON.stringify({ ts: "2026-01-01T00:00:04.000Z", event: "step.end", cycle_id: "0042", step: "research", status: "ok", exit_code: 0 }),
      JSON.stringify({ ts: "2026-01-01T00:00:05.000Z", event: "step.start", cycle_id: "0042", step: "plan", agent: "claudecode" }),
      JSON.stringify({ ts: "2026-01-01T00:00:06.000Z", event: "step.end", cycle_id: "0042", step: "plan", status: "ok", exit_code: 0 }),
      JSON.stringify({ ts: "2026-01-01T00:00:07.000Z", event: "step.start", cycle_id: "0042", step: "build", agent: "claudecode", head_sha: dirtyHead }),
      JSON.stringify({ ts: "2026-01-01T00:00:08.000Z", event: "step.end", cycle_id: "0042", step: "build", status: "ok", exit_code: 0 }),
      JSON.stringify({ ts: "2026-01-01T00:00:09.000Z", event: "step.start", cycle_id: "0042", step: "review", agent: "claudecode" }),
      JSON.stringify({ ts: "2026-01-01T00:00:10.000Z", event: "step.end", cycle_id: "0042", step: "review", status: "ok", exit_code: 0 }),
      JSON.stringify({ ts: "2026-01-01T00:00:11.000Z", event: "step.start", cycle_id: "0042", step: "fix", agent: "claudecode" }),
    ];
    await writeFile(join(root, ".cycle/log.jsonl"), seedLines.join("\n") + "\n", "utf8");

    const fake = join(bin, "claude");
    await writeFile(fake, "#!/bin/bash\nyes FAKED | head -50\n", "utf8");
    await chmod(fake, 0o755);

    git(root, ["checkout", "main"]);

    const r = await runCycle(root, {
      cycleId: "0042",
      issueId: "TEST-1",
      title: "legacy fix log",
      workflow: "feature",
      resume: { startStepIndex: 5 },
      env: { PATH: `${bin}:${process.env.PATH}`, CYCLE_BASE: "main" },
    });
    assert.equal(r.status, "ok");

    git(root, ["checkout", "cycle/feature/legacy-fix-log"]);
    assert.equal(git(root, ["rev-parse", "HEAD"]).trim(), dirtyHead, "no reset ran: HEAD preserved");
    const tracked = await readFile(join(root, "tracked.txt"), "utf8");
    assert.equal(tracked, "v2-partial");

    const log = await readFile(join(root, ".cycle/log.jsonl"), "utf8");
    assert.match(log, /"event":"step\.warning","cycle_id":"0042","step":"fix","reason":"fix_pre_sha_missing"/);
    assert.match(log, new RegExp(`"event":"step\\.start","cycle_id":"0042","step":"fix","agent":"claudecode","head_sha":"${dirtyHead}"`));
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(bin, { recursive: true, force: true });
  }
});

test("resume at fix with unreachable head_sha emits fix_pre_sha_unreachable and skips reset", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-test-"));
  const bin = await mkdtemp(join(tmpdir(), "cycle-bin-"));
  try {
    git(root, ["init", "-b", "main"]);
    git(root, ["config", "user.email", "t@t"]);
    git(root, ["config", "user.name", "t"]);
    await writeFile(join(root, "tracked.txt"), "v1", "utf8");
    git(root, ["add", "tracked.txt"]);
    git(root, ["commit", "-m", "init"]);

    await mkdir(join(root, ".cycle/prompts"), { recursive: true });
    await writeFile(join(root, ".cycle/workflows.yml"),
      workflowYmlBranch(`      - name: spec
        agent: claudecode
        prompt: prompts/spec.md
      - name: research
        agent: claudecode
        prompt: prompts/research.md
      - name: plan
        agent: claudecode
        prompt: prompts/plan.md
      - name: build
        agent: claudecode
        prompt: prompts/build.md
      - name: review
        agent: claudecode
        prompt: prompts/review.md
      - name: fix
        agent: claudecode
        prompt: prompts/fix.md
`), "utf8");
    for (const p of ["spec", "research", "plan", "build", "review", "fix"]) {
      await writeFile(join(root, `.cycle/prompts/${p}.md`), `${p} body`, "utf8");
    }

    git(root, ["checkout", "-b", "cycle/feature/lost-fix-sha"]);
    await writeFile(join(root, "tracked.txt"), "v2-partial", "utf8");
    git(root, ["add", "tracked.txt"]);
    git(root, ["commit", "-m", "partial"]);
    const dirtyHead = git(root, ["rev-parse", "HEAD"]).trim();

    const lostSha = "deadbeefdeadbeefdeadbeefdeadbeefdeadbeef";
    const seedLines = [
      JSON.stringify({ ts: "2026-01-01T00:00:00.000Z", event: "cycle.start", cycle_id: "0042", workflow: "feature", title: "lost fix sha", issue_id: "TEST-1" }),
      JSON.stringify({ ts: "2026-01-01T00:00:01.000Z", event: "step.start", cycle_id: "0042", step: "spec", agent: "claudecode" }),
      JSON.stringify({ ts: "2026-01-01T00:00:02.000Z", event: "step.end", cycle_id: "0042", step: "spec", status: "ok", exit_code: 0 }),
      JSON.stringify({ ts: "2026-01-01T00:00:03.000Z", event: "step.start", cycle_id: "0042", step: "research", agent: "claudecode" }),
      JSON.stringify({ ts: "2026-01-01T00:00:04.000Z", event: "step.end", cycle_id: "0042", step: "research", status: "ok", exit_code: 0 }),
      JSON.stringify({ ts: "2026-01-01T00:00:05.000Z", event: "step.start", cycle_id: "0042", step: "plan", agent: "claudecode" }),
      JSON.stringify({ ts: "2026-01-01T00:00:06.000Z", event: "step.end", cycle_id: "0042", step: "plan", status: "ok", exit_code: 0 }),
      JSON.stringify({ ts: "2026-01-01T00:00:07.000Z", event: "step.start", cycle_id: "0042", step: "build", agent: "claudecode", head_sha: dirtyHead }),
      JSON.stringify({ ts: "2026-01-01T00:00:08.000Z", event: "step.end", cycle_id: "0042", step: "build", status: "ok", exit_code: 0 }),
      JSON.stringify({ ts: "2026-01-01T00:00:09.000Z", event: "step.start", cycle_id: "0042", step: "review", agent: "claudecode" }),
      JSON.stringify({ ts: "2026-01-01T00:00:10.000Z", event: "step.end", cycle_id: "0042", step: "review", status: "ok", exit_code: 0 }),
      JSON.stringify({ ts: "2026-01-01T00:00:11.000Z", event: "step.start", cycle_id: "0042", step: "fix", agent: "claudecode", head_sha: lostSha }),
    ];
    await writeFile(join(root, ".cycle/log.jsonl"), seedLines.join("\n") + "\n", "utf8");

    const fake = join(bin, "claude");
    await writeFile(fake, "#!/bin/bash\nyes FAKED | head -50\n", "utf8");
    await chmod(fake, 0o755);

    git(root, ["checkout", "main"]);

    const r = await runCycle(root, {
      cycleId: "0042",
      issueId: "TEST-1",
      title: "lost fix sha",
      workflow: "feature",
      resume: { startStepIndex: 5 },
      env: { PATH: `${bin}:${process.env.PATH}`, CYCLE_BASE: "main" },
    });
    assert.equal(r.status, "ok");

    git(root, ["checkout", "cycle/feature/lost-fix-sha"]);
    assert.equal(git(root, ["rev-parse", "HEAD"]).trim(), dirtyHead);
    const tracked = await readFile(join(root, "tracked.txt"), "utf8");
    assert.equal(tracked, "v2-partial");

    const log = await readFile(join(root, ".cycle/log.jsonl"), "utf8");
    assert.match(log, new RegExp(`"event":"step\\.warning","cycle_id":"0042","step":"fix","reason":"fix_pre_sha_unreachable","sha":"${lostSha}"`));
    assert.match(log, new RegExp(`"event":"step\\.start","cycle_id":"0042","step":"fix","agent":"claudecode","head_sha":"${dirtyHead}"`));
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(bin, { recursive: true, force: true });
  }
});

test("findPriorBuildHeadSha returns newer sha when two build step.start rows exist for same cycle", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-test-"));
  try {
    await mkdir(join(root, ".cycle"), { recursive: true });
    const lines = [
      JSON.stringify({ event: "step.start", step: "build", cycle_id: "0099", head_sha: "OLD_SHA" }),
      JSON.stringify({ event: "step.warning", step: "build", cycle_id: "0099", reason: "build_pre_sha_missing" }),
      JSON.stringify({ event: "step.start", step: "build", cycle_id: "0099", head_sha: "NEW_SHA" }),
    ];
    await writeFile(join(root, ".cycle/log.jsonl"), lines.join("\n") + "\n", "utf8");
    const got = await findPriorBuildHeadSha(root, "0099");
    assert.equal(got, "NEW_SHA");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("step with unregistered agent fails the step and ends the cycle", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-test-"));
  const bin = await mkdtemp(join(tmpdir(), "cycle-bin-"));
  try {
    git(root, ["init", "-b", "main"]);
    git(root, ["config", "user.email", "t@t"]);
    git(root, ["config", "user.name", "t"]);
    git(root, ["commit", "--allow-empty", "-m", "init"]);

    await mkdir(join(root, ".cycle/prompts"), { recursive: true });
    await writeFile(join(root, ".cycle/workflows.yml"),
      workflowYml(`      - name: bogus
        agent: made-up
        prompt: prompts/x.md
`), "utf8");
    await writeFile(join(root, ".cycle/prompts/x.md"), "noop", "utf8");

    const fake = join(bin, "claude");
    await writeFile(fake, "#!/bin/bash\nyes FAKED | head -50\n", "utf8");
    await chmod(fake, 0o755);

    const r = await runCycle(root, {
      issueId: "TEST-1",
      title: "unknown agent",
      workflow: "feature",
      env: { PATH: `${bin}:${process.env.PATH}`, CYCLE_BASE: "main" },
    });
    assert.equal(r.status, "failed");
    assert.equal(r.failingStep, "bogus");

    const log = await readFile(join(root, ".cycle/log.jsonl"), "utf8");
    assert.match(log, /"event":"step.start","cycle_id":"0001","step":"bogus","agent":"made-up"/);
    assert.match(log, /"event":"step.end","cycle_id":"0001","step":"bogus","status":"failed","exit_code":-1/);
    assert.match(log, /"event":"cycle.end","cycle_id":"0001","status":"failed","failing_step":"bogus"/);
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(bin, { recursive: true, force: true });
  }
});
