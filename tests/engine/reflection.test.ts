import { test } from "node:test";
import { strict as assert } from "node:assert";
import { mkdtemp, mkdir, writeFile, readFile, readdir, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ingestReflection } from "../../src/engine/reflection.ts";
import { parseFrontmatter } from "../../src/engine/frontmatter.ts";

type EmittedEvent = { event: string; fields: Record<string, unknown> };

function makeLogger(): { events: EmittedEvent[]; logger: { emit: (e: string, f: Record<string, unknown>) => Promise<void> } } {
  const events: EmittedEvent[] = [];
  return {
    events,
    logger: {
      async emit(event, fields) {
        events.push({ event, fields });
      },
    },
  };
}

async function setupRepo(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "cycle-refl-"));
  await mkdir(join(root, ".cycle"), { recursive: true });
  await mkdir(join(root, "docs/cycle/issues/raw"), { recursive: true });
  return root;
}

async function fileExists(p: string): Promise<boolean> {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

const CID = "0042";
const SLUG = "test-cycle";

test("ingestReflection: happy path with 2 entries writes files and emits events", async () => {
  const root = await setupRepo();
  try {
    const { events, logger } = makeLogger();
    const stdout = JSON.stringify({
      sharp_edges: [
        { title: "foo bar", body: "first body paragraph.", priority_hint: 7 },
        { title: "baz", body: "second body.", priority_hint: 3 },
      ],
    });
    const r = await ingestReflection(root, CID, SLUG, stdout, logger);
    assert.deepEqual(r, { written: [`refl-${CID}-foo-bar`, `refl-${CID}-baz`], skipped: 0 });

    const fooPath = join(root, "docs/cycle/issues/raw", `refl-${CID}-foo-bar.md`);
    const bazPath = join(root, "docs/cycle/issues/raw", `refl-${CID}-baz.md`);
    assert.ok(await fileExists(fooPath));
    assert.ok(await fileExists(bazPath));

    const fooBody = await readFile(fooPath, "utf8");
    const { fm, bodyAfter } = parseFrontmatter(fooBody);
    assert.equal(fm.id, `refl-${CID}-foo-bar`);
    assert.equal(fm.source, "reflection");
    assert.equal(fm.title, "foo bar");
    assert.equal(fm.triage_attempts, 0);
    assert.equal(fm.priority_hint, 7);
    assert.equal(fm.origin_cycle_id, "0042");
    assert.equal(typeof fm.added_at, "string");
    assert.ok(!Number.isNaN(Date.parse(String(fm.added_at))), "added_at must parse as ISO timestamp");
    assert.match(bodyAfter, /first body paragraph\./);

    const surfaced = events.filter((e) => e.event === "reflection.surfaced");
    assert.equal(surfaced.length, 2);
    assert.equal(surfaced[0].fields.raw_id, `refl-${CID}-foo-bar`);
    assert.equal(surfaced[0].fields.priority_hint, 7);

    const summary = events.find((e) => e.event === "reflection.summary");
    assert.ok(summary);
    assert.equal(summary!.fields.count, 2);
    assert.equal(summary!.fields.skipped, 0);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("ingestReflection: empty array emits summary only, no files", async () => {
  const root = await setupRepo();
  try {
    const { events, logger } = makeLogger();
    const r = await ingestReflection(root, CID, SLUG, JSON.stringify({ sharp_edges: [] }), logger);
    assert.deepEqual(r, { written: [], skipped: 0 });
    const entries = await readdir(join(root, "docs/cycle/issues/raw"));
    assert.equal(entries.length, 0);
    assert.equal(events.length, 1);
    assert.equal(events[0].event, "reflection.summary");
    assert.equal(events[0].fields.count, 0);
    assert.equal(events[0].fields.skipped, 0);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("ingestReflection: unparseable stdout escalates to refl-<cid>-parse-error.md and emits summary", async () => {
  const root = await setupRepo();
  try {
    const { events, logger } = makeLogger();
    const r = await ingestReflection(root, CID, SLUG, "not json at all", logger);
    assert.deepEqual(r, { written: [`refl-${CID}-parse-error`], skipped: 1 });
    const skip = events.find((e) => e.event === "reflection.skipped");
    assert.ok(skip, "reflection.skipped emitted");
    assert.equal(skip!.fields.reason, "parse_error");
    const summary = events.find((e) => e.event === "reflection.summary");
    assert.ok(summary, "reflection.summary emitted on escalation");
    assert.equal(summary!.fields.count, 0);
    assert.equal(summary!.fields.skipped, 1);
    const errPath = join(root, "docs/cycle/issues/raw", `refl-${CID}-parse-error.md`);
    assert.ok(await fileExists(errPath));
    const body = await readFile(errPath, "utf8");
    const { fm, bodyAfter } = parseFrontmatter(body);
    assert.equal(fm.id, `refl-${CID}-parse-error`);
    assert.equal(fm.source, "reflection");
    assert.equal(fm.title, "reflection stdout failed to parse");
    assert.equal(fm.priority_hint, 7);
    assert.equal(fm.origin_cycle_id, CID);
    assert.equal(fm.triage_attempts, 0);
    assert.match(bodyAfter, /not json at all/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("ingestReflection: strips a ```json fenced wrapper before parsing", async () => {
  const root = await setupRepo();
  try {
    const { events, logger } = makeLogger();
    const stdout = "```json\n" + JSON.stringify({ sharp_edges: [] }) + "\n```";
    const r = await ingestReflection(root, CID, SLUG, stdout, logger);
    assert.deepEqual(r, { written: [], skipped: 0 });
    assert.equal(events.length, 1);
    assert.equal(events[0].event, "reflection.summary");
    assert.equal(events[0].fields.count, 0);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("ingestReflection: leading prose + fenced JSON + trailing prose recovers via repair pass", async () => {
  const root = await setupRepo();
  try {
    const { events, logger } = makeLogger();
    const stdout =
      "Here is the output:\n```json\n" +
      JSON.stringify({ sharp_edges: [] }) +
      "\n```\nHope that helps!";
    const r = await ingestReflection(root, CID, SLUG, stdout, logger);
    assert.deepEqual(r, { written: [], skipped: 0 });
    const skip = events.find((e) => e.event === "reflection.skipped");
    assert.equal(skip, undefined, "repair pass succeeds — no reflection.skipped");
    const summary = events.find((e) => e.event === "reflection.summary");
    assert.ok(summary);
    assert.equal(summary!.fields.count, 0);
    assert.equal(summary!.fields.skipped, 0);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("ingestReflection: JSON with trailing prose parses via repair pass", async () => {
  const root = await setupRepo();
  try {
    const { events, logger } = makeLogger();
    const stdout =
      JSON.stringify({
        sharp_edges: [{ title: "A", body: "b", priority_hint: 3 }],
      }) + "\nHere is some commentary the agent leaked.";
    const r = await ingestReflection(root, CID, SLUG, stdout, logger);
    assert.deepEqual(r, { written: [`refl-${CID}-a`], skipped: 0 });
    const skip = events.find((e) => e.event === "reflection.skipped");
    assert.equal(skip, undefined, "repair pass succeeds — no reflection.skipped");
    const surfaced = events.filter((e) => e.event === "reflection.surfaced");
    assert.equal(surfaced.length, 1);
    const summary = events.find((e) => e.event === "reflection.summary");
    assert.equal(summary!.fields.count, 1);
    assert.equal(summary!.fields.skipped, 0);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("ingestReflection: repair pass handles JSON strings containing braces", async () => {
  const root = await setupRepo();
  try {
    const { logger } = makeLogger();
    const stdout =
      JSON.stringify({
        sharp_edges: [{ title: "brace title", body: "body with {literal} braces inside", priority_hint: 3 }],
      }) + "\nyap yap yap";
    const r = await ingestReflection(root, CID, SLUG, stdout, logger);
    assert.deepEqual(r, { written: [`refl-${CID}-brace-title`], skipped: 0 });
    const p = join(root, "docs/cycle/issues/raw", `refl-${CID}-brace-title.md`);
    const body = await readFile(p, "utf8");
    const { fm, bodyAfter } = parseFrontmatter(body);
    assert.equal(fm.title, "brace title");
    assert.match(bodyAfter, /body with \{literal\} braces inside/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("ingestReflection: repair pass handles backslash-escaped quotes inside JSON strings", async () => {
  const root = await setupRepo();
  try {
    const { logger } = makeLogger();
    const stdout =
      JSON.stringify({
        sharp_edges: [
          { title: 'fix: "quoted" title', body: "ok", priority_hint: 4 },
        ],
      }) + "\ntrailing prose to force repair pass";
    const r = await ingestReflection(root, CID, SLUG, stdout, logger);
    assert.equal(r.skipped, 0);
    assert.equal(r.written.length, 1);
    const p = join(root, "docs/cycle/issues/raw", `${r.written[0]}.md`);
    const body = await readFile(p, "utf8");
    const { fm } = parseFrontmatter(body);
    assert.equal(fm.title, 'fix: "quoted" title');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("ingestReflection: unbalanced braces escalate without looping", async () => {
  const root = await setupRepo();
  try {
    const { events, logger } = makeLogger();
    const r = await ingestReflection(root, CID, SLUG, '{"sharp_edges":[', logger);
    assert.deepEqual(r, { written: [`refl-${CID}-parse-error`], skipped: 1 });
    const skipCount = events.filter((e) => e.event === "reflection.skipped").length;
    assert.equal(skipCount, 1, "exactly one reflection.skipped — no loop");
    const summaryCount = events.filter((e) => e.event === "reflection.summary").length;
    assert.equal(summaryCount, 1, "exactly one reflection.summary");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("ingestReflection: repair-substring still invalid JSON escalates with second-parse error message", async () => {
  const root = await setupRepo();
  try {
    const { events, logger } = makeLogger();
    const r = await ingestReflection(root, CID, SLUG, "{x:1} trailing prose", logger);
    assert.deepEqual(r, { written: [`refl-${CID}-parse-error`], skipped: 1 });
    const skip = events.find((e) => e.event === "reflection.skipped");
    assert.ok(skip);
    assert.equal(skip!.fields.reason, "parse_error");
    assert.match(String(skip!.fields.message), /JSON|token|expected/i);
    const summary = events.find((e) => e.event === "reflection.summary");
    assert.equal(summary!.fields.count, 0);
    assert.equal(summary!.fields.skipped, 1);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("ingestReflection: escalation truncates stdout over 8 KB", async () => {
  const root = await setupRepo();
  try {
    const { logger } = makeLogger();
    const huge = "x".repeat(10000);
    const r = await ingestReflection(root, CID, SLUG, huge, logger);
    assert.equal(r.written.length, 1);
    const errPath = join(root, "docs/cycle/issues/raw", `refl-${CID}-parse-error.md`);
    const file = await readFile(errPath, "utf8");
    const { bodyAfter } = parseFrontmatter(file);
    const trimmed = bodyAfter.replace(/^\n/, "").replace(/\n$/, "");
    assert.equal(Buffer.byteLength(trimmed, "utf8"), 8192, "body byte length is exactly 8192 on overflow");
    assert.ok(trimmed.endsWith("\n…\n"), "ends with marker");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("ingestReflection: escalation preserves short stdout verbatim (no marker)", async () => {
  const root = await setupRepo();
  try {
    const { logger } = makeLogger();
    const r = await ingestReflection(root, CID, SLUG, "garbage", logger);
    assert.equal(r.written.length, 1);
    const errPath = join(root, "docs/cycle/issues/raw", `refl-${CID}-parse-error.md`);
    const file = await readFile(errPath, "utf8");
    const { bodyAfter } = parseFrontmatter(file);
    assert.match(bodyAfter, /^\ngarbage\n$/);
    assert.ok(!bodyAfter.includes("…"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("ingestReflection: escalation truncation is codepoint-safe across multi-byte boundary", async () => {
  const root = await setupRepo();
  try {
    const { logger } = makeLogger();
    // 8190 ASCII + rocket (4-byte UTF-8) = 8194 bytes total → must truncate.
    // After codepoint walk, marker = 5 bytes, cap = 8187, so we keep 8187 ASCII
    // chars (rocket dropped — adding it would push acc to 8191, then +4 > 8187 cap),
    // and append marker for a total of 8192 bytes.
    const stdout = "a".repeat(8190) + "🚀";
    const r = await ingestReflection(root, CID, SLUG, stdout, logger);
    assert.equal(r.written.length, 1);
    const errPath = join(root, "docs/cycle/issues/raw", `refl-${CID}-parse-error.md`);
    const file = await readFile(errPath, "utf8");
    const { bodyAfter } = parseFrontmatter(file);
    const trimmed = bodyAfter.replace(/^\n/, "").replace(/\n$/, "");
    assert.equal(Buffer.byteLength(trimmed, "utf8"), 8192);
    assert.ok(!trimmed.includes("�"), "no replacement char from a half-codepoint split");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("ingestReflection: escalation is idempotent on resume (pre-seeded parse-error file replaced)", async () => {
  const root = await setupRepo();
  try {
    const errPath = join(root, "docs/cycle/issues/raw", `refl-${CID}-parse-error.md`);
    await writeFile(errPath, "stale-content-from-previous-attempt", "utf8");
    const { logger } = makeLogger();
    const r = await ingestReflection(root, CID, SLUG, "still not json", logger);
    assert.deepEqual(r, { written: [`refl-${CID}-parse-error`], skipped: 1 });
    const files = (await readdir(join(root, "docs/cycle/issues/raw")))
      .filter((n) => n.startsWith(`refl-${CID}-`));
    assert.deepEqual(files, [`refl-${CID}-parse-error.md`], "exactly one parse-error file");
    const body = await readFile(errPath, "utf8");
    assert.ok(!body.includes("stale-content-from-previous-attempt"));
    assert.match(body, /still not json/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("ingestReflection: entry with missing body is dropped, others written", async () => {
  const root = await setupRepo();
  try {
    const { events, logger } = makeLogger();
    const stdout = JSON.stringify({
      sharp_edges: [
        { title: "kept", body: "ok body", priority_hint: 5 },
        { title: "missing body", body: "", priority_hint: 5 },
      ],
    });
    const r = await ingestReflection(root, CID, SLUG, stdout, logger);
    assert.deepEqual(r, { written: [`refl-${CID}-kept`], skipped: 1 });
    const skip = events.find((e) => e.event === "reflection.skipped");
    assert.ok(skip);
    assert.equal(skip!.fields.reason, "invalid_entry");
    assert.equal(skip!.fields.entry_index, 1);
    assert.equal(skip!.fields.field, "body");
    const summary = events.find((e) => e.event === "reflection.summary");
    assert.equal(summary!.fields.count, 1);
    assert.equal(summary!.fields.skipped, 1);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("ingestReflection: non-number priority_hint is dropped with field=priority_hint", async () => {
  const root = await setupRepo();
  try {
    const { events, logger } = makeLogger();
    const stdout = JSON.stringify({
      sharp_edges: [
        { title: "bad pri", body: "body", priority_hint: "high" as unknown as number },
      ],
    });
    const r = await ingestReflection(root, CID, SLUG, stdout, logger);
    assert.deepEqual(r, { written: [], skipped: 1 });
    const skip = events.find((e) => e.event === "reflection.skipped");
    assert.ok(skip);
    assert.equal(skip!.fields.field, "priority_hint");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("ingestReflection: in-pass slug collision appends -2 suffix", async () => {
  const root = await setupRepo();
  try {
    const { events, logger } = makeLogger();
    const stdout = JSON.stringify({
      sharp_edges: [
        { title: "refactor x", body: "first", priority_hint: 5 },
        { title: "refactor x", body: "second", priority_hint: 5 },
      ],
    });
    const r = await ingestReflection(root, CID, SLUG, stdout, logger);
    assert.deepEqual(r, {
      written: [`refl-${CID}-refactor-x`, `refl-${CID}-refactor-x-2`],
      skipped: 0,
    });
    const p1 = join(root, "docs/cycle/issues/raw", `refl-${CID}-refactor-x.md`);
    const p2 = join(root, "docs/cycle/issues/raw", `refl-${CID}-refactor-x-2.md`);
    assert.ok(await fileExists(p1));
    assert.ok(await fileExists(p2));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("ingestReflection: idempotent re-run unlinks prior refl-<cycleId>-*.md", async () => {
  const root = await setupRepo();
  try {
    const stalePath = join(root, "docs/cycle/issues/raw", `refl-${CID}-stale.md`);
    await writeFile(stalePath, "stale content", "utf8");
    const { logger } = makeLogger();
    const stdout = JSON.stringify({
      sharp_edges: [{ title: "fresh", body: "body", priority_hint: 5 }],
    });
    await ingestReflection(root, CID, SLUG, stdout, logger);
    assert.equal(await fileExists(stalePath), false);
    const freshPath = join(root, "docs/cycle/issues/raw", `refl-${CID}-fresh.md`);
    assert.ok(await fileExists(freshPath));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("ingestReflection: idempotent re-run with same stdout yields identical final state", async () => {
  const root = await setupRepo();
  try {
    const { logger } = makeLogger();
    const stdout = JSON.stringify({
      sharp_edges: [
        { title: "alpha", body: "a", priority_hint: 5 },
        { title: "beta", body: "b", priority_hint: 5 },
      ],
    });
    await ingestReflection(root, CID, SLUG, stdout, logger);
    const after1 = (await readdir(join(root, "docs/cycle/issues/raw"))).sort();
    await ingestReflection(root, CID, SLUG, stdout, logger);
    const after2 = (await readdir(join(root, "docs/cycle/issues/raw"))).sort();
    assert.deepEqual(after1, after2);
    assert.deepEqual(after2, [`refl-${CID}-alpha.md`, `refl-${CID}-beta.md`]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("ingestReflection: out-of-range priority_hint is accepted as-is", async () => {
  const root = await setupRepo();
  try {
    const { logger } = makeLogger();
    const stdout = JSON.stringify({
      sharp_edges: [{ title: "huge pri", body: "b", priority_hint: 99 }],
    });
    const r = await ingestReflection(root, CID, SLUG, stdout, logger);
    assert.deepEqual(r, { written: [`refl-${CID}-huge-pri`], skipped: 0 });
    const body = await readFile(
      join(root, "docs/cycle/issues/raw", `refl-${CID}-huge-pri.md`),
      "utf8",
    );
    const { fm } = parseFrontmatter(body);
    assert.equal(fm.priority_hint, 99);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("ingestReflection: root not an object emits parse_error", async () => {
  const root = await setupRepo();
  try {
    const { events, logger } = makeLogger();
    const r = await ingestReflection(root, CID, SLUG, "[]", logger);
    assert.deepEqual(r, { written: [], skipped: 0 });
    assert.equal(events.length, 1);
    assert.equal(events[0].event, "reflection.skipped");
    assert.equal(events[0].fields.reason, "parse_error");
    assert.match(String(events[0].fields.message), /sharp_edges/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("ingestReflection: NaN priority_hint dropped as invalid", async () => {
  const root = await setupRepo();
  try {
    const { events, logger } = makeLogger();
    const stdout = '{"sharp_edges":[{"title":"x","body":"b","priority_hint":null}]}';
    const r = await ingestReflection(root, CID, SLUG, stdout, logger);
    assert.deepEqual(r, { written: [], skipped: 1 });
    const skip = events.find((e) => e.event === "reflection.skipped");
    assert.equal(skip!.fields.field, "priority_hint");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("ingestReflection: title containing colon and quote round-trips through frontmatter", async () => {
  const root = await setupRepo();
  try {
    const { logger } = makeLogger();
    const tricky = 'fix: "quoted" thing';
    const stdout = JSON.stringify({
      sharp_edges: [{ title: tricky, body: "body", priority_hint: 5 }],
    });
    const r = await ingestReflection(root, CID, SLUG, stdout, logger);
    assert.equal(r.written.length, 1);
    const path = join(root, "docs/cycle/issues/raw", `${r.written[0]}.md`);
    const body = await readFile(path, "utf8");
    const { fm } = parseFrontmatter(body);
    assert.equal(fm.title, tricky);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("ingestReflection: null entry dropped as invalid", async () => {
  const root = await setupRepo();
  try {
    const { events, logger } = makeLogger();
    const stdout = '{"sharp_edges":[null,{"title":"ok","body":"b","priority_hint":1}]}';
    const r = await ingestReflection(root, CID, SLUG, stdout, logger);
    assert.deepEqual(r, { written: [`refl-${CID}-ok`], skipped: 1 });
    const skip = events.find((e) => e.event === "reflection.skipped");
    assert.equal(skip!.fields.field, "entry");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("ingestReflection: unlink error on stale file is swallowed", async () => {
  const root = await setupRepo();
  try {
    const rawDir = join(root, "docs/cycle/issues/raw");
    const stalePath = join(rawDir, `refl-${CID}-stale.md`);
    await writeFile(stalePath, "stale", "utf8");
    // Make raw dir read-only so unlink fails but readdir still works.
    const { chmod } = await import("node:fs/promises");
    await chmod(rawDir, 0o500);
    try {
      const { logger } = makeLogger();
      const r = await ingestReflection(
        root,
        CID,
        SLUG,
        JSON.stringify({ sharp_edges: [] }),
        logger,
      );
      assert.deepEqual(r, { written: [], skipped: 0 });
    } finally {
      await chmod(rawDir, 0o755);
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("ingestReflection: atomicWrite cleanup runs when rename fails", async () => {
  const root = await setupRepo();
  try {
    const rawDir = join(root, "docs/cycle/issues/raw");
    const targetId = `refl-${CID}-blocked`;
    // Pre-create a directory at the target path so rename fails (ENOTEMPTY/EISDIR).
    await mkdir(join(rawDir, `${targetId}.md`), { recursive: true });
    const { logger } = makeLogger();
    const stdout = JSON.stringify({
      sharp_edges: [{ title: "blocked", body: "body", priority_hint: 1 }],
    });
    await assert.rejects(() => ingestReflection(root, CID, SLUG, stdout, logger));
    // .tmp cleanup branch ran; no leftover tmp file with .tmp suffix.
    const entries = await readdir(rawDir);
    assert.equal(entries.filter((e) => e.endsWith(".tmp")).length, 0);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("ingestReflection: entry whose title slugifies to empty falls back to 'entry'", async () => {
  const root = await setupRepo();
  try {
    const { logger } = makeLogger();
    const stdout = JSON.stringify({
      sharp_edges: [{ title: "!!!", body: "b", priority_hint: 1 }],
    });
    const r = await ingestReflection(root, CID, SLUG, stdout, logger);
    assert.deepEqual(r, { written: [`refl-${CID}-entry`], skipped: 0 });
    assert.ok(await fileExists(join(root, "docs/cycle/issues/raw", `refl-${CID}-entry.md`)));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
