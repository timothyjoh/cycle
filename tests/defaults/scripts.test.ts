import { test } from "node:test";
import { strict as assert } from "node:assert";
import { readFile, stat } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

// Absolute path to the script under test, resolved once.
const VERIFY_SH = resolve("src/defaults/scripts/verify.sh");

// Resolve an absolute bash path once. spawnSync("bash", …) resolves the literal
// command via options.env.PATH, so a curated (empty) PATH would make bash itself
// unlaunchable (ENOENT). Spawning the absolute path lets us curate the script's
// PATH freely. bash on PATH is already a repo precondition for running verify.sh.
function resolveBash(): string {
  const r = spawnSync("bash", ["-c", "command -v bash"], { encoding: "utf8" });
  const path = (r.stdout ?? "").trim();
  if (r.status !== 0 || !path) {
    throw new Error(`could not resolve bash on PATH (status=${r.status}, error=${r.error})`);
  }
  return path;
}
const BASH = resolveBash();

// Spawn verify.sh in a throwaway tmpdir seeded by `seed`, with a curated PATH.
// Returns the spawnSync result; caller asserts. tmpdir removed by caller in finally.
function runVerify(
  seed: (dir: string) => void,
  env: NodeJS.ProcessEnv,
): { dir: string; result: ReturnType<typeof spawnSync> } {
  const dir = mkdtempSync(join(tmpdir(), "cycle-verify-"));
  seed(dir);
  const result = spawnSync(BASH, [VERIFY_SH], { cwd: dir, env, encoding: "utf8", timeout: 30000 });
  return { dir, result };
}

// Central guard assertion: launch must succeed, exit 1, actionable message on
// stderr (fd 2) and NOT on stdout. A null/non-1 status fails loudly.
function assertGuardFired(result: ReturnType<typeof spawnSync>, substring: string): void {
  assert.equal(result.error, undefined, `bash failed to launch: ${result.error}`);
  assert.equal(
    result.status,
    1,
    `expected exit 1, got ${result.status}. stderr: ${result.stderr} | stdout: ${result.stdout}`,
  );
  const stderr = result.stderr.toString();
  const stdout = result.stdout.toString();
  assert.ok(stderr.includes(substring), `stderr must contain ${JSON.stringify(substring)}; got: ${stderr}`);
  assert.ok(!stdout.includes(substring), `actionable message must be on stderr, not stdout; stdout: ${stdout}`);
}

// Curated minimal env: empty PATH so the script sees no host tooling. bash is
// spawned via its absolute path, so it still launches. Used by the Python guard
// (needs `command -v pytest` to fail) and the no-runner guard (no external tool
// reached during branch selection).
const HERMETIC_ENV: NodeJS.ProcessEnv = { PATH: "" };

// The Node branch's selection runs `grep -q '"test"' package.json`, so grep must
// be resolvable. Use the inherited PATH: the node_modules-absent guard exits
// before `npm test` is ever reached, so npm's presence on PATH is irrelevant and
// the guard fires deterministically on any host (grep is a universal precondition).
const NODE_GUARD_ENV: NodeJS.ProcessEnv = { PATH: process.env.PATH ?? "" };

for (const s of ["verify.sh"]) {
  test(`${s} has shebang and is executable`, async () => {
    const path = `src/defaults/scripts/${s}`;
    const first = (await readFile(path, "utf8")).split("\n")[0];
    assert.match(first, /^#!\/usr\/bin\/env bash/);
    const st = await stat(path);
    assert.ok((st.mode & 0o111) !== 0, `${s} should be executable`);
  });
}

test("verify.sh does not invoke npm install", async () => {
  const body = await readFile("src/defaults/scripts/verify.sh", "utf8");
  assert.doesNotMatch(body, /^\s*npm install/m, "verify.sh must not invoke npm install");
});

test("verify.sh exits 1 with actionable message when node_modules is absent", async () => {
  const body = await readFile("src/defaults/scripts/verify.sh", "utf8");
  assert.match(
    body,
    /!\s*-d node_modules[\s\S]*?Run 'npm install'/,
    "verify.sh must co-locate the node_modules guard with the actionable 'npm install' message",
  );
});

test("verify.sh checks pytest availability before invoking it", async () => {
  const body = await readFile("src/defaults/scripts/verify.sh", "utf8");
  assert.match(body, /command -v pytest/, "verify.sh must guard pytest availability");
});

test("verify.sh exits 1 with custom-script direction when no runner detected", async () => {
  const body = await readFile("src/defaults/scripts/verify.sh", "utf8");
  assert.doesNotMatch(body, /passing trivially/, "verify.sh must not pass trivially");
  assert.match(body, /custom.*verify\.sh/, "verify.sh must direct operator to write custom script");
});

test("verify.sh: Node project without node_modules exits 1 with npm install guidance", () => {
  const { dir, result } = runVerify((d) => {
    writeFileSync(join(d, "package.json"), JSON.stringify({ scripts: { test: "echo nope" } }), "utf8");
    // intentionally no node_modules/ directory
  }, NODE_GUARD_ENV);
  try {
    assertGuardFired(result, "npm install");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("verify.sh: Python project without pytest on PATH exits 1 with pytest guidance", () => {
  const { dir, result } = runVerify((d) => {
    writeFileSync(join(d, "pyproject.toml"), '[project]\nname = "x"\n', "utf8");
  }, HERMETIC_ENV); // PATH="" → command -v pytest fails → guard fires
  try {
    assertGuardFired(result, "pytest");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("verify.sh: no recognized runner exits 1 with custom-script direction", () => {
  const { dir, result } = runVerify(() => {
    // empty fixture: no package.json, Cargo.toml, or pyproject.toml
  }, HERMETIC_ENV);
  try {
    assertGuardFired(result, "custom .cycle/scripts/verify.sh");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
