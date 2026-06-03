import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  writeResidueContext,
  readResidueContext,
  deleteResidueContext,
  type ResidueStoreDeps,
} from "../../src/engine/residue-context-store.ts";
import type { ResidueContext } from "../../src/engine/failed-residue-guard.ts";

async function tmp(): Promise<string> {
  return mkdtemp(join(tmpdir(), "residue-store-"));
}

test("round-trip — write then read preserves cycleId/issueId/failingStep", async () => {
  const dir = await tmp();
  try {
    const path = join(dir, "failed-residue-context.json");
    const ctx: ResidueContext = { cycleId: "0042", issueId: "A", failingStep: "verify" };
    writeResidueContext(path, ctx);
    const r = readResidueContext(path);
    assert.equal(r.status, "ok");
    if (r.status !== "ok") throw new Error("unreachable");
    assert.deepEqual(r.ctx, ctx);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("round-trip — failingStep:undefined round-trips through null", async () => {
  const dir = await tmp();
  try {
    const path = join(dir, "failed-residue-context.json");
    const ctx: ResidueContext = { cycleId: "0042", issueId: "A", failingStep: undefined };
    writeResidueContext(path, ctx);
    const r = readResidueContext(path);
    assert.equal(r.status, "ok");
    if (r.status !== "ok") throw new Error("unreachable");
    assert.equal(r.ctx.failingStep, undefined);
    assert.equal(r.ctx.cycleId, "0042");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("atomic write — no .tmp file remains after write", async () => {
  const dir = await tmp();
  try {
    const path = join(dir, "failed-residue-context.json");
    writeResidueContext(path, { cycleId: "0001", issueId: "A", failingStep: "build" });
    const files = await readdir(dir);
    assert.deepEqual(files.sort(), ["failed-residue-context.json"]);
    assert.ok(!files.some((f) => f.endsWith(".tmp")), "no leftover .tmp file");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("missing file — read returns none (no throw)", async () => {
  const dir = await tmp();
  try {
    const r = readResidueContext(join(dir, "absent.json"));
    assert.equal(r.status, "none");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("malformed JSON — read returns corrupt (no throw)", async () => {
  const dir = await tmp();
  try {
    const path = join(dir, "failed-residue-context.json");
    await writeFile(path, "{ not json", "utf8");
    const r = readResidueContext(path);
    assert.equal(r.status, "corrupt");
    if (r.status !== "corrupt") throw new Error("unreachable");
    assert.ok(r.error.length > 0);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("wrong shape — empty cycleId / missing fields / non-object ⇒ corrupt", async () => {
  const dir = await tmp();
  try {
    const path = join(dir, "ctx.json");
    for (const body of ['{"cycleId":""}', '{"foo":1}', '"a string"', "null", '{"cycleId":"0001","issueId":""}']) {
      await writeFile(path, body, "utf8");
      const r = readResidueContext(path);
      assert.equal(r.status, "corrupt", `expected corrupt for ${body}`);
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("non-ENOENT read error ⇒ corrupt (deps seam)", async () => {
  const deps: ResidueStoreDeps = {
    readFileSync: () => {
      const e = new Error("permission denied") as NodeJS.ErrnoException;
      e.code = "EACCES";
      throw e;
    },
    writeFileSync: () => {},
    renameSync: () => {},
    unlinkSync: () => {},
  };
  const r = readResidueContext("/any/path", deps);
  assert.equal(r.status, "corrupt");
  if (r.status !== "corrupt") throw new Error("unreachable");
  assert.match(r.error, /permission denied/);
});

test("delete missing — no throw (idempotent)", async () => {
  const dir = await tmp();
  try {
    assert.doesNotThrow(() => deleteResidueContext(join(dir, "absent.json")));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("delete — write then delete removes the file; second delete is a no-op", async () => {
  const dir = await tmp();
  try {
    const path = join(dir, "ctx.json");
    writeResidueContext(path, { cycleId: "0001", issueId: "A", failingStep: undefined });
    deleteResidueContext(path);
    assert.equal(readResidueContext(path).status, "none");
    assert.doesNotThrow(() => deleteResidueContext(path));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("delete — non-ENOENT unlink error rethrows (deps seam)", async () => {
  const deps: ResidueStoreDeps = {
    readFileSync: () => "",
    writeFileSync: () => {},
    renameSync: () => {},
    unlinkSync: () => {
      const e = new Error("permission denied") as NodeJS.ErrnoException;
      e.code = "EACCES";
      throw e;
    },
  };
  assert.throws(() => deleteResidueContext("/any/path", deps), /permission denied/);
});

test("write — rethrows on writeFileSync failure (deps seam)", async () => {
  const deps: ResidueStoreDeps = {
    readFileSync: () => "",
    writeFileSync: () => {
      throw new Error("ENOSPC: no space");
    },
    renameSync: () => {},
    unlinkSync: () => {},
  };
  assert.throws(
    () => writeResidueContext("/any/path", { cycleId: "0001", issueId: "A", failingStep: undefined }, deps),
    /ENOSPC/,
  );
});
