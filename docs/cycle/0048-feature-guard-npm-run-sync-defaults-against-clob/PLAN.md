Read complete. Open questions resolved inline: hotfix AC-4 regression test does not exist; new guard tests cover the divergence shape via the `--force`/skip scenarios, so AC-4 is deferred (separate concern). Map keys are repo-relative POSIX paths. Orphan destinations (file in `.cycle/` with no source counterpart) are left untouched. Legacy `.cycle/workflows/` dir teardown stays unconditional.

Emitting PLAN.md to stdout now.

```markdown
# Implementation Plan: Cycle 0048

## Overview
Replace the unconditional copy loop in `scripts/sync-defaults.mjs` with a per-file sha256 content-hash guard that records last-sync `{src_sha256, dst_sha256}` pairs in `.cycle/.sync-state.json`, refuses to overwrite locally-divergent destinations (exit 2 with grep-able stderr), and honors `--force` / `CYCLE_SYNC_DEFAULTS_FORCE=1` to bypass.

## Current State (from Research)
- `scripts/sync-defaults.mjs:11-25` does an unconditional `rm -rf` + `cp -r` over `workflows.yml` + the `prompts/` and `scripts/` pairs. No hash, no state, no flag parsing.
- `.cycle/workflows.yml` is currently divergent from `src/defaults/workflows.yml` (trunk-based `no_branch: true`, `commit-trunk.sh`, dropped `pr` step). The 0046 incident is exactly this clobber, restored by housekeeping commit `56e0e07`.
- `.gitignore` (7 lines) does not yet ignore `.cycle/.sync-state.json`.
- `CLAUDE.md ## Commands` documents `npm run sync-defaults` but says nothing about a guard.
- Test patterns to mirror: `tests/cli/drop-priority.test.ts:8-26` (mkdtemp + `spawnSync(process.execPath, [script, …args])` + post-state asserts + `finally` cleanup). `tests/defaults/scripts.test.ts` is the closest neighbor in scope.
- Coverage: `package.json` excludes `scripts/**` from instrumentation, so the script itself does not move the coverage needle; `src/` thresholds (line ≥ 95 / branch ≥ 75 / func ≥ 90) still need to hold.
- Sibling hotfix `refl-0046-…-hotfix-restore-workflows-yml-divergence` already landed via commit `56e0e07` (file restoration only); its AC-4 regression test does NOT exist in `tests/` today. Resolved (see below): treat as deferred; this cycle's tests pin the guard behavior independently.

## Desired End State
- `node scripts/sync-defaults.mjs` discovers every file in `src/defaults/` recursively, hashes each source/destination pair, and copies only paths that are clean (not locally divergent). Clean run writes `.cycle/.sync-state.json` and exits 0.
- A divergent destination (current `dst_sha256` ≠ recorded `dst_sha256` AND ≠ current `src_sha256`) is skipped. Stderr lists each skipped path on its own line + a final `N path(s) skipped` summary; exit code is 2. State file is NOT mutated for skipped paths.
- `--force` or `CYCLE_SYNC_DEFAULTS_FORCE=1` overrides the guard for every path, prints one `force: overwriting N divergent path(s): …` stderr line, and exits 0.
- `.cycle/.sync-state.json` is gitignored. `CLAUDE.md` documents the contract.
- All seven SPEC test scenarios pass; full `npm test` green; `npm run typecheck` clean; coverage thresholds hold.

## What We're NOT Doing
- No durable runtime-override for `.cycle/workflows.yml` (sibling cycle).
- No generalization to config files outside the `src/defaults/ → .cycle/` flow.
- No engine-side changes — guard stays in `scripts/sync-defaults.mjs`.
- No re-creation of the missing hotfix AC-4 regression test (deferred; not in this SPEC).
- No JSON output mode, no colors, no commander/yargs, no new deps.
- No protection for the legacy `.cycle/workflows/` directory teardown (directory removal, intentionally unguarded).
- No special handling of orphan destinations (files in `.cycle/<dir>/` with no `src/defaults/<dir>/` counterpart): left untouched, not hashed, not reported.

## Implementation Approach
Rewrite `scripts/sync-defaults.mjs` end-to-end since the entire copy loop is being replaced. Keep it a single ESM file (~100–140 lines), stdlib-only (`node:crypto`, `node:fs/promises`, `node:path`). Five logical sections in order:

1. **Args + env parse.** `process.argv.includes("--force") || process.env.CYCLE_SYNC_DEFAULTS_FORCE === "1"` → `force` boolean. No other flags.
2. **Legacy teardown.** Keep `rm(".cycle/workflows", { recursive: true, force: true })`. The `workflows.yml` removal moves into the per-file copy path (so the guard protects it).
3. **File discovery.** `discoverPairs()` walks `src/defaults/` recursively via `readdir(..., { withFileTypes: true, recursive: true })` (Node ≥ 22.6 supports `recursive`). For each file, derive POSIX repo-relative `from` (`src/defaults/...`) and `to` (`.cycle/...`). Returns `Array<{from, to}>`.
4. **Guard + copy loop.** Load `.cycle/.sync-state.json` (if present and valid JSON; otherwise empty map). For each pair: hash source, hash destination if it exists, compare against recorded `dst_sha256`. Decide `clean | divergent | absent`. If `force` OR not `divergent`: `mkdir -p` parent, `copyFile(from, to)`, hash new dst, stage state update for that key. If `divergent` and not `force`: append to `skipped` list, leave state entry untouched. Print `synced <from> → <to>` for every copy (mirrors current output).
5. **State write + exit.** If anything was copied, atomic-write the updated state map to `.cycle/.sync-state.json` via tmp-rename. Print summary: if `force` and any divergent paths existed, one stderr line `force: overwriting N divergent path(s): <comma-list>`. If skipped list non-empty, stderr block (one path per line) + final `N path(s) skipped` line; `process.exit(2)`. Else exit 0.

Hash helper: `sha256(filepath)` returns hex digest via `createHash("sha256").update(await readFile(path)).digest("hex")`. Files are small (< 50 KB each), no streaming needed.

State file shape (JSON, repo-relative POSIX keys):

```json
{
  ".cycle/workflows.yml": { "src_sha256": "…", "dst_sha256": "…" },
  ".cycle/prompts/build.md": { "src_sha256": "…", "dst_sha256": "…" },
  …
}
```

Divergence rule (per SPEC):
- If destination does not exist: treat as `absent` → copy unconditionally, no divergence.
- If destination exists and no state entry: clean iff `current dst sha == current src sha`, else divergent.
- If destination exists and state entry exists: divergent iff `current dst sha ≠ recorded dst_sha256 AND current dst sha ≠ current src sha`. Otherwise clean.

Tests are end-to-end spawn — no module exports, no in-process unit calls. Matches `tests/cli/drop-priority.test.ts` shape.

---

## Task 1: Rewrite `scripts/sync-defaults.mjs` with the content-hash guard

### Overview
Replace the entire script body with the structured guard logic above. Single file, stdlib-only, ESM, fully self-contained.

### Changes Required
**File**: `scripts/sync-defaults.mjs`
**Changes**: Full rewrite. New shape:

```js
import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join, posix, relative, sep } from "node:path";

const SRC_ROOT = "src/defaults";
const DST_ROOT = ".cycle";
const STATE_PATH = ".cycle/.sync-state.json";

const force = process.argv.includes("--force") || process.env.CYCLE_SYNC_DEFAULTS_FORCE === "1";

async function sha256(path) { /* readFile → createHash("sha256") → hex */ }
async function fileExists(path) { /* stat → true; ENOENT → false */ }
async function loadState() { /* readFile + JSON.parse; missing or invalid → {} */ }
async function writeStateAtomic(state) { /* writeFile(tmp) + rename(tmp, STATE_PATH) */ }
async function discoverPairs() {
  // readdir(SRC_ROOT, { withFileTypes: true, recursive: true }) → filter files →
  // for each, build {from: posix path under SRC_ROOT, to: posix path under DST_ROOT}.
}
function toPosix(p) { /* normalize separators to "/" for state keys + log output */ }

// Legacy directory teardown (unconditional — directory removal, not file overwrite).
await rm(join(DST_ROOT, "workflows"), { recursive: true, force: true });

const state = await loadState();
const pairs = await discoverPairs();           // includes workflows.yml + prompts/** + scripts/**
const skipped = [];                            // [{to, reason}]
const forced = [];                             // ["to/path", …] when force-overwriting a divergent file

for (const { from, to } of pairs) {
  const srcSha = await sha256(from);
  const dstExists = await fileExists(to);
  const dstSha = dstExists ? await sha256(to) : null;
  const recorded = state[to];
  const isDivergent =
    dstExists &&
    dstSha !== srcSha &&
    (recorded ? dstSha !== recorded.dst_sha256 : true);

  if (isDivergent && !force) {
    skipped.push({ to, reason: "locally divergent" });
    continue;
  }
  if (isDivergent && force) forced.push(to);

  await mkdir(dirname(to), { recursive: true });
  await copyFile(from, to);
  const newDstSha = await sha256(to);
  state[to] = { src_sha256: srcSha, dst_sha256: newDstSha };
  console.log(`synced ${from} → ${to}`);
}

await writeStateAtomic(state);

if (force && forced.length > 0) {
  console.error(`force: overwriting ${forced.length} divergent path(s): ${forced.join(", ")}`);
}
if (skipped.length > 0) {
  for (const s of skipped) console.error(`skipped ${s.to} — ${s.reason}`);
  console.error(`${skipped.length} path(s) skipped`);
  process.exit(2);
}
```

Details:
- All paths normalized to POSIX (`/`) before logging, state-key use, and stderr output. Avoids Windows-style backslashes leaking into the state file or error messages.
- `discoverPairs()` includes `src/defaults/workflows.yml` naturally because the recursive walk emits every file under `src/defaults/`. No special-casing.
- `loadState()` returns `{}` on `ENOENT`, on `SyntaxError` from `JSON.parse`, or on any unexpected shape (defensive). Logs `warning: ignoring malformed .cycle/.sync-state.json` to stderr when malformed.
- `writeStateAtomic`: write to `STATE_PATH + ".tmp"`, then `rename`. Tmp path lives in `.cycle/` so the rename is intra-filesystem.
- Empty-state edge case: if `pairs` is empty (no `src/defaults/` content — wouldn't happen in this repo but stays safe), the script still writes an empty state map and exits 0. Acceptable; no SPEC violation.
- `discoverPairs` filters out non-files (skips directory entries). `recursive: true` was added in Node 20.1; OK at our 22.6 floor.

### Success Criteria
- [ ] `npm run typecheck` clean (script is plain ESM, not typechecked; this is a no-op verification).
- [ ] Manual smoke: `node scripts/sync-defaults.mjs` in this repo, with the current divergent `.cycle/workflows.yml`, copies every prompts/scripts file and skips `.cycle/workflows.yml`; exit 2; stderr lists the skipped path.
- [ ] Manual smoke: `node scripts/sync-defaults.mjs --force` after the above clobbers `.cycle/workflows.yml` back to source; exit 0; force-warning printed on stderr. (Then restore the divergence manually before commit.)
- [ ] `.cycle/.sync-state.json` exists with one entry per copied destination.

---

## Task 2: Add `tests/defaults/sync-defaults-guard.test.ts` covering all SPEC scenarios

### Overview
Seven `node:test` cases driving the script via `spawnSync(process.execPath, [join(process.cwd(), "scripts/sync-defaults.mjs")], { cwd: tmpRoot, env, encoding: "utf8" })`. Each test seeds a tmp dir with the minimum needed `src/defaults/` + `.cycle/` content (no need to copy the entire repo defaults), runs the script, asserts on exit code, stdout/stderr substrings, post-state files, and `.sync-state.json` contents.

### Changes Required
**File**: `tests/defaults/sync-defaults-guard.test.ts` (new)
**Changes**: Seven `test(...)` cases. Each follows the helper pattern:

```ts
import { test } from "node:test";
import { strict as assert } from "node:assert";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const SCRIPT = join(process.cwd(), "scripts/sync-defaults.mjs");

async function seedDefaults(root: string, files: Record<string, string>) {
  for (const [rel, body] of Object.entries(files)) {
    const dst = join(root, rel);
    await mkdir(join(dst, ".."), { recursive: true });
    await writeFile(dst, body);
  }
}

function runScript(root: string, opts: { force?: "flag" | "env" } = {}) {
  const args = [SCRIPT];
  if (opts.force === "flag") args.push("--force");
  const env = { ...process.env };
  if (opts.force === "env") env.CYCLE_SYNC_DEFAULTS_FORCE = "1";
  else delete env.CYCLE_SYNC_DEFAULTS_FORCE;
  return spawnSync(process.execPath, args, { cwd: root, env, encoding: "utf8" });
}
```

The seven scenarios:

1. **Clean sync (no destination exists).** Seed `src/defaults/workflows.yml`, `src/defaults/prompts/spec.md`, `src/defaults/scripts/verify.sh`. Run. Assert `status === 0`, stdout contains `synced src/defaults/workflows.yml → .cycle/workflows.yml`, all three destinations exist with matching content, `.cycle/.sync-state.json` has three entries with matching `src_sha256 === dst_sha256` for each.
2. **Re-sync no-op.** Run scenario 1 twice. Second invocation: `status === 0`, stderr empty, all files unchanged, state file unchanged (or only timestamps changed — assert key set + value equality).
3. **Local divergence on one file → skipped, others copied, exit 2.** Seed sources, then `writeFile(".cycle/workflows.yml", "diverged content\n")` (no state file). Run. Assert `status === 2`, stderr matches `/skipped \.cycle\/workflows\.yml — locally divergent/`, stderr matches `/1 path\(s\) skipped/`, `.cycle/workflows.yml` still contains `diverged content`, `.cycle/prompts/spec.md` and `.cycle/scripts/verify.sh` were copied, `.cycle/.sync-state.json` has entries ONLY for the two copied paths (no key for `.cycle/workflows.yml`).
4. **`--force` override clobbers divergent file.** Same divergent setup. Run with `--force`. Assert `status === 0`, `.cycle/workflows.yml` now equals source, stderr matches `/force: overwriting 1 divergent path\(s\): .cycle\/workflows\.yml/`, state file has entry for `.cycle/workflows.yml`.
5. **`CYCLE_SYNC_DEFAULTS_FORCE=1` equivalent to `--force`.** Same divergent setup. Run with `force: "env"`. Assert identical outcome to scenario 4.
6. **State recording integrity.** After scenario 3, parse `.cycle/.sync-state.json`. Assert (a) keys exist for the two copied paths, (b) keys do NOT include `.cycle/workflows.yml`, (c) for each copied entry `src_sha256` and `dst_sha256` are valid 64-char hex strings AND equal to each other (since copy is byte-for-byte).
7. **Per-file granularity inside `prompts/`.** Seed `src/defaults/prompts/spec.md` and `src/defaults/prompts/build.md`. Pre-divergence `.cycle/prompts/spec.md` with custom content. Run. Assert `status === 2`, `.cycle/prompts/build.md` was copied, `.cycle/prompts/spec.md` preserved, stderr names only `spec.md` as skipped.

Each test wraps body in `try/finally` with `await rm(root, { recursive: true, force: true })`.

### Success Criteria
- [ ] All seven tests pass: `node --test --experimental-strip-types --test-reporter=spec tests/defaults/sync-defaults-guard.test.ts`.
- [ ] Full `npm test` suite green (no regressions in other test files).
- [ ] `npm run test:coverage` reports line ≥ 95%, branch ≥ 75%, function ≥ 90% on `src/` (the script under test is excluded from instrumentation — `--test-coverage-exclude='scripts/**'` in package.json).
- [ ] Test file uses `spawnSync` with array args, no `shell: true` (subprocess discipline).

---

## Task 3: Update `.gitignore` and `CLAUDE.md` to document the guard

### Overview
Add `.cycle/.sync-state.json` to `.gitignore` and document the guard contract under `CLAUDE.md ## Commands`.

### Changes Required

**File**: `.gitignore`
**Changes**: Append one line:

```
.cycle/.sync-state.json
```

**File**: `CLAUDE.md`
**Changes**: Update the `npm run sync-defaults` row in the `## Commands` table to point at a new short subsection immediately after the table titled `### sync-defaults guard`. The subsection contents:

```markdown
### `sync-defaults` divergence guard

`scripts/sync-defaults.mjs` records a sha256 of every `src/defaults/* → .cycle/*` pair in `.cycle/.sync-state.json` (gitignored, JSON). On each run it re-hashes source and destination and refuses to overwrite a destination whose current sha matches neither the recorded `dst_sha256` from the last sync nor the current `src_sha256` — that's the "locally divergent" state.

When divergence is detected:
- The script copies every non-divergent path normally.
- It prints `skipped <path> — locally divergent` to stderr for each divergent destination plus a final `N path(s) skipped` summary line.
- Exit code is `2`. No `.sync-state.json` entry is written for the skipped paths.

To force-overwrite divergent destinations (e.g., after intentionally reverting a local change), pass `--force`:

```sh
npm run sync-defaults -- --force
```

The env var `CYCLE_SYNC_DEFAULTS_FORCE=1` is equivalent and useful for scripted contexts.

The canonical divergent file today is `.cycle/workflows.yml` — this repo's dogfood `.cycle/` runs a trunk-based variant (`no_branch: true`, `commit-trunk.sh`, no `pr` step) that the shipped default does not carry. The guard exists to keep that divergence from being silently re-clobbered by a stray `sync-defaults` invocation (the 0046 incident).
```

The `## Commands` table row stays as-is but its purpose text can append `— see [guard contract](#sync-defaults-guard) below.`.

### Success Criteria
- [ ] `.gitignore` contains `.cycle/.sync-state.json`.
- [ ] `CLAUDE.md` documents the contract: how divergence is detected, what happens on detection, both override mechanisms.
- [ ] `git status` after a clean `npm run sync-defaults` shows no untracked `.cycle/.sync-state.json`.

---

## Testing Strategy

### Unit Tests
None. The script has no exported surface; tests exercise it end-to-end via `spawnSync`. This matches the SPEC's testing approach and the existing `tests/cli/drop-priority.test.ts` and `tests/defaults/scripts.test.ts` patterns.

### Integration / E2E Tests
The seven scenarios in Task 2. All run the real script against a real tmp-dir filesystem, real `node:crypto` hashing, real `.sync-state.json` reads/writes. No mocks. Each test ≤ ~50 lines.

### Manual Verification
After landing:
1. With `.cycle/workflows.yml` in its current divergent state: `npm run sync-defaults` → exit 2, skip message on stderr, `.cycle/workflows.yml` unchanged, other files (re-)synced, `.cycle/.sync-state.json` written.
2. `npm run sync-defaults -- --force` → exit 0, `.cycle/workflows.yml` overwritten by source (DO NOT COMMIT). Restore manually via `git checkout .cycle/workflows.yml`.
3. `git status` does not list `.cycle/.sync-state.json`.

## Risk Assessment

- **Risk:** Recursive `readdir` returns paths with platform-native separators on Windows; state file keys could drift between OSes. **Mitigation:** Explicit POSIX normalization (`toPosix` helper) before any state-key use or stderr/stdout logging. cycle's existing macOS/Linux focus reduces real exposure, but the normalization is cheap and keeps the JSON portable.
- **Risk:** Malformed `.sync-state.json` (manual edit, partial write from a killed previous run) trips `JSON.parse`. **Mitigation:** `loadState()` swallows `SyntaxError` and treats the file as empty; emits a stderr warning. Cost is one false "divergent" flag on the next run — recoverable via `--force`.
- **Risk:** A new default file (e.g., a freshly added prompt) shows up in `src/defaults/` but the corresponding `.cycle/` destination doesn't exist yet. **Mitigation:** `dstExists === false` short-circuits to "absent" → copy unconditionally; tested in scenario 1.
- **Risk:** Coverage thresholds break because the guard code in `scripts/sync-defaults.mjs` is uninstrumented. **Mitigation:** `scripts/**` is already excluded by the existing `--test-coverage-exclude` flag, so threshold compliance depends only on `src/` — unaffected by this change. Confirmed in RESEARCH.
- **Risk:** Tests flake because `spawnSync` resolves `node` differently in CI vs local. **Mitigation:** Use `process.execPath` (already the project convention) — points at the exact Node binary running the test.
- **Risk:** A future agent running the build step's prompt re-runs `sync-defaults` and trips exit 2, halting the workflow. **Mitigation:** This is the desired behavior — exit 2 with a clear stderr block signals the agent (or human) to investigate the divergence rather than re-clobber it. Documented in CLAUDE.md.
```
