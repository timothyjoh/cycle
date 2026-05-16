import { test } from "node:test";
import { strict as assert } from "node:assert";
import {
  mkdtemp,
  mkdir,
  writeFile,
  readFile,
  readdir,
  rm,
  chmod,
  stat,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";

const REPO = process.cwd();

async function ensureDist(): Promise<string> {
  const distPath = join(REPO, "dist", "cycle.js");
  await readFile(distPath, "utf8");
  return distPath;
}

const workflowYml = `engine:
  max_consecutive_failures: 2
  base_branch: main
triage:
  agent: claudecode
  prompt: prompts/triage.md
  max_turns: 10
workflows:
  - name: feature
    max_cycle_attempts: 3
    steps:
      - name: noop
        agent: bash
        command: scripts/noop.sh
`;

const fakeClaudeOk = `#!/bin/bash
PROMPT="$3"
RAW_ID=$(printf '%s' "$PROMPT" | grep -oE '=== raw: [^ ]+ ===' | head -1 | sed 's/=== raw: //;s/ ===//')
cat <<JSON
{"ordering":["\${RAW_ID}-a","\${RAW_ID}-b"],"children":[{"raw_id":"\${RAW_ID}","slug":"a","id":"\${RAW_ID}-a","title":"A","workflow":"feature","depends_on":[],"body":"A body"},{"raw_id":"\${RAW_ID}","slug":"b","id":"\${RAW_ID}-b","title":"B","workflow":"feature","depends_on":["\${RAW_ID}-a"],"body":"B body"}],"decomposed_parents":["\${RAW_ID}"]}
JSON
`;

const fakeClaudeBad = `#!/bin/bash
echo "not even close to json"
`;

function rawFile(id: string, title: string): string {
  return [
    "---",
    `id: ${id}`,
    "source: text",
    `title: "${title}"`,
    "added_at: 2026-05-13T00:00:00Z",
    "triage_attempts: 0",
    "---",
    "",
    title,
    "",
  ].join("\n");
}

async function bootstrapRepo(
  root: string,
  fakeBin: string,
  fakeScript: string,
): Promise<void> {
  spawnSync("git", ["init", "-b", "main"], { cwd: root, stdio: "ignore" });
  spawnSync("git", ["config", "user.email", "t@t"], { cwd: root, stdio: "ignore" });
  spawnSync("git", ["config", "user.name", "t"], { cwd: root, stdio: "ignore" });

  const cycleDir = join(root, ".cycle");
  const scriptsDir = join(cycleDir, "scripts");
  const promptsDir = join(cycleDir, "prompts");
  await mkdir(scriptsDir, { recursive: true });
  await mkdir(promptsDir, { recursive: true });
  await mkdir(join(root, "docs/cycle/issues/raw"), { recursive: true });
  await mkdir(join(root, "docs/cycle/issues/todo"), { recursive: true });
  await mkdir(join(root, "docs/cycle/issues/done"), { recursive: true });
  await mkdir(join(root, "docs/cycle/issues/failed"), { recursive: true });

  await writeFile(join(cycleDir, "workflows.yml"), workflowYml, "utf8");
  await writeFile(
    join(promptsDir, "triage.md"),
    "RAWS:{{RAWS_BLOCK}}\nTBD:{{TBD_JSONL}}\nTODO:{{TODO_LISTING}}\nFB:{{RETRY_FEEDBACK}}",
    "utf8",
  );
  const noop = join(scriptsDir, "noop.sh");
  await writeFile(noop, "#!/bin/bash\nexit 0\n", "utf8");
  await chmod(noop, 0o755);

  const bin = join(fakeBin, "claude");
  await writeFile(bin, fakeScript, "utf8");
  await chmod(bin, 0o755);
}

async function dirSnapshot(
  dir: string,
): Promise<{ files: string[]; sha: string }> {
  let entries: string[];
  try {
    entries = (await readdir(dir)).sort();
  } catch {
    return { files: [], sha: "" };
  }
  const h = createHash("sha256");
  for (const f of entries) {
    h.update(f);
    h.update("\0");
    h.update(await readFile(join(dir, f)));
  }
  return { files: entries, sha: h.digest("hex") };
}

async function fileBytes(p: string): Promise<Buffer | null> {
  try {
    return await readFile(p);
  } catch {
    return null;
  }
}

test("cycle triage --help: prints no-side-effects contract, exit 0", async () => {
  const dist = await ensureDist();
  const root = await mkdtemp(join(tmpdir(), "cycle-triage-help-"));
  try {
    const res = spawnSync("node", [dist, "triage", "--help"], {
      cwd: root,
      encoding: "utf8",
    });
    assert.equal(res.status, 0, `stderr: ${res.stderr}`);
    assert.ok(res.stdout.includes("performs no engine-side filesystem mutations"));
    assert.ok(res.stdout.includes("--dry-run"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("cycle triage (no flag): prints help on stderr, exit 2", async () => {
  const dist = await ensureDist();
  const root = await mkdtemp(join(tmpdir(), "cycle-triage-noflag-"));
  try {
    const res = spawnSync("node", [dist, "triage"], {
      cwd: root,
      encoding: "utf8",
    });
    assert.equal(res.status, 2, `stdout: ${res.stdout}\nstderr: ${res.stderr}`);
    assert.ok(res.stderr.includes("Usage: cycle triage --dry-run"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("cycle triage --dry-run happy path: two raws, JSON report, exit 0", async () => {
  const dist = await ensureDist();
  const root = await mkdtemp(join(tmpdir(), "cycle-triage-dry-ok-"));
  const binDir = await mkdtemp(join(tmpdir(), "cycle-triage-bin-"));
  try {
    await bootstrapRepo(root, binDir, fakeClaudeOk);
    await writeFile(
      join(root, "docs/cycle/issues/raw/r1.md"),
      rawFile("r1", "raw one"),
      "utf8",
    );
    await writeFile(
      join(root, "docs/cycle/issues/raw/r2.md"),
      rawFile("r2", "raw two"),
      "utf8",
    );

    const res = spawnSync("node", [dist, "triage", "--dry-run"], {
      cwd: root,
      encoding: "utf8",
      env: { ...process.env, PATH: `${binDir}:${process.env.PATH ?? ""}` },
    });
    assert.equal(
      res.status,
      0,
      `exit ${res.status}\nstdout: ${res.stdout}\nstderr: ${res.stderr}`,
    );
    const parsed = JSON.parse(res.stdout);
    assert.equal(Array.isArray(parsed), true);
    assert.equal(parsed.length, 2);
    for (const r of parsed) {
      assert.equal(r.status, "ok");
      assert.equal(r.attempts, 1);
      assert.ok(Array.isArray(r.children));
    }
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(binDir, { recursive: true, force: true });
  }
});

test("cycle triage --dry-run validation failure: exit 1, last_error populated", async () => {
  const dist = await ensureDist();
  const root = await mkdtemp(join(tmpdir(), "cycle-triage-dry-fail-"));
  const binDir = await mkdtemp(join(tmpdir(), "cycle-triage-bin-"));
  try {
    await bootstrapRepo(root, binDir, fakeClaudeBad);
    await writeFile(
      join(root, "docs/cycle/issues/raw/oops.md"),
      rawFile("oops", "oops"),
      "utf8",
    );

    const res = spawnSync("node", [dist, "triage", "--dry-run"], {
      cwd: root,
      encoding: "utf8",
      env: { ...process.env, PATH: `${binDir}:${process.env.PATH ?? ""}` },
    });
    assert.equal(res.status, 1, `expected exit 1 got ${res.status}`);
    const parsed = JSON.parse(res.stdout);
    assert.equal(parsed.length, 1);
    assert.equal(parsed[0].status, "failed");
    assert.equal(parsed[0].attempts, 3);
    assert.ok(parsed[0].last_error);
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(binDir, { recursive: true, force: true });
  }
});

test("cycle triage --dry-run byte-identity: log.jsonl, tbd.jsonl, raw/, todo/ unchanged", async () => {
  const dist = await ensureDist();
  const root = await mkdtemp(join(tmpdir(), "cycle-triage-dry-bi-"));
  const binDir = await mkdtemp(join(tmpdir(), "cycle-triage-bin-"));
  try {
    await bootstrapRepo(root, binDir, fakeClaudeOk);
    await writeFile(
      join(root, "docs/cycle/issues/raw/keep.md"),
      rawFile("keep", "keep me"),
      "utf8",
    );
    // Pre-seed tbd.jsonl and log.jsonl with non-trivial content.
    const queueBody =
      JSON.stringify({
        id: "EXISTING",
        title: "preexisting",
        status: "pending",
        attempt: 0,
        depends_on: [],
        triaged_at: "2026-05-13T00:00:00Z",
      }) + "\n";
    await writeFile(join(root, ".cycle/tbd.jsonl"), queueBody, "utf8");
    await writeFile(
      join(root, "docs/cycle/issues/todo/EXISTING.md"),
      rawFile("EXISTING", "preexisting"),
      "utf8",
    );
    const logBody = JSON.stringify({ ts: "2026-05-13T00:00:00Z", event: "preexisting" }) + "\n";
    await writeFile(join(root, ".cycle/log.jsonl"), logBody, "utf8");

    const before = {
      raw: await dirSnapshot(join(root, "docs/cycle/issues/raw")),
      todo: await dirSnapshot(join(root, "docs/cycle/issues/todo")),
      done: await dirSnapshot(join(root, "docs/cycle/issues/done")),
      failed: await dirSnapshot(join(root, "docs/cycle/issues/failed")),
      tbd: await fileBytes(join(root, ".cycle/tbd.jsonl")),
      log: await fileBytes(join(root, ".cycle/log.jsonl")),
    };

    const res = spawnSync("node", [dist, "triage", "--dry-run"], {
      cwd: root,
      encoding: "utf8",
      env: { ...process.env, PATH: `${binDir}:${process.env.PATH ?? ""}` },
    });
    assert.equal(res.status, 0, `exit ${res.status} stderr: ${res.stderr}`);

    const after = {
      raw: await dirSnapshot(join(root, "docs/cycle/issues/raw")),
      todo: await dirSnapshot(join(root, "docs/cycle/issues/todo")),
      done: await dirSnapshot(join(root, "docs/cycle/issues/done")),
      failed: await dirSnapshot(join(root, "docs/cycle/issues/failed")),
      tbd: await fileBytes(join(root, ".cycle/tbd.jsonl")),
      log: await fileBytes(join(root, ".cycle/log.jsonl")),
    };

    assert.deepEqual(after.raw, before.raw);
    assert.deepEqual(after.todo, before.todo);
    assert.deepEqual(after.done, before.done);
    assert.deepEqual(after.failed, before.failed);
    assert.ok(
      after.tbd && before.tbd && after.tbd.equals(before.tbd),
      "tbd.jsonl bytes changed",
    );
    assert.ok(
      after.log && before.log && after.log.equals(before.log),
      "log.jsonl was appended to",
    );
    // Also verify size match explicitly per SPEC.
    const sizeBefore = (await stat(join(root, ".cycle/log.jsonl"))).size;
    assert.equal(sizeBefore, before.log!.length);
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(binDir, { recursive: true, force: true });
  }
});
