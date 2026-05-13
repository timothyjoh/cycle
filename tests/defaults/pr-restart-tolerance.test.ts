import { test } from "node:test";
import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve, join } from "node:path";
import { mkdtemp, mkdir, writeFile, readFile, rm, chmod } from "node:fs/promises";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PR_SH = resolve(__dirname, "../../src/defaults/scripts/pr.sh");

test("pr.sh: checks for existing PR via gh pr list --head before creating", () => {
  const src = readFileSync(PR_SH, "utf8");
  assert.match(src, /gh pr list --head "\$\{branch\}" --json number,url --jq '\.\[0\]'/);
});

test("pr.sh: skips gh pr create when an existing PR is detected", () => {
  const src = readFileSync(PR_SH, "utf8");
  const block =
    /if \[ -n "\$\{existing\}" \] && \[ "\$\{existing\}" != "null" \]; then[\s\S]*?else[\s\S]*?gh pr create [\s\S]*?fi/;
  assert.match(src, block, "existing-PR branch must skip the create call");
});

test("pr.sh: reuses existing PR number and url when present", () => {
  const src = readFileSync(PR_SH, "utf8");
  assert.match(src, /pr_number=\$\(printf '%s' "\$\{existing\}" \| jq -r \.number\)/);
  assert.match(src, /pr_url=\$\(printf '%s' "\$\{existing\}" \| jq -r \.url\)/);
});

test("pr.sh: behavioral — skips gh pr create when gh pr list returns a PR", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-pr-restart-"));
  const bin = await mkdtemp(join(tmpdir(), "cycle-pr-bin-"));
  try {
    spawnSync("git", ["init", "-b", "main"], { cwd: root, stdio: "ignore" });
    spawnSync("git", ["config", "user.email", "t@t"], { cwd: root, stdio: "ignore" });
    spawnSync("git", ["config", "user.name", "t"], { cwd: root, stdio: "ignore" });
    spawnSync("git", ["commit", "--allow-empty", "-m", "init"], { cwd: root, stdio: "ignore" });
    spawnSync("git", ["checkout", "-b", "cycle/feature/foo"], { cwd: root, stdio: "ignore" });
    // Fake a "remote" so `git push` doesn't fail: point origin at a bare repo.
    const bareDir = await mkdtemp(join(tmpdir(), "cycle-pr-bare-"));
    spawnSync("git", ["init", "--bare", "-b", "main", bareDir], { stdio: "ignore" });
    spawnSync("git", ["remote", "add", "origin", bareDir], { cwd: root, stdio: "ignore" });

    // Fake gh: log all invocations to gh.log and respond deterministically.
    const ghLog = join(bin, "gh.log");
    const gh = join(bin, "gh");
    await writeFile(gh, `#!/bin/bash
echo "$@" >> "${ghLog}"
case "$1 $2" in
  "pr list")
    echo '{"number":42,"url":"https://example/pr/42"}'
    exit 0
    ;;
  "pr create")
    echo "should not be called" >&2
    exit 99
    ;;
  "pr merge")
    exit 0
    ;;
  "pr view")
    # Honor "-q .state" filter used in pr.sh's polling loop by
    # returning the bare state value; for other -q queries return raw JSON.
    for arg in "$@"; do
      if [ "$arg" = ".state" ]; then
        echo "MERGED"
        exit 0
      fi
    done
    echo '{"state":"MERGED"}'
    exit 0
    ;;
  "repo view")
    echo "owner/repo"
    exit 0
    ;;
  *)
    exit 0
    ;;
esac
`, "utf8");
    await chmod(gh, 0o755);

    // Ensure scripts dir exists and copy pr.sh + lib/closes.sh into the
    // temp root so the relative `lib/closes.sh` source works.
    const scriptsDir = join(root, "scripts");
    await mkdir(join(scriptsDir, "lib"), { recursive: true });
    await writeFile(join(scriptsDir, "pr.sh"), readFileSync(PR_SH, "utf8"), "utf8");
    await chmod(join(scriptsDir, "pr.sh"), 0o755);
    // Minimal closes.sh stub — closes_block accepts (issue_file, repo_slug)
    // and prints nothing.
    await writeFile(
      join(scriptsDir, "lib", "closes.sh"),
      `closes_block() { echo ""; }\n`,
      "utf8",
    );

    const r = spawnSync("bash", ["scripts/pr.sh"], {
      cwd: root,
      encoding: "utf8",
      env: {
        ...process.env,
        PATH: `${bin}:${process.env.PATH}`,
        CYCLE_ID: "0001",
        CYCLE_TITLE: "test",
        CYCLE_BASE: "main",
      },
    });
    assert.equal(r.status, 0, `pr.sh exited ${r.status}\nstderr:\n${r.stderr}\nstdout:\n${r.stdout}`);

    const ghCalls = await readFile(ghLog, "utf8");
    assert.match(ghCalls, /pr list --head cycle\/feature\/foo/);
    assert.doesNotMatch(ghCalls, /pr create/);

    await rm(bareDir, { recursive: true, force: true });
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(bin, { recursive: true, force: true });
  }
});
