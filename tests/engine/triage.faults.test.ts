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
  unlink,
  stat,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  runTriage,
  type TriageAgentResult,
  type TriageDeps,
} from "../../src/engine/triage.ts";
import type { CycleConfig } from "../../src/engine/workflow.ts";
import type { Logger } from "../../src/engine/log.ts";
import { parseFrontmatter } from "../../src/engine/frontmatter.ts";

function makeConfig(): CycleConfig {
  return {
    engine: { max_consecutive_failures: 2, base_branch: "main", commit: { mode: "trunk" as const, push: true } },
    triage: { agent: "claudecode", prompt: "prompts/triage.md", max_turns: 10 },
    workflows: [
      {
        name: "feature",
        max_cycle_attempts: 3,
        steps: [{ name: "noop", agent: "bash", command: "scripts/noop.sh" }],
      },
    ],
  };
}

type Captured = { event: string; fields: Record<string, unknown> };

function makeLog(): { log: Logger; events: Captured[] } {
  const events: Captured[] = [];
  const log: Logger = {
    async emit(event, fields) {
      events.push({ event, fields });
    },
  };
  return { log, events };
}

async function setupRepo(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "cycle-triage-faults-"));
  await mkdir(join(root, ".cycle/prompts"), { recursive: true });
  await mkdir(join(root, "docs/cycle/issues/raw"), { recursive: true });
  await mkdir(join(root, "docs/cycle/issues/todo"), { recursive: true });
  await mkdir(join(root, "docs/cycle/issues/done"), { recursive: true });
  await mkdir(join(root, "docs/cycle/issues/failed"), { recursive: true });
  await writeFile(
    join(root, ".cycle/prompts/triage.md"),
    "RAWS:{{RAWS_BLOCK}}\nTBD:{{TBD_JSONL}}\nTODO:{{TODO_LISTING}}\nFB:{{RETRY_FEEDBACK}}",
    "utf8",
  );
  return root;
}

function rawBody(id: string, title: string, attempts = 0): string {
  return [
    "---",
    `id: ${id}`,
    "source: text",
    `title: "${title}"`,
    "added_at: 2026-05-13T00:00:00Z",
    `triage_attempts: ${attempts}`,
    "---",
    "",
    title,
    "",
  ].join("\n");
}

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

// ---- Test 1: runAgentViaDispatch fault — agent rejects on the all-fail path; raw stays in raw/

test("fault: agent rejection across full retry budget leaves raw in raw/ on all-fail and emits triage.raw.failed", async () => {
  const root = await setupRepo();
  try {
    await writeFile(
      join(root, "docs/cycle/issues/raw/agentfail.md"),
      rawBody("agentfail", "agent fault", 2),
      "utf8",
    );
    const deps: TriageDeps = {
      runAgent: async () => {
        throw new Error("synthetic spawn ENOENT");
      },
    };
    const { log, events } = makeLog();
    const result = await runTriage(root, makeConfig(), log, deps);
    assert.equal(result.status, "paused");
    assert.deepEqual(result.failed, ["agentfail"]);

    const failedFiles = await readdir(join(root, "docs/cycle/issues/failed"));
    assert.deepEqual(failedFiles, []);
    assert.equal(
      await exists(join(root, "docs/cycle/issues/raw/agentfail.md")),
      true,
      "raw retained in raw/ on all-fail",
    );

    const queueExists = await exists(join(root, ".cycle/tbd.jsonl"));
    if (queueExists) {
      const q = await readFile(join(root, ".cycle/tbd.jsonl"), "utf8");
      assert.equal(q.includes("agentfail"), false, "no row remains in tbd.jsonl");
    }

    const failed = events.find((e) => e.event === "triage.raw.failed");
    assert.ok(failed, "triage.raw.failed emitted");
    assert.match(String(failed!.fields.reason), /agent failed:.*synthetic spawn ENOENT/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

// ---- Test 2: bumpAttempts catch — mutateFrontmatter throws (writeFile tmp -> EISDIR); attempts stay unbumped

test("fault: bumpAttempts swallows mutateFrontmatter failure; persisted triage_attempts not bumped", async () => {
  const root = await setupRepo();
  try {
    await writeFile(
      join(root, "docs/cycle/issues/raw/bumpfail.md"),
      rawBody("bumpfail", "bump fault", 2),
      "utf8",
    );
    // Pre-create raw/bumpfail.md.tmp as a non-empty directory so the inner
    // writeFile(tmp) in mutateFrontmatter fails with EISDIR.
    const tmpDir = join(root, "docs/cycle/issues/raw/bumpfail.md.tmp");
    await mkdir(tmpDir, { recursive: true });
    await writeFile(join(tmpDir, "sentinel"), "x", "utf8");

    const deps: TriageDeps = {
      runAgent: async () => {
        throw new Error("agent down");
      },
    };
    const { log, events } = makeLog();
    const result = await runTriage(root, makeConfig(), log, deps);
    assert.equal(result.status, "paused");

    // All-fail path: raw stays in raw/ (moveToFailed is never called). The
    // bumpAttempts swallow path is still exercised through onAttemptFailed.
    const rawPath = join(root, "docs/cycle/issues/raw/bumpfail.md");
    assert.equal(await exists(rawPath), true);
    assert.equal(
      await exists(join(root, "docs/cycle/issues/failed/bumpfail.md")),
      false,
    );
    const { fm } = parseFrontmatter(await readFile(rawPath, "utf8"));
    assert.equal(
      fm.triage_attempts,
      2,
      "bumpAttempts catch swallowed — counter remained at its starting value",
    );
    assert.equal(fm.failed_at, undefined);
    assert.equal(fm.failed_step, undefined);

    const failedEvt = events.find((e) => e.event === "triage.raw.failed");
    assert.ok(failedEvt, "triage.raw.failed still emitted despite bumpAttempts silent failure");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

// ---- Test 3: moveToFailed stamp-pass catch — partial-fail path: file moved to failed/ without failed_at/failed_step

test("fault: moveToFailed stamp-pass swallows mutateFrontmatter failure on partial-fail; raw still moves to failed/", async () => {
  const root = await setupRepo();
  try {
    // Two raws: stampfail fails every attempt; ok decomposes cleanly. That
    // pushes the pass onto the partial-fail branch which invokes moveToFailed
    // on the deferred failed list — exercising the stamp-pass swallow path
    // (still independently injected via the .tmp directory trick).
    await writeFile(
      join(root, "docs/cycle/issues/raw/stampfail.md"),
      rawBody("stampfail", "stamp fault", 2),
      "utf8",
    );
    await writeFile(
      join(root, "docs/cycle/issues/raw/ok.md"),
      rawBody("ok", "ok task"),
      "utf8",
    );
    const tmpDir = join(root, "docs/cycle/issues/raw/stampfail.md.tmp");
    await mkdir(tmpDir, { recursive: true });
    await writeFile(join(tmpDir, "sentinel"), "x", "utf8");

    const deps: TriageDeps = {
      runAgent: async (prompt) => {
        if (prompt.includes("=== raw: stampfail ===")) {
          throw new Error("agent down");
        }
        return {
          exitCode: 0,
          stdout: JSON.stringify({
            ordering: ["ok"],
            children: [
              {
                raw_id: "ok",
                slug: "",
                id: "ok",
                title: "ok",
                workflow: "feature",
                depends_on: [],
                body: "ok body",
              },
            ],
            decomposed_parents: [],
          }),
          stderr: "",
        };
      },
    };
    const { log, events } = makeLog();
    const result = await runTriage(root, makeConfig(), log, deps);
    assert.equal(result.status, "ok");
    assert.deepEqual(result.failed, ["stampfail"]);
    assert.deepEqual(result.processed, ["ok"]);

    const failedPath = join(root, "docs/cycle/issues/failed/stampfail.md");
    assert.equal(await exists(failedPath), true, "rename to failed/ succeeded");
    assert.equal(
      await exists(join(root, "docs/cycle/issues/raw/stampfail.md")),
      false,
      "raw moved out of raw/",
    );
    const { fm } = parseFrontmatter(await readFile(failedPath, "utf8"));
    assert.equal(
      "failed_at" in fm,
      false,
      "failed_at stamp not applied — mutateFrontmatter swallowed",
    );
    assert.equal(
      "failed_step" in fm,
      false,
      "failed_step stamp not applied — mutateFrontmatter swallowed",
    );

    assert.equal(
      events.find((e) => e.event === "engine.paused"),
      undefined,
      "engine.paused must not fire on partial-fail",
    );
    assert.ok(events.find((e) => e.event === "triage.raw.failed"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

// ---- Test 4: raw file unlinked mid-flight — all-fail still pauses cleanly, no failed/ artifact

test("fault: raw unlinked mid-flight on all-fail path; engine.paused completes cleanly with no failed/ artifact", async () => {
  const root = await setupRepo();
  try {
    const rawPath = join(root, "docs/cycle/issues/raw/vanish.md");
    await writeFile(rawPath, rawBody("vanish", "vanish task", 2), "utf8");

    const deps: TriageDeps = {
      runAgent: async () => {
        await unlink(rawPath);
        throw new Error("agent vanished the raw");
      },
    };
    const { log, events } = makeLog();
    const result = await runTriage(root, makeConfig(), log, deps);
    assert.equal(result.status, "paused");

    assert.equal(await exists(rawPath), false, "raw file unlinked by agent");
    assert.equal(
      await exists(join(root, "docs/cycle/issues/failed/vanish.md")),
      false,
      "all-fail path never calls moveToFailed; no failed/ artifact regardless",
    );

    assert.ok(events.find((e) => e.event === "triage.raw.failed"));
    assert.ok(
      events.find((e) => e.event === "engine.paused"),
      "loop completed cleanly through engine.paused without crashing",
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

// ---- Test 5: rewriteOrdering failure leaves tbd.jsonl byte-for-byte unchanged

function reversedDecomposeJson(rawId: string): string {
  return JSON.stringify({
    ordering: [`${rawId}-b`, `${rawId}-a`],
    children: [
      {
        raw_id: rawId,
        slug: "a",
        id: `${rawId}-a`,
        title: "A",
        workflow: "feature",
        depends_on: [],
        body: "A body",
      },
      {
        raw_id: rawId,
        slug: "b",
        id: `${rawId}-b`,
        title: "B",
        workflow: "feature",
        depends_on: [`${rawId}-a`],
        body: "B body",
      },
    ],
    decomposed_parents: [rawId],
  });
}

test("fault: rewriteOrdering writeQueue failure leaves tbd.jsonl byte-for-byte unchanged (atomic tmp+rename invariant)", async () => {
  const root = await setupRepo();
  try {
    await writeFile(
      join(root, "docs/cycle/issues/raw/rew.md"),
      rawBody("rew", "rewrite parent"),
      "utf8",
    );
    // Block writeQueue's writeFile(tmp) by pre-creating the tmp path as a
    // non-empty directory. appendRow uses appendFile and is unaffected.
    const queueTmpDir = join(root, ".cycle/tbd.jsonl.tmp");
    await mkdir(queueTmpDir, { recursive: true });
    await writeFile(join(queueTmpDir, "sentinel"), "x", "utf8");

    const deps: TriageDeps = {
      runAgent: async () => ({
        exitCode: 0,
        stdout: reversedDecomposeJson("rew"),
        stderr: "",
      }),
    };

    // Snapshot tbd.jsonl bytes the moment applyRaw finishes (triage.raw.ok
    // fires after applyRaw, before rewriteOrdering). Compare to final bytes
    // after rewriteOrdering's failure to prove the atomic rename never ran.
    const events: Captured[] = [];
    let snapshot: Buffer | null = null;
    const log: Logger = {
      async emit(event, fields) {
        events.push({ event, fields });
        if (event === "triage.raw.ok") {
          snapshot = await readFile(join(root, ".cycle/tbd.jsonl"));
        }
      },
    };

    await assert.rejects(runTriage(root, makeConfig(), log, deps), /EISDIR|directory|illegal operation/i);

    assert.ok(snapshot, "snapshot captured after applyRaw");
    const finalBytes: Buffer = await readFile(join(root, ".cycle/tbd.jsonl"));
    const snapshotBuf = snapshot as Buffer;
    assert.equal(
      finalBytes.equals(snapshotBuf),
      true,
      "tbd.jsonl byte-identical pre/post rewriteOrdering failure",
    );

    // Independently verify the on-disk order is the appendRow iteration order
    // (a before b), NOT what rewriteOrdering would have produced (b before a).
    const ids = finalBytes
      .toString("utf8")
      .trim()
      .split("\n")
      .map((l: string) => JSON.parse(l).id);
    assert.deepEqual(ids, ["rew-a", "rew-b"]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

// ---- Test 6a: loadRaws per-file isolation — parseFrontmatter failure skipped, surviving raw processed

test("fault: loadRaws isolates parseFrontmatter failure; surviving raw processed, triage.raw.load_error emitted", async () => {
  const root = await setupRepo();
  try {
    // broken.md — no frontmatter, will fail parseFrontmatter
    await writeFile(
      join(root, "docs/cycle/issues/raw/broken.md"),
      "no frontmatter here\njust prose\n",
      "utf8",
    );
    // good.md — valid raw
    await writeFile(
      join(root, "docs/cycle/issues/raw/good.md"),
      rawBody("good", "A good issue"),
      "utf8",
    );
    const deps: TriageDeps = {
      runAgent: async () => ({ exitCode: 0, stdout: enrichJson("good"), stderr: "" }),
    };
    const { log, events } = makeLog();
    const result = await runTriage(root, makeConfig(), log, deps);

    assert.equal(result.status, "ok");
    assert.deepEqual(result.processed, ["good"]);
    assert.deepEqual(result.failed, []);

    const loadErr = events.find((e) => e.event === "triage.raw.load_error");
    assert.ok(loadErr, "triage.raw.load_error emitted for broken.md");
    assert.equal(loadErr!.fields.raw_id, "broken");
    assert.ok(typeof loadErr!.fields.error === "string" && loadErr!.fields.error.length > 0);

    assert.ok(!events.some((e) => e.event === "engine.paused"), "no engine.paused when survivor exists");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

// ---- Test 6c: loadRaws all-fail via load error — empty result, load_error emitted, no engine.paused

test("fault: loadRaws all-fail via parse error returns empty set; triage ends cleanly (not engine.paused)", async () => {
  const root = await setupRepo();
  try {
    await writeFile(
      join(root, "docs/cycle/issues/raw/broken1.md"),
      "no frontmatter\n",
      "utf8",
    );
    await writeFile(
      join(root, "docs/cycle/issues/raw/broken2.md"),
      "also no frontmatter\n",
      "utf8",
    );
    const deps: TriageDeps = {
      runAgent: async () => { throw new Error("should not be called"); },
    };
    const { log, events } = makeLog();
    const result = await runTriage(root, makeConfig(), log, deps);

    // All raws fail to load -> loadRaws returns [] -> hits raws.length === 0
    // short-circuit -> status:"ok", no agent calls, no engine.paused.
    // This is distinct from all-agent-failure (engine.paused); load errors
    // are pre-agent and treated as an empty queue.
    assert.equal(result.status, "ok");
    assert.deepEqual(result.processed, []);
    assert.deepEqual(result.failed, []);

    const loadErrs = events.filter((e) => e.event === "triage.raw.load_error");
    assert.equal(loadErrs.length, 2, "one load_error per broken file");
    assert.ok(!events.some((e) => e.event === "engine.paused"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

// ---- Test 6d: loadRaws readFile error (EACCES) isolates; surviving raw processed

test("fault: loadRaws readFile error isolates; surviving raw processed, triage.raw.load_error emitted", async () => {
  const root = await setupRepo();
  try {
    // aaa-unreadable.md — chmod 000 makes readFile throw EACCES; sorts before good.md
    const unreadablePath = join(root, "docs/cycle/issues/raw/aaa-unreadable.md");
    await writeFile(unreadablePath, rawBody("aaa-unreadable", "Unreadable"), "utf8");
    await chmod(unreadablePath, 0o000);

    // good.md — sorts after aaa-unreadable alphabetically
    await writeFile(
      join(root, "docs/cycle/issues/raw/good.md"),
      rawBody("good", "A good issue"),
      "utf8",
    );
    const deps: TriageDeps = {
      runAgent: async () => ({ exitCode: 0, stdout: enrichJson("good"), stderr: "" }),
    };
    const { log, events } = makeLog();
    const result = await runTriage(root, makeConfig(), log, deps);

    assert.equal(result.status, "ok");
    assert.deepEqual(result.processed, ["good"]);

    const loadErr = events.find((e) => e.event === "triage.raw.load_error");
    assert.ok(loadErr, "triage.raw.load_error emitted for unreadable file");
    assert.equal(loadErr!.fields.raw_id, "aaa-unreadable");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

// ---- Test 6b: loadRaws — missing raw/ directory returns empty (ENOENT swallow)

test("fault: loadRaws ENOENT on raw/ directory returns empty set, runTriage resolves cleanly", async () => {
  const root = await setupRepo();
  try {
    await rm(join(root, "docs/cycle/issues/raw"), { recursive: true, force: true });
    let agentCalls = 0;
    const deps: TriageDeps = {
      runAgent: async () => {
        agentCalls++;
        return { exitCode: 0, stdout: "{}", stderr: "" };
      },
    };
    const { log, events } = makeLog();
    const result = await runTriage(root, makeConfig(), log, deps);
    assert.equal(result.status, "ok");
    assert.deepEqual(result.processed, []);
    assert.deepEqual(result.failed, []);
    assert.equal(agentCalls, 0, "no agent invocations when raw/ absent");

    const names = events.map((e) => e.event);
    assert.deepEqual(names.includes("triage.start") && names.includes("triage.end"), true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

// ---- Test 7: applyRaw writeQueue rollback catch (615-616) — row remains in tbd.jsonl when partial-rollback writeQueue fails

function enrichJson(rawId: string): string {
  return JSON.stringify({
    ordering: [rawId],
    children: [
      {
        raw_id: rawId,
        slug: "",
        id: rawId,
        title: "enriched",
        workflow: "feature",
        depends_on: [],
        body: "enriched body",
      },
    ],
    decomposed_parents: [],
  });
}

test("fault: applyRaw rollback writeQueue catch swallows; row remains in tbd.jsonl after rollback failure", async () => {
  const root = await setupRepo();
  try {
    await writeFile(
      join(root, "docs/cycle/issues/raw/rollbackq.md"),
      rawBody("rollbackq", "rollback queue", 2),
      "utf8",
    );
    // Force the outer rename(raw → done/) to fail so applyRaw enters the
    // rollback path.
    await chmod(join(root, "docs/cycle/issues/done"), 0o500);
    // Force writeQueue inside the rollback to fail (EISDIR on tmp).
    const queueTmpDir = join(root, ".cycle/tbd.jsonl.tmp");
    await mkdir(queueTmpDir, { recursive: true });
    await writeFile(join(queueTmpDir, "sentinel"), "x", "utf8");

    const deps: TriageDeps = {
      runAgent: async () => ({
        exitCode: 0,
        stdout: enrichJson("rollbackq"),
        stderr: "",
      }),
    };
    const { log, events } = makeLog();
    const result = await runTriage(root, makeConfig(), log, deps);
    assert.equal(result.status, "paused");

    // Inner writeQueue rollback was swallowed: the appended row is still on
    // disk because the atomic rename never ran inside writeQueue.
    const queueBytes = await readFile(join(root, ".cycle/tbd.jsonl"), "utf8");
    assert.ok(
      queueBytes.includes('"id":"rollbackq"'),
      `row remains after swallowed rollback writeQueue: ${queueBytes}`,
    );

    // The original apply error propagated and was treated as a failed attempt.
    const failedEvt = events.find((e) => e.event === "triage.raw.failed");
    assert.ok(failedEvt, "triage.raw.failed emitted after rollback rethrow");
    assert.match(String(failedEvt!.fields.reason), /apply failed:/);
  } finally {
    try {
      await chmod(join(root, "docs/cycle/issues/done"), 0o755);
    } catch {
      // ignore
    }
    await rm(root, { recursive: true, force: true });
  }
});
