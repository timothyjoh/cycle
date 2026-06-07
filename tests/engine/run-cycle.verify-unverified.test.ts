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

function workflowYml(stepsBody: string, engineExtra = ""): string {
  return `engine:
  max_consecutive_failures: 2
  base_branch: main
  commit:
    mode: trunk
    push: false${engineExtra}
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

async function setupRepo(stepsBody: string, scripts: Array<{ name: string; body: string }>, engineExtra = "") {
  const root = await mkdtemp(join(tmpdir(), "cycle-verify-unverified-"));
  git(root, ["init", "-b", "main"]);
  git(root, ["config", "user.email", "t@t"]);
  git(root, ["config", "user.name", "t"]);
  git(root, ["commit", "--allow-empty", "-m", "init"]);

  await mkdir(join(root, ".cycle/scripts"), { recursive: true });
  await writeFile(join(root, ".cycle/workflows.yml"), workflowYml(stepsBody, engineExtra), "utf8");
  for (const s of scripts) {
    const p = join(root, ".cycle/scripts", s.name);
    await writeFile(p, s.body, "utf8");
    await chmod(p, 0o755);
  }
  return root;
}

function readLog(root: string): Promise<string> {
  return readFile(join(root, ".cycle/log.jsonl"), "utf8");
}

function allEvents(log: string, eventName: string): Array<Record<string, unknown>> {
  return log
    .trim()
    .split("\n")
    .filter(l => l.includes(`"event":"${eventName}"`))
    .map(l => JSON.parse(l) as Record<string, unknown>);
}

function findStepEnd(log: string, stepName: string): Record<string, unknown> | undefined {
  return log
    .trim()
    .split("\n")
    .map(l => {
      try {
        return JSON.parse(l) as Record<string, unknown>;
      } catch {
        return null;
      }
    })
    .find(o => o !== null && o.event === "step.end" && o.step === stepName) ?? undefined;
}

const NODE_ALL_SKIPPED = "# tests 15\\n# pass 0\\n# fail 0\\n# skip 15\\n# todo 0\\n";
const NODE_NORMAL = "# tests 15\\n# pass 12\\n# fail 0\\n# skip 3\\n# todo 0\\n";

// (a) all-skipped verify (exit 0) ⇒ step failed + exactly-one verify.unverified.
test("degenerate verify (all skipped, exit 0) ⇒ failed + exactly-one verify.unverified", async () => {
  const root = await setupRepo(
    `      - name: verify
        agent: bash
        command: scripts/verify.sh
`,
    [{ name: "verify.sh", body: `#!/bin/bash\nprintf "${NODE_ALL_SKIPPED}"\nexit 0\n` }],
  );
  try {
    const r = await runCycle(root, {
      issueId: "VU-1",
      title: "degenerate verify",
      workflow: "feature",
      env: { CYCLE_BASE: "main" },
    });
    assert.equal(r.status, "failed");
    assert.equal(r.failingStep, "verify");

    const log = await readLog(root);
    const unverified = allEvents(log, "verify.unverified").filter(e => e.step === "verify");
    assert.equal(unverified.length, 1, "verify.unverified fires exactly once");
    assert.equal(unverified[0].executed, 0);
    assert.equal(unverified[0].skipped, 15);
    assert.equal(unverified[0].total, 15);
    assert.equal(unverified[0].reason, "zero_executed");

    const stepEnd = findStepEnd(log, "verify");
    assert.ok(stepEnd, "step.end for verify present");
    assert.equal(stepEnd!.status, "failed");
    assert.ok(
      (stepEnd!.stderr as string).includes("verification incomplete"),
      "step.end.stderr carries the diagnostic",
    );

    // The degenerate verdict flips r.status to failed, so the failed-bash .out
    // capture surfaces the verify output.
    const outFull = await readFile(join(r.artifactDir, "verify.out"), "utf8");
    assert.ok(outFull.includes("# skip 15"), ".out artifact has the verify stdout");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

// (b) zero executed with a positive total (no skips) ⇒ block.
test("degenerate verify (0 executed, total > 0, no skips) ⇒ block", async () => {
  // pytest-style: no tests passed, but a total is present via skipped count.
  const out = "# tests 4\\n# pass 0\\n# fail 0\\n# skip 0\\n# todo 0\\n";
  const root = await setupRepo(
    `      - name: verify
        agent: bash
        command: scripts/verify.sh
`,
    [{ name: "verify.sh", body: `#!/bin/bash\nprintf "${out}"\nexit 0\n` }],
  );
  try {
    const r = await runCycle(root, {
      issueId: "VU-2",
      title: "zero executed positive total",
      workflow: "feature",
      env: { CYCLE_BASE: "main" },
    });
    assert.equal(r.status, "failed");
    const log = await readLog(root);
    const unverified = allEvents(log, "verify.unverified").filter(e => e.step === "verify");
    assert.equal(unverified.length, 1);
    assert.equal(unverified[0].total, 4);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

// (c) normal pass with a few skips ⇒ ok, no event.
test("normal verify (≥1 executed with skips) ⇒ ok, no verify.unverified", async () => {
  const root = await setupRepo(
    `      - name: verify
        agent: bash
        command: scripts/verify.sh
`,
    [{ name: "verify.sh", body: `#!/bin/bash\nprintf "${NODE_NORMAL}"\nexit 0\n` }],
  );
  try {
    const r = await runCycle(root, {
      issueId: "VU-3",
      title: "normal verify",
      workflow: "feature",
      env: { CYCLE_BASE: "main" },
    });
    assert.equal(r.status, "ok");
    const log = await readLog(root);
    assert.equal(allEvents(log, "verify.unverified").length, 0, "no verify.unverified on a real pass");
    assert.equal(findStepEnd(log, "verify")!.status, "ok");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

// (d) unparseable output ⇒ outcome byte-for-byte unchanged (ok), no event.
test("unparseable verify output ⇒ fail-open, ok, no verify.unverified", async () => {
  const root = await setupRepo(
    `      - name: verify
        agent: bash
        command: scripts/verify.sh
`,
    [{ name: "verify.sh", body: `#!/bin/bash\necho "all good, shipping it"\nexit 0\n` }],
  );
  try {
    const r = await runCycle(root, {
      issueId: "VU-4",
      title: "unparseable verify",
      workflow: "feature",
      env: { CYCLE_BASE: "main" },
    });
    assert.equal(r.status, "ok");
    const log = await readLog(root);
    assert.equal(allEvents(log, "verify.unverified").length, 0);
    assert.equal(findStepEnd(log, "verify")!.status, "ok");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

// (e) non-zero verify exit ⇒ existing failure path, hook does not fire.
test("non-zero verify exit ⇒ existing failure path, no verify.unverified", async () => {
  const root = await setupRepo(
    `      - name: verify
        agent: bash
        command: scripts/verify.sh
`,
    // Exits non-zero even though stdout would parse as degenerate.
    [{ name: "verify.sh", body: `#!/bin/bash\nprintf "${NODE_ALL_SKIPPED}"\nexit 1\n` }],
  );
  try {
    const r = await runCycle(root, {
      issueId: "VU-5",
      title: "non-zero verify",
      workflow: "feature",
      env: { CYCLE_BASE: "main" },
    });
    assert.equal(r.status, "failed");
    const log = await readLog(root);
    assert.equal(allEvents(log, "verify.unverified").length, 0, "hook must not fire on a non-zero exit");
    const stepEnd = findStepEnd(log, "verify")!;
    assert.equal(stepEnd.status, "failed");
    // The stderr is NOT the degenerate diagnostic — it is the native failure.
    assert.ok(
      !(stepEnd.stderr as string ?? "").includes("verification incomplete"),
      "non-zero exit keeps its native failure surfacing, not the degenerate diagnostic",
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

// (f) final_verify degenerate ⇒ routes through the failed-cycle path.
test("degenerate final_verify ⇒ failed cycle + verify.unverified", async () => {
  const root = await setupRepo(
    `      - name: final_verify
        agent: bash
        command: scripts/verify.sh
`,
    [{ name: "verify.sh", body: `#!/bin/bash\nprintf "${NODE_ALL_SKIPPED}"\nexit 0\n` }],
  );
  try {
    const r = await runCycle(root, {
      issueId: "VU-6",
      title: "degenerate final_verify",
      workflow: "feature",
      env: { CYCLE_BASE: "main" },
    });
    assert.equal(r.status, "failed");
    assert.equal(r.failingStep, "final_verify");
    const log = await readLog(root);
    const unverified = allEvents(log, "verify.unverified").filter(e => e.step === "final_verify");
    assert.equal(unverified.length, 1);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

// A non-verify bash step with degenerate-looking output is never gated.
test("non-verify bash step with degenerate-looking output ⇒ unaffected", async () => {
  const root = await setupRepo(
    `      - name: build
        agent: bash
        command: scripts/build.sh
`,
    // build.sh both prints degenerate output AND makes a code change so the
    // empty-diff guard does not fire.
    [{
      name: "build.sh",
      body: `#!/bin/bash\nmkdir -p src\necho "x" > src/touched.txt\nprintf "${NODE_ALL_SKIPPED}"\nexit 0\n`,
    }],
  );
  try {
    const r = await runCycle(root, {
      issueId: "VU-7",
      title: "non-verify step",
      workflow: "feature",
      env: { CYCLE_BASE: "main" },
    });
    assert.equal(r.status, "ok");
    const log = await readLog(root);
    assert.equal(allEvents(log, "verify.unverified").length, 0, "gate is keyed to verify/final_verify only");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

// Config knob: verify_min_executed: 0 disables the gate (executed < 0 is never true).
test("verify_min_executed: 0 ⇒ degenerate run is not blocked", async () => {
  const root = await setupRepo(
    `      - name: verify
        agent: bash
        command: scripts/verify.sh
`,
    [{ name: "verify.sh", body: `#!/bin/bash\nprintf "${NODE_ALL_SKIPPED}"\nexit 0\n` }],
    "\n  verify_min_executed: 0",
  );
  try {
    const r = await runCycle(root, {
      issueId: "VU-8",
      title: "knob disables gate",
      workflow: "feature",
      env: { CYCLE_BASE: "main" },
    });
    assert.equal(r.status, "ok");
    const log = await readLog(root);
    assert.equal(allEvents(log, "verify.unverified").length, 0);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

// Config knob: verify_min_executed: 5 raises the floor (12 executed still passes;
// 3 executed would block). Here 12 executed ⇒ ok.
test("verify_min_executed: 5 ⇒ a run with 12 executed still passes", async () => {
  const root = await setupRepo(
    `      - name: verify
        agent: bash
        command: scripts/verify.sh
`,
    [{ name: "verify.sh", body: `#!/bin/bash\nprintf "${NODE_NORMAL}"\nexit 0\n` }],
    "\n  verify_min_executed: 5",
  );
  try {
    const r = await runCycle(root, {
      issueId: "VU-9",
      title: "floor honored",
      workflow: "feature",
      env: { CYCLE_BASE: "main" },
    });
    assert.equal(r.status, "ok");
    const log = await readLog(root);
    assert.equal(allEvents(log, "verify.unverified").length, 0);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

// Config knob: malformed verify_min_executed ⇒ defaults to 1 (degenerate blocks).
test("malformed verify_min_executed ⇒ default 1, degenerate run blocks", async () => {
  const root = await setupRepo(
    `      - name: verify
        agent: bash
        command: scripts/verify.sh
`,
    [{ name: "verify.sh", body: `#!/bin/bash\nprintf "${NODE_ALL_SKIPPED}"\nexit 0\n` }],
    "\n  verify_min_executed: -3",
  );
  try {
    const r = await runCycle(root, {
      issueId: "VU-10",
      title: "malformed knob defaults to 1",
      workflow: "feature",
      env: { CYCLE_BASE: "main" },
    });
    assert.equal(r.status, "failed");
    const log = await readLog(root);
    assert.equal(allEvents(log, "verify.unverified").filter(e => e.step === "verify").length, 1);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
