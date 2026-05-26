import { test } from "node:test";
import { strict as assert } from "node:assert";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  parseFrontmatter,
  serializeFrontmatter,
  mutateFrontmatter,
  type Frontmatter,
} from "../../src/engine/frontmatter.ts";

test("parses scalar, quoted, and numeric values", () => {
  const body = `---\nid: ABC\ntitle: "hello: world"\nattempt: 3\n---\n\nbody body\n`;
  const { fm, bodyAfter } = parseFrontmatter(body);
  assert.equal(fm.id, "ABC");
  assert.equal(fm.title, "hello: world");
  assert.equal(fm.attempt, 3);
  assert.equal(bodyAfter, "\nbody body\n");
});

test("parses array values", () => {
  const body = `---\nid: X\ndepends_on: [a, b, c]\n---\n\nbody\n`;
  const { fm } = parseFrontmatter(body);
  assert.deepEqual(fm.depends_on, ["a", "b", "c"]);
});

test("parses empty array", () => {
  const body = `---\nid: X\ndepends_on: []\n---\n\nbody\n`;
  const { fm } = parseFrontmatter(body);
  assert.deepEqual(fm.depends_on, []);
});

test("round-trip parse -> serialize preserves body and key order", () => {
  const body = `---\nid: X\ntitle: "a: b"\nattempt: 0\n---\n\nbody bytes preserved\n`;
  const { fm, bodyAfter } = parseFrontmatter(body);
  const out = serializeFrontmatter(fm, bodyAfter);
  assert.equal(bodyAfter, "\nbody bytes preserved\n");
  assert.equal(out, body);
  assert.deepEqual(Object.keys(fm), ["id", "title", "attempt"]);
});

test("serialize quotes values containing colons", () => {
  const body = `---\nid: X\ntitle: "a: b"\n---\n\nb\n`;
  const { fm, bodyAfter } = parseFrontmatter(body);
  const out = serializeFrontmatter(fm, bodyAfter);
  assert.match(out, /title: "a: b"/);
});

test("throws on missing frontmatter", () => {
  assert.throws(() => parseFrontmatter("no frontmatter here"), /no frontmatter/);
});

test("mutateFrontmatter adds new keys preserving existing order", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-fm-"));
  try {
    const p = join(root, "f.md");
    const body = `---\nid: X\ntitle: simple\n---\n\nbody\n`;
    await writeFile(p, body, "utf8");
    await mutateFrontmatter(p, (fm) => ({ ...fm, failed_at: "2026-05-13T00:00:00Z", failed_attempts: 3 }));
    const out = await readFile(p, "utf8");
    assert.match(out, /id: X\ntitle: simple\nfailed_at: 2026-05-13T00:00:00Z\nfailed_attempts: 3/);
    assert.match(out, /\n---\n\nbody\n$/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("mutateFrontmatter is idempotent for same patch", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-fm-"));
  try {
    const p = join(root, "f.md");
    await writeFile(p, `---\nid: X\n---\n\nbody\n`, "utf8");
    const patch = (fm: Record<string, unknown>) => ({ ...fm, k: "v" });
    await mutateFrontmatter(p, patch as never);
    const once = await readFile(p, "utf8");
    await mutateFrontmatter(p, patch as never);
    const twice = await readFile(p, "utf8");
    assert.equal(once, twice);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("serialize array values", () => {
  const out = serializeFrontmatter({ id: "X", depends_on: ["a", "b"] }, "\nbody\n");
  assert.match(out, /depends_on:\n  - a\n  - b/);
});

test("serialize handles no body after", () => {
  const out = serializeFrontmatter({ id: "X" }, "");
  assert.equal(out, "---\nid: X\n---\n");
});

test("all-digit string round-trips as string (preserves zero-padding)", () => {
  const out = serializeFrontmatter({ origin_cycle_id: "0042" }, "\nbody\n");
  assert.match(out, /origin_cycle_id: "0042"/);
  const { fm } = parseFrontmatter(out);
  assert.equal(fm.origin_cycle_id, "0042");
});

test("title with comma parses as single string, not array", () => {
  const body = `---\nid: X\ntitle: "Fix login, cookie, and session"\n---\n\nbody\n`;
  const { fm } = parseFrontmatter(body);
  assert.equal(fm.title, "Fix login, cookie, and session");
  assert.equal(typeof fm.title, "string");
});

test("title with double-quote character preserved", () => {
  const body = `---\nid: X\ntitle: 'He said "hello"'\n---\n\nbody\n`;
  const { fm } = parseFrontmatter(body);
  assert.equal(fm.title, 'He said "hello"');
});

test("multi-line value via block scalar parses as single string", () => {
  const body = `---\nid: X\ntitle: |\n  line one\n  line two\n---\n\nbody\n`;
  const { fm } = parseFrontmatter(body);
  assert.equal(typeof fm.title, "string");
  assert.match(fm.title as string, /line one/);
  assert.match(fm.title as string, /line two/);
});

test("serializeFrontmatter round-trip: parse(serialize(fm)) deep-equals fm", () => {
  const fm: Frontmatter = {
    id: "0099",
    title: "Fix login, cookie, and session",
    attempt: 2,
    depends_on: ["id-a", "id-b"],
    origin_cycle_id: "0042",
  };
  const serialized = serializeFrontmatter(fm, "\nbody\n");
  const { fm: reparsed } = parseFrontmatter(serialized);
  assert.deepEqual(reparsed, fm);
});
