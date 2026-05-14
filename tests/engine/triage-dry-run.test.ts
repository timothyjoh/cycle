import { test } from "node:test";
import { strict as assert } from "node:assert";
import {
  mkdtemp,
  mkdir,
  writeFile,
  readFile,
  readdir,
  rm,
  stat,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import {
  dryRunTriage,
  type TriageDeps,
  type TriageAgentResult,
} from "../../src/engine/triage.ts";
import type { CycleConfig } from "../../src/engine/workflow.ts";

function makeConfig(): CycleConfig {
  return {
    engine: { max_consecutive_failures: 2, base_branch: "main" },
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

async function setupRepo(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "cycle-triage-dry-"));
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

function decomposeJson(rawId: string): string {
  return JSON.stringify({
    ordering: [`${rawId}-a`, `${rawId}-b`],
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

async function dirHash(
  dir: string,
): Promise<{ files: string[]; sha: string }> {
  let entries: string[];
  try {
    entries = (await readdir(dir)).sort();
  } catch {
    return { files: [], sha: "" };
  }
  const h = createHash("sha256");
  const files: string[] = [];
  for (const f of entries) {
    files.push(f);
    const body = await readFile(join(dir, f));
    h.update(f);
    h.update("\0");
    h.update(body);
  }
  return { files, sha: h.digest("hex") };
}

async function fileBytes(path: string): Promise<Buffer | null> {
  try {
    return await readFile(path);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw e;
  }
}

test("dryRun happy path: three raws, all ok, attempts=1", async () => {
  const root = await setupRepo();
  try {
    for (const id of ["alpha", "beta", "gamma"]) {
      await writeFile(
        join(root, `docs/cycle/issues/raw/${id}.md`),
        rawBody(id, id),
        "utf8",
      );
    }
    const deps: TriageDeps = {
      runAgent: async (prompt): Promise<TriageAgentResult> => {
        const m = prompt.match(/=== raw: ([a-z]+) ===/);
        const id = m ? m[1] : "x";
        return { exitCode: 0, stdout: decomposeJson(id), stderr: "" };
      },
    };
    const reports = await dryRunTriage(root, makeConfig(), deps);
    assert.equal(reports.length, 3);
    for (const r of reports) {
      assert.equal(r.status, "ok");
      assert.equal(r.attempts, 1);
      assert.deepEqual(r.children, [`${r.raw_id}-a`, `${r.raw_id}-b`]);
      assert.equal(r.last_error, undefined);
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("dryRun retry-then-succeed reports attempts=2", async () => {
  const root = await setupRepo();
  try {
    await writeFile(
      join(root, "docs/cycle/issues/raw/r1.md"),
      rawBody("r1", "r1"),
      "utf8",
    );
    let calls = 0;
    const deps: TriageDeps = {
      runAgent: async (): Promise<TriageAgentResult> => {
        calls++;
        if (calls === 1) {
          return { exitCode: 0, stdout: "not json", stderr: "" };
        }
        return { exitCode: 0, stdout: decomposeJson("r1"), stderr: "" };
      },
    };
    const reports = await dryRunTriage(root, makeConfig(), deps);
    assert.equal(reports.length, 1);
    assert.equal(reports[0].status, "ok");
    assert.equal(reports[0].attempts, 2);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("dryRun all retries fail: status=failed, attempts=3, last_error set", async () => {
  const root = await setupRepo();
  try {
    await writeFile(
      join(root, "docs/cycle/issues/raw/bad.md"),
      rawBody("bad", "bad"),
      "utf8",
    );
    const deps: TriageDeps = {
      runAgent: async (): Promise<TriageAgentResult> => ({
        exitCode: 0,
        stdout: "still not json",
        stderr: "",
      }),
    };
    const reports = await dryRunTriage(root, makeConfig(), deps);
    assert.equal(reports.length, 1);
    assert.equal(reports[0].status, "failed");
    assert.equal(reports[0].attempts, 3);
    assert.ok(reports[0].last_error);
    assert.match(reports[0].last_error!, /not valid JSON/i);
    assert.equal(reports[0].children, undefined);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("dryRun agent non-zero exit: status=failed, last_error mentions exit code and stderr", async () => {
  const root = await setupRepo();
  try {
    await writeFile(
      join(root, "docs/cycle/issues/raw/boom.md"),
      rawBody("boom", "boom"),
      "utf8",
    );
    const deps: TriageDeps = {
      runAgent: async (): Promise<TriageAgentResult> => ({
        exitCode: 1,
        stdout: "",
        stderr: "boom-stderr",
      }),
    };
    const reports = await dryRunTriage(root, makeConfig(), deps);
    assert.equal(reports.length, 1);
    assert.equal(reports[0].status, "failed");
    assert.match(reports[0].last_error!, /agent exited 1/);
    assert.match(reports[0].last_error!, /boom-stderr/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("dryRun byte-identity: filesystem unchanged across raw/, todo/, done/, failed/, tbd.jsonl, log.jsonl", async () => {
  const root = await setupRepo();
  try {
    // Pre-seed fixtures.
    await writeFile(
      join(root, "docs/cycle/issues/raw/keep.md"),
      rawBody("keep", "keep me"),
      "utf8",
    );
    await writeFile(
      join(root, "docs/cycle/issues/raw/fail.md"),
      rawBody("fail", "will fail"),
      "utf8",
    );
    await writeFile(
      join(root, "docs/cycle/issues/todo/EXISTING.md"),
      rawBody("EXISTING", "preexisting"),
      "utf8",
    );
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
    const logBody = JSON.stringify({ ts: "2026-05-13T00:00:00Z", event: "engine.start" }) + "\n";
    await writeFile(join(root, ".cycle/log.jsonl"), logBody, "utf8");

    const before = {
      raw: await dirHash(join(root, "docs/cycle/issues/raw")),
      todo: await dirHash(join(root, "docs/cycle/issues/todo")),
      done: await dirHash(join(root, "docs/cycle/issues/done")),
      failed: await dirHash(join(root, "docs/cycle/issues/failed")),
      tbd: await fileBytes(join(root, ".cycle/tbd.jsonl")),
      log: await fileBytes(join(root, ".cycle/log.jsonl")),
    };

    const deps: TriageDeps = {
      runAgent: async (prompt): Promise<TriageAgentResult> => {
        if (prompt.includes("=== raw: fail ===")) {
          return { exitCode: 1, stdout: "", stderr: "nope" };
        }
        return { exitCode: 0, stdout: decomposeJson("keep"), stderr: "" };
      },
    };

    const reports = await dryRunTriage(root, makeConfig(), deps);
    assert.equal(reports.length, 2);

    const after = {
      raw: await dirHash(join(root, "docs/cycle/issues/raw")),
      todo: await dirHash(join(root, "docs/cycle/issues/todo")),
      done: await dirHash(join(root, "docs/cycle/issues/done")),
      failed: await dirHash(join(root, "docs/cycle/issues/failed")),
      tbd: await fileBytes(join(root, ".cycle/tbd.jsonl")),
      log: await fileBytes(join(root, ".cycle/log.jsonl")),
    };

    assert.deepEqual(after.raw, before.raw, "raw/ contents changed");
    assert.deepEqual(after.todo, before.todo, "todo/ contents changed");
    assert.deepEqual(after.done, before.done, "done/ contents changed");
    assert.deepEqual(after.failed, before.failed, "failed/ contents changed");
    assert.ok(after.tbd && before.tbd && after.tbd.equals(before.tbd), "tbd.jsonl bytes changed");
    assert.ok(after.log && before.log && after.log.equals(before.log), "log.jsonl bytes changed");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("dryRun empty raw dir: returns [] and creates no directories", async () => {
  // Use a temp root WITHOUT pre-creating any directories. The dryRunTriage
  // path must tolerate a missing raw/ and never mkdir.
  const root = await mkdtemp(join(tmpdir(), "cycle-triage-empty-"));
  try {
    await mkdir(join(root, ".cycle/prompts"), { recursive: true });
    await writeFile(
      join(root, ".cycle/prompts/triage.md"),
      "RAWS:{{RAWS_BLOCK}}\nTBD:{{TBD_JSONL}}\nTODO:{{TODO_LISTING}}\nFB:{{RETRY_FEEDBACK}}",
      "utf8",
    );
    const deps: TriageDeps = {
      runAgent: async (): Promise<TriageAgentResult> => {
        throw new Error("runAgent must not be called for empty raw/");
      },
    };
    const reports = await dryRunTriage(root, makeConfig(), deps);
    assert.deepEqual(reports, []);

    // Verify raw/, todo/, etc. were NOT created.
    for (const sub of ["raw", "todo", "done", "failed"]) {
      let exists = true;
      try {
        await stat(join(root, "docs/cycle/issues", sub));
      } catch {
        exists = false;
      }
      assert.equal(exists, false, `${sub}/ should not exist`);
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("dryRun ignores on-disk triage_attempts and runs full retry budget", async () => {
  const root = await setupRepo();
  try {
    await writeFile(
      join(root, "docs/cycle/issues/raw/exhausted.md"),
      rawBody("exhausted", "already-tried", 3),
      "utf8",
    );
    let calls = 0;
    const deps: TriageDeps = {
      runAgent: async (): Promise<TriageAgentResult> => {
        calls++;
        return { exitCode: 0, stdout: "still not json", stderr: "" };
      },
    };
    const reports = await dryRunTriage(root, makeConfig(), deps);
    assert.equal(calls, 3, "agent should be invoked 3 times");
    assert.equal(reports[0].status, "failed");
    assert.equal(reports[0].attempts, 3);
    assert.ok(reports[0].last_error, "last_error must be populated");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("dryRun with prior triage_attempts succeeds on third dry-run attempt", async () => {
  const root = await setupRepo();
  try {
    await writeFile(
      join(root, "docs/cycle/issues/raw/r1.md"),
      rawBody("r1", "r1", 2),
      "utf8",
    );
    let calls = 0;
    const deps: TriageDeps = {
      runAgent: async (): Promise<TriageAgentResult> => {
        calls++;
        if (calls < 3) {
          return { exitCode: 0, stdout: "nope not json", stderr: "" };
        }
        return { exitCode: 0, stdout: decomposeJson("r1"), stderr: "" };
      },
    };
    const reports = await dryRunTriage(root, makeConfig(), deps);
    assert.equal(calls, 3);
    assert.equal(reports[0].status, "ok");
    assert.equal(reports[0].attempts, 3);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("dryRun unknown triage agent reports per-raw failure with UnknownAgentError", async () => {
  const root = await setupRepo();
  try {
    await writeFile(
      join(root, "docs/cycle/issues/raw/x.md"),
      rawBody("x", "x"),
      "utf8",
    );
    const cfg = makeConfig();
    cfg.triage.agent = "other";
    const reports = await dryRunTriage(root, cfg);
    assert.equal(reports.length, 1);
    assert.equal(reports[0].raw_id, "x");
    assert.equal(reports[0].status, "failed");
    assert.match(String(reports[0].last_error), /"other"/);
    assert.match(String(reports[0].last_error), /claudecode/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("dryRun Case B: missing prompt template → throws 'prompt template missing: <path>: ...'", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-triage-nopromp-"));
  try {
    await mkdir(join(root, ".cycle"), { recursive: true });
    await mkdir(join(root, "docs/cycle/issues/raw"), { recursive: true });
    await mkdir(join(root, "docs/cycle/issues/todo"), { recursive: true });
    await writeFile(
      join(root, "docs/cycle/issues/raw/solo.md"),
      rawBody("solo", "solo"),
      "utf8",
    );

    const before = {
      raw: await dirHash(join(root, "docs/cycle/issues/raw")),
      todo: await dirHash(join(root, "docs/cycle/issues/todo")),
      tbd: await fileBytes(join(root, ".cycle/tbd.jsonl")),
      log: await fileBytes(join(root, ".cycle/log.jsonl")),
    };

    const cfg = makeConfig();
    const resolvedPromptPath = join(root, ".cycle", cfg.triage.prompt);
    const deps: TriageDeps = {
      runAgent: async (): Promise<TriageAgentResult> => {
        throw new Error(
          "runAgent must not be called when prompt template is missing",
        );
      },
    };

    await assert.rejects(
      dryRunTriage(root, cfg, deps),
      (e: Error) =>
        /^prompt template missing: /.test(e.message) &&
        e.message.includes(resolvedPromptPath),
    );

    const after = {
      raw: await dirHash(join(root, "docs/cycle/issues/raw")),
      todo: await dirHash(join(root, "docs/cycle/issues/todo")),
      tbd: await fileBytes(join(root, ".cycle/tbd.jsonl")),
      log: await fileBytes(join(root, ".cycle/log.jsonl")),
    };
    assert.deepEqual(after.raw, before.raw, "raw/ contents changed");
    assert.deepEqual(after.todo, before.todo, "todo/ contents changed");
    assert.equal(after.tbd, before.tbd, "tbd.jsonl appeared");
    assert.equal(after.log, before.log, "log.jsonl appeared");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("dryRun Case A: runAgent throws → status failed, attempts 3, last_error matches /^agent failed: /", async () => {
  const root = await setupRepo();
  try {
    await writeFile(
      join(root, "docs/cycle/issues/raw/solo.md"),
      rawBody("solo", "solo"),
      "utf8",
    );

    const before = {
      raw: await dirHash(join(root, "docs/cycle/issues/raw")),
      todo: await dirHash(join(root, "docs/cycle/issues/todo")),
      done: await dirHash(join(root, "docs/cycle/issues/done")),
      failed: await dirHash(join(root, "docs/cycle/issues/failed")),
      tbd: await fileBytes(join(root, ".cycle/tbd.jsonl")),
      log: await fileBytes(join(root, ".cycle/log.jsonl")),
    };

    let calls = 0;
    const deps: TriageDeps = {
      runAgent: async (): Promise<TriageAgentResult> => {
        calls++;
        throw new Error("boom: claude spawn failed");
      },
    };

    const reports = await dryRunTriage(root, makeConfig(), deps);

    assert.equal(reports.length, 1);
    const r = reports[0]!;
    assert.equal(r.raw_id, "solo");
    assert.equal(r.status, "failed");
    assert.equal(r.attempts, 3);
    assert.ok(r.last_error, "last_error present");
    assert.match(r.last_error!, /^agent failed: /);
    assert.ok(
      r.last_error!.includes("boom: claude spawn failed"),
      `last_error includes inner: ${r.last_error}`,
    );
    assert.equal(calls, 3, "runAgent invoked exactly MAX_ATTEMPTS times");

    const after = {
      raw: await dirHash(join(root, "docs/cycle/issues/raw")),
      todo: await dirHash(join(root, "docs/cycle/issues/todo")),
      done: await dirHash(join(root, "docs/cycle/issues/done")),
      failed: await dirHash(join(root, "docs/cycle/issues/failed")),
      tbd: await fileBytes(join(root, ".cycle/tbd.jsonl")),
      log: await fileBytes(join(root, ".cycle/log.jsonl")),
    };
    assert.deepEqual(after.raw, before.raw, "raw/ contents changed");
    assert.deepEqual(after.todo, before.todo, "todo/ contents changed");
    assert.deepEqual(after.done, before.done, "done/ contents changed");
    assert.deepEqual(after.failed, before.failed, "failed/ contents changed");
    assert.equal(after.tbd, before.tbd, "tbd.jsonl appeared");
    assert.equal(after.log, before.log, "log.jsonl appeared");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
