import { test } from "node:test";
import { strict as assert } from "node:assert";
import { mkdtemp, mkdir, writeFile, rm, chmod } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execClaudecodeStep } from "../../src/engine/exec-claudecode.ts";

test("invokes claude -p with prompt body, captures stdout", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-test-"));
  const bin = await mkdtemp(join(tmpdir(), "cycle-bin-"));
  try {
    const prompts = join(root, ".cycle/prompts");
    await mkdir(prompts, { recursive: true });
    await writeFile(join(prompts, "spec.md"), "Write a one-line spec.", "utf8");

    const fake = join(bin, "claude");
    await writeFile(fake, "#!/bin/bash\necho SPECCED $@\n", "utf8");
    await chmod(fake, 0o755);

    const r = await execClaudecodeStep(root, "prompts/spec.md", { PATH: `${bin}:${process.env.PATH}` });
    assert.equal(r.status, "ok");
    assert.match(r.stdout, /SPECCED/);
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(bin, { recursive: true, force: true });
  }
});
