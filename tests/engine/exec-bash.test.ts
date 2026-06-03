import { test } from "node:test";
import { strict as assert } from "node:assert";
import { mkdtemp, mkdir, writeFile, rm, chmod } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execBashStep } from "../../src/engine/exec-bash.ts";

test("runs script in cycleDir cwd, captures stdout, exits ok", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-test-"));
  try {
    const scripts = join(root, ".cycle/scripts");
    await mkdir(scripts, { recursive: true });
    const script = join(scripts, "hello.sh");
    await writeFile(script, "#!/bin/bash\necho hello\n", "utf8");
    await chmod(script, 0o755);
    const r = await execBashStep(root, "scripts/hello.sh", {});
    assert.equal(r.status, "ok");
    assert.match(r.stdout, /hello/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("non-zero exit reports failed", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-test-"));
  try {
    const scripts = join(root, ".cycle/scripts");
    await mkdir(scripts, { recursive: true });
    const script = join(scripts, "fail.sh");
    await writeFile(script, "#!/bin/bash\nexit 7\n", "utf8");
    await chmod(script, 0o755);
    const r = await execBashStep(root, "scripts/fail.sh", {});
    assert.equal(r.status, "failed");
    assert.equal(r.exitCode, 7);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("spawns the resolved shell, not the literal /bin/bash", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-test-"));
  try {
    // A wrapper shell that emits a unique sentinel, then execs a real bash so
    // the step script still runs. If the lane spawned a literal "/bin/bash" the
    // sentinel would never appear — its presence proves the resolved path ran.
    const wrapper = join(root, "shell-wrapper.sh");
    await writeFile(wrapper, "#!/bin/bash\necho __SENTINEL_4f3a__\nexec /bin/bash \"$@\"\n", "utf8");
    await chmod(wrapper, 0o755);
    const scripts = join(root, ".cycle/scripts");
    await mkdir(scripts, { recursive: true });
    const script = join(scripts, "hello.sh");
    await writeFile(script, "#!/bin/bash\necho hello\n", "utf8");
    await chmod(script, 0o755);
    const r = await execBashStep(root, "scripts/hello.sh", {}, { ok: true, path: wrapper });
    assert.equal(r.status, "ok");
    assert.match(r.stdout, /__SENTINEL_4f3a__/);
    assert.match(r.stdout, /hello/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("unresolved shell resolution fails without spawning, with actionable stderr", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-test-"));
  try {
    const message =
      "cycle: no POSIX shell found for bash steps on Windows. Searched:\n" +
      "  - C:\\Program Files\\Git\\bin\\bash.exe\n" +
      "Fix: install Git for Windows (git-bash) or WSL, or set engine.shell or CYCLE_SHELL.";
    const r = await execBashStep(root, "scripts/never.sh", {}, {
      ok: false,
      searched: ["C:\\Program Files\\Git\\bin\\bash.exe"],
      message,
    });
    assert.equal(r.status, "failed");
    assert.equal(r.exitCode, 1);
    assert.match(r.stderr, /Program Files\\Git/);
    assert.match(r.stderr, /CYCLE_SHELL/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("configured-but-missing shell path routes the spawn error to a failed result", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-test-"));
  try {
    const r = await execBashStep(root, "scripts/never.sh", {}, {
      ok: true,
      path: "/nonexistent/definitely-not-a-shell",
    });
    assert.equal(r.status, "failed");
    assert.equal(r.exitCode, -1);
    assert.match(r.stderr, /ENOENT|spawn/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
