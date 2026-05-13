import { test } from "node:test";
import { strict as assert } from "node:assert";
import { mkdtemp, mkdir, writeFile, readFile, rm, copyFile, chmod } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const REPO_ROOT = resolve(import.meta.dirname, "../..");
const SRC_SCRIPTS = join(REPO_ROOT, "src/defaults/scripts");
const CLOSES_SH = join(SRC_SCRIPTS, "lib/closes.sh");
const COMMIT_SH = join(SRC_SCRIPTS, "commit.sh");
const PR_SH = join(SRC_SCRIPTS, "pr.sh");

function git(cwd: string, args: string[]) {
  const r = spawnSync("git", args, { cwd, encoding: "utf8" });
  if (r.status !== 0) throw new Error(`git ${args.join(" ")} (cwd=${cwd}) failed: ${r.stderr}`);
  return r.stdout;
}

function bash(script: string, env: Record<string, string> = {}, cwd?: string) {
  return spawnSync("bash", ["-c", script], {
    cwd,
    env: { ...process.env, ...env },
    encoding: "utf8",
  });
}

function callCloses(issuePath: string, slug: string) {
  const r = bash(`. "${CLOSES_SH}"; closes_block "${issuePath}" "${slug}"`);
  if (r.status !== 0) throw new Error(`closes_block failed: ${r.stderr}`);
  return r.stdout;
}

test("closes_block: single matching URL → one Closes line", async () => {
  const dir = await mkdtemp(join(tmpdir(), "closes-"));
  try {
    const f = join(dir, "issue.md");
    await writeFile(f, "See https://github.com/acme/repo/issues/99 for context.\n");
    assert.equal(callCloses(f, "acme/repo"), "Closes #99\n");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("closes_block: multi-URL deduplicates preserving order", async () => {
  const dir = await mkdtemp(join(tmpdir(), "closes-"));
  try {
    const f = join(dir, "issue.md");
    await writeFile(
      f,
      "Refs https://github.com/acme/repo/issues/7\n" +
        "Then https://github.com/acme/repo/issues/9\n" +
        "Dup https://github.com/acme/repo/issues/7\n",
    );
    assert.equal(callCloses(f, "acme/repo"), "Closes #7\nCloses #9\n");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("closes_block: trailing punctuation / query / fragment stripped", async () => {
  const dir = await mkdtemp(join(tmpdir(), "closes-"));
  try {
    const f = join(dir, "issue.md");
    await writeFile(
      f,
      "a https://github.com/acme/repo/issues/42).\n" +
        "b https://github.com/acme/repo/issues/43?ref=x\n" +
        "c https://github.com/acme/repo/issues/44#comment\n" +
        "d https://github.com/acme/repo/issues/45,\n",
    );
    assert.equal(
      callCloses(f, "acme/repo"),
      "Closes #42\nCloses #43\nCloses #44\nCloses #45\n",
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("closes_block: cross-repo URL is skipped", async () => {
  const dir = await mkdtemp(join(tmpdir(), "closes-"));
  try {
    const f = join(dir, "issue.md");
    await writeFile(
      f,
      "Same: https://github.com/acme/repo/issues/1\n" +
        "Other: https://github.com/other/proj/issues/2\n",
    );
    assert.equal(callCloses(f, "acme/repo"), "Closes #1\n");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("closes_block: empty body emits nothing", async () => {
  const dir = await mkdtemp(join(tmpdir(), "closes-"));
  try {
    const f = join(dir, "issue.md");
    await writeFile(f, "");
    assert.equal(callCloses(f, "acme/repo"), "");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("closes_block: missing file returns empty + exit 0", () => {
  const r = bash(`. "${CLOSES_SH}"; closes_block /no/such/file acme/repo`);
  assert.equal(r.status, 0);
  assert.equal(r.stdout, "");
});

test("closes_block: scans YAML frontmatter title field too", async () => {
  const dir = await mkdtemp(join(tmpdir(), "closes-"));
  try {
    const f = join(dir, "issue.md");
    await writeFile(
      f,
      "---\n" +
        "title: fix https://github.com/acme/repo/issues/99\n" +
        "---\n" +
        "Body has no URL.\n",
    );
    assert.equal(callCloses(f, "acme/repo"), "Closes #99\n");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("closes_block: dedups across frontmatter title and body", async () => {
  const dir = await mkdtemp(join(tmpdir(), "closes-"));
  try {
    const f = join(dir, "issue.md");
    await writeFile(
      f,
      "---\n" +
        "title: fix https://github.com/acme/repo/issues/42\n" +
        "---\n" +
        "Body also refs https://github.com/acme/repo/issues/42.\n",
    );
    assert.equal(callCloses(f, "acme/repo"), "Closes #42\n");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("closes_block: pull-request URLs are not treated as issues", async () => {
  const dir = await mkdtemp(join(tmpdir(), "closes-"));
  try {
    const f = join(dir, "issue.md");
    await writeFile(
      f,
      "Refs PR https://github.com/acme/repo/pull/7 and " +
        "issue https://github.com/acme/repo/issues/8.\n",
    );
    assert.equal(callCloses(f, "acme/repo"), "Closes #8\n");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("closes_block: empty repo_slug returns no output", async () => {
  const dir = await mkdtemp(join(tmpdir(), "closes-"));
  try {
    const f = join(dir, "issue.md");
    await writeFile(f, "https://github.com/acme/repo/issues/1\n");
    const r = bash(`. "${CLOSES_SH}"; closes_block "${f}" ""`);
    assert.equal(r.status, 0);
    assert.equal(r.stdout, "");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

async function makeCommitRepo(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "cycle-closes-commit-"));
  git(root, ["init", "-q"]);
  git(root, ["config", "user.email", "t@t"]);
  git(root, ["config", "user.name", "t"]);
  git(root, ["config", "commit.gpgsign", "false"]);
  await writeFile(join(root, ".gitignore"), ".cycle/\n");
  await writeFile(join(root, "README.md"), "seed\n");
  git(root, ["add", ".gitignore", "README.md"]);
  git(root, ["commit", "-q", "-m", "seed"]);
  const scripts = join(root, ".cycle/scripts");
  const lib = join(scripts, "lib");
  await mkdir(lib, { recursive: true });
  await copyFile(COMMIT_SH, join(scripts, "commit.sh"));
  await copyFile(CLOSES_SH, join(lib, "closes.sh"));
  await chmod(join(scripts, "commit.sh"), 0o755);
  return root;
}

async function installGhShim(root: string, repoSlug: string): Promise<string> {
  const shim = join(root, "_shims");
  await mkdir(shim, { recursive: true });
  const gh = join(shim, "gh");
  await writeFile(
    gh,
    `#!/usr/bin/env bash
log="\${GH_LOG:-/dev/null}"
printf '%s\\n' "$*" >>"$log"
if [ "$1" = "repo" ] && [ "$2" = "view" ]; then
  echo '${repoSlug}'
  exit 0
fi
if [ "$1" = "pr" ] && [ "$2" = "create" ]; then
  echo "https://example.invalid/pr/1"
  exit 0
fi
exit 0
`,
    "utf8",
  );
  await chmod(gh, 0o755);
  return shim;
}

test("commit.sh: appends Closes #N body when issue URL matches repo", async () => {
  const root = await makeCommitRepo();
  try {
    await mkdir(join(root, "docs/cycle/issues/triaged"), { recursive: true });
    await writeFile(
      join(root, "docs/cycle/issues/triaged/foo.md"),
      "Reproduces https://github.com/acme/cycle/issues/99 in the wild.\n",
    );
    await mkdir(join(root, "src"), { recursive: true });
    await writeFile(join(root, "src/app.ts"), "export {};\n");

    const shim = await installGhShim(root, "acme/cycle");
    const r = spawnSync("bash", [".cycle/scripts/commit.sh"], {
      cwd: root,
      env: {
        ...process.env,
        PATH: `${shim}:${process.env.PATH ?? ""}`,
        CYCLE_ID: "0099",
        CYCLE_TITLE: "test",
        CYCLE_ISSUE_ID: "foo",
      },
      encoding: "utf8",
    });
    assert.equal(r.status, 0, `stderr: ${r.stderr}`);

    const subject = git(root, ["log", "-1", "--pretty=%s"]).trimEnd();
    const body = git(root, ["log", "-1", "--pretty=%b"]).trimEnd();
    assert.equal(subject, "cycle 0099: test");
    assert.equal(body, "Closes #99");
    assert.doesNotMatch(subject, /Closes/, "subject must not contain Closes");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("commit.sh: byte-identical message when issue body has no qualifying URL", async () => {
  const root = await makeCommitRepo();
  try {
    await mkdir(join(root, "docs/cycle/issues/triaged"), { recursive: true });
    await writeFile(join(root, "docs/cycle/issues/triaged/foo.md"), "No urls here.\n");
    await mkdir(join(root, "src"), { recursive: true });
    await writeFile(join(root, "src/app.ts"), "export {};\n");

    const shim = await installGhShim(root, "acme/cycle");
    const r = spawnSync("bash", [".cycle/scripts/commit.sh"], {
      cwd: root,
      env: {
        ...process.env,
        PATH: `${shim}:${process.env.PATH ?? ""}`,
        CYCLE_ID: "0099",
        CYCLE_TITLE: "test",
        CYCLE_ISSUE_ID: "foo",
      },
      encoding: "utf8",
    });
    assert.equal(r.status, 0, `stderr: ${r.stderr}`);

    const subject = git(root, ["log", "-1", "--pretty=%s"]).trimEnd();
    const body = git(root, ["log", "-1", "--pretty=%b"]).trimEnd();
    assert.equal(subject, "cycle 0099: test");
    assert.equal(body, "");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("commit.sh: cross-repo URL produces no Closes line", async () => {
  const root = await makeCommitRepo();
  try {
    await mkdir(join(root, "docs/cycle/issues/triaged"), { recursive: true });
    await writeFile(
      join(root, "docs/cycle/issues/triaged/foo.md"),
      "Refs https://github.com/someone/else/issues/5 unrelated.\n",
    );
    await mkdir(join(root, "src"), { recursive: true });
    await writeFile(join(root, "src/app.ts"), "export {};\n");

    const shim = await installGhShim(root, "acme/cycle");
    const r = spawnSync("bash", [".cycle/scripts/commit.sh"], {
      cwd: root,
      env: {
        ...process.env,
        PATH: `${shim}:${process.env.PATH ?? ""}`,
        CYCLE_ID: "0099",
        CYCLE_TITLE: "test",
        CYCLE_ISSUE_ID: "foo",
      },
      encoding: "utf8",
    });
    assert.equal(r.status, 0, `stderr: ${r.stderr}`);
    const subject = git(root, ["log", "-1", "--pretty=%s"]).trimEnd();
    const body = git(root, ["log", "-1", "--pretty=%b"]).trimEnd();
    assert.equal(subject, "cycle 0099: test");
    assert.equal(body, "");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

async function makePrRepo(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "cycle-closes-pr-"));
  git(root, ["init", "-q", "-b", "main"]);
  git(root, ["config", "user.email", "t@t"]);
  git(root, ["config", "user.name", "t"]);
  git(root, ["config", "commit.gpgsign", "false"]);
  await writeFile(join(root, ".gitignore"), ".cycle/\n");
  await writeFile(join(root, "README.md"), "seed\n");
  git(root, ["add", ".gitignore", "README.md"]);
  git(root, ["commit", "-q", "-m", "seed"]);
  git(root, ["checkout", "-q", "-b", "cycle/feature/test"]);
  await writeFile(join(root, "README.md"), "changed\n");
  git(root, ["add", "README.md"]);
  git(root, ["commit", "-q", "-m", "change"]);
  // Stub remote so `git push --set-upstream origin <branch>` succeeds.
  const remote = join(root, "_remote.git");
  await mkdir(remote, { recursive: true });
  git(remote, ["init", "-q", "--bare"]);
  git(root, ["remote", "add", "origin", remote]);

  const scripts = join(root, ".cycle/scripts");
  const lib = join(scripts, "lib");
  await mkdir(lib, { recursive: true });
  await copyFile(PR_SH, join(scripts, "pr.sh"));
  await copyFile(CLOSES_SH, join(lib, "closes.sh"));
  await chmod(join(scripts, "pr.sh"), 0o755);
  return root;
}

async function installPrGhShim(root: string, repoSlug: string): Promise<{ shim: string; log: string; bodyFile: string }> {
  const shim = join(root, "_shims");
  await mkdir(shim, { recursive: true });
  const log = join(root, "gh.argv.log");
  const bodyFile = join(root, "gh.body");
  await writeFile(log, "");
  const gh = join(shim, "gh");
  await writeFile(
    gh,
    `#!/usr/bin/env bash
log="${log}"
bodyFile="${bodyFile}"
{ for a in "$@"; do printf '%s\\0' "$a"; done; printf '\\n'; } >>"$log"
if [ "$1" = "repo" ] && [ "$2" = "view" ]; then
  echo '${repoSlug}'
  exit 0
fi
if [ "$1" = "pr" ] && [ "$2" = "create" ]; then
  # capture --body argument
  while [ $# -gt 0 ]; do
    if [ "$1" = "--body" ]; then printf '%s' "$2" >"$bodyFile"; fi
    shift
  done
  echo "https://example.invalid/pr/1"
  exit 0
fi
if [ "$1" = "pr" ] && [ "$2" = "view" ]; then
  case "$*" in
    *"--json number"*) echo "1" ;;
    *"--json state"*) echo "MERGED" ;;
  esac
  exit 0
fi
if [ "$1" = "pr" ] && [ "$2" = "merge" ]; then
  exit 0
fi
exit 0
`,
    "utf8",
  );
  await chmod(gh, 0o755);
  return { shim, log, bodyFile };
}

test("pr.sh: PR body appends Closes #N when issue URL matches repo", async () => {
  const root = await makePrRepo();
  try {
    await mkdir(join(root, "docs/cycle/issues/triaged"), { recursive: true });
    await writeFile(
      join(root, "docs/cycle/issues/triaged/foo.md"),
      "Refs https://github.com/acme/cycle/issues/99 here.\n",
    );
    const { shim, bodyFile, log } = await installPrGhShim(root, "acme/cycle");
    const r = spawnSync("bash", [".cycle/scripts/pr.sh"], {
      cwd: root,
      env: {
        ...process.env,
        PATH: `${shim}:${process.env.PATH ?? ""}`,
        CYCLE_ID: "0099",
        CYCLE_TITLE: "test",
        CYCLE_BASE: "main",
        CYCLE_ISSUE_ID: "foo",
      },
      encoding: "utf8",
    });
    assert.equal(r.status, 0, `stderr: ${r.stderr}`);
    const body = await readFile(bodyFile, "utf8");
    assert.equal(body, "Generated by cycle.\n\nCloses #99");
    const logContents = await readFile(log, "utf8");
    const repoViewCalls = logContents
      .split("\n")
      .filter((l) => /(^|\0)repo\0view\0/.test(l));
    assert.equal(
      repoViewCalls.length,
      1,
      `expected exactly one gh repo view call; got ${repoViewCalls.length}: ${logContents}`,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("pr.sh: PR body is byte-identical to legacy when no qualifying URL", async () => {
  const root = await makePrRepo();
  try {
    await mkdir(join(root, "docs/cycle/issues/triaged"), { recursive: true });
    await writeFile(join(root, "docs/cycle/issues/triaged/foo.md"), "No urls.\n");
    const { shim, bodyFile } = await installPrGhShim(root, "acme/cycle");
    const r = spawnSync("bash", [".cycle/scripts/pr.sh"], {
      cwd: root,
      env: {
        ...process.env,
        PATH: `${shim}:${process.env.PATH ?? ""}`,
        CYCLE_ID: "0099",
        CYCLE_TITLE: "test",
        CYCLE_BASE: "main",
        CYCLE_ISSUE_ID: "foo",
      },
      encoding: "utf8",
    });
    assert.equal(r.status, 0, `stderr: ${r.stderr}`);
    const body = await readFile(bodyFile, "utf8");
    assert.equal(body, "Generated by cycle.");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("pr.sh: cross-repo URL is omitted from PR body", async () => {
  const root = await makePrRepo();
  try {
    await mkdir(join(root, "docs/cycle/issues/triaged"), { recursive: true });
    await writeFile(
      join(root, "docs/cycle/issues/triaged/foo.md"),
      "Refs https://github.com/someone/else/issues/5 only.\n",
    );
    const { shim, bodyFile } = await installPrGhShim(root, "acme/cycle");
    const r = spawnSync("bash", [".cycle/scripts/pr.sh"], {
      cwd: root,
      env: {
        ...process.env,
        PATH: `${shim}:${process.env.PATH ?? ""}`,
        CYCLE_ID: "0099",
        CYCLE_TITLE: "test",
        CYCLE_BASE: "main",
        CYCLE_ISSUE_ID: "foo",
      },
      encoding: "utf8",
    });
    assert.equal(r.status, 0, `stderr: ${r.stderr}`);
    const body = await readFile(bodyFile, "utf8");
    assert.equal(body, "Generated by cycle.");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("commit.sh source: subject -m line never embeds Closes literal", async () => {
  const src = await readFile(COMMIT_SH, "utf8");
  const subjectLine = src
    .split("\n")
    .find((l) => /git commit -m "cycle \$\{CYCLE_ID\}: \$\{CYCLE_TITLE\}"/.test(l));
  assert.ok(subjectLine, "subject git commit line not found");
  assert.doesNotMatch(
    subjectLine,
    /-m "cycle \$\{CYCLE_ID\}: \$\{CYCLE_TITLE\}.*Closes/,
    "subject -m must not embed Closes",
  );
});

test("commit.sh + pr.sh source lib/closes.sh", async () => {
  const c = await readFile(COMMIT_SH, "utf8");
  const p = await readFile(PR_SH, "utf8");
  assert.match(c, /\. "\$\(dirname "\$0"\)\/lib\/closes\.sh"/);
  assert.match(p, /\. "\$\(dirname "\$0"\)\/lib\/closes\.sh"/);
});
