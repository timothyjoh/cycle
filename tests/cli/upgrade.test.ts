import { test } from "node:test";
import { strict as assert } from "node:assert";
import { mkdtemp, readFile, writeFile, stat, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runInit } from "../../src/cli/init.ts";
import { runUpgrade } from "../../src/cli/upgrade.ts";

const SENTINEL_WORKFLOWS = "# USER-EDITED workflows sentinel\n";
const SENTINEL_PROMPT = "# USER-EDITED spec prompt sentinel\n";
const SENTINEL_SCRIPT = "#!/usr/bin/env bash\n# USER-EDITED verify sentinel\n";
const SENTINEL_ENV = "CYCLE_TRUNK_BASED=1\n";
const SENTINEL_TBD = '{"sentinel":"tbd"}\n';
const SENTINEL_LOG = '{"event":"sentinel"}\n';
const SENTINEL_ISSUE = "user issue sentinel\n";

// Seed an initialized repo, then user-edit the three config categories and
// write sentinel state files. Returns the absolute paths used for assertions.
async function seedInitializedRepo(root: string) {
  await runInit({ targetRoot: root, force: false });

  const workflows = join(root, ".cycle/workflows.yml");
  const prompt = join(root, ".cycle/prompts/spec.md");
  const script = join(root, ".cycle/scripts/verify.sh");
  await writeFile(workflows, SENTINEL_WORKFLOWS);
  await writeFile(prompt, SENTINEL_PROMPT);
  await writeFile(script, SENTINEL_SCRIPT);

  const env = join(root, ".cycle/.env");
  const tbd = join(root, ".cycle/tbd.jsonl");
  const log = join(root, ".cycle/log.jsonl");
  const issue = join(root, "docs/cycle/issues/todo/user-issue.md");
  await writeFile(env, SENTINEL_ENV);
  await writeFile(tbd, SENTINEL_TBD);
  await writeFile(log, SENTINEL_LOG);
  await writeFile(issue, SENTINEL_ISSUE);

  return { workflows, prompt, script, env, tbd, log, issue };
}

async function assertStateUntouched(p: Awaited<ReturnType<typeof seedInitializedRepo>>) {
  assert.equal(await readFile(p.env, "utf8"), SENTINEL_ENV);
  assert.equal(await readFile(p.tbd, "utf8"), SENTINEL_TBD);
  assert.equal(await readFile(p.log, "utf8"), SENTINEL_LOG);
  assert.equal(await readFile(p.issue, "utf8"), SENTINEL_ISSUE);
}

test("upgrade with no flags preserves all three config categories byte-for-byte", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-test-"));
  try {
    const p = await seedInitializedRepo(root);
    const r = await runUpgrade({ targetRoot: root, argv: [] });
    assert.equal(r.exitCode, 0);
    assert.match(r.stdout, /Preserved/);
    assert.equal(await readFile(p.workflows, "utf8"), SENTINEL_WORKFLOWS);
    assert.equal(await readFile(p.prompt, "utf8"), SENTINEL_PROMPT);
    assert.equal(await readFile(p.script, "utf8"), SENTINEL_SCRIPT);
    await assertStateUntouched(p);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("upgrade always refreshes engine artifacts even when config is preserved", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-test-"));
  try {
    const p = await seedInitializedRepo(root);
    // Corrupt the engine bin so we can prove it is refreshed.
    await writeFile(join(root, ".cycle/bin/cycle.js"), "stale\n");
    const r = await runUpgrade({ targetRoot: root, argv: [] });
    assert.equal(r.exitCode, 0);

    const bin = join(root, ".cycle/bin/cycle.js");
    const sb = await stat(bin);
    assert.ok((sb.mode & 0o111) !== 0, "cycle.js should be exec");
    const head = (await readFile(bin, "utf8")).slice(0, 30);
    assert.match(head, /^#!\/usr\/bin\/env node/);
    const pkg = JSON.parse(await readFile(join(root, ".cycle/package.json"), "utf8"));
    assert.equal(pkg.type, "module");
    // Config still preserved.
    assert.equal(await readFile(p.workflows, "utf8"), SENTINEL_WORKFLOWS);
    await assertStateUntouched(p);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("--overwrite-prompts replaces only prompts; workflows and scripts preserved", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-test-"));
  try {
    const p = await seedInitializedRepo(root);
    const r = await runUpgrade({ targetRoot: root, argv: ["--overwrite-prompts"] });
    assert.equal(r.exitCode, 0);
    assert.notEqual(await readFile(p.prompt, "utf8"), SENTINEL_PROMPT);
    assert.equal(await readFile(p.workflows, "utf8"), SENTINEL_WORKFLOWS);
    assert.equal(await readFile(p.script, "utf8"), SENTINEL_SCRIPT);
    await assertStateUntouched(p);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("--overwrite-workflows replaces only workflows.yml", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-test-"));
  try {
    const p = await seedInitializedRepo(root);
    const r = await runUpgrade({ targetRoot: root, argv: ["--overwrite-workflows"] });
    assert.equal(r.exitCode, 0);
    assert.notEqual(await readFile(p.workflows, "utf8"), SENTINEL_WORKFLOWS);
    assert.equal(await readFile(p.prompt, "utf8"), SENTINEL_PROMPT);
    assert.equal(await readFile(p.script, "utf8"), SENTINEL_SCRIPT);
    await assertStateUntouched(p);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("--overwrite-scripts replaces only scripts", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-test-"));
  try {
    const p = await seedInitializedRepo(root);
    const r = await runUpgrade({ targetRoot: root, argv: ["--overwrite-scripts"] });
    assert.equal(r.exitCode, 0);
    assert.notEqual(await readFile(p.script, "utf8"), SENTINEL_SCRIPT);
    assert.equal(await readFile(p.workflows, "utf8"), SENTINEL_WORKFLOWS);
    assert.equal(await readFile(p.prompt, "utf8"), SENTINEL_PROMPT);
    await assertStateUntouched(p);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("--overwrite-prompts clean-replaces: stray user file removed", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-test-"));
  try {
    await seedInitializedRepo(root);
    const stray = join(root, ".cycle/prompts/stray-user-file.md");
    await writeFile(stray, "stray\n");
    const r = await runUpgrade({ targetRoot: root, argv: ["--overwrite-prompts"] });
    assert.equal(r.exitCode, 0);
    await assert.rejects(
      () => stat(stray),
      (e: NodeJS.ErrnoException) => e.code === "ENOENT",
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("--overwrite-all overwrites all three categories", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-test-"));
  try {
    const p = await seedInitializedRepo(root);
    const r = await runUpgrade({ targetRoot: root, argv: ["--overwrite-all"] });
    assert.equal(r.exitCode, 0);
    assert.notEqual(await readFile(p.workflows, "utf8"), SENTINEL_WORKFLOWS);
    assert.notEqual(await readFile(p.prompt, "utf8"), SENTINEL_PROMPT);
    assert.notEqual(await readFile(p.script, "utf8"), SENTINEL_SCRIPT);
    await assertStateUntouched(p);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("uninitialized repo errors, points to cycle init, and writes nothing", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-test-"));
  try {
    const r = await runUpgrade({ targetRoot: root, argv: [] });
    assert.equal(r.exitCode, 1);
    assert.match(r.stderr, /\.cycle\//);
    assert.match(r.stderr, /cycle init/);
    await assert.rejects(
      () => stat(join(root, ".cycle")),
      (e: NodeJS.ErrnoException) => e.code === "ENOENT",
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("non-directory .cycle errors as uninitialized", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-test-"));
  try {
    await writeFile(join(root, ".cycle"), "not a dir\n");
    const r = await runUpgrade({ targetRoot: root, argv: [] });
    assert.equal(r.exitCode, 1);
    assert.match(r.stderr, /cycle init/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("unknown flag errors and writes nothing", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-test-"));
  try {
    const p = await seedInitializedRepo(root);
    const r = await runUpgrade({ targetRoot: root, argv: ["--overwrite-foo"] });
    assert.equal(r.exitCode, 1);
    assert.match(r.stderr, /Unknown flag\(s\): --overwrite-foo/);
    // No write occurred — sentinels intact.
    assert.equal(await readFile(p.workflows, "utf8"), SENTINEL_WORKFLOWS);
    await assertStateUntouched(p);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
