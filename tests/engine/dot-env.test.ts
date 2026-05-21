import { test, mock } from "node:test";
import { strict as assert } from "node:assert";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { writeFileSync, chmodSync, rmSync } from "node:fs";
import * as nodefs from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadDotEnv } from "../../src/engine/dot-env.ts";
import { loadConfig } from "../../src/engine/workflow.ts";

const ENGINE_YAML = `engine:
  max_consecutive_failures: 2
  base_branch: main
  commit:
    mode: worktree-pr
    push: true
triage:
  agent: claudecode
  prompt: prompts/triage.md
  max_turns: 10
workflows:
  - name: feature
    max_cycle_attempts: 3
    steps:
      - name: spec
        agent: claudecode
        prompt: prompts/spec.md
`;

test("ENOENT is a no-op", () => {
  const missingPath = join(tmpdir(), `cycle-dot-env-missing-${Date.now()}`);
  assert.doesNotThrow(() => loadDotEnv(missingPath));
});

test("normal KEY=VALUE is set", () => {
  const filePath = join(tmpdir(), `cycle-dot-env-${Date.now()}.env`);
  const prev = process.env.CYCLE_TEST_DOT_ENV_KEY;
  try {
    writeFileSync(filePath, "CYCLE_TEST_DOT_ENV_KEY=hello\n", "utf8");
    delete process.env.CYCLE_TEST_DOT_ENV_KEY;
    loadDotEnv(filePath);
    assert.equal(process.env.CYCLE_TEST_DOT_ENV_KEY, "hello");
  } finally {
    if (prev === undefined) delete process.env.CYCLE_TEST_DOT_ENV_KEY;
    else process.env.CYCLE_TEST_DOT_ENV_KEY = prev;
  }
});

test("blank lines are skipped", () => {
  const filePath = join(tmpdir(), `cycle-dot-env-${Date.now()}.env`);
  const prev = process.env.CYCLE_TEST_BLANK_KEY;
  try {
    writeFileSync(filePath, "\n\nCYCLE_TEST_BLANK_KEY=set\n\n\n", "utf8");
    delete process.env.CYCLE_TEST_BLANK_KEY;
    assert.doesNotThrow(() => loadDotEnv(filePath));
    assert.equal(process.env.CYCLE_TEST_BLANK_KEY, "set");
  } finally {
    if (prev === undefined) delete process.env.CYCLE_TEST_BLANK_KEY;
    else process.env.CYCLE_TEST_BLANK_KEY = prev;
  }
});

test("#-comment lines are skipped", () => {
  const filePath = join(tmpdir(), `cycle-dot-env-${Date.now()}.env`);
  try {
    writeFileSync(filePath, "# CYCLE_TEST_COMMENT_KEY=should_not_be_set\n", "utf8");
    loadDotEnv(filePath);
    assert.equal(process.env.CYCLE_TEST_COMMENT_KEY, undefined);
  } finally {
    delete process.env.CYCLE_TEST_COMMENT_KEY;
  }
});

test("lines with no = are skipped", () => {
  const filePath = join(tmpdir(), `cycle-dot-env-${Date.now()}.env`);
  try {
    writeFileSync(filePath, "NOEQUALSSIGN\n", "utf8");
    assert.doesNotThrow(() => loadDotEnv(filePath));
    assert.equal(process.env.NOEQUALSSIGN, undefined);
  } finally {
    delete process.env.NOEQUALSSIGN;
  }
});

test("real-env-wins — existing env var takes precedence over file", () => {
  const filePath = join(tmpdir(), `cycle-dot-env-${Date.now()}.env`);
  const prev = process.env.CYCLE_TEST_PREEXISTING;
  try {
    writeFileSync(filePath, "CYCLE_TEST_PREEXISTING=override\n", "utf8");
    process.env.CYCLE_TEST_PREEXISTING = "original";
    loadDotEnv(filePath);
    assert.equal(process.env.CYCLE_TEST_PREEXISTING, "original");
  } finally {
    if (prev === undefined) delete process.env.CYCLE_TEST_PREEXISTING;
    else process.env.CYCLE_TEST_PREEXISTING = prev;
  }
});

test("non-ENOENT error (EACCES) is re-thrown with actionable message", () => {
  const fakeErr = Object.assign(new Error("EACCES"), { code: "EACCES" });

  if (process.getuid?.() === 0) {
    const m = mock.method(nodefs, "readFileSync", () => { throw fakeErr; });
    try {
      assert.throws(
        () => loadDotEnv("any.env"),
        (err: unknown) => {
          assert.ok(err instanceof Error);
          assert.equal((err as NodeJS.ErrnoException).code, "EACCES");
          assert.ok((err as Error).message.includes("Cannot read .env file"));
          return true;
        }
      );
    } finally {
      m.mock.restore();
    }
    return;
  }

  const filePath = join(tmpdir(), `cycle-dot-env-eacces-${Date.now()}.env`);
  writeFileSync(filePath, "KEY=value\n", "utf8");
  chmodSync(filePath, 0o000);
  try {
    assert.throws(
      () => loadDotEnv(filePath),
      (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.equal((err as NodeJS.ErrnoException).code, "EACCES");
        assert.ok((err as Error).message.includes("Cannot read .env file"));
        return true;
      }
    );
  } finally {
    chmodSync(filePath, 0o644);
    rmSync(filePath);
  }
});

test("integration smoke — CYCLE_TRUNK_BASED propagates to loadConfig", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-test-"));
  const filePath = join(tmpdir(), `cycle-dot-env-${Date.now()}.env`);
  const prev = process.env.CYCLE_TRUNK_BASED;
  try {
    await mkdir(join(root, ".cycle"), { recursive: true });
    await writeFile(join(root, ".cycle/workflows.yml"), ENGINE_YAML, "utf8");
    writeFileSync(filePath, "CYCLE_TRUNK_BASED=1\n", "utf8");
    delete process.env.CYCLE_TRUNK_BASED;
    loadDotEnv(filePath);
    const cfg = await loadConfig(root);
    assert.equal(cfg.engine.commit.mode, "trunk");
  } finally {
    if (prev === undefined) delete process.env.CYCLE_TRUNK_BASED;
    else process.env.CYCLE_TRUNK_BASED = prev;
    await rm(root, { recursive: true, force: true });
  }
});
