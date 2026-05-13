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
  const root = await mkdtemp(join(tmpdir(), "cycle-triage-"));
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

test("happy path: decompose one raw into two todos, move raw to done, queue ordered", async () => {
  const root = await setupRepo();
  try {
    await writeFile(
      join(root, "docs/cycle/issues/raw/parent.md"),
      rawBody("parent", "parent task"),
      "utf8",
    );

    const deps: TriageDeps = {
      runAgent: async () => ({
        exitCode: 0,
        stdout: decomposeJson("parent"),
        stderr: "",
      }),
    };
    const { log, events } = makeLog();

    const result = await runTriage(root, makeConfig(), log, deps);
    assert.equal(result.status, "ok");
    assert.deepEqual(result.processed, ["parent"]);
    assert.deepEqual(result.failed, []);

    const todoFiles = (await readdir(join(root, "docs/cycle/issues/todo"))).sort();
    assert.deepEqual(todoFiles, ["parent-a.md", "parent-b.md"]);
    const doneFiles = await readdir(join(root, "docs/cycle/issues/done"));
    assert.deepEqual(doneFiles, ["parent_raw.md"]);
    const rawFiles = await readdir(join(root, "docs/cycle/issues/raw"));
    assert.deepEqual(rawFiles, []);

    const aBody = await readFile(
      join(root, "docs/cycle/issues/todo/parent-a.md"),
      "utf8",
    );
    const { fm: fmA } = parseFrontmatter(aBody);
    assert.equal(fmA.id, "parent-a");
    assert.equal(fmA.parent, "parent");
    assert.equal(fmA.workflow, "feature");
    assert.equal(fmA.title, "A");
    assert.deepEqual(fmA.depends_on, []);
    assert.equal(fmA.source, "triage");

    const queue = await readFile(join(root, ".cycle/tbd.jsonl"), "utf8");
    const rows = queue.trim().split("\n").map((l) => JSON.parse(l));
    assert.deepEqual(
      rows.map((r) => r.id),
      ["parent-a", "parent-b"],
    );
    assert.equal(rows[0].status, "pending");
    assert.equal(rows[1].parent, "parent");

    const eventNames = events.map((e) => e.event);
    assert.ok(eventNames.includes("triage.start"));
    assert.ok(eventNames.includes("triage.raw.ok"));
    assert.ok(eventNames.includes("triage.end"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("happy path: enrich-only single child whose id equals raw_id", async () => {
  const root = await setupRepo();
  try {
    await writeFile(
      join(root, "docs/cycle/issues/raw/solo.md"),
      rawBody("solo", "solo task"),
      "utf8",
    );

    const deps: TriageDeps = {
      runAgent: async () => ({
        exitCode: 0,
        stdout: enrichJson("solo"),
        stderr: "",
      }),
    };
    const { log } = makeLog();

    const result = await runTriage(root, makeConfig(), log, deps);
    assert.equal(result.status, "ok");

    const todoFiles = await readdir(join(root, "docs/cycle/issues/todo"));
    assert.deepEqual(todoFiles, ["solo.md"]);
    const doneFiles = await readdir(join(root, "docs/cycle/issues/done"));
    assert.deepEqual(doneFiles, ["solo_raw.md"]);

    const todoBody = await readFile(
      join(root, "docs/cycle/issues/todo/solo.md"),
      "utf8",
    );
    const { fm } = parseFrontmatter(todoBody);
    assert.equal(fm.id, "solo");
    assert.equal(fm.parent, undefined);

    const queue = await readFile(join(root, ".cycle/tbd.jsonl"), "utf8");
    const rows = queue.trim().split("\n").map((l) => JSON.parse(l));
    assert.equal(rows.length, 1);
    assert.equal(rows[0].id, "solo");
    assert.equal(rows[0].parent, undefined);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("reordering preserves in_progress at top, applies agent ordering for pending", async () => {
  const root = await setupRepo();
  try {
    const existing = [
      {
        id: "RUN-1",
        title: "running",
        status: "in_progress",
        attempt: 0,
        depends_on: [],
        triaged_at: "2026-05-13T00:00:00Z",
        cycle_id: "0001",
      },
      {
        id: "OLD-1",
        title: "old pending",
        status: "pending",
        attempt: 0,
        depends_on: [],
        triaged_at: "2026-05-13T00:00:00Z",
      },
    ];
    await writeFile(
      join(root, ".cycle/tbd.jsonl"),
      existing.map((r) => JSON.stringify(r)).join("\n") + "\n",
      "utf8",
    );
    await writeFile(
      join(root, "docs/cycle/issues/raw/newx.md"),
      rawBody("newx", "new task"),
      "utf8",
    );

    const deps: TriageDeps = {
      runAgent: async () => ({
        exitCode: 0,
        stdout: JSON.stringify({
          ordering: ["newx", "OLD-1"],
          children: [
            {
              raw_id: "newx",
              slug: "",
              id: "newx",
              title: "enriched",
              workflow: "feature",
              depends_on: [],
              body: "x",
            },
          ],
          decomposed_parents: [],
        }),
        stderr: "",
      }),
    };
    const { log } = makeLog();
    const result = await runTriage(root, makeConfig(), log, deps);
    assert.equal(result.status, "ok");

    const queue = await readFile(join(root, ".cycle/tbd.jsonl"), "utf8");
    const rows = queue.trim().split("\n").map((l) => JSON.parse(l));
    assert.deepEqual(
      rows.map((r) => r.id),
      ["RUN-1", "newx", "OLD-1"],
    );
    assert.equal(rows[0].status, "in_progress");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("ordering omission appends omitted row at end with triage.warning", async () => {
  const root = await setupRepo();
  try {
    const existing = {
      id: "OMIT-1",
      title: "omitted",
      status: "pending",
      attempt: 0,
      depends_on: [],
      triaged_at: "2026-05-13T00:00:00Z",
    };
    await writeFile(
      join(root, ".cycle/tbd.jsonl"),
      JSON.stringify(existing) + "\n",
      "utf8",
    );
    await writeFile(
      join(root, "docs/cycle/issues/raw/newy.md"),
      rawBody("newy", "new y"),
      "utf8",
    );

    const deps: TriageDeps = {
      runAgent: async () => ({
        exitCode: 0,
        stdout: JSON.stringify({
          ordering: ["newy"],
          children: [
            {
              raw_id: "newy",
              slug: "",
              id: "newy",
              title: "enriched",
              workflow: "feature",
              depends_on: [],
              body: "y",
            },
          ],
          decomposed_parents: [],
        }),
        stderr: "",
      }),
    };
    const { log, events } = makeLog();
    const result = await runTriage(root, makeConfig(), log, deps);
    assert.equal(result.status, "ok");

    const queue = await readFile(join(root, ".cycle/tbd.jsonl"), "utf8");
    const rows = queue.trim().split("\n").map((l) => JSON.parse(l));
    assert.deepEqual(
      rows.map((r) => r.id),
      ["newy", "OMIT-1"],
    );
    const warns = events.filter((e) => e.event === "triage.warning");
    assert.equal(warns.length, 1);
    assert.equal(warns[0].fields.reason, "ordering_omitted");
    assert.equal(warns[0].fields.id, "OMIT-1");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("validator failure feeds error back to next attempt; success on attempt 2", async () => {
  const root = await setupRepo();
  try {
    await writeFile(
      join(root, "docs/cycle/issues/raw/retry.md"),
      rawBody("retry", "retry task"),
      "utf8",
    );

    let calls = 0;
    const seenPrompts: string[] = [];
    const deps: TriageDeps = {
      runAgent: async (prompt) => {
        seenPrompts.push(prompt);
        calls++;
        if (calls === 1) {
          return {
            exitCode: 0,
            stdout: JSON.stringify({
              ordering: ["retry-x"],
              children: [
                {
                  raw_id: "retry",
                  slug: "x",
                  id: "retry-x",
                  title: "X",
                  workflow: "feature",
                  body: "x",
                },
              ],
              decomposed_parents: ["retry"],
            }),
            stderr: "",
          };
        }
        return {
          exitCode: 0,
          stdout: JSON.stringify({
            ordering: ["retry-x"],
            children: [
              {
                raw_id: "retry",
                slug: "x",
                id: "retry-x",
                title: "X",
                workflow: "feature",
                depends_on: [],
                body: "x",
              },
            ],
            decomposed_parents: ["retry"],
          }),
          stderr: "",
        };
      },
    };
    const { log, events } = makeLog();
    const result = await runTriage(root, makeConfig(), log, deps);
    assert.equal(result.status, "ok");
    assert.deepEqual(result.processed, ["retry"]);
    assert.equal(calls, 2);
    assert.ok(
      seenPrompts[1].includes("PREVIOUS ATTEMPT FAILED VALIDATION:"),
      "second prompt should include retry feedback",
    );
    assert.ok(
      seenPrompts[1].includes("depends_on"),
      "second prompt should mention the missing field",
    );

    const failed = events.filter((e) => e.event === "triage.raw.failed");
    assert.equal(failed.length, 1);
    assert.equal(failed[0].fields.attempt, 1);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("3-attempt exhaustion: one raw fails all attempts, other succeeds", async () => {
  const root = await setupRepo();
  try {
    await writeFile(
      join(root, "docs/cycle/issues/raw/A.md"),
      rawBody("A", "raw A"),
      "utf8",
    );
    await writeFile(
      join(root, "docs/cycle/issues/raw/B.md"),
      rawBody("B", "raw B"),
      "utf8",
    );

    const deps: TriageDeps = {
      runAgent: async (prompt) => {
        if (prompt.includes("=== raw: A ===")) {
          return { exitCode: 0, stdout: "not json", stderr: "" };
        }
        return { exitCode: 0, stdout: enrichJson("B"), stderr: "" };
      },
    };
    const { log, events } = makeLog();
    const result = await runTriage(root, makeConfig(), log, deps);
    assert.equal(result.status, "ok");
    assert.deepEqual(result.processed, ["B"]);
    assert.deepEqual(result.failed, ["A"]);

    const failedDir = await readdir(join(root, "docs/cycle/issues/failed"));
    assert.deepEqual(failedDir, ["A.md"]);
    const failedBody = await readFile(
      join(root, "docs/cycle/issues/failed/A.md"),
      "utf8",
    );
    const { fm } = parseFrontmatter(failedBody);
    assert.equal(fm.triage_attempts, 3);
    assert.equal(fm.failed_step, "triage");
    assert.ok(typeof fm.failed_at === "string" && fm.failed_at.length > 0);

    const todoDir = await readdir(join(root, "docs/cycle/issues/todo"));
    assert.deepEqual(todoDir, ["B.md"]);

    const paused = events.find((e) => e.event === "engine.paused");
    assert.equal(paused, undefined, "engine.paused must not fire when any raw succeeded");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("whole-pass failure: only raw fails all attempts → engine.paused", async () => {
  const root = await setupRepo();
  try {
    await writeFile(
      join(root, "docs/cycle/issues/raw/only.md"),
      rawBody("only", "only task"),
      "utf8",
    );
    const deps: TriageDeps = {
      runAgent: async () => ({ exitCode: 0, stdout: "not json", stderr: "" }),
    };
    const { log, events } = makeLog();
    const result = await runTriage(root, makeConfig(), log, deps);
    assert.equal(result.status, "paused");
    assert.deepEqual(result.failed, ["only"]);

    const paused = events.find((e) => e.event === "engine.paused");
    assert.ok(paused, "engine.paused must fire on whole-pass failure");
    assert.equal(paused?.fields.reason, "triage_failed");

    const failedFiles = await readdir(join(root, "docs/cycle/issues/failed"));
    assert.deepEqual(failedFiles, ["only.md"]);
    const failedBody = await readFile(
      join(root, "docs/cycle/issues/failed/only.md"),
      "utf8",
    );
    const { fm } = parseFrontmatter(failedBody);
    assert.equal(fm.triage_attempts, 3);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("empty raw/: returns ok with zero processed and no exec call", async () => {
  const root = await setupRepo();
  try {
    let calls = 0;
    const deps: TriageDeps = {
      runAgent: async (): Promise<TriageAgentResult> => {
        calls++;
        return { exitCode: 0, stdout: "{}", stderr: "" };
      },
    };
    const { log, events } = makeLog();
    const result = await runTriage(root, makeConfig(), log, deps);
    assert.equal(result.status, "ok");
    assert.deepEqual(result.processed, []);
    assert.deepEqual(result.failed, []);
    assert.equal(calls, 0);

    const names = events.map((e) => e.event);
    assert.ok(names.includes("triage.start"));
    assert.ok(names.includes("triage.end"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("atomic apply rolls back when appendRow fails (tbd.jsonl readonly)", async () => {
  const root = await setupRepo();
  try {
    await writeFile(
      join(root, "docs/cycle/issues/raw/atomic.md"),
      rawBody("atomic", "atomic task"),
      "utf8",
    );
    // pre-seed empty new-schema tbd.jsonl, then make it read-only so appendFile fails
    await writeFile(join(root, ".cycle/tbd.jsonl"), "", "utf8");
    await chmod(join(root, ".cycle/tbd.jsonl"), 0o400);

    const deps: TriageDeps = {
      runAgent: async () => ({
        exitCode: 0,
        stdout: enrichJson("atomic"),
        stderr: "",
      }),
    };
    const { log } = makeLog();
    const result = await runTriage(root, makeConfig(), log, deps);
    assert.equal(result.status, "paused");
    assert.deepEqual(result.failed, ["atomic"]);

    const todoFiles = await readdir(join(root, "docs/cycle/issues/todo"));
    assert.equal(
      todoFiles.includes("atomic.md"),
      false,
      "todo file should be removed by rollback",
    );
    // raw was moved to failed/ after 3 exhausted attempts (each tries+rolls back)
    const failedFiles = await readdir(join(root, "docs/cycle/issues/failed"));
    assert.deepEqual(failedFiles, ["atomic.md"]);
  } finally {
    try {
      await chmod(join(root, ".cycle/tbd.jsonl"), 0o644);
    } catch {
      // ignore
    }
    await rm(root, { recursive: true, force: true });
  }
});

test("atomic apply rolls back when raw rename fails (done/ unwritable)", async () => {
  const root = await setupRepo();
  try {
    await writeFile(
      join(root, "docs/cycle/issues/raw/multi.md"),
      rawBody("multi", "multi task"),
      "utf8",
    );
    await chmod(join(root, "docs/cycle/issues/done"), 0o500);

    const deps: TriageDeps = {
      runAgent: async () => ({
        exitCode: 0,
        stdout: decomposeJson("multi"),
        stderr: "",
      }),
    };
    const { log, events } = makeLog();
    const result = await runTriage(root, makeConfig(), log, deps);
    assert.equal(result.status, "paused");

    const todoFiles = await readdir(join(root, "docs/cycle/issues/todo"));
    assert.equal(todoFiles.includes("multi-a.md"), false);
    assert.equal(todoFiles.includes("multi-b.md"), false);

    const queue = await readFile(join(root, ".cycle/tbd.jsonl"), "utf8");
    assert.equal(
      queue.includes("multi-a"),
      false,
      "rollback should remove queue rows",
    );

    const rawFailed = events.filter((e) => e.event === "triage.raw.failed");
    assert.ok(rawFailed.length >= 1);
  } finally {
    try {
      await chmod(join(root, "docs/cycle/issues/done"), 0o755);
    } catch {
      // ignore
    }
    await rm(root, { recursive: true, force: true });
  }
});

test("atomicWrite cleans up .tmp when rename fails", async () => {
  const root = await setupRepo();
  try {
    await writeFile(
      join(root, "docs/cycle/issues/raw/leak.md"),
      rawBody("leak", "leak task"),
      "utf8",
    );
    // Pre-create todo/leak.md as a non-empty directory so rename(tmp, target) fails.
    const targetDir = join(root, "docs/cycle/issues/todo/leak.md");
    await mkdir(targetDir, { recursive: true });
    await writeFile(join(targetDir, "sentinel"), "x", "utf8");

    const deps: TriageDeps = {
      runAgent: async () => ({
        exitCode: 0,
        stdout: enrichJson("leak"),
        stderr: "",
      }),
    };
    const { log } = makeLog();
    const result = await runTriage(root, makeConfig(), log, deps);
    assert.equal(result.status, "paused");

    const todoFiles = await readdir(join(root, "docs/cycle/issues/todo"));
    const leaks = todoFiles.filter((f) => f.endsWith(".tmp"));
    assert.deepEqual(
      leaks,
      [],
      `atomicWrite leaked .tmp file(s): ${leaks.join(",")}`,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("unsupported agent throws clear error", async () => {
  const root = await setupRepo();
  try {
    const cfg = makeConfig();
    cfg.triage.agent = "codex";
    const { log } = makeLog();
    await assert.rejects(
      runTriage(root, cfg, log, { runAgent: async () => ({ exitCode: 0, stdout: "{}", stderr: "" }) }),
      /unsupported triage agent: codex/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("persisted triage_attempts carries into next run for retry budget", async () => {
  const root = await setupRepo();
  try {
    await writeFile(
      join(root, "docs/cycle/issues/raw/persist.md"),
      rawBody("persist", "persisted", 2),
      "utf8",
    );

    let calls = 0;
    const deps: TriageDeps = {
      runAgent: async () => {
        calls++;
        return { exitCode: 0, stdout: "not json", stderr: "" };
      },
    };
    const { log } = makeLog();
    const result = await runTriage(root, makeConfig(), log, deps);
    assert.equal(result.status, "paused");
    assert.equal(calls, 1, "only one attempt left when attempts=2");
    const failedFiles = await readdir(join(root, "docs/cycle/issues/failed"));
    assert.deepEqual(failedFiles, ["persist.md"]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("agent that throws is treated as a failed attempt", async () => {
  const root = await setupRepo();
  try {
    await writeFile(
      join(root, "docs/cycle/issues/raw/throwy.md"),
      rawBody("throwy", "t", 2),
      "utf8",
    );
    const deps: TriageDeps = {
      runAgent: async () => {
        throw new Error("network down");
      },
    };
    const { log, events } = makeLog();
    const result = await runTriage(root, makeConfig(), log, deps);
    assert.equal(result.status, "paused");
    const failed = events.find((e) => e.event === "triage.raw.failed");
    assert.match(String(failed?.fields.reason), /agent failed: network down/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("agent with non-zero exit code is treated as a failed attempt", async () => {
  const root = await setupRepo();
  try {
    await writeFile(
      join(root, "docs/cycle/issues/raw/exit.md"),
      rawBody("exit", "t", 2),
      "utf8",
    );
    const deps: TriageDeps = {
      runAgent: async () => ({ exitCode: 17, stdout: "", stderr: "broken pipe" }),
    };
    const { log, events } = makeLog();
    const result = await runTriage(root, makeConfig(), log, deps);
    assert.equal(result.status, "paused");
    const failed = events.find((e) => e.event === "triage.raw.failed");
    assert.match(String(failed?.fields.reason), /agent exited 17/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

function chainedDecomposeJson(rawId: string): string {
  return JSON.stringify({
    ordering: [
      `${rawId}-auth-middleware`,
      `${rawId}-login-form`,
      `${rawId}-2fa-flow`,
    ],
    children: [
      {
        raw_id: rawId,
        slug: "auth-middleware",
        id: `${rawId}-auth-middleware`,
        title: "Auth middleware",
        workflow: "feature",
        depends_on: [],
        body: "auth body",
      },
      {
        raw_id: rawId,
        slug: "login-form",
        id: `${rawId}-login-form`,
        title: "Login form",
        workflow: "feature",
        depends_on: [`${rawId}-auth-middleware`],
        body: "login body",
      },
      {
        raw_id: rawId,
        slug: "2fa-flow",
        id: `${rawId}-2fa-flow`,
        title: "2FA flow",
        workflow: "feature",
        depends_on: [`${rawId}-login-form`],
        body: "2fa body",
      },
    ],
    decomposed_parents: [rawId],
  });
}

test("happy path: chained siblings — three children with chained depends_on accepted", async () => {
  const root = await setupRepo();
  try {
    await writeFile(
      join(root, "docs/cycle/issues/raw/login.md"),
      rawBody("login", "Add login"),
      "utf8",
    );

    const deps: TriageDeps = {
      runAgent: async () => ({
        exitCode: 0,
        stdout: chainedDecomposeJson("login"),
        stderr: "",
      }),
    };
    const { log, events } = makeLog();

    const result = await runTriage(root, makeConfig(), log, deps);
    assert.equal(result.status, "ok");
    assert.deepEqual(result.processed, ["login"]);
    assert.deepEqual(result.failed, []);

    const todoFiles = (await readdir(join(root, "docs/cycle/issues/todo"))).sort();
    assert.deepEqual(todoFiles, [
      "login-2fa-flow.md",
      "login-auth-middleware.md",
      "login-login-form.md",
    ]);

    const authBody = await readFile(
      join(root, "docs/cycle/issues/todo/login-auth-middleware.md"),
      "utf8",
    );
    const { fm: fmAuth } = parseFrontmatter(authBody);
    assert.deepEqual(fmAuth.depends_on, []);

    const formBody = await readFile(
      join(root, "docs/cycle/issues/todo/login-login-form.md"),
      "utf8",
    );
    const { fm: fmForm } = parseFrontmatter(formBody);
    assert.deepEqual(fmForm.depends_on, ["login-auth-middleware"]);

    const twoFaBody = await readFile(
      join(root, "docs/cycle/issues/todo/login-2fa-flow.md"),
      "utf8",
    );
    const { fm: fm2 } = parseFrontmatter(twoFaBody);
    assert.deepEqual(fm2.depends_on, ["login-login-form"]);

    const queue = await readFile(join(root, ".cycle/tbd.jsonl"), "utf8");
    const rows = queue.trim().split("\n").map((l) => JSON.parse(l));
    const byId = new Map(rows.map((r) => [r.id, r]));
    assert.deepEqual(byId.get("login-auth-middleware").depends_on, []);
    assert.deepEqual(byId.get("login-login-form").depends_on, [
      "login-auth-middleware",
    ]);
    assert.deepEqual(byId.get("login-2fa-flow").depends_on, [
      "login-login-form",
    ]);

    assert.equal(events.filter((e) => e.event === "triage.raw.failed").length, 0);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("dangling depends_on id rejected; retry sees validator error in next prompt", async () => {
  const root = await setupRepo();
  try {
    await writeFile(
      join(root, "docs/cycle/issues/raw/r1.md"),
      rawBody("r1", "raw 1"),
      "utf8",
    );

    let calls = 0;
    const seenPrompts: string[] = [];
    const deps: TriageDeps = {
      runAgent: async (prompt) => {
        seenPrompts.push(prompt);
        calls++;
        if (calls === 1) {
          return {
            exitCode: 0,
            stdout: JSON.stringify({
              ordering: ["r1-a", "r1-b"],
              children: [
                {
                  raw_id: "r1",
                  slug: "a",
                  id: "r1-a",
                  title: "A",
                  workflow: "feature",
                  depends_on: [],
                  body: "a",
                },
                {
                  raw_id: "r1",
                  slug: "b",
                  id: "r1-b",
                  title: "B",
                  workflow: "feature",
                  depends_on: ["does-not-exist"],
                  body: "b",
                },
              ],
              decomposed_parents: ["r1"],
            }),
            stderr: "",
          };
        }
        return { exitCode: 0, stdout: decomposeJson("r1"), stderr: "" };
      },
    };
    const { log, events } = makeLog();
    const result = await runTriage(root, makeConfig(), log, deps);

    assert.equal(result.status, "ok");
    assert.deepEqual(result.processed, ["r1"]);
    assert.equal(calls, 2);

    const failed = events.filter((e) => e.event === "triage.raw.failed");
    assert.equal(failed.length, 1);
    const reason = String(failed[0].fields.reason);
    assert.match(reason, /does-not-exist/);
    assert.match(reason, /r1-b/);

    assert.ok(
      seenPrompts[1].includes("PREVIOUS ATTEMPT FAILED VALIDATION:"),
      "second prompt should include retry feedback",
    );
    assert.ok(
      seenPrompts[1].includes("does-not-exist"),
      "second prompt should mention offending reference",
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("self-loop in depends_on rejected with self-loop-specific message; retry succeeds", async () => {
  const root = await setupRepo();
  try {
    await writeFile(
      join(root, "docs/cycle/issues/raw/r2.md"),
      rawBody("r2", "raw 2"),
      "utf8",
    );

    let calls = 0;
    const seenPrompts: string[] = [];
    const deps: TriageDeps = {
      runAgent: async (prompt) => {
        seenPrompts.push(prompt);
        calls++;
        if (calls === 1) {
          return {
            exitCode: 0,
            stdout: JSON.stringify({
              ordering: ["r2-foo"],
              children: [
                {
                  raw_id: "r2",
                  slug: "foo",
                  id: "r2-foo",
                  title: "Foo",
                  workflow: "feature",
                  depends_on: ["r2-foo"],
                  body: "foo",
                },
              ],
              decomposed_parents: ["r2"],
            }),
            stderr: "",
          };
        }
        return { exitCode: 0, stdout: enrichJson("r2"), stderr: "" };
      },
    };
    const { log, events } = makeLog();
    const result = await runTriage(root, makeConfig(), log, deps);

    assert.equal(result.status, "ok");
    assert.deepEqual(result.processed, ["r2"]);
    assert.equal(calls, 2);

    const failed = events.filter((e) => e.event === "triage.raw.failed");
    assert.equal(failed.length, 1);
    const reason = String(failed[0].fields.reason);
    assert.match(reason, /self-loop/);
    assert.match(reason, /r2-foo/);

    assert.ok(
      seenPrompts[1].includes("PREVIOUS ATTEMPT FAILED VALIDATION:"),
      "second prompt should include retry feedback",
    );
    assert.ok(
      seenPrompts[1].includes("self-loop"),
      "second prompt should mention self-loop",
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("depends_on resolves against existing tbd.jsonl row and todo/ file", async () => {
  const root = await setupRepo();
  try {
    await writeFile(
      join(root, "docs/cycle/issues/raw/r3.md"),
      rawBody("r3", "raw 3"),
      "utf8",
    );
    // Pre-seed existing queue row.
    await writeFile(
      join(root, ".cycle/tbd.jsonl"),
      JSON.stringify({
        id: "old-queue-1",
        title: "old queued",
        status: "pending",
        attempt: 0,
        depends_on: [],
        triaged_at: "2026-05-12T00:00:00Z",
      }) + "\n",
      "utf8",
    );
    // Pre-seed existing todo file.
    await writeFile(
      join(root, "docs/cycle/issues/todo/old-todo-2.md"),
      "---\nid: old-todo-2\ntitle: old todo\n---\nbody\n",
      "utf8",
    );

    const stdout = JSON.stringify({
      ordering: ["r3-z", "old-queue-1"],
      children: [
        {
          raw_id: "r3",
          slug: "z",
          id: "r3-z",
          title: "Z",
          workflow: "feature",
          depends_on: ["old-queue-1", "old-todo-2"],
          body: "z body",
        },
      ],
      decomposed_parents: ["r3"],
    });

    const deps: TriageDeps = {
      runAgent: async () => ({ exitCode: 0, stdout, stderr: "" }),
    };
    const { log, events } = makeLog();
    const result = await runTriage(root, makeConfig(), log, deps);

    assert.equal(result.status, "ok");
    assert.deepEqual(result.processed, ["r3"]);
    assert.equal(events.filter((e) => e.event === "triage.raw.failed").length, 0);

    const zBody = await readFile(
      join(root, "docs/cycle/issues/todo/r3-z.md"),
      "utf8",
    );
    const { fm: fmZ } = parseFrontmatter(zBody);
    assert.deepEqual(fmZ.depends_on, ["old-queue-1", "old-todo-2"]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("validator rejects each missing/wrong field with a specific message", async () => {
  const root = await setupRepo();
  try {
    await writeFile(
      join(root, "docs/cycle/issues/raw/vp.md"),
      rawBody("vp", "v"),
      "utf8",
    );

    const collected: string[] = [];
    const deps: TriageDeps = {
      runAgent: async () => {
        // missing children field entirely
        return {
          exitCode: 0,
          stdout: JSON.stringify({ ordering: [], decomposed_parents: [] }),
          stderr: "",
        };
      },
    };
    const log: Logger = {
      async emit(event, fields) {
        if (event === "triage.raw.failed") {
          collected.push(String(fields.reason));
        }
      },
    };
    const result = await runTriage(root, makeConfig(), log, deps);
    assert.equal(result.status, "paused");
    assert.ok(collected.length > 0);
    assert.ok(
      collected[0].includes("children:"),
      `reason should mention children field; got ${collected[0]}`,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
