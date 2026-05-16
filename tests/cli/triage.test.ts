import { test } from "node:test";
import { strict as assert } from "node:assert";
import { mkdtemp, mkdir, writeFile, readFile, readdir, rm, chmod } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { parseFrontmatter } from "../../src/engine/frontmatter.ts";

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

const fakeClaude = `#!/bin/bash
PROMPT="$3"
RAW_ID=$(printf '%s' "$PROMPT" | grep -oE '=== raw: [^ ]+ ===' | head -1 | sed 's/=== raw: //;s/ ===//')
cat <<JSON
{"ordering":["\${RAW_ID}-a","\${RAW_ID}-b"],"children":[{"raw_id":"\${RAW_ID}","slug":"a","id":"\${RAW_ID}-a","title":"A","workflow":"feature","depends_on":[],"body":"A body"},{"raw_id":"\${RAW_ID}","slug":"b","id":"\${RAW_ID}-b","title":"B","workflow":"feature","depends_on":["\${RAW_ID}-a"],"body":"B body"}],"decomposed_parents":["\${RAW_ID}"]}
JSON
`;

test("triage end-to-end: dropped raw decomposes into two todos via stubbed claude", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-triage-int-"));
  const binDir = await mkdtemp(join(tmpdir(), "cycle-triage-bin-"));
  try {
    const dist = await ensureDist();

    spawnSync("git", ["init", "-b", "main"], { cwd: root, stdio: "ignore" });
    spawnSync("git", ["config", "user.email", "t@t"], { cwd: root, stdio: "ignore" });
    spawnSync("git", ["config", "user.name", "t"], { cwd: root, stdio: "ignore" });
    spawnSync("git", ["commit", "--allow-empty", "-m", "init"], { cwd: root, stdio: "ignore" });

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

    const fakeBin = join(binDir, "claude");
    await writeFile(fakeBin, fakeClaude, "utf8");
    await chmod(fakeBin, 0o755);

    const drop = spawnSync("node", [dist, "drop", "implement feature X"], {
      cwd: root,
      encoding: "utf8",
    });
    assert.equal(drop.status, 0);
    const dropOut = JSON.parse(drop.stdout.trim());
    const rawId: string = dropOut.issue_id;

    const run = spawnSync("node", [dist, "run"], {
      cwd: root,
      encoding: "utf8",
      env: { ...process.env, PATH: `${binDir}:${process.env.PATH ?? ""}` },
    });
    assert.equal(
      run.status,
      0,
      `run exit ${run.status}\nstdout: ${run.stdout}\nstderr: ${run.stderr}`,
    );

    // Triage artifacts must exist regardless of downstream cycle outcome
    const todoFiles = (await readdir(join(root, "docs/cycle/issues/todo"))).sort();
    const doneFiles = await readdir(join(root, "docs/cycle/issues/done"));

    assert.ok(
      doneFiles.includes(`${rawId}_raw.md`),
      `expected done/${rawId}_raw.md, got ${doneFiles.join(",")}`,
    );

    const aId = `${rawId}-a`;
    const bId = `${rawId}-b`;

    const rawListing = await readdir(join(root, "docs/cycle/issues/raw"));
    assert.deepEqual(rawListing, [], "raw/ should be empty after triage");

    const log = await readFile(join(root, ".cycle/log.jsonl"), "utf8");
    const events = log.trim().split("\n").map((l) => JSON.parse(l));
    const names = events.map((e) => e.event);
    assert.ok(names.includes("triage.start"), "missing triage.start");
    assert.ok(names.includes("triage.raw.ok"), "missing triage.raw.ok");
    assert.ok(names.includes("triage.end"), "missing triage.end");

    const rawOk = events.find((e) => e.event === "triage.raw.ok");
    assert.equal(rawOk.raw_id, rawId);
    assert.deepEqual(rawOk.children, [aId, bId]);

    // SPEC: tbd.jsonl rows landed in the queue in the agent-supplied ordering.
    // The engine may have drained one or both rows by exit, so reconstruct
    // post-triage state from cycle.start events instead of the live queue.
    const cycleStarts = events
      .filter((e) => e.event === "cycle.start")
      .map((e) => e.issue_id);
    assert.deepEqual(
      cycleStarts,
      [aId, bId],
      `expected cycle.start order [${aId}, ${bId}], got [${cycleStarts.join(", ")}]`,
    );

    // SPEC: each child id must exist exactly once across todo/ and done/.
    // (todo/<id>.md if pending; done/<id>.md after the cycle drained it.)
    const seen = [...todoFiles, ...doneFiles];
    for (const id of [aId, bId]) {
      const matches = seen.filter((f) => f === `${id}.md`);
      assert.equal(
        matches.length,
        1,
        `expected exactly one ${id}.md across todo/+done/, got ${matches.length} (todo=${todoFiles.join(",")} done=${doneFiles.join(",")})`,
      );
    }

    // SPEC: child frontmatter has correct fields.
    const aTodoPath = join(root, "docs/cycle/issues/todo", `${aId}.md`);
    const aDonePath = join(root, "docs/cycle/issues/done", `${aId}.md`);
    let aBody: string;
    try {
      aBody = await readFile(aTodoPath, "utf8");
    } catch {
      aBody = await readFile(aDonePath, "utf8");
    }
    const { fm } = parseFrontmatter(aBody);
    assert.equal(fm.id, aId);
    assert.equal(fm.parent, rawId);
    assert.equal(fm.workflow, "feature");
    assert.ok(Array.isArray(fm.depends_on), "depends_on should be array");
    assert.equal(typeof fm.triaged_at, "string");
    assert.equal(fm.source, "triage");
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(binDir, { recursive: true, force: true });
  }
});
