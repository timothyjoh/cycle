import { test } from "node:test";
import { strict as assert } from "node:assert";
import { mkdtemp, mkdir, writeFile, readFile, readdir, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ingestReflection } from "../../src/engine/reflection.ts";
import { parseFrontmatter } from "../../src/engine/frontmatter.ts";
import { expectExactlyOne } from "../helpers.ts";

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

async function setupRepo(): Promise<{ root: string; artifactDir: string }> {
  const root = await mkdtemp(join(tmpdir(), "cycle-refl-"));
  await mkdir(join(root, ".cycle"), { recursive: true });
  await mkdir(join(root, "docs/cycle/issues/raw"), { recursive: true });
  await mkdir(join(root, "docs/cycle/issues/todo"), { recursive: true });
  await mkdir(join(root, "docs/cycle/issues/discuss"), { recursive: true });
  const artifactDir = join(root, `docs/cycle/${CID}-test-cycle`);
  await mkdir(artifactDir, { recursive: true });
  // Create empty log.jsonl so readScopeWarnings has something to read
  await writeFile(join(root, ".cycle", "log.jsonl"), "", "utf8");
  return { root, artifactDir };
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
  const { root, artifactDir } = await setupRepo();
  try {
    const { events, logger } = makeLogger();
    const stdout = JSON.stringify({
      sharp_edges: [
        { title: "foo bar", body: "first body paragraph.", bucket: "defer", priority: "medium" },
        { title: "baz", body: "second body.", bucket: "defer", priority: "medium" },
      ],
    });
    const r = await ingestReflection(root, CID, SLUG, stdout, logger, artifactDir, join(artifactDir, "touched.json"));
    assert.deepEqual(r, { written: [`refl-${CID}-foo-bar`, `refl-${CID}-baz`], skipped: 0, fixNow: 0 });

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
    assert.equal(fm.priority, "medium");
    assert.equal(fm.origin_cycle_id, "0042");
    assert.equal(typeof fm.added_at, "string");
    assert.ok(!Number.isNaN(Date.parse(String(fm.added_at))), "added_at must parse as ISO timestamp");
    assert.ok(!("priority_hint" in fm), "no priority_hint field");
    assert.match(bodyAfter, /first body paragraph\./);

    const deferred = events.filter((e) => e.event === "reflection.deferred_issue_written");
    assert.equal(deferred.length, 2);
    assert.equal(deferred[0].fields.raw_id, `refl-${CID}-foo-bar`);
    assert.equal(deferred[0].fields.priority, "medium");

    const summary = expectExactlyOne(events, "reflection.summary");
    assert.equal(summary.fields.count, 2);
    assert.equal(summary.fields.skipped, 0);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("ingestReflection: empty array emits summary only, no files", async () => {
  const { root, artifactDir } = await setupRepo();
  try {
    const { events, logger } = makeLogger();
    const r = await ingestReflection(root, CID, SLUG, JSON.stringify({ sharp_edges: [] }), logger, artifactDir, join(artifactDir, "touched.json"));
    assert.deepEqual(r, { written: [], skipped: 0, fixNow: 0 });
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
  const { root, artifactDir } = await setupRepo();
  try {
    const { events, logger } = makeLogger();
    const r = await ingestReflection(root, CID, SLUG, "not json at all", logger, artifactDir, join(artifactDir, "touched.json"));
    assert.deepEqual(r, { written: [`refl-${CID}-parse-error`], skipped: 1, fixNow: 0 });
    const skip = events.find((e) => e.event === "reflection.skipped");
    assert.ok(skip, "reflection.skipped emitted");
    assert.equal(skip!.fields.reason, "parse_error");
    const summary = expectExactlyOne(events, "reflection.summary");
    assert.equal(summary.fields.count, 0);
    assert.equal(summary.fields.skipped, 1);
    const errPath = join(root, "docs/cycle/issues/raw", `refl-${CID}-parse-error.md`);
    assert.ok(await fileExists(errPath));
    const body = await readFile(errPath, "utf8");
    const { fm, bodyAfter } = parseFrontmatter(body);
    assert.equal(fm.id, `refl-${CID}-parse-error`);
    assert.equal(fm.source, "reflection");
    assert.equal(fm.title, "reflection stdout failed to parse");
    assert.equal(fm.priority, "high");
    assert.equal(fm.origin_cycle_id, CID);
    assert.equal(fm.triage_attempts, 0);
    assert.ok(!("priority_hint" in fm), "no priority_hint field");
    assert.match(bodyAfter, /not json at all/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("ingestReflection: strips a ```json fenced wrapper before parsing", async () => {
  const { root, artifactDir } = await setupRepo();
  try {
    const { events, logger } = makeLogger();
    const stdout = "```json\n" + JSON.stringify({ sharp_edges: [] }) + "\n```";
    const r = await ingestReflection(root, CID, SLUG, stdout, logger, artifactDir, join(artifactDir, "touched.json"));
    assert.deepEqual(r, { written: [], skipped: 0, fixNow: 0 });
    assert.equal(events.length, 1);
    assert.equal(events[0].event, "reflection.summary");
    assert.equal(events[0].fields.count, 0);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("ingestReflection: leading prose + fenced JSON + trailing prose parsed via stripFences", async () => {
  const { root, artifactDir } = await setupRepo();
  try {
    const { events, logger } = makeLogger();
    const stdout =
      "Here is the output:\n```json\n" +
      JSON.stringify({ sharp_edges: [] }) +
      "\n```\nHope that helps!";
    const r = await ingestReflection(root, CID, SLUG, stdout, logger, artifactDir, join(artifactDir, "touched.json"));
    assert.deepEqual(r, { written: [], skipped: 0, fixNow: 0 });
    const skip = events.find((e) => e.event === "reflection.skipped");
    assert.equal(skip, undefined, "stripFences extracts fence before repair path — no reflection.skipped");
    const summary = expectExactlyOne(events, "reflection.summary");
    assert.equal(summary.fields.count, 0);
    assert.equal(summary.fields.skipped, 0);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("ingestReflection: prose with brace before fence parses via stripFences", async () => {
  const { root, artifactDir } = await setupRepo();
  try {
    const { events, logger } = makeLogger();
    const stdout =
      "Error in step {build}:\n```json\n" +
      JSON.stringify({ sharp_edges: [{ title: "t", body: "b", bucket: "defer", priority: "medium" }] }) +
      "\n```";
    const r = await ingestReflection(root, CID, SLUG, stdout, logger, artifactDir, join(artifactDir, "touched.json"));
    assert.deepEqual(r, { written: [`refl-${CID}-t`], skipped: 0, fixNow: 0 });
    const skip = events.find((e) => e.event === "reflection.skipped");
    assert.equal(skip, undefined, "stripFences removes fence before brace scan");
    const summary = expectExactlyOne(events, "reflection.summary");
    assert.equal(summary.fields.count, 1);
    assert.equal(summary.fields.skipped, 0);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("ingestReflection: JSON with trailing prose parses via repair pass", async () => {
  const { root, artifactDir } = await setupRepo();
  try {
    const { events, logger } = makeLogger();
    const stdout =
      JSON.stringify({
        sharp_edges: [{ title: "A", body: "b", bucket: "defer", priority: "medium" }],
      }) + "\nHere is some commentary the agent leaked.";
    const r = await ingestReflection(root, CID, SLUG, stdout, logger, artifactDir, join(artifactDir, "touched.json"));
    assert.deepEqual(r, { written: [`refl-${CID}-a`], skipped: 0, fixNow: 0 });
    const skip = events.find((e) => e.event === "reflection.skipped");
    assert.equal(skip, undefined, "repair pass succeeds — no reflection.skipped");
    const deferred = events.filter((e) => e.event === "reflection.deferred_issue_written");
    assert.equal(deferred.length, 1);
    const summary = expectExactlyOne(events, "reflection.summary");
    assert.equal(summary.fields.count, 1);
    assert.equal(summary.fields.skipped, 0);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("ingestReflection: repair pass handles JSON strings containing braces", async () => {
  const { root, artifactDir } = await setupRepo();
  try {
    const { logger } = makeLogger();
    const stdout =
      JSON.stringify({
        sharp_edges: [{ title: "brace title", body: "body with {literal} braces inside", bucket: "defer", priority: "medium" }],
      }) + "\nyap yap yap";
    const r = await ingestReflection(root, CID, SLUG, stdout, logger, artifactDir, join(artifactDir, "touched.json"));
    assert.deepEqual(r, { written: [`refl-${CID}-brace-title`], skipped: 0, fixNow: 0 });
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
  const { root, artifactDir } = await setupRepo();
  try {
    const { logger } = makeLogger();
    const stdout =
      JSON.stringify({
        sharp_edges: [
          { title: 'fix: "quoted" title', body: "ok", bucket: "defer", priority: "medium" },
        ],
      }) + "\ntrailing prose to force repair pass";
    const r = await ingestReflection(root, CID, SLUG, stdout, logger, artifactDir, join(artifactDir, "touched.json"));
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
  const { root, artifactDir } = await setupRepo();
  try {
    const { events, logger } = makeLogger();
    const r = await ingestReflection(root, CID, SLUG, '{"sharp_edges":[', logger, artifactDir, join(artifactDir, "touched.json"));
    assert.deepEqual(r, { written: [`refl-${CID}-parse-error`], skipped: 1, fixNow: 0 });
    const skipCount = events.filter((e) => e.event === "reflection.skipped").length;
    assert.equal(skipCount, 1, "exactly one reflection.skipped — no loop");
    const summaryCount = events.filter((e) => e.event === "reflection.summary").length;
    assert.equal(summaryCount, 1, "exactly one reflection.summary");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("ingestReflection: repair-substring still invalid JSON exhausts retry loop and escalates", async () => {
  const { root, artifactDir } = await setupRepo();
  try {
    const { events, logger } = makeLogger();
    const r = await ingestReflection(root, CID, SLUG, "{x:1} trailing prose", logger, artifactDir, join(artifactDir, "touched.json"));
    assert.deepEqual(r, { written: [`refl-${CID}-parse-error`], skipped: 1, fixNow: 0 });
    const skip = events.find((e) => e.event === "reflection.skipped");
    assert.ok(skip);
    assert.equal(skip!.fields.reason, "parse_error");
    assert.match(String(skip!.fields.message), /JSON|token|expected/i);
    const summary = expectExactlyOne(events, "reflection.summary");
    assert.equal(summary.fields.count, 0);
    assert.equal(summary.fields.skipped, 1);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("ingestReflection: escalation truncates stdout over 8 KB", async () => {
  const { root, artifactDir } = await setupRepo();
  try {
    const { logger } = makeLogger();
    const huge = "x".repeat(10000);
    const r = await ingestReflection(root, CID, SLUG, huge, logger, artifactDir, join(artifactDir, "touched.json"));
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
  const { root, artifactDir } = await setupRepo();
  try {
    const { logger } = makeLogger();
    const r = await ingestReflection(root, CID, SLUG, "garbage", logger, artifactDir, join(artifactDir, "touched.json"));
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
  const { root, artifactDir } = await setupRepo();
  try {
    const { logger } = makeLogger();
    // 8190 ASCII + rocket (4-byte UTF-8) = 8194 bytes total → must truncate.
    // After codepoint walk, marker = 5 bytes, cap = 8187, so we keep 8187 ASCII
    // chars (rocket dropped — adding it would push acc to 8191, then +4 > 8187 cap),
    // and append marker for a total of 8192 bytes.
    const stdout = "a".repeat(8190) + "🚀";
    const r = await ingestReflection(root, CID, SLUG, stdout, logger, artifactDir, join(artifactDir, "touched.json"));
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
  const { root, artifactDir } = await setupRepo();
  try {
    const errPath = join(root, "docs/cycle/issues/raw", `refl-${CID}-parse-error.md`);
    await writeFile(errPath, "stale-content-from-previous-attempt", "utf8");
    const { logger } = makeLogger();
    const r = await ingestReflection(root, CID, SLUG, "still not json", logger, artifactDir, join(artifactDir, "touched.json"));
    assert.deepEqual(r, { written: [`refl-${CID}-parse-error`], skipped: 1, fixNow: 0 });
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
  const { root, artifactDir } = await setupRepo();
  try {
    const { events, logger } = makeLogger();
    const stdout = JSON.stringify({
      sharp_edges: [
        { title: "kept", body: "ok body", bucket: "defer", priority: "medium" },
        { title: "missing body", body: "", bucket: "defer", priority: "medium" },
      ],
    });
    const r = await ingestReflection(root, CID, SLUG, stdout, logger, artifactDir, join(artifactDir, "touched.json"));
    assert.deepEqual(r, { written: [`refl-${CID}-kept`], skipped: 1, fixNow: 0 });
    const skip = events.find((e) => e.event === "reflection.skipped");
    assert.ok(skip);
    assert.equal(skip!.fields.reason, "invalid_entry");
    assert.equal(skip!.fields.entry_index, 1);
    assert.equal(skip!.fields.field, "body");
    const summary = expectExactlyOne(events, "reflection.summary");
    assert.equal(summary.fields.count, 1);
    assert.equal(summary.fields.skipped, 1);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("ingestReflection: invalid bucket value is dropped with field=bucket", async () => {
  const { root, artifactDir } = await setupRepo();
  try {
    const { events, logger } = makeLogger();
    const stdout = JSON.stringify({
      sharp_edges: [
        { title: "bad bucket", body: "body", bucket: "invalid" },
      ],
    });
    const r = await ingestReflection(root, CID, SLUG, stdout, logger, artifactDir, join(artifactDir, "touched.json"));
    assert.deepEqual(r, { written: [], skipped: 1, fixNow: 0 });
    const skip = events.find((e) => e.event === "reflection.skipped");
    assert.ok(skip);
    assert.equal(skip!.fields.field, "bucket");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("ingestReflection: in-pass slug collision appends -2 suffix", async () => {
  const { root, artifactDir } = await setupRepo();
  try {
    const { events, logger } = makeLogger();
    const stdout = JSON.stringify({
      sharp_edges: [
        { title: "refactor x", body: "first", bucket: "defer", priority: "medium" },
        { title: "refactor x", body: "second", bucket: "defer", priority: "medium" },
      ],
    });
    const r = await ingestReflection(root, CID, SLUG, stdout, logger, artifactDir, join(artifactDir, "touched.json"));
    assert.deepEqual(r, {
      written: [`refl-${CID}-refactor-x`, `refl-${CID}-refactor-x-2`],
      skipped: 0,
      fixNow: 0,
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
  const { root, artifactDir } = await setupRepo();
  try {
    const stalePath = join(root, "docs/cycle/issues/raw", `refl-${CID}-stale.md`);
    await writeFile(stalePath, "stale content", "utf8");
    const { logger } = makeLogger();
    const stdout = JSON.stringify({
      sharp_edges: [{ title: "fresh", body: "body", bucket: "defer", priority: "medium" }],
    });
    await ingestReflection(root, CID, SLUG, stdout, logger, artifactDir, join(artifactDir, "touched.json"));
    assert.equal(await fileExists(stalePath), false);
    const freshPath = join(root, "docs/cycle/issues/raw", `refl-${CID}-fresh.md`);
    assert.ok(await fileExists(freshPath));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("ingestReflection: idempotent re-run with same stdout yields identical final state", async () => {
  const { root, artifactDir } = await setupRepo();
  try {
    const { logger } = makeLogger();
    const stdout = JSON.stringify({
      sharp_edges: [
        { title: "alpha", body: "a", bucket: "defer", priority: "medium" },
        { title: "beta", body: "b", bucket: "defer", priority: "medium" },
      ],
    });
    await ingestReflection(root, CID, SLUG, stdout, logger, artifactDir, join(artifactDir, "touched.json"));
    const after1 = (await readdir(join(root, "docs/cycle/issues/raw"))).sort();
    await ingestReflection(root, CID, SLUG, stdout, logger, artifactDir, join(artifactDir, "touched.json"));
    const after2 = (await readdir(join(root, "docs/cycle/issues/raw"))).sort();
    assert.deepEqual(after1, after2);
    assert.deepEqual(after2, [`refl-${CID}-alpha.md`, `refl-${CID}-beta.md`]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("ingestReflection: defer entry writes priority enum in frontmatter", async () => {
  const { root, artifactDir } = await setupRepo();
  try {
    const { logger } = makeLogger();
    const stdout = JSON.stringify({
      sharp_edges: [{ title: "huge pri", body: "b", bucket: "defer", priority: "medium" }],
    });
    const r = await ingestReflection(root, CID, SLUG, stdout, logger, artifactDir, join(artifactDir, "touched.json"));
    assert.deepEqual(r, { written: [`refl-${CID}-huge-pri`], skipped: 0, fixNow: 0 });
    const body = await readFile(
      join(root, "docs/cycle/issues/raw", `refl-${CID}-huge-pri.md`),
      "utf8",
    );
    const { fm } = parseFrontmatter(body);
    assert.equal(fm.priority, "medium");
    assert.ok(!("priority_hint" in fm), "no priority_hint field");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("ingestReflection: root not an object emits parse_error", async () => {
  const { root, artifactDir } = await setupRepo();
  try {
    const { events, logger } = makeLogger();
    const r = await ingestReflection(root, CID, SLUG, "[]", logger, artifactDir, join(artifactDir, "touched.json"));
    assert.deepEqual(r, { written: [], skipped: 0, fixNow: 0 });
    assert.equal(events.length, 1);
    assert.equal(events[0].event, "reflection.skipped");
    assert.equal(events[0].fields.reason, "parse_error");
    assert.match(String(events[0].fields.message), /sharp_edges/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("ingestReflection: missing bucket field dropped as invalid", async () => {
  const { root, artifactDir } = await setupRepo();
  try {
    const { events, logger } = makeLogger();
    const stdout = '{"sharp_edges":[{"title":"x","body":"b"}]}';
    const r = await ingestReflection(root, CID, SLUG, stdout, logger, artifactDir, join(artifactDir, "touched.json"));
    assert.deepEqual(r, { written: [], skipped: 1, fixNow: 0 });
    const skip = events.find((e) => e.event === "reflection.skipped");
    assert.equal(skip!.fields.field, "bucket");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("ingestReflection: title containing colon and quote round-trips through frontmatter", async () => {
  const { root, artifactDir } = await setupRepo();
  try {
    const { logger } = makeLogger();
    const tricky = 'fix: "quoted" thing';
    const stdout = JSON.stringify({
      sharp_edges: [{ title: tricky, body: "body", bucket: "defer", priority: "medium" }],
    });
    const r = await ingestReflection(root, CID, SLUG, stdout, logger, artifactDir, join(artifactDir, "touched.json"));
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
  const { root, artifactDir } = await setupRepo();
  try {
    const { events, logger } = makeLogger();
    const stdout = '{"sharp_edges":[null,{"title":"ok","body":"b","bucket":"defer","priority":"medium"}]}';
    const r = await ingestReflection(root, CID, SLUG, stdout, logger, artifactDir, join(artifactDir, "touched.json"));
    assert.deepEqual(r, { written: [`refl-${CID}-ok`], skipped: 1, fixNow: 0 });
    const skip = events.find((e) => e.event === "reflection.skipped");
    assert.equal(skip!.fields.field, "entry");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("ingestReflection: unlink error on stale file is swallowed", async () => {
  const { root, artifactDir } = await setupRepo();
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
        artifactDir,
        join(artifactDir, "touched.json"),
      );
      assert.deepEqual(r, { written: [], skipped: 0, fixNow: 0 });
    } finally {
      await chmod(rawDir, 0o755);
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("ingestReflection: atomicWrite cleanup runs when rename fails", async () => {
  const { root, artifactDir } = await setupRepo();
  try {
    const rawDir = join(root, "docs/cycle/issues/raw");
    const targetId = `refl-${CID}-blocked`;
    // Pre-create a directory at the target path so rename fails (ENOTEMPTY/EISDIR).
    await mkdir(join(rawDir, `${targetId}.md`), { recursive: true });
    const { logger } = makeLogger();
    const stdout = JSON.stringify({
      sharp_edges: [{ title: "blocked", body: "body", bucket: "defer", priority: "medium" }],
    });
    await assert.rejects(() => ingestReflection(root, CID, SLUG, stdout, logger, artifactDir, join(artifactDir, "touched.json")));
    // .tmp cleanup branch ran; no leftover tmp file with .tmp suffix.
    const entries = await readdir(rawDir);
    assert.equal(entries.filter((e) => e.endsWith(".tmp")).length, 0);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("ingestReflection: entry whose title slugifies to empty falls back to 'entry'", async () => {
  const { root, artifactDir } = await setupRepo();
  try {
    const { logger } = makeLogger();
    const stdout = JSON.stringify({
      sharp_edges: [{ title: "!!!", body: "b", bucket: "defer", priority: "medium" }],
    });
    const r = await ingestReflection(root, CID, SLUG, stdout, logger, artifactDir, join(artifactDir, "touched.json"));
    assert.deepEqual(r, { written: [`refl-${CID}-entry`], skipped: 0, fixNow: 0 });
    assert.ok(await fileExists(join(root, "docs/cycle/issues/raw", `refl-${CID}-entry.md`)));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("ingestReflection: unfenced prose with brace before JSON object recovers via retry", async () => {
  const { root, artifactDir } = await setupRepo();
  try {
    const { events, logger } = makeLogger();
    const stdout = "Error in step {build}: failed.\n" + JSON.stringify({ sharp_edges: [] });
    const r = await ingestReflection(root, CID, SLUG, stdout, logger, artifactDir, join(artifactDir, "touched.json"));
    assert.deepEqual(r, { written: [], skipped: 0, fixNow: 0 });
    const skip = events.find((e) => e.event === "reflection.skipped");
    assert.equal(skip, undefined, "retry loop succeeds — no reflection.skipped for parse failure");
    const summary = expectExactlyOne(events, "reflection.summary");
    assert.equal(summary.fields.count, 0);
    assert.equal(summary.fields.skipped, 0);
    const files = await readdir(join(root, "docs/cycle/issues/raw"));
    assert.equal(files.filter((f) => f.includes("parse-error")).length, 0);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("ingestReflection: unfenced prose with brace before JSON array recovers — parse ok, shape check fails cleanly", async () => {
  const { root, artifactDir } = await setupRepo();
  try {
    const { events, logger } = makeLogger();
    const stdout = "Prose {with: braces} and more prose\n[1,2,3]";
    const r = await ingestReflection(root, CID, SLUG, stdout, logger, artifactDir, join(artifactDir, "touched.json"));
    assert.deepEqual(r, { written: [], skipped: 0, fixNow: 0 });
    const skip = events.find((e) => e.event === "reflection.skipped");
    assert.ok(skip, "reflection.skipped emitted for shape failure");
    assert.equal(skip!.fields.reason, "parse_error");
    assert.match(String(skip!.fields.message), /sharp_edges/);
    const files = await readdir(join(root, "docs/cycle/issues/raw"));
    assert.equal(files.filter((f) => f.includes("parse-error")).length, 0, "no parse-error file — parse itself succeeded");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

// ─── New tests: three-bucket routing ─────────────────────────────────────────

test("fix_now: FINAL_FIXES.md written with title and body", async () => {
  const { root, artifactDir } = await setupRepo();
  try {
    const { events, logger } = makeLogger();
    const stdout = JSON.stringify({
      sharp_edges: [{ title: "quick fix", body: "Fix the typo in line 12.", bucket: "fix_now" }],
    });
    const r = await ingestReflection(root, CID, SLUG, stdout, logger, artifactDir, join(artifactDir, "touched.json"));
    assert.deepEqual(r, { written: [], skipped: 0, fixNow: 1 });
    const finalFixesPath = join(artifactDir, "FINAL_FIXES.md");
    assert.ok(await fileExists(finalFixesPath));
    const content = await readFile(finalFixesPath, "utf8");
    assert.match(content, /quick fix/);
    assert.match(content, /Fix the typo in line 12\./);
    const fixNowEv = events.find((e) => e.event === "reflection.fix_now_written");
    assert.ok(fixNowEv);
    assert.equal(fixNowEv!.fields.title, "quick fix");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("fix_now: FINAL_FIXES.md absent when no fix_now entries", async () => {
  const { root, artifactDir } = await setupRepo();
  try {
    const { logger } = makeLogger();
    const stdout = JSON.stringify({
      sharp_edges: [{ title: "defer this", body: "body.", bucket: "defer", priority: "medium" }],
    });
    await ingestReflection(root, CID, SLUG, stdout, logger, artifactDir, join(artifactDir, "touched.json"));
    assert.equal(await fileExists(join(artifactDir, "FINAL_FIXES.md")), false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("fix_now: multiple fix_now items all appear in FINAL_FIXES.md", async () => {
  const { root, artifactDir } = await setupRepo();
  try {
    const { logger } = makeLogger();
    const stdout = JSON.stringify({
      sharp_edges: [
        { title: "fix alpha", body: "alpha body.", bucket: "fix_now" },
        { title: "fix beta", body: "beta body.", bucket: "fix_now" },
      ],
    });
    const r = await ingestReflection(root, CID, SLUG, stdout, logger, artifactDir, join(artifactDir, "touched.json"));
    assert.equal(r.fixNow, 2);
    const content = await readFile(join(artifactDir, "FINAL_FIXES.md"), "utf8");
    assert.match(content, /fix alpha/);
    assert.match(content, /alpha body\./);
    assert.match(content, /fix beta/);
    assert.match(content, /beta body\./);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("cap: at most 2 defer+discuss combined written; reflection.cap_reached emitted for excess", async () => {
  const { root, artifactDir } = await setupRepo();
  try {
    const { events, logger } = makeLogger();
    const stdout = JSON.stringify({
      sharp_edges: [
        { title: "edge one", body: "b1", bucket: "defer", priority: "medium" },
        { title: "edge two", body: "b2", bucket: "defer", priority: "medium" },
        { title: "edge three", body: "b3", bucket: "defer", priority: "medium" },
      ],
    });
    const r = await ingestReflection(root, CID, SLUG, stdout, logger, artifactDir, join(artifactDir, "touched.json"));
    assert.equal(r.written.length, 2);
    const capEv = expectExactlyOne(events, "reflection.cap_reached");
    assert.equal(capEv.fields.title, "edge three");
    const rawFiles = await readdir(join(root, "docs/cycle/issues/raw"));
    assert.equal(rawFiles.filter((f) => f.endsWith(".md")).length, 2);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("cap: discuss counts toward cap", async () => {
  const { root, artifactDir } = await setupRepo();
  try {
    const { events, logger } = makeLogger();
    const stdout = JSON.stringify({
      sharp_edges: [
        { title: "defer one", body: "b1", bucket: "defer", priority: "high" },
        { title: "discuss two", body: "b2", bucket: "discuss" },
        { title: "defer three", body: "b3", bucket: "defer", priority: "medium" },
      ],
    });
    const r = await ingestReflection(root, CID, SLUG, stdout, logger, artifactDir, join(artifactDir, "touched.json"));
    assert.equal(r.written.length, 2);
    const capEv = expectExactlyOne(events, "reflection.cap_reached");
    assert.equal(capEv.fields.title, "defer three");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("dedup: same-cycle raw/ file removed by cleanup and re-created (no dedup skip)", async () => {
  const { root, artifactDir } = await setupRepo();
  try {
    const { events, logger } = makeLogger();
    // Idempotent cleanup removes refl-<CID>-*.md from raw/ before dedup map is built.
    // So a pre-existing same-cycle file in raw/ is deleted first and then re-written —
    // dedup_skipped is NOT emitted. This verifies cleanup takes precedence over raw/ dedup.
    const prePath = join(root, "docs/cycle/issues/raw", `refl-${CID}-recreated.md`);
    await writeFile(prePath, "stale content", "utf8");
    const stdout = JSON.stringify({
      sharp_edges: [{ title: "recreated", body: "fresh body.", bucket: "defer", priority: "medium" }],
    });
    const r = await ingestReflection(root, CID, SLUG, stdout, logger, artifactDir, join(artifactDir, "touched.json"));
    assert.equal(r.written.length, 1);
    assert.ok(await fileExists(prePath), "file re-created after cleanup");
    const content = await readFile(prePath, "utf8");
    assert.match(content, /fresh body\./, "file contains fresh content, not stale");
    const dupEv = events.find((e) => e.event === "reflection.dedup_skipped");
    assert.equal(dupEv, undefined, "no dedup_skipped — cleanup removed file before dedup map built");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("dedup: matching id in todo/ emits reflection.dedup_skipped", async () => {
  const { root, artifactDir } = await setupRepo();
  try {
    const { events, logger } = makeLogger();
    // Pre-create a file in todo/ (triage moved it there from raw/)
    const preexistingId = `refl-${CID}-already-triaged`;
    await writeFile(join(root, "docs/cycle/issues/todo", `${preexistingId}.md`), "---\nid: x\n---\n", "utf8");
    const stdout = JSON.stringify({
      sharp_edges: [{ title: "already triaged", body: "body.", bucket: "defer", priority: "medium" }],
    });
    const r = await ingestReflection(root, CID, SLUG, stdout, logger, artifactDir, join(artifactDir, "touched.json"));
    assert.equal(r.written.length, 0);
    const dupEv = expectExactlyOne(events, "reflection.dedup_skipped");
    assert.equal(dupEv.fields.id, preexistingId);
    assert.equal(dupEv.fields.existing_in, "todo");
    // No new file written for this entry
    const rawFiles = await readdir(join(root, "docs/cycle/issues/raw"));
    assert.equal(rawFiles.filter((f) => f.endsWith(".md")).length, 0);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("dedup: matching id in discuss/ emits reflection.dedup_skipped", async () => {
  const { root, artifactDir } = await setupRepo();
  try {
    const { events, logger } = makeLogger();
    // Pre-create a file in discuss/ (triage routed it there)
    const preexistingId = `refl-${CID}-in-discuss`;
    await writeFile(join(root, "docs/cycle/issues/discuss", `${preexistingId}.md`), "---\nid: x\n---\n", "utf8");
    const stdout = JSON.stringify({
      sharp_edges: [{ title: "in discuss", body: "body.", bucket: "discuss" }],
    });
    const r = await ingestReflection(root, CID, SLUG, stdout, logger, artifactDir, join(artifactDir, "touched.json"));
    assert.equal(r.written.length, 0);
    const dupEv = expectExactlyOne(events, "reflection.dedup_skipped");
    assert.equal(dupEv.fields.id, preexistingId);
    assert.equal(dupEv.fields.existing_in, "discuss");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("scope_warning: commit.scope_warning in log.jsonl produces deferred raw issue", async () => {
  const { root, artifactDir } = await setupRepo();
  try {
    const { events, logger } = makeLogger();
    // Write a commit.scope_warning event to log.jsonl
    const logLine = JSON.stringify({
      ts: new Date().toISOString(),
      event: "commit.scope_warning",
      cycle_id: CID,
      files: ["src/engine/foo.ts", "src/engine/bar.ts"],
    });
    await writeFile(join(root, ".cycle", "log.jsonl"), logLine + "\n", "utf8");
    const stdout = JSON.stringify({ sharp_edges: [] });
    const r = await ingestReflection(root, CID, SLUG, stdout, logger, artifactDir, join(artifactDir, "touched.json"));
    // The synthetic entry should be written as a deferred raw issue
    assert.equal(r.written.length, 1);
    const deferredEv = events.find((e) => e.event === "reflection.deferred_issue_written");
    assert.ok(deferredEv, "deferred_issue_written emitted for scope warning");
    assert.equal(deferredEv!.fields.priority, "low");
    assert.equal(deferredEv!.fields.bucket, "defer");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("scope_warning: scope_warning subject to cap when cap already full", async () => {
  const { root, artifactDir } = await setupRepo();
  try {
    const { events, logger } = makeLogger();
    // Write a commit.scope_warning event to log.jsonl
    const logLine = JSON.stringify({
      ts: new Date().toISOString(),
      event: "commit.scope_warning",
      cycle_id: CID,
      files: ["src/engine/foo.ts"],
    });
    await writeFile(join(root, ".cycle", "log.jsonl"), logLine + "\n", "utf8");
    // Supply 2 defer entries to fill the cap first
    const stdout = JSON.stringify({
      sharp_edges: [
        { title: "edge one", body: "b1", bucket: "defer", priority: "medium" },
        { title: "edge two", body: "b2", bucket: "defer", priority: "medium" },
      ],
    });
    const r = await ingestReflection(root, CID, SLUG, stdout, logger, artifactDir, join(artifactDir, "touched.json"));
    assert.equal(r.written.length, 2);
    const capEv = expectExactlyOne(events, "reflection.cap_reached");
    assert.ok(capEv, "cap_reached emitted for scope_warning when cap full");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("REFLECTION.md: present in artifactDir after successful reflection", async () => {
  const { root, artifactDir } = await setupRepo();
  try {
    const { logger } = makeLogger();
    const stdout = JSON.stringify({ sharp_edges: [] });
    await ingestReflection(root, CID, SLUG, stdout, logger, artifactDir, join(artifactDir, "touched.json"));
    const reflPath = join(artifactDir, "REFLECTION.md");
    assert.ok(await fileExists(reflPath));
    const content = await readFile(reflPath, "utf8");
    assert.ok(content.length > 0, "REFLECTION.md is non-empty");
    assert.match(content, new RegExp(CID));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("REFLECTION.md: absent after parse error (not written on failure)", async () => {
  const { root, artifactDir } = await setupRepo();
  try {
    const { logger } = makeLogger();
    await ingestReflection(root, CID, SLUG, "not json", logger, artifactDir, join(artifactDir, "touched.json"));
    assert.equal(await fileExists(join(artifactDir, "REFLECTION.md")), false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("priority: defer entry with priority: critical writes priority: critical frontmatter", async () => {
  const { root, artifactDir } = await setupRepo();
  try {
    const { logger } = makeLogger();
    const stdout = JSON.stringify({
      sharp_edges: [{ title: "critical issue", body: "very urgent.", bucket: "defer", priority: "critical" }],
    });
    await ingestReflection(root, CID, SLUG, stdout, logger, artifactDir, join(artifactDir, "touched.json"));
    const body = await readFile(join(root, "docs/cycle/issues/raw", `refl-${CID}-critical-issue.md`), "utf8");
    const { fm } = parseFrontmatter(body);
    assert.equal(fm.priority, "critical");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("priority: discuss entry writes priority: discuss frontmatter", async () => {
  const { root, artifactDir } = await setupRepo();
  try {
    const { logger } = makeLogger();
    const stdout = JSON.stringify({
      sharp_edges: [{ title: "discuss this", body: "needs discussion.", bucket: "discuss" }],
    });
    await ingestReflection(root, CID, SLUG, stdout, logger, artifactDir, join(artifactDir, "touched.json"));
    const body = await readFile(join(root, "docs/cycle/issues/raw", `refl-${CID}-discuss-this.md`), "utf8");
    const { fm } = parseFrontmatter(body);
    assert.equal(fm.priority, "discuss");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("no priority_hint: no written file contains priority_hint key in frontmatter", async () => {
  const { root, artifactDir } = await setupRepo();
  try {
    const { logger } = makeLogger();
    const stdout = JSON.stringify({
      sharp_edges: [
        { title: "defer one", body: "b1", bucket: "defer", priority: "high" },
        { title: "discuss two", body: "b2", bucket: "discuss" },
      ],
    });
    await ingestReflection(root, CID, SLUG, stdout, logger, artifactDir, join(artifactDir, "touched.json"));
    const rawFiles = await readdir(join(root, "docs/cycle/issues/raw"));
    for (const name of rawFiles) {
      const content = await readFile(join(root, "docs/cycle/issues/raw", name), "utf8");
      assert.ok(!content.includes("priority_hint"), `${name} must not contain priority_hint`);
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
