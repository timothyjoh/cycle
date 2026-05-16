import { test } from "node:test";
import { strict as assert } from "node:assert";
import { mkdtemp, mkdir, writeFile, readFile, rm, chmod, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import {
  runCycle,
  SPEC_MIN_BYTES,
  formatSpecGuardError,
} from "../../src/engine/run-cycle.ts";

function git(cwd: string, args: string[]) {
  const r = spawnSync("git", args, { cwd, encoding: "utf8" });
  if (r.status !== 0) throw new Error(`git ${args.join(" ")}: ${r.stderr}`);
  return r.stdout;
}

function workflowYml(stepsBody: string, opts: { noBranch?: boolean } = {}): string {
  const noBranchLine = opts.noBranch ? "    no_branch: true\n" : "";
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
${noBranchLine}    steps:
${stepsBody}`;
}

async function setupRepo(noBranch: boolean, fakeBody: string) {
  const root = await mkdtemp(join(tmpdir(), "cycle-spec-guard-rc-"));
  const bin = await mkdtemp(join(tmpdir(), "cycle-spec-guard-bin-"));
  git(root, ["init", "-b", "main"]);
  git(root, ["config", "user.email", "t@t"]);
  git(root, ["config", "user.name", "t"]);
  git(root, ["commit", "--allow-empty", "-m", "init"]);

  await mkdir(join(root, ".cycle/prompts"), { recursive: true });
  await writeFile(
    join(root, ".cycle/workflows.yml"),
    workflowYml(
      `      - name: spec
        agent: claudecode
        prompt: prompts/spec.md
`,
      { noBranch },
    ),
    "utf8",
  );
  await writeFile(join(root, ".cycle/prompts/spec.md"), "noop", "utf8");

  const fake = join(bin, "claude");
  await writeFile(fake, fakeBody, "utf8");
  await chmod(fake, 0o755);
  return { root, bin };
}

async function cleanup(root: string, bin: string) {
  await rm(root, { recursive: true, force: true });
  await rm(bin, { recursive: true, force: true });
}

for (const noBranch of [false, true]) {
  const label = noBranch ? "no_branch" : "branch";

  test(`spec-guard [${label}]: empty payload fails`, async () => {
    const { root, bin } = await setupRepo(noBranch, `#!/bin/bash\nprintf ''\n`);
    try {
      const r = await runCycle(root, {
        issueId: "SG-EMPTY",
        title: "spec guard empty",
        workflow: "feature",
        env: { PATH: `${bin}:${process.env.PATH}`, CYCLE_BASE: "main" },
      });
      assert.equal(r.status, "failed");
      assert.equal(r.status === "failed" ? r.failingStep : null, "spec");

      const log = await readFile(join(root, ".cycle/log.jsonl"), "utf8");
      assert.match(
        log,
        /"event":"step\.end","cycle_id":"\d+","step":"spec","status":"failed","exit_code":1/,
      );
      assert.match(
        log,
        /"event":"cycle\.end","cycle_id":"\d+","status":"failed","failing_step":"spec"/,
      );
      assert.doesNotMatch(log, /"event":"step\.start"[^\n]*"step":"research"/);
    } finally {
      await cleanup(root, bin);
    }
  });

  test(`spec-guard [${label}]: under-threshold payload fails + artifact persisted`, async () => {
    const payload = "x".repeat(50);
    const { root, bin } = await setupRepo(
      noBranch,
      `#!/bin/bash\nprintf '%s' '${payload}'\n`,
    );
    try {
      const r = await runCycle(root, {
        issueId: "SG-UNDER",
        title: "spec guard under",
        workflow: "feature",
        env: { PATH: `${bin}:${process.env.PATH}`, CYCLE_BASE: "main" },
      });
      assert.equal(r.status, "failed");
      assert.equal(r.status === "failed" ? r.failingStep : null, "spec");

      const log = await readFile(join(root, ".cycle/log.jsonl"), "utf8");
      assert.match(
        log,
        /"event":"step\.end","cycle_id":"\d+","step":"spec","status":"failed","exit_code":1/,
      );
      assert.match(
        log,
        /"event":"cycle\.end","cycle_id":"\d+","status":"failed","failing_step":"spec"/,
      );
      assert.doesNotMatch(log, /"event":"step\.start"[^\n]*"step":"research"/);

      const artifactDir = join(root, "docs/cycle", `${r.cycleId}-feature-spec-guard-under`);
      const specMd = await readFile(join(artifactDir, "SPEC.md"), "utf8");
      // Sanitization is a no-op for plain 'x' text, but appends a trailing newline.
      assert.equal(specMd, payload + "\n");
      assert.ok(Buffer.byteLength(specMd, "utf8") < SPEC_MIN_BYTES);
    } finally {
      await cleanup(root, bin);
    }
  });

  test(`spec-guard [${label}]: at-threshold payload passes`, async () => {
    // 199 x's + (sanitizer appends '\n') = 200 bytes exactly.
    const payload = "x".repeat(199);
    const { root, bin } = await setupRepo(
      noBranch,
      `#!/bin/bash\nprintf '%s' '${payload}'\n`,
    );
    try {
      const r = await runCycle(root, {
        issueId: "SG-AT",
        title: "spec guard at",
        workflow: "feature",
        env: { PATH: `${bin}:${process.env.PATH}`, CYCLE_BASE: "main" },
      });
      assert.equal(r.status, "ok");

      const log = await readFile(join(root, ".cycle/log.jsonl"), "utf8");
      assert.match(
        log,
        /"event":"step\.end","cycle_id":"\d+","step":"spec","status":"ok"/,
      );
      assert.doesNotMatch(
        log,
        /"event":"step\.end","cycle_id":"\d+","step":"spec","status":"failed"/,
      );

      const artifactDir = join(root, "docs/cycle", `${r.cycleId}-feature-spec-guard-at`);
      const st = await stat(join(artifactDir, "SPEC.md"));
      assert.equal(st.size, SPEC_MIN_BYTES);
    } finally {
      await cleanup(root, bin);
    }
  });
}

test("spec-guard [branch]: raw>=200 but sanitized<200 still fails", async () => {
  const fakeBody = `#!/bin/bash
for i in $(seq 1 10); do echo "Now I will write the spec for cycle X."; done
`;
  const { root, bin } = await setupRepo(false, fakeBody);
  try {
    const r = await runCycle(root, {
      issueId: "SG-SANITIZE",
      title: "spec guard sanitize",
      workflow: "feature",
      env: { PATH: `${bin}:${process.env.PATH}`, CYCLE_BASE: "main" },
    });
    assert.equal(r.status, "failed");
    assert.equal(r.status === "failed" ? r.failingStep : null, "spec");

    const log = await readFile(join(root, ".cycle/log.jsonl"), "utf8");
    assert.match(
      log,
      /"event":"step\.end","cycle_id":"\d+","step":"spec","status":"failed","exit_code":1/,
    );
    assert.match(
      log,
      /"event":"cycle\.end","cycle_id":"\d+","status":"failed","failing_step":"spec"/,
    );
    assert.doesNotMatch(log, /"event":"step\.start"[^\n]*"step":"research"/);

    const artifactDir = join(root, "docs/cycle", `${r.cycleId}-feature-spec-guard-sanitize`);
    const specMd = await readFile(join(artifactDir, "SPEC.md"), "utf8");
    // Sanitizer strips every "Now …" line, leaving empty -> "" written verbatim.
    assert.equal(specMd, "");
    assert.ok(Buffer.byteLength(specMd, "utf8") < SPEC_MIN_BYTES);
  } finally {
    await cleanup(root, bin);
  }
});

test("formatSpecGuardError: stable greppable shape", () => {
  const out = formatSpecGuardError("/abs/path/SPEC.md", 42, 200);
  assert.equal(out, "spec post-condition failed: /abs/path/SPEC.md is 42 bytes (< 200)");
  assert.match(out, /^spec post-condition failed: /);
  assert.match(out, /is 42 bytes \(< 200\)$/);
});

test("SPEC_MIN_BYTES is 200", () => {
  assert.equal(SPEC_MIN_BYTES, 200);
});
