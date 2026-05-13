# cycle MVP — Dogfood-Ready Implementation Plan

> **Historical plan (pre-RFC-001).** References to `tbd/`, `queued/`, and `triaged/` describe the MVP lifecycle. The live model is `raw/ → todo/ → done/` with `blocked/` and `failed/` siblings. See `docs/RFC-001-issue-lifecycle.md` § 12 BB-1 for the rename.

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build the cycle engine and `@cycleai/cli` npm package far enough that we can invoke `./.cycle/bin/cycle.js run "<task>"` against the cycle repo itself and produce a merged PR for a real feature. Validates that workflows can be constructed (the `feature` workflow) and followed (`spec → research → plan → build → verify → commit → pr`).

**Architecture:** Node 22.6+ TypeScript engine, no transpile in the dev loop (native `--experimental-strip-types`), `esbuild` bundles to a single `dist/cycle.js`. CLI parses argv, materializes the input as an issue file in `docs/cycle/issues/tbd/`, scans it into `queued/`, loads `.cycle/workflows/feature.yaml`, executes each step (claudecode steps shell out to `claude -p`; bash steps run a script via `spawn` with no shell). Branch / commit / PR / auto-merge wraps the workflow. All events are emitted as JSONL to stdout, mirrored into `.cycle/log.jsonl`.

**Tech Stack:**
- Node.js ≥ 22.6 (≥ 24 LTS recommended; native TS strip)
- TypeScript (authoring only; no `tsc` in dev loop, `tsc --noEmit` for type-check)
- esbuild (single-file bundle, devDep only)
- `node:test` (built-in test runner, run with `--experimental-strip-types`)
- `yaml` (npm pkg — small, well-maintained)
- `node:util` `parseArgs` (built-in argv parsing — no `commander` dep)
- `node:child_process` `spawn` / `spawnSync` with **array args, no shell**

**Out of scope for this plan (deferred to post-dogfood):**
- `--detach` daemon mode (`cycle.pid`, `attach`, `status`, `stop`)
- Triage (multi-cycle decomposition) — for MVP, always single cycle, workflow forced via `--workflow feature`
- Multi-issue queues, `--issues-file`, `--issues-stdin`, `depends_on`
- Cycle attempts / abandonment / `blocked/` / `failed/`
- `--merge-mode stack`
- Rate-limit handling beyond a hard exit
- Tracker fetch scripts (`--issue JIRA-123` is NOT in MVP — only freeform `"task text"`)
- `init --upgrade` 3-way merge (full overwrite only for now)
- npm publish (use `node dist/cycle.js init` from local build)

**Security note:** All subprocess invocations use `spawn` / `spawnSync` with an array `args` parameter and never a shell-interpolated string. This is non-negotiable — there is no `execSync` / `exec` anywhere in the plan. Test setups that need to invoke `git init`, `git config`, `git commit --allow-empty`, etc. do so via `spawnSync("git", ["init", "-b", "main"], { cwd })` etc.

**Prerequisites (manual, not plan tasks):**
- Node 22.6+ installed locally
- `claude` CLI logged in (`claude login`)
- `gh` CLI logged in (`gh auth login`)
- Branch protection on `main` permissive enough to let `gh pr merge --squash --auto` work (or temporarily disabled for the first dogfood run)

---

## Phase A — Project Scaffold (Tasks 1–3)

### Task 1: Initialize Node + TypeScript project

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `.gitignore`
- Create: `src/.gitkeep`
- Create: `tests/.gitkeep`

**Step 1: Create `package.json`**

```json
{
  "name": "@cycleai/cli",
  "version": "0.0.1",
  "description": "cycle — issue-driven workflow engine for autonomous code changes",
  "type": "module",
  "bin": {
    "cycle": "./dist/cycle.js"
  },
  "files": [
    "dist/",
    "src/defaults/"
  ],
  "scripts": {
    "test": "node --test --experimental-strip-types tests/",
    "typecheck": "tsc --noEmit",
    "build": "node scripts/build.mjs",
    "smoke": "node dist/cycle.js --version"
  },
  "engines": {
    "node": ">=22.6"
  },
  "dependencies": {
    "yaml": "^2.6.0"
  },
  "devDependencies": {
    "@types/node": "^22.0.0",
    "esbuild": "^0.25.0",
    "typescript": "^5.6.0"
  }
}
```

**Step 2: Create `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "allowImportingTsExtensions": true,
    "isolatedModules": true,
    "verbatimModuleSyntax": true
  },
  "include": ["src/**/*.ts", "tests/**/*.ts", "scripts/**/*.mjs"]
}
```

**Step 3: Create `.gitignore`**

```
node_modules/
dist/
.DS_Store
.claude/settings.local.json
.cycle/log.jsonl
.cycle/tbd.jsonl
.cycle/cycle.pid
```

**Step 4: Install deps**

Run: `npm install`
Expected: dependencies installed, `node_modules/` populated, no errors.

**Step 5: Verify typecheck baseline**

Run: `npm run typecheck`
Expected: PASS (no source files yet, nothing to check).

**Step 6: Commit**

```bash
git add package.json package-lock.json tsconfig.json .gitignore src/.gitkeep tests/.gitkeep
git commit -m "Scaffold Node + TypeScript project for @cycleai/cli"
```

---

### Task 2: First TDD round — `version` returns package version

**Files:**
- Create: `tests/version.test.ts`
- Create: `src/version.ts`

**Step 1: Write the failing test**

```typescript
// tests/version.test.ts
import { test } from "node:test";
import { strict as assert } from "node:assert";
import { getVersion } from "../src/version.ts";

test("getVersion reads version from package.json", async () => {
  const v = await getVersion();
  assert.match(v, /^\d+\.\d+\.\d+/);
});
```

**Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL with "Cannot find module '../src/version.ts'".

**Step 3: Write minimal implementation**

```typescript
// src/version.ts
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

export async function getVersion(): Promise<string> {
  const pkgPath = resolve(dirname(fileURLToPath(import.meta.url)), "..", "package.json");
  const pkg = JSON.parse(await readFile(pkgPath, "utf8"));
  return pkg.version;
}
```

**Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS, 1 test.

**Step 5: Commit**

```bash
git add tests/version.test.ts src/version.ts
git commit -m "Add version helper backed by package.json"
```

---

### Task 3: esbuild bundle script with shebang

**Files:**
- Create: `scripts/build.mjs`
- Create: `src/cli.ts`
- Create: `tests/build.test.ts`

**Step 1: Write the failing test**

```typescript
// tests/build.test.ts
import { test } from "node:test";
import { strict as assert } from "node:assert";
import { readFile, stat } from "node:fs/promises";
import { spawnSync } from "node:child_process";

test("build produces dist/cycle.js with shebang and executable bit", async () => {
  const r = spawnSync("npm", ["run", "build"], { stdio: "inherit" });
  assert.equal(r.status, 0);
  const first = (await readFile("dist/cycle.js", "utf8")).split("\n")[0];
  assert.equal(first, "#!/usr/bin/env node");
  const s = await stat("dist/cycle.js");
  assert.ok((s.mode & 0o111) !== 0, "dist/cycle.js should be executable");
});
```

**Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — either `scripts/build.mjs` missing or `src/cli.ts` missing.

**Step 3: Create `src/cli.ts` (placeholder entry)**

```typescript
// src/cli.ts
import { getVersion } from "./version.ts";

const args = process.argv.slice(2);
if (args[0] === "--version") {
  console.log(await getVersion());
  process.exit(0);
}
console.error("cycle: no command yet (MVP scaffold)");
process.exit(2);
```

**Step 4: Create `scripts/build.mjs`**

```javascript
// scripts/build.mjs
import { build } from "esbuild";
import { chmod } from "node:fs/promises";

await build({
  entryPoints: ["src/cli.ts"],
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  outfile: "dist/cycle.js",
  banner: { js: "#!/usr/bin/env node" },
});

await chmod("dist/cycle.js", 0o755);
```

**Step 5: Run test to verify it passes**

Run: `npm test`
Expected: PASS, 2 tests. `dist/cycle.js` starts with shebang, is executable.

**Step 6: Commit**

```bash
git add scripts/build.mjs src/cli.ts tests/build.test.ts
git commit -m "Bundle engine to dist/cycle.js with shebang via esbuild"
```

---

## Phase B — Engine Core (Tasks 4–15)

### Task 4: argv parsing for `cycle run "<text>"`

**Files:**
- Create: `tests/cli/parse-args.test.ts`
- Create: `src/cli/parse-args.ts`

**Step 1: Write the failing test**

```typescript
// tests/cli/parse-args.test.ts
import { test } from "node:test";
import { strict as assert } from "node:assert";
import { parseArgs } from "../../src/cli/parse-args.ts";

test("parses 'run <text>' freeform task", () => {
  const r = parseArgs(["run", "fix the login bug"]);
  assert.deepEqual(r, { command: "run", text: "fix the login bug", workflow: "feature", dryRun: false });
});

test("parses --workflow override", () => {
  const r = parseArgs(["run", "--workflow", "bug", "kill the cookie banner"]);
  assert.equal(r.workflow, "bug");
});

test("parses --dry-run", () => {
  const r = parseArgs(["run", "--dry-run", "scope something"]);
  assert.equal(r.dryRun, true);
});

test("rejects unknown command", () => {
  assert.throws(() => parseArgs(["wat"]), /unknown command/);
});
```

**Step 2: Verify fail**

Run: `npm test`
Expected: FAIL — module missing.

**Step 3: Write minimal implementation**

```typescript
// src/cli/parse-args.ts
import { parseArgs as nodeParseArgs } from "node:util";

export type RunArgs = {
  command: "run";
  text: string;
  workflow: string;
  dryRun: boolean;
};

export function parseArgs(argv: string[]): RunArgs {
  if (argv[0] !== "run") throw new Error(`unknown command: ${argv[0] ?? "(none)"}`);

  const { values, positionals } = nodeParseArgs({
    args: argv.slice(1),
    options: {
      workflow: { type: "string", default: "feature" },
      "dry-run": { type: "boolean", default: false },
    },
    allowPositionals: true,
  });

  const text = positionals.join(" ").trim();
  if (!text) throw new Error("run requires a task text positional");

  return {
    command: "run",
    text,
    workflow: String(values.workflow),
    dryRun: Boolean(values["dry-run"]),
  };
}
```

**Step 4: Verify pass**

Run: `npm test`
Expected: PASS.

**Step 5: Commit**

```bash
git add src/cli/parse-args.ts tests/cli/parse-args.test.ts
git commit -m "Parse 'cycle run' argv with workflow + dry-run flags"
```

---

### Task 5: Slug + freeform-id generation

**Files:**
- Create: `tests/issue/id.test.ts`
- Create: `src/issue/id.ts`

**Step 1: Write the failing test**

```typescript
// tests/issue/id.test.ts
import { test } from "node:test";
import { strict as assert } from "node:assert";
import { slugify, freeformId } from "../../src/issue/id.ts";

test("slugify lowercases and dashes", () => {
  assert.equal(slugify("Fix the Safari Login Bug!"), "fix-the-safari-login-bug");
});

test("slugify truncates long input", () => {
  const long = "a".repeat(100);
  assert.ok(slugify(long).length <= 40);
});

test("freeformId combines timestamp + slug", () => {
  const id = freeformId("fix login", new Date("2026-05-12T10:30:00Z"));
  assert.equal(id, "txt-20260512-103000-fix-login");
});
```

**Step 2: Verify fail.**

**Step 3: Implement**

```typescript
// src/issue/id.ts
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/, "");
}

export function freeformId(text: string, now: Date = new Date()): string {
  const y = now.getUTCFullYear();
  const mo = String(now.getUTCMonth() + 1).padStart(2, "0");
  const d = String(now.getUTCDate()).padStart(2, "0");
  const h = String(now.getUTCHours()).padStart(2, "0");
  const mi = String(now.getUTCMinutes()).padStart(2, "0");
  const s = String(now.getUTCSeconds()).padStart(2, "0");
  return `txt-${y}${mo}${d}-${h}${mi}${s}-${slugify(text)}`;
}
```

**Step 4: Verify pass.**

**Step 5: Commit**

```bash
git add src/issue/id.ts tests/issue/id.test.ts
git commit -m "Slugify + freeform issue ID generator"
```

---

### Task 6: Materialize issue file into `docs/cycle/issues/tbd/`

**Files:**
- Create: `tests/issue/materialize.test.ts`
- Create: `src/issue/materialize.ts`

**Step 1: Write the failing test**

```typescript
// tests/issue/materialize.test.ts
import { test } from "node:test";
import { strict as assert } from "node:assert";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { materializeFreeformIssue } from "../../src/issue/materialize.ts";

test("writes a markdown file with frontmatter to tbd/", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-test-"));
  try {
    const { path, id } = await materializeFreeformIssue("fix login bug", root, new Date("2026-05-12T10:30:00Z"));
    assert.ok(path.endsWith("/docs/cycle/issues/tbd/txt-20260512-103000-fix-login-bug.md"));
    assert.equal(id, "txt-20260512-103000-fix-login-bug");
    const body = await readFile(path, "utf8");
    assert.match(body, /^---\n/);
    assert.match(body, /id: txt-20260512-103000-fix-login-bug/);
    assert.match(body, /source: text/);
    assert.match(body, /title: "fix login bug"/);
    assert.match(body, /\nfix login bug\n$/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
```

**Step 2: Verify fail.**

**Step 3: Implement**

```typescript
// src/issue/materialize.ts
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { freeformId } from "./id.ts";

export async function materializeFreeformIssue(text: string, repoRoot: string, now: Date = new Date()) {
  const id = freeformId(text, now);
  const dir = join(repoRoot, "docs", "cycle", "issues", "tbd");
  await mkdir(dir, { recursive: true });
  const path = join(dir, `${id}.md`);
  const frontmatter = [
    "---",
    `id: ${id}`,
    "source: text",
    `title: "${text.replace(/"/g, '\\"')}"`,
    `added_at: ${now.toISOString()}`,
    "triage_attempts: 0",
    "---",
    "",
    text,
    "",
  ].join("\n");
  await writeFile(path, frontmatter, "utf8");
  return { path, id };
}
```

**Step 4: Verify pass.**

**Step 5: Commit**

```bash
git add src/issue/materialize.ts tests/issue/materialize.test.ts
git commit -m "Materialize freeform task as issue markdown in tbd/"
```

---

### Task 7: Scan `tbd/` → move to `queued/` and append to `tbd.jsonl`

**Files:**
- Create: `tests/engine/scan.test.ts`
- Create: `src/engine/scan.ts`

**Step 1: Write the failing test**

```typescript
// tests/engine/scan.test.ts
import { test } from "node:test";
import { strict as assert } from "node:assert";
import { mkdtemp, mkdir, readFile, writeFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { scanTbd } from "../../src/engine/scan.ts";

test("moves tbd file to queued and appends tbd.jsonl line", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-test-"));
  try {
    const tbd = join(root, "docs/cycle/issues/tbd");
    const queued = join(root, "docs/cycle/issues/queued");
    await mkdir(tbd, { recursive: true });
    await mkdir(queued, { recursive: true });
    await mkdir(join(root, ".cycle"), { recursive: true });
    const body = `---\nid: TEST-1\nsource: text\ntitle: "hi"\nadded_at: 2026-05-12T10:30:00Z\n---\n\nhi\n`;
    await writeFile(join(tbd, "TEST-1.md"), body, "utf8");

    const moved = await scanTbd(root);
    assert.deepEqual(moved.map(m => m.id), ["TEST-1"]);
    const queuedFiles = await readdir(queued);
    assert.deepEqual(queuedFiles, ["TEST-1.md"]);
    const tbdFiles = await readdir(tbd);
    assert.deepEqual(tbdFiles, []);
    const jsonl = await readFile(join(root, ".cycle/tbd.jsonl"), "utf8");
    assert.match(jsonl, /"id":"TEST-1"/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
```

**Step 2: Verify fail.**

**Step 3: Implement**

```typescript
// src/engine/scan.ts
import { readdir, rename, readFile, appendFile, mkdir } from "node:fs/promises";
import { join } from "node:path";

export type TbdEntry = { id: string; source: string; title: string; path: string; added_at: string };

function parseFrontmatter(body: string): Record<string, string> {
  const m = body.match(/^---\n([\s\S]*?)\n---/);
  if (!m) throw new Error("no frontmatter");
  const out: Record<string, string> = {};
  for (const line of m[1].split("\n")) {
    const kv = line.match(/^(\w+):\s*(.+)$/);
    if (kv) out[kv[1]] = kv[2].replace(/^"(.*)"$/, "$1");
  }
  return out;
}

export async function scanTbd(repoRoot: string): Promise<TbdEntry[]> {
  const tbd = join(repoRoot, "docs/cycle/issues/tbd");
  const queued = join(repoRoot, "docs/cycle/issues/queued");
  const cycleDir = join(repoRoot, ".cycle");
  await mkdir(queued, { recursive: true });
  await mkdir(cycleDir, { recursive: true });

  let files: string[] = [];
  try {
    files = (await readdir(tbd)).filter(f => f.endsWith(".md"));
  } catch {
    return [];
  }

  const ingested: TbdEntry[] = [];
  for (const f of files) {
    const src = join(tbd, f);
    const dst = join(queued, f);
    const body = await readFile(src, "utf8");
    const fm = parseFrontmatter(body);
    await rename(src, dst);
    const entry: TbdEntry = {
      id: fm.id,
      source: fm.source,
      title: fm.title,
      path: dst,
      added_at: fm.added_at,
    };
    await appendFile(join(cycleDir, "tbd.jsonl"), JSON.stringify(entry) + "\n", "utf8");
    ingested.push(entry);
  }
  return ingested;
}
```

**Step 4: Verify pass.**

**Step 5: Commit**

```bash
git add src/engine/scan.ts tests/engine/scan.test.ts
git commit -m "Scan tbd/ → queued/ and append tbd.jsonl on ingest"
```

---

### Task 8: JSONL log writer (append + stdout mirror)

**Files:**
- Create: `tests/engine/log.test.ts`
- Create: `src/engine/log.ts`

**Step 1: Write the failing test**

```typescript
// tests/engine/log.test.ts
import { test } from "node:test";
import { strict as assert } from "node:assert";
import { mkdtemp, mkdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createLogger } from "../../src/engine/log.ts";

test("emits JSONL to file and to a sink", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-test-"));
  try {
    await mkdir(join(root, ".cycle"), { recursive: true });
    const out: string[] = [];
    const log = await createLogger(root, line => out.push(line));
    await log.emit("engine.start", {});
    await log.emit("cycle.start", { cycle_id: "0001" });
    const file = await readFile(join(root, ".cycle/log.jsonl"), "utf8");
    const lines = file.trim().split("\n");
    assert.equal(lines.length, 2);
    assert.match(lines[0], /"event":"engine.start"/);
    assert.match(lines[1], /"cycle_id":"0001"/);
    assert.equal(out.length, 2);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
```

**Step 2: Verify fail.**

**Step 3: Implement**

```typescript
// src/engine/log.ts
import { appendFile, mkdir } from "node:fs/promises";
import { join } from "node:path";

export type Logger = {
  emit: (event: string, fields: Record<string, unknown>) => Promise<void>;
};

export async function createLogger(repoRoot: string, sink: (line: string) => void = console.log): Promise<Logger> {
  const path = join(repoRoot, ".cycle", "log.jsonl");
  await mkdir(join(repoRoot, ".cycle"), { recursive: true });
  return {
    async emit(event, fields) {
      const line = JSON.stringify({ ts: new Date().toISOString(), event, ...fields });
      await appendFile(path, line + "\n", "utf8");
      sink(line);
    },
  };
}
```

**Step 4: Verify pass.**

**Step 5: Commit**

```bash
git add src/engine/log.ts tests/engine/log.test.ts
git commit -m "JSONL logger: append to .cycle/log.jsonl and mirror to stdout sink"
```

---

### Task 9: Cycle ID allocator

**Files:**
- Create: `tests/engine/cycle-id.test.ts`
- Create: `src/engine/cycle-id.ts`

**Step 1: Write the failing test**

```typescript
// tests/engine/cycle-id.test.ts
import { test } from "node:test";
import { strict as assert } from "node:assert";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { allocateCycleId } from "../../src/engine/cycle-id.ts";

test("starts at 0001 when log is empty", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-test-"));
  try {
    await mkdir(join(root, ".cycle"), { recursive: true });
    assert.equal(await allocateCycleId(root), "0001");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("returns highest+1 from log.jsonl", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-test-"));
  try {
    await mkdir(join(root, ".cycle"), { recursive: true });
    await writeFile(join(root, ".cycle/log.jsonl"),
      [
        JSON.stringify({ event: "cycle.start", cycle_id: "0042" }),
        JSON.stringify({ event: "cycle.start", cycle_id: "0007" }),
      ].join("\n") + "\n", "utf8");
    assert.equal(await allocateCycleId(root), "0043");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
```

**Step 2: Verify fail.**

**Step 3: Implement**

```typescript
// src/engine/cycle-id.ts
import { readFile } from "node:fs/promises";
import { join } from "node:path";

export async function allocateCycleId(repoRoot: string): Promise<string> {
  let highest = 0;
  try {
    const log = await readFile(join(repoRoot, ".cycle/log.jsonl"), "utf8");
    for (const line of log.split("\n")) {
      if (!line) continue;
      try {
        const e = JSON.parse(line);
        const id = typeof e.cycle_id === "string" ? parseInt(e.cycle_id, 10) : NaN;
        if (!Number.isNaN(id) && id > highest) highest = id;
      } catch { /* skip */ }
    }
  } catch { /* no log yet */ }
  return String(highest + 1).padStart(4, "0");
}
```

**Step 4: Verify pass.**

**Step 5: Commit**

```bash
git add src/engine/cycle-id.ts tests/engine/cycle-id.test.ts
git commit -m "Allocate next cycle ID by scanning log.jsonl"
```

---

### Task 10: Workflow YAML loader

**Files:**
- Create: `tests/engine/workflow.test.ts`
- Create: `src/engine/workflow.ts`

**Step 1: Write the failing test**

```typescript
// tests/engine/workflow.test.ts
import { test } from "node:test";
import { strict as assert } from "node:assert";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadWorkflow } from "../../src/engine/workflow.ts";

test("parses a workflow with claudecode and bash steps", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-test-"));
  try {
    const wf = join(root, ".cycle/workflows");
    await mkdir(wf, { recursive: true });
    await writeFile(join(wf, "feature.yaml"),
      `name: feature\ndescription: test\nsteps:\n  - name: spec\n    agent: claudecode\n    prompt: prompts/spec.md\n  - name: commit\n    agent: bash\n    command: scripts/commit.sh\n`, "utf8");

    const w = await loadWorkflow(root, "feature");
    assert.equal(w.name, "feature");
    assert.equal(w.steps.length, 2);
    assert.equal(w.steps[0].agent, "claudecode");
    assert.equal(w.steps[0].prompt, "prompts/spec.md");
    assert.equal(w.steps[1].agent, "bash");
    assert.equal(w.steps[1].command, "scripts/commit.sh");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
```

**Step 2: Verify fail.**

**Step 3: Implement**

```typescript
// src/engine/workflow.ts
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import YAML from "yaml";

export type Step = {
  name: string;
  agent: "claudecode" | "bash";
  prompt?: string;
  command?: string;
};

export type Workflow = {
  name: string;
  description?: string;
  steps: Step[];
};

export async function loadWorkflow(repoRoot: string, name: string): Promise<Workflow> {
  const path = join(repoRoot, ".cycle/workflows", `${name}.yaml`);
  const body = await readFile(path, "utf8");
  const parsed = YAML.parse(body) as Workflow;
  if (!parsed?.name || !Array.isArray(parsed.steps)) throw new Error(`malformed workflow: ${path}`);
  return parsed;
}
```

**Step 4: Verify pass.**

**Step 5: Commit**

```bash
git add src/engine/workflow.ts tests/engine/workflow.test.ts
git commit -m "Load workflow YAML by name"
```

---

### Task 11: Bash step executor (spawn, array args, no shell)

**Files:**
- Create: `tests/engine/exec-bash.test.ts`
- Create: `src/engine/exec-bash.ts`

**Step 1: Write the failing test**

```typescript
// tests/engine/exec-bash.test.ts
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
```

**Step 2: Verify fail.**

**Step 3: Implement (no shell, array args only)**

```typescript
// src/engine/exec-bash.ts
import { spawn } from "node:child_process";
import { join } from "node:path";

export type StepResult = {
  status: "ok" | "failed";
  exitCode: number;
  stdout: string;
  stderr: string;
};

export function execBashStep(repoRoot: string, command: string, env: Record<string, string>): Promise<StepResult> {
  return new Promise(resolve => {
    const abs = join(repoRoot, ".cycle", command);
    // spawn with args ARRAY and no shell: no command-injection surface
    const child = spawn("/bin/bash", [abs], {
      cwd: repoRoot,
      env: { ...process.env, ...env },
      shell: false,
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", d => { stdout += d.toString(); });
    child.stderr.on("data", d => { stderr += d.toString(); });
    child.on("close", code => {
      resolve({
        status: code === 0 ? "ok" : "failed",
        exitCode: code ?? -1,
        stdout,
        stderr,
      });
    });
  });
}
```

**Step 4: Verify pass.**

**Step 5: Commit**

```bash
git add src/engine/exec-bash.ts tests/engine/exec-bash.test.ts
git commit -m "Bash step executor via spawn (array args, no shell)"
```

---

### Task 12: Claudecode step executor (spawn `claude -p`)

**Files:**
- Create: `tests/engine/exec-claudecode.test.ts`
- Create: `src/engine/exec-claudecode.ts`

> **Note for the implementer:** This step requires `claude` CLI on PATH. The test uses a fake `claude` shim on PATH so the real CLI isn't invoked during tests.

**Step 1: Write the failing test**

```typescript
// tests/engine/exec-claudecode.test.ts
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
```

**Step 2: Verify fail.**

**Step 3: Implement (spawn with array args; no shell interpolation)**

```typescript
// src/engine/exec-claudecode.ts
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { StepResult } from "./exec-bash.ts";

export async function execClaudecodeStep(repoRoot: string, promptPath: string, env: Record<string, string>): Promise<StepResult> {
  const abs = join(repoRoot, ".cycle", promptPath);
  const prompt = await readFile(abs, "utf8");
  return new Promise(resolve => {
    const child = spawn("claude", ["-p", prompt], {
      cwd: repoRoot,
      env: { ...process.env, ...env },
      shell: false,
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", d => { stdout += d.toString(); });
    child.stderr.on("data", d => { stderr += d.toString(); });
    child.on("close", code => {
      resolve({
        status: code === 0 ? "ok" : "failed",
        exitCode: code ?? -1,
        stdout,
        stderr,
      });
    });
  });
}
```

**Step 4: Verify pass.**

**Step 5: Commit**

```bash
git add src/engine/exec-claudecode.ts tests/engine/exec-claudecode.test.ts
git commit -m "Claudecode step executor: spawn 'claude -p' with prompt template"
```

---

### Task 13: Cycle artifact directory + branch creation

**Files:**
- Create: `tests/engine/branch.test.ts`
- Create: `src/engine/branch.ts`

> **Note:** Tests in this task use a real local git repo in a tmp dir. All git invocations go through `spawnSync` with array args.

**Step 1: Write the failing test**

```typescript
// tests/engine/branch.test.ts
import { test } from "node:test";
import { strict as assert } from "node:assert";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { createCycleBranch } from "../../src/engine/branch.ts";

function git(cwd: string, args: string[]) {
  const r = spawnSync("git", args, { cwd, encoding: "utf8" });
  if (r.status !== 0) throw new Error(`git ${args.join(" ")} failed: ${r.stderr}`);
  return r.stdout;
}

test("creates branch cycle/feature/<slug> and artifact dir", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-test-"));
  try {
    git(root, ["init", "-b", "main"]);
    git(root, ["config", "user.email", "t@t"]);
    git(root, ["config", "user.name", "t"]);
    git(root, ["commit", "--allow-empty", "-m", "init"]);

    const r = await createCycleBranch(root, { cycleId: "0042", workflow: "feature", slug: "safari-login" });
    assert.equal(r.branch, "cycle/feature/safari-login");
    assert.ok(r.artifactDir.endsWith("/docs/cycle/0042-feature-safari-login"));
    const branch = git(root, ["rev-parse", "--abbrev-ref", "HEAD"]).trim();
    assert.equal(branch, "cycle/feature/safari-login");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
```

**Step 2: Verify fail.**

**Step 3: Implement**

```typescript
// src/engine/branch.ts
import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";

function git(repoRoot: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn("git", args, { cwd: repoRoot, shell: false });
    let stderr = "";
    child.stderr.on("data", d => { stderr += d.toString(); });
    child.on("close", code => {
      if (code === 0) resolve();
      else reject(new Error(`git ${args.join(" ")} failed: ${stderr}`));
    });
  });
}

export async function createCycleBranch(repoRoot: string, opts: { cycleId: string; workflow: string; slug: string }) {
  const branch = `cycle/${opts.workflow}/${opts.slug}`;
  await git(repoRoot, ["checkout", "-b", branch]);
  const artifactDir = join(repoRoot, "docs", "cycle", `${opts.cycleId}-${opts.workflow}-${opts.slug}`);
  await mkdir(artifactDir, { recursive: true });
  return { branch, artifactDir };
}
```

**Step 4: Verify pass.**

**Step 5: Commit**

```bash
git add src/engine/branch.ts tests/engine/branch.test.ts
git commit -m "Create cycle branch and artifact directory via spawn"
```

---

### Task 14: Orchestrator wiring — single cycle end-to-end

**Files:**
- Create: `tests/engine/run-cycle.test.ts`
- Create: `src/engine/run-cycle.ts`

**Step 1: Write the failing test**

```typescript
// tests/engine/run-cycle.test.ts
import { test } from "node:test";
import { strict as assert } from "node:assert";
import { mkdtemp, mkdir, writeFile, readFile, rm, chmod } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { runCycle } from "../../src/engine/run-cycle.ts";

function git(cwd: string, args: string[]) {
  const r = spawnSync("git", args, { cwd, encoding: "utf8" });
  if (r.status !== 0) throw new Error(`git ${args.join(" ")}: ${r.stderr}`);
  return r.stdout;
}

test("runs a 2-step workflow end-to-end and writes log + artifacts", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-test-"));
  const bin = await mkdtemp(join(tmpdir(), "cycle-bin-"));
  try {
    git(root, ["init", "-b", "main"]);
    git(root, ["config", "user.email", "t@t"]);
    git(root, ["config", "user.name", "t"]);
    git(root, ["commit", "--allow-empty", "-m", "init"]);

    await mkdir(join(root, ".cycle/workflows"), { recursive: true });
    await mkdir(join(root, ".cycle/prompts"), { recursive: true });
    await mkdir(join(root, ".cycle/scripts"), { recursive: true });

    await writeFile(join(root, ".cycle/workflows/feature.yaml"),
      `name: feature\nsteps:\n  - name: spec\n    agent: claudecode\n    prompt: prompts/spec.md\n  - name: note\n    agent: bash\n    command: scripts/note.sh\n`, "utf8");
    await writeFile(join(root, ".cycle/prompts/spec.md"), "spec body", "utf8");
    const note = join(root, ".cycle/scripts/note.sh");
    await writeFile(note, "#!/bin/bash\necho NOTED ${CYCLE_ID} ${CYCLE_TITLE}\n", "utf8");
    await chmod(note, 0o755);

    const fake = join(bin, "claude");
    await writeFile(fake, "#!/bin/bash\necho FAKED\n", "utf8");
    await chmod(fake, 0o755);

    const r = await runCycle(root, {
      issueId: "TEST-1",
      title: "spec the thing",
      workflow: "feature",
      env: { PATH: `${bin}:${process.env.PATH}` },
    });
    assert.equal(r.cycleId, "0001");
    assert.equal(r.status, "ok");

    const log = await readFile(join(root, ".cycle/log.jsonl"), "utf8");
    assert.match(log, /"event":"cycle.start"/);
    assert.match(log, /"event":"step.start","cycle_id":"0001","step":"spec"/);
    assert.match(log, /"event":"step.end","cycle_id":"0001","step":"spec","status":"ok"/);
    assert.match(log, /"event":"cycle.end","cycle_id":"0001","status":"ok"/);
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(bin, { recursive: true, force: true });
  }
});
```

**Step 2: Verify fail.**

**Step 3: Implement**

```typescript
// src/engine/run-cycle.ts
import { allocateCycleId } from "./cycle-id.ts";
import { loadWorkflow } from "./workflow.ts";
import { createLogger } from "./log.ts";
import { execBashStep } from "./exec-bash.ts";
import { execClaudecodeStep } from "./exec-claudecode.ts";
import { createCycleBranch } from "./branch.ts";
import { slugify } from "../issue/id.ts";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";

export type RunCycleOpts = {
  issueId: string;
  title: string;
  workflow: string;
  env?: Record<string, string>;
};

export async function runCycle(repoRoot: string, opts: RunCycleOpts) {
  const cycleId = await allocateCycleId(repoRoot);
  const log = await createLogger(repoRoot);
  const slug = slugify(opts.title);
  const wf = await loadWorkflow(repoRoot, opts.workflow);

  await log.emit("cycle.start", { cycle_id: cycleId, workflow: opts.workflow, title: opts.title, issue_id: opts.issueId });
  const { artifactDir } = await createCycleBranch(repoRoot, { cycleId, workflow: opts.workflow, slug });

  const cycleEnv: Record<string, string> = {
    CYCLE_ID: cycleId,
    CYCLE_TITLE: opts.title,
    CYCLE_BASE: process.env.CYCLE_BASE ?? "main",
    ...(opts.env ?? {}),
  };

  for (const step of wf.steps) {
    await log.emit("step.start", { cycle_id: cycleId, step: step.name, agent: step.agent });
    let r;
    if (step.agent === "bash") {
      r = await execBashStep(repoRoot, step.command!, cycleEnv);
    } else if (step.agent === "claudecode") {
      r = await execClaudecodeStep(repoRoot, step.prompt!, cycleEnv);
      if (r.status === "ok" && step.name) {
        await writeFile(join(artifactDir, `${step.name.toUpperCase()}.md`), r.stdout, "utf8");
      }
    } else {
      throw new Error(`unknown agent: ${(step as { agent: string }).agent}`);
    }
    await log.emit("step.end", { cycle_id: cycleId, step: step.name, status: r.status, exit_code: r.exitCode });
    if (r.status === "failed") {
      await log.emit("cycle.end", { cycle_id: cycleId, status: "failed", failing_step: step.name });
      return { cycleId, status: "failed" as const, failingStep: step.name };
    }
  }

  await log.emit("cycle.end", { cycle_id: cycleId, status: "ok" });
  return { cycleId, status: "ok" as const };
}
```

**Step 4: Verify pass.**

**Step 5: Commit**

```bash
git add src/engine/run-cycle.ts tests/engine/run-cycle.test.ts
git commit -m "Orchestrate single cycle end-to-end with JSONL events"
```

---

### Task 15: Wire `cycle run "<text>"` end-to-end in `src/cli.ts`

**Files:**
- Modify: `src/cli.ts`

**Step 1: Replace `src/cli.ts`**

```typescript
// src/cli.ts
import { getVersion } from "./version.ts";
import { parseArgs } from "./cli/parse-args.ts";
import { materializeFreeformIssue } from "./issue/materialize.ts";
import { scanTbd } from "./engine/scan.ts";
import { createLogger } from "./engine/log.ts";
import { runCycle } from "./engine/run-cycle.ts";

const argv = process.argv.slice(2);
if (argv[0] === "--version") {
  console.log(await getVersion());
  process.exit(0);
}

const args = parseArgs(argv);
const cwd = process.cwd();

const log = await createLogger(cwd);
await log.emit("engine.start", {});

const { id } = await materializeFreeformIssue(args.text, cwd);
const ingested = await scanTbd(cwd);
const issue = ingested.find(i => i.id === id);
if (!issue) throw new Error("freshly materialized issue not picked up by scan");
await log.emit("issue.ingested", { issue_id: issue.id, path: issue.path });

if (args.dryRun) {
  await log.emit("engine.stop", { status: "ok", dry_run: true });
  process.exit(0);
}

const r = await runCycle(cwd, { issueId: issue.id, title: issue.title, workflow: args.workflow });
await log.emit("engine.stop", { status: r.status });
process.exit(r.status === "ok" ? 0 : 1);
```

**Step 2: Manual smoke test (no automated test — this is the integration glue)**

Run: `npm run build && node dist/cycle.js run --dry-run "test it"`
Expected: prints JSONL events `engine.start`, `issue.ingested`, `engine.stop`; exit 0.
Then: `ls docs/cycle/issues/queued/` shows the freshly materialized file.

**Step 3: Commit**

```bash
git add src/cli.ts
git commit -m "Wire 'cycle run <text>' through ingest → scan → runCycle"
```

---

## Phase C — feature Workflow + Prompts (Tasks 16–22)

These tasks add the actual default `feature` workflow content under `src/defaults/` (which `init` will copy to consuming repos).

### Task 16: feature.yaml workflow definition

**Files:**
- Create: `src/defaults/workflows/feature.yaml`
- Create: `tests/defaults/feature-yaml.test.ts`

**Step 1: Write failing test**

```typescript
// tests/defaults/feature-yaml.test.ts
import { test } from "node:test";
import { strict as assert } from "node:assert";
import { readFile } from "node:fs/promises";
import YAML from "yaml";

test("default feature workflow has expected step sequence", async () => {
  const y = YAML.parse(await readFile("src/defaults/workflows/feature.yaml", "utf8"));
  const names = y.steps.map((s: { name: string }) => s.name);
  assert.deepEqual(names, ["spec", "research", "plan", "build", "verify", "commit", "pr"]);
});
```

**Step 2: Verify fail.**

**Step 3: Implement `src/defaults/workflows/feature.yaml`**

```yaml
name: feature
description: Full SDLC pass for a single cycle of work.
steps:
  - name: spec
    agent: claudecode
    prompt: prompts/spec.md
  - name: research
    agent: claudecode
    prompt: prompts/research.md
  - name: plan
    agent: claudecode
    prompt: prompts/plan.md
  - name: build
    agent: claudecode
    prompt: prompts/build.md
  - name: verify
    agent: bash
    command: scripts/verify.sh
  - name: commit
    agent: bash
    command: scripts/commit.sh
  - name: pr
    agent: bash
    command: scripts/pr.sh
```

**Step 4: Verify pass.**

**Step 5: Commit**

```bash
git add src/defaults/workflows/feature.yaml tests/defaults/feature-yaml.test.ts
git commit -m "Default feature workflow definition"
```

---

### Task 17: spec / research / plan / build prompt templates

**Files:**
- Create: `src/defaults/prompts/spec.md`
- Create: `src/defaults/prompts/research.md`
- Create: `src/defaults/prompts/plan.md`
- Create: `src/defaults/prompts/build.md`

> **Note:** Content authorship, not TDD. Verify by reading the files back.

**Step 1: Write each prompt** (content shown below)

`spec.md`:
```markdown
You are working on a cycle of code change inside a repo where the user
has dropped an issue into `docs/cycle/issues/queued/`.

The current cycle ID, workflow, and title are recorded in `.cycle/log.jsonl`.

Your job in this step: produce a one-page SPEC.md that restates the
issue as an implementation-ready cycle objective, defines success
conditions, and narrows scope so the run does not sprawl.

Output the SPEC.md content to stdout. Nothing else.
```

`research.md`:
```markdown
You are in a cycle. The SPEC.md for this cycle is already written.

Your job in this step: inspect the current codebase state relevant to
the spec. Identify existing patterns, modules, conventions, tests, and
constraints that touch the change area.

Output a RESEARCH.md to stdout describing what's there and what
constraints the planner should account for. Do not edit code.
```

`plan.md`:
```markdown
You are in a cycle. SPEC.md and RESEARCH.md are written.

Your job: produce a PLAN.md with an actionable implementation plan
grounded in both issue intent and codebase structure. Enumerate files
to change, with line ranges where useful. Call out risks, unknowns,
validations to run.

Output the PLAN.md content to stdout.
```

`build.md`:
```markdown
You are in a cycle. SPEC.md, RESEARCH.md, and PLAN.md are written.

Your job: implement the plan. Make the minimal coherent code changes
required. Follow existing codebase patterns. Run the test suite as you
go to confirm no regression. Do NOT commit; the next step handles that.

When complete, summarize what you changed and confirm tests pass.
Output that summary to stdout.
```

**Step 2: Commit**

```bash
git add src/defaults/prompts/spec.md src/defaults/prompts/research.md src/defaults/prompts/plan.md src/defaults/prompts/build.md
git commit -m "Default prompts for spec / research / plan / build"
```

---

### Task 18: verify.sh script

**Files:**
- Create: `src/defaults/scripts/verify.sh`

**Step 1: Write**

```bash
#!/usr/bin/env bash
# Default verify script. Runs the test suite if a typical project file is present.
# Overridden per-repo when a project has a custom verify.
set -euo pipefail

if [ -f package.json ] && grep -q '"test"' package.json; then
  npm test
elif [ -f Cargo.toml ]; then
  cargo test
elif [ -f pyproject.toml ]; then
  pytest
else
  echo "verify.sh: no test runner detected; passing trivially"
fi
```

**Step 2: Make executable + commit**

```bash
chmod +x src/defaults/scripts/verify.sh
git add src/defaults/scripts/verify.sh
git commit -m "Default verify script with framework auto-detect"
```

---

### Task 19: commit.sh script

**Files:**
- Create: `src/defaults/scripts/commit.sh`

**Step 1: Write**

```bash
#!/usr/bin/env bash
# Stage everything under the cycle's artifact dir + any code changes,
# then create a single commit. Cycle ID is read from CYCLE_ID env var
# (set by the engine before invoking).
set -euo pipefail

: "${CYCLE_ID:?CYCLE_ID must be set by cycle engine}"
: "${CYCLE_TITLE:?CYCLE_TITLE must be set}"

git add -A
if git diff --cached --quiet; then
  echo "commit.sh: nothing to commit"
  exit 0
fi
git commit -m "cycle ${CYCLE_ID}: ${CYCLE_TITLE}"
git rev-parse HEAD
```

**Step 2: Make executable + commit**

```bash
chmod +x src/defaults/scripts/commit.sh
git add src/defaults/scripts/commit.sh
git commit -m "Default commit script (cycle-tagged commit message)"
```

---

### Task 20: pr.sh script (PR open + auto-merge)

**Files:**
- Create: `src/defaults/scripts/pr.sh`

**Step 1: Write**

```bash
#!/usr/bin/env bash
# Push the cycle branch, open a PR, enable auto-merge, then poll until
# the PR lands on the base branch (or exit non-zero if it never does).
set -euo pipefail

: "${CYCLE_ID:?CYCLE_ID must be set}"
: "${CYCLE_TITLE:?CYCLE_TITLE must be set}"
: "${CYCLE_BASE:=main}"

branch=$(git rev-parse --abbrev-ref HEAD)
git push --set-upstream origin "${branch}"

pr_url=$(gh pr create --base "${CYCLE_BASE}" --title "cycle ${CYCLE_ID}: ${CYCLE_TITLE}" --body "Generated by cycle.")
pr_number=$(gh pr view "${branch}" --json number -q .number)

gh pr merge "${pr_number}" --squash --auto

# Poll until merged or timeout (30 minutes)
deadline=$(( $(date +%s) + 1800 ))
while [ "$(date +%s)" -lt "${deadline}" ]; do
  state=$(gh pr view "${pr_number}" --json state -q .state)
  if [ "${state}" = "MERGED" ]; then
    echo "${pr_url}"
    exit 0
  fi
  sleep 10
done

echo "pr.sh: PR did not merge within timeout" >&2
exit 1
```

**Step 2: Make executable + commit**

```bash
chmod +x src/defaults/scripts/pr.sh
git add src/defaults/scripts/pr.sh
git commit -m "Default pr script: push, open PR, enable auto-merge, poll"
```

---

### Task 21: Default verify.sh + scripts smoke test

**Files:**
- Create: `tests/defaults/scripts.test.ts`

**Step 1: Test that the shipped scripts have a shebang and are executable**

```typescript
// tests/defaults/scripts.test.ts
import { test } from "node:test";
import { strict as assert } from "node:assert";
import { readFile, stat } from "node:fs/promises";

for (const s of ["verify.sh", "commit.sh", "pr.sh"]) {
  test(`${s} has shebang and is executable`, async () => {
    const path = `src/defaults/scripts/${s}`;
    const first = (await readFile(path, "utf8")).split("\n")[0];
    assert.match(first, /^#!\/usr\/bin\/env bash/);
    const st = await stat(path);
    assert.ok((st.mode & 0o111) !== 0, `${s} should be executable`);
  });
}
```

**Step 2: Verify pass.**

**Step 3: Commit**

```bash
git add tests/defaults/scripts.test.ts
git commit -m "Smoke-test that default scripts ship executable with shebang"
```

---

### Task 22: Test the full default workflow YAML can load via the engine

**Files:**
- Create: `tests/defaults/feature-loadable.test.ts`

**Step 1: Write**

```typescript
import { test } from "node:test";
import { strict as assert } from "node:assert";
import { mkdtemp, mkdir, copyFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadWorkflow } from "../../src/engine/workflow.ts";

test("default feature.yaml loads via the engine", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-test-"));
  try {
    await mkdir(join(root, ".cycle/workflows"), { recursive: true });
    await copyFile("src/defaults/workflows/feature.yaml", join(root, ".cycle/workflows/feature.yaml"));
    const w = await loadWorkflow(root, "feature");
    assert.equal(w.steps.length, 7);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
```

**Step 2: Verify pass.**

**Step 3: Commit**

```bash
git add tests/defaults/feature-loadable.test.ts
git commit -m "Verify default feature.yaml round-trips through the loader"
```

---

## Phase D — `init` Bootstrap Scaffolder (Tasks 23–26)

### Task 23: `init` subcommand wiring + scaffolder skeleton

**Files:**
- Create: `src/cli/init.ts`
- Create: `tests/cli/init.test.ts`
- Modify: `src/cli.ts`

**Step 1: Write the failing test**

```typescript
// tests/cli/init.test.ts
import { test } from "node:test";
import { strict as assert } from "node:assert";
import { mkdtemp, readFile, stat, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runInit } from "../../src/cli/init.ts";

test("init scaffolds .cycle/bin/cycle.js (exec), workflows, prompts, scripts", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-test-"));
  try {
    await runInit({ targetRoot: root, force: false });
    const bin = join(root, ".cycle/bin/cycle.js");
    const sb = await stat(bin);
    assert.ok((sb.mode & 0o111) !== 0, "cycle.js should be exec");
    const head = (await readFile(bin, "utf8")).slice(0, 30);
    assert.match(head, /^#!\/usr\/bin\/env node/);
    await stat(join(root, ".cycle/workflows/feature.yaml"));
    await stat(join(root, ".cycle/prompts/spec.md"));
    await stat(join(root, ".cycle/scripts/verify.sh"));
    await stat(join(root, "docs/cycle/issues/tbd"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
```

**Step 2: Verify fail.**

**Step 3: Implement `src/cli/init.ts`**

```typescript
// src/cli/init.ts
import { cp, mkdir, stat, chmod, copyFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));

export async function runInit(opts: { targetRoot: string; force: boolean }) {
  const t = opts.targetRoot;

  const enginePath = await locateEngineBundle();

  await mkdir(join(t, ".cycle/bin"), { recursive: true });
  await copyFile(enginePath, join(t, ".cycle/bin/cycle.js"));
  await chmod(join(t, ".cycle/bin/cycle.js"), 0o755);

  const defaults = await locateDefaultsDir();
  await cp(join(defaults, "workflows"), join(t, ".cycle/workflows"), { recursive: true });
  await cp(join(defaults, "prompts"), join(t, ".cycle/prompts"), { recursive: true });
  await cp(join(defaults, "scripts"), join(t, ".cycle/scripts"), { recursive: true });

  for (const sub of ["tbd", "queued", "triaged", "blocked", "failed"]) {
    await mkdir(join(t, "docs/cycle/issues", sub), { recursive: true });
  }
}

async function locateEngineBundle(): Promise<string> {
  const candidates = [
    join(HERE, "..", "..", "dist", "cycle.js"),
    join(HERE, "..", "dist", "cycle.js"),
    join(HERE, "cycle.js"),
  ];
  for (const c of candidates) {
    try { await stat(c); return c; } catch { /* try next */ }
  }
  throw new Error("init: could not locate dist/cycle.js");
}

async function locateDefaultsDir(): Promise<string> {
  const candidates = [
    join(HERE, "..", "..", "src", "defaults"),
    join(HERE, "..", "defaults"),
    join(HERE, "defaults"),
  ];
  for (const c of candidates) {
    try { await stat(c); return c; } catch { /* try next */ }
  }
  throw new Error("init: could not locate src/defaults");
}
```

**Step 4: Wire into `src/cli.ts`** (add at top of the argv dispatch, before `parseArgs`)

```typescript
if (argv[0] === "init") {
  const { runInit } = await import("./cli/init.ts");
  const force = argv.includes("--force");
  await runInit({ targetRoot: process.cwd(), force });
  process.exit(0);
}
```

**Step 5: Verify pass.**

**Step 6: Commit**

```bash
git add src/cli/init.ts tests/cli/init.test.ts src/cli.ts
git commit -m "Add cycle init scaffolder (copies engine bundle + defaults)"
```

---

### Task 24: Stage `src/defaults/` next to bundled engine for init

**Files:**
- Modify: `scripts/build.mjs`

**Step 1: Verify dist/cycle.js init flow**

From a fresh tmp dir, run: `node /abs/path/to/cycle/dist/cycle.js init`

If it fails because the bundle can't locate `src/defaults/`, update `scripts/build.mjs`:

```javascript
// scripts/build.mjs (additions at bottom)
import { cp } from "node:fs/promises";
await cp("src/defaults", "dist/defaults", { recursive: true });
```

And ensure `locateDefaultsDir` returns the `dist/defaults` candidate when running from the bundle.

**Step 2: Verify**

Run: `npm run build && (cd $(mktemp -d) && node /abs/path/dist/cycle.js init && ls .cycle/)`

Expected: `bin/ prompts/ scripts/ workflows/`.

**Step 3: Commit**

```bash
git add scripts/build.mjs src/cli/init.ts
git commit -m "Stage src/defaults next to bundled engine for init"
```

---

### Task 25: cycle init self-test inside this repo

**Files:** N/A (operation, no code change)

**Step 1: From cycle repo root**

```bash
npm run build
node dist/cycle.js init
git status
```

Expected: `.cycle/bin/cycle.js`, `.cycle/workflows/feature.yaml`, `.cycle/prompts/*.md`, `.cycle/scripts/*.sh`, and `docs/cycle/issues/<subdirs>/` all show up as untracked.

**Step 2: Confirm the canonical invocation works**

```bash
./.cycle/bin/cycle.js --version
```

Expected: prints `0.0.1`.

**Step 3: Commit the scaffolded `.cycle/` and `docs/cycle/issues/` skeleton**

```bash
git add .cycle/ docs/cycle/issues/
git commit -m "Bootstrap cycle into the cycle repo (dogfood scaffolding)"
```

---

### Task 26: Smoke test — `cycle run --dry-run "test"` against the cycle repo

**Files:** N/A (operation)

**Step 1: Run**

```bash
./.cycle/bin/cycle.js run --dry-run "smoke test the engine"
```

Expected: prints JSONL events `engine.start`, `issue.ingested`, `engine.stop`; exit 0. File appears under `docs/cycle/issues/queued/`.

**Step 2: Inspect**

```bash
cat .cycle/log.jsonl
ls docs/cycle/issues/queued/
```

Expected: log has 3 lines; one `txt-…md` file in queued/.

**Step 3: Clean up the dry-run artifact**

```bash
rm docs/cycle/issues/queued/txt-*.md
rm .cycle/log.jsonl .cycle/tbd.jsonl
git status   # should be clean
```

**Step 4: (Optional) Commit a note that smoke passed**

Skip — nothing changed in tracked files.

---

## Phase E — End-to-End Dogfood (Tasks 27–28)

### Task 27: Dogfood — run cycle on a tiny real feature in the cycle repo

**Files:** N/A (operation)

**Prerequisites:**
- `gh auth status` shows logged in
- `claude` CLI logged in
- `main` branch protection lets `gh pr merge --squash --auto` work (temporarily disable if needed)

**Step 1: Pick a small target feature**

Suggested first dogfood task (small, low-risk): *"Add a one-line README.md describing what cycle is"* (creates a single new file).

**Step 2: Run cycle in foreground**

```bash
./.cycle/bin/cycle.js run "add a one-line README.md describing cycle"
```

Expected timeline (rough):
- `engine.start`, `issue.ingested`
- `cycle.start` (cycle 0001)
- `step.start spec` … `step.end spec`
- `step.start research` … `step.end research`
- `step.start plan` … `step.end plan`
- `step.start build` … `step.end build`
- `step.start verify` (`npm test` runs)
- `step.start commit` (creates commit on `cycle/feature/<slug>`)
- `step.start pr` (opens PR, enables auto-merge, polls)
- `cycle.end`, `engine.stop`

**Step 3: Verify outcome**

```bash
git log --oneline -5
gh pr list --state merged
```

Expected: at least one new merged PR on `main` named `cycle 0001: …`. README.md exists.

**Step 4: Capture the dogfood transcript**

```bash
cp .cycle/log.jsonl docs/cycle/0001-feature-*/log.jsonl
git add docs/cycle/0001-feature-*/
git commit -m "Archive cycle 0001 dogfood transcript"
```

---

### Task 28: Document the dogfood result + known sharp edges

**Files:**
- Create: `docs/DOGFOOD.md`

**Step 1: Write a short retrospective**

```markdown
# Cycle MVP Dogfood — 2026-05-12

## What worked
- `cycle init` scaffolds cleanly into the cycle repo.
- `./.cycle/bin/cycle.js run "<text>"` runs the feature workflow end-to-end.
- PR 0001 (`<url>`) merged via `gh pr merge --squash --auto`.

## What's rough
- (record actual observations)

## Next:
- (link to next plan once written)
```

**Step 2: Commit**

```bash
git add docs/DOGFOOD.md
git commit -m "Record cycle 0001 dogfood outcome and observations"
```

---

## Post-Plan Deferrals

These appear in BRIEF.md / ARCHITECTURE.md and are intentionally NOT in this plan. Each deserves its own subsequent plan once dogfood is green:

- **Triage + multi-cycle decomposition.** Required to handle big issues. Currently we force `--workflow feature`.
- **`--detach` daemon + `attach` / `status` / `stop`.** Required for the hours-long-queue UX with Claude Code.
- **3-attempt abandon-and-restart + `blocked/` + `failed/`.** Required for production resilience (BRIEF Phase 4 MVP line).
- **Rate-limit handling (short backoff + long `engine.paused` + exit 42).**
- **`--merge-mode stack`.**
- **Tracker fetch scripts + `--issue <id>`.**
- **`init --upgrade` 3-way merge.**
- **npm publish + version pinning.**
- **`.claude/skills/cycle.md` skill template (Claude Code integration).**

---

## Execution Notes

- **Frequent commits.** Each task is its own commit. Don't batch.
- **TDD discipline.** Red → green → commit. Don't skip the failing-test step.
- **Run `npm test` after every code change.** Catches regressions immediately.
- **If a test is hard to write, the design is probably wrong.** Refactor for testability before writing the test.
- **All subprocess invocations use `spawn` / `spawnSync` with array args, never a shell-interpolated string.** No `exec` / `execSync` anywhere.
- **Tasks 12, 13, 14, 26, 27 talk to the network / real CLI.** Use the fake-`claude`-shim pattern (Task 12) to keep tests hermetic; reserve network-touching steps for the dogfood phase.
