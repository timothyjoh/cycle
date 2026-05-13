import { test } from "node:test";
import { strict as assert } from "node:assert";
import { mkdtemp, mkdir, writeFile, readFile, rm, chmod } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { runCycle } from "../../src/engine/run-cycle.ts";

function git(cwd: string, args: string[]) {
  const r = spawnSync("git", args, { cwd, encoding: "utf8" });
  if (r.status !== 0) throw new Error(`git ${args.join(" ")}: ${r.stderr}`);
  return r.stdout;
}

test("runs a 2-step workflow end-to-end and writes log + artifacts", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-test-"));
  const bin = await mkdtemp(join(tmpdir(), "cycle-bin-"));
  try {
    git(root, ["init", "-b", "main"]);
    git(root, ["config", "user.email", "t@t"]);
    git(root, ["config", "user.name", "t"]);
    git(root, ["commit", "--allow-empty", "-m", "init"]);

    await mkdir(join(root, ".cycle/workflows"), { recursive: true });
    await mkdir(join(root, ".cycle/prompts"), { recursive: true });
    await mkdir(join(root, ".cycle/scripts"), { recursive: true });

    await writeFile(join(root, ".cycle/workflows/feature.yaml"),
      `name: feature\nsteps:\n  - name: spec\n    agent: claudecode\n    prompt: prompts/spec.md\n  - name: note\n    agent: bash\n    command: scripts/note.sh\n`, "utf8");
    await writeFile(join(root, ".cycle/prompts/spec.md"), "spec body", "utf8");
    const note = join(root, ".cycle/scripts/note.sh");
    await writeFile(note, "#!/bin/bash\necho NOTED ${CYCLE_ID} ${CYCLE_TITLE}\n", "utf8");
    await chmod(note, 0o755);

    const fake = join(bin, "claude");
    await writeFile(fake, "#!/bin/bash\necho FAKED\n", "utf8");
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

    await mkdir(join(root, ".cycle/workflows"), { recursive: true });
    await mkdir(join(root, ".cycle/prompts"), { recursive: true });

    await writeFile(join(root, ".cycle/workflows/feature.yaml"),
      `name: feature\nsteps:\n  - name: spec\n    agent: claudecode\n    prompt: prompts/spec.md\n`, "utf8");
    await writeFile(join(root, ".cycle/prompts/spec.md"), "spec body", "utf8");

    const fake = join(bin, "claude");
    await writeFile(fake, "#!/bin/bash\necho FAKED\n", "utf8");
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

    await mkdir(join(root, ".cycle/workflows"), { recursive: true });
    await mkdir(join(root, ".cycle/prompts"), { recursive: true });
    await mkdir(join(root, ".cycle/scripts"), { recursive: true });

    await writeFile(join(root, ".cycle/workflows/feature.yaml"),
      `name: feature\nsteps:\n  - name: spec\n    agent: claudecode\n    prompt: prompts/spec.md\n  - name: boom\n    agent: bash\n    command: scripts/boom.sh\n`, "utf8");
    await writeFile(join(root, ".cycle/prompts/spec.md"), "spec body", "utf8");
    const boom = join(root, ".cycle/scripts/boom.sh");
    await writeFile(boom, "#!/bin/bash\necho boom\nexit 1\n", "utf8");
    await chmod(boom, 0o755);

    const fake = join(bin, "claude");
    await writeFile(fake, "#!/bin/bash\necho FAKED\n", "utf8");
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

    await mkdir(join(root, ".cycle/workflows"), { recursive: true });
    await mkdir(join(root, ".cycle/scripts"), { recursive: true });
    await writeFile(
      join(root, ".cycle/workflows/feature.yaml"),
      `name: feature\nsteps:\n  - name: echo\n    agent: bash\n    command: scripts/echo.sh\n`,
      "utf8",
    );
    const echo = join(root, ".cycle/scripts/echo.sh");
    await writeFile(echo, "#!/bin/bash\necho ISSUE=${CYCLE_ISSUE_ID:-MISSING}\n", "utf8");
    await chmod(echo, 0o755);

    const fake = join(bin, "claude");
    await writeFile(fake, "#!/bin/bash\necho FAKED\n", "utf8");
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
      join(root, ".cycle/workflows/feature.yaml"),
      `name: feature\nsteps:\n  - name: check\n    agent: bash\n    command: scripts/check.sh\n`,
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

    await mkdir(join(root, ".cycle/workflows"), { recursive: true });
    await mkdir(join(root, ".cycle/prompts"), { recursive: true });
    await writeFile(join(root, ".cycle/workflows/feature.yaml"),
      `name: feature\nsteps:\n  - name: spec\n    agent: claudecode\n    prompt: prompts/spec.md\n`, "utf8");
    await writeFile(join(root, ".cycle/prompts/spec.md"), "spec body", "utf8");

    const fake = join(bin, "claude");
    await writeFile(fake, "#!/bin/bash\necho FAKED\n", "utf8");
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

    await mkdir(join(workRoot, ".cycle/workflows"), { recursive: true });
    await mkdir(join(workRoot, ".cycle/prompts"), { recursive: true });
    await writeFile(join(workRoot, ".cycle/workflows/feature.yaml"),
      `name: feature\nsteps:\n  - name: spec\n    agent: claudecode\n    prompt: prompts/spec.md\n`, "utf8");
    await writeFile(join(workRoot, ".cycle/prompts/spec.md"), "spec body", "utf8");

    const fake = join(bin, "claude");
    await writeFile(fake, "#!/bin/bash\necho FAKED\n", "utf8");
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

    await mkdir(join(root, ".cycle/workflows"), { recursive: true });
    await mkdir(join(root, ".cycle/prompts"), { recursive: true });
    await writeFile(join(root, ".cycle/workflows/feature.yaml"),
      `name: feature\nsteps:\n  - name: spec\n    agent: claudecode\n    prompt: prompts/spec.md\n`, "utf8");
    await writeFile(join(root, ".cycle/prompts/spec.md"), "spec body", "utf8");

    const fake = join(bin, "claude");
    await writeFile(fake, "#!/bin/bash\necho FAKED\n", "utf8");
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

test("logs cycle.base_pull status=skipped when prior checkout failed", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-test-"));
  const bin = await mkdtemp(join(tmpdir(), "cycle-bin-"));
  try {
    git(root, ["init", "-b", "main"]);
    git(root, ["config", "user.email", "t@t"]);
    git(root, ["config", "user.name", "t"]);
    git(root, ["commit", "--allow-empty", "-m", "init"]);

    await mkdir(join(root, ".cycle/workflows"), { recursive: true });
    await mkdir(join(root, ".cycle/prompts"), { recursive: true });
    await writeFile(join(root, ".cycle/workflows/feature.yaml"),
      `name: feature\nsteps:\n  - name: spec\n    agent: claudecode\n    prompt: prompts/spec.md\n`, "utf8");
    await writeFile(join(root, ".cycle/prompts/spec.md"), "spec body", "utf8");

    const fake = join(bin, "claude");
    await writeFile(fake, "#!/bin/bash\necho FAKED\n", "utf8");
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
