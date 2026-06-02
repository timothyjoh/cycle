# Implementation Plan: Cycle 0029

## Overview
Deliver a new first-class `cycle upgrade` command (`src/cli/upgrade.ts` exporting `runUpgrade`) that always refreshes the never-edited engine artifacts (`.cycle/bin/cycle.js`, `.cycle/package.json`), default-preserves the three user-editable config categories (`workflows.yml`, `prompts/**`, `scripts/**`), overwrites each only under its own flag, never touches state files, errors on an uninitialized repo or unknown flag, and prints a concise refreshed/preserved summary — wired into `src/cli.ts` dispatch, `cycle help`, README, `docs/upgrade.md`, and gated by a per-file coverage floor.

## Current State (from Research)
- `runInit({ targetRoot, force })` (`src/cli/init.ts:7-34`) performs unconditional scaffolding: engine bin + chmod `0o755`, `package.json` literal `{ type: "module", private: true }`, `workflows.yml` via `copyFile`, `prompts`/`scripts` via recursive `cp`, and issue dirs. Its `force` param is declared but unused.
- `locateEngineBundle` (`src/cli/init.ts:36-46`) and `locateDefaultsDir` (`src/cli/init.ts:48-62`) are module-private; both throw on failure and reference the module-level `HERE` anchor.
- CLI dispatch (`src/cli.ts:46-131`) is a chain of `if (argv[0] === ...)` branches. The `cleanup` branch (`src/cli.ts:80-86`) is the result-object model: handler returns `{ exitCode, stdout, stderr }`, dispatcher writes streams and `process.exit(result.exitCode)`. The `init` branch (`src/cli.ts:51-56`) is the void-return/`exit(0)` model.
- `cleanup` (`src/cli/cleanup.ts:59-64`) is the established unknown-flag convention: filter argv for `-`-prefixed tokens not in an allowlist → `{ exitCode: 1, stderr: "Unknown flag(s): " + joined }`.
- The help block (`src/cli.ts:109-131`) is a single string literal. `tests/cli/help.test.ts:74-88` asserts subcommand substrings against the built `dist/cycle.js` via `spawnSync`.
- `init.test.ts` (`tests/cli/init.test.ts`) is the temp-dir test template: `mkdtemp` → call handler → `stat`/`readFile` assertions → `rm(..., { recursive: true, force: true })` in `finally`. `node:fs/promises` cannot be `mock.method`-stubbed (CLAUDE.md), so tests use real temp dirs.
- Coverage floors live in `scripts/coverage-gate.mjs:12-37` (`FLOORS` table); `src/cli/cleanup.ts` is gated at 70.

## Desired End State
- `src/cli/upgrade.ts` exists, exporting `runUpgrade(opts: { targetRoot: string; argv: string[] }): Promise<{ exitCode: number; stdout: string; stderr: string }>`.
- `src/cli/init.ts` exports `locateEngineBundle` and `locateDefaultsDir` (reused, not duplicated).
- `src/cli.ts` has an `upgrade` dispatch branch (result-object model) and the help block lists `cycle upgrade` plus all four flag strings.
- `scripts/coverage-gate.mjs` `FLOORS` includes `"src/cli/upgrade.ts": 70`.
- `tests/cli/upgrade.test.ts` covers happy path, each `--overwrite-*` flag in isolation, `--overwrite-all`, always-refresh, state-file untouched, uninitialized-repo error, and unknown-flag error.
- `CLAUDE.md` Commands table, `README.md` "Upgrading" section, and new `docs/upgrade.md` document the command.
- Verify: `npm test` passes, `npm run typecheck` clean, `npm run check:coverage` passes the new floor.

## What We're NOT Doing
- No sidecar-on-divergence (`workflows.yml.new`, `.new` files), no divergence detection or diffing — deferred to a sibling cycle.
- No refactor or removal of `runInit`'s dead `force` param — left byte-for-byte untouched.
- No change to `cycle init`'s scaffolding behavior for fresh repos.
- No `AGENTS.md` (file does not exist at repo root — Commands-table row goes into `CLAUDE.md` only).
- No engine log events / `.cycle/log.jsonl` emission from `upgrade` (one-shot subcommand scope, mirroring `init`/`cleanup` which emit none for this purpose); summary is human-readable stdout.
- No engine lock acquisition (one-shot subcommand, mirroring `init`/`cleanup`).

## Implementation Approach
Resolve the RESEARCH open questions as fixed decisions:

1. **Locator reuse**: Export `locateEngineBundle` and `locateDefaultsDir` from `init.ts` rather than extracting to a new module. This keeps `HERE` anchored to `init.ts`'s `import.meta.url` (which already resolves correctly from both bundled `dist/` and local `src/cli/`), avoids re-anchoring risk, and is the minimal change satisfying "reuse not duplicate."
2. **Directory-category overwrite semantics**: clean-replace. SPEC says "replace `.cycle/prompts/**` **with** shipped defaults," and the always-safe AFK contract means a stale user-added prompt left behind after an explicit opt-in overwrite would be a surprise. So an opted-in directory category is `rm(dest, { recursive: true, force: true })` then `cp(src, dest, { recursive: true })`. `workflows.yml` is a single file: plain `copyFile` (overwrites). The default-preserve path performs **no** write to that category at all.
3. **Return contract**: `runUpgrade` returns `{ exitCode, stdout, stderr }` (the `cleanup` model). This cleanly supports "writes no files on uninitialized repo → return exitCode 1 before any write," lets the summary be a returned stdout string the dispatcher prints, and keeps the handler pure of `process.exit`.
4. **"Initialized" definition**: presence of the `.cycle/` directory (`stat(join(targetRoot, ".cycle"))` succeeds and is a directory). SPEC text says "no `.cycle/` directory present."
5. **`force` param**: untouched.

Ordering within `runUpgrade` makes the no-write-on-error guarantee structural: (a) parse flags → unknown-flag error returns before any I/O; (b) initialized-guard (`stat .cycle`) → error returns before any I/O; (c) locate engine bundle + defaults (throws propagate); (d) always-refresh engine artifacts; (e) per-category conditional overwrites; (f) build and return summary.

Implementation is a single vertical slice (one small command file + dispatch + tests) plus a docs slice; splitting further would create non-testable partial states.

## Failure & Resilience Decisions

### Task 1 — Export locators from `init.ts`
N/A — pure (a visibility change: add `export` keyword; no behavior, no new I/O surface). Verified by existing `init.test.ts` continuing to pass.

### Task 2 — `runUpgrade` in `src/cli/upgrade.ts`
- **Failure modes**:
  - *Unknown flag*: detected by allowlist filter → return `{ exitCode: 1, stderr: "Unknown flag(s): …" }` **before any filesystem access**. No propagation needed; surfaced via non-zero exit + stderr.
  - *Uninitialized repo (`.cycle/` missing or not a directory)*: `stat` fails / `isDirectory()` false → return `{ exitCode: 1, stderr: "…no .cycle/ found… run \`cycle init\` first" }` **before any write**. No partial scaffold.
  - *Engine bundle / defaults not locatable*: `locateEngineBundle` / `locateDefaultsDir` throw plain `Error`; **not caught** in `runUpgrade` — propagates to the dispatcher, which lets it bubble (non-zero exit, stack to stderr), preserving init's behavior. Errors are never swallowed.
  - *Per-category copy failure (opted-in)*: `copyFile`/`rm`/`cp` rejection propagates (not caught), so a half-copied category surfaces as a thrown error / non-zero exit rather than a silent partial state. The always-refresh of engine artifacts runs first and independently; each opted-in category is awaited in sequence so the first failure aborts and surfaces.
- **Idempotency**: Fully idempotent. Always-refresh `copyFile`/`writeFile`/`chmod` are overwrite-by-nature; re-running produces identical engine artifacts. Default-preserve writes nothing to user categories, so re-runs never accumulate. Opted-in clean-replace (`rm` then `cp`) yields the same end state on every run (target is removed before copy; `rm` uses `force: true` so a missing target is not an error). The engine may retry the step — safe.
- **Observability**: The returned stdout summary lists each artifact/category as `refreshed` or `preserved` (and which flag drove an overwrite); errors return descriptive stderr (unknown-flag list; missing-`.cycle/` message naming the path and pointing to `cycle init`) or propagate a named `Error`. No silent path.
- **No silent failure**: Every error either (a) returns a non-zero `exitCode` with a stderr message, or (b) propagates an uncaught `Error` → non-zero process exit. No `catch {}` that swallows. The only `try/catch` is the initialized-guard `stat`, whose `catch` converts ENOENT into the explicit uninitialized error result (not a swallow).

### Task 3 — Wire dispatch + help in `src/cli.ts`
- **Failure modes**: handler returns a result object; dispatcher writes `stdout`/`stderr` and exits `result.exitCode`. A thrown `Error` from `runUpgrade` (locate failure) propagates out of the top-level `await`, producing a non-zero exit with the stack — same as `init` today.
- **Idempotency**: dispatch is stateless routing; re-runs route identically.
- **Observability**: exit code reflects `result.exitCode`; stderr carries any message.
- **No silent failure**: no `catch` added; errors bubble.

### Task 4 — Coverage floor + docs
N/A — pure (config-table entry + Markdown). The floor is enforced mechanically by `check:coverage`; a regression there fails the build loudly.

---

## Task 1: Export `locateEngineBundle` / `locateDefaultsDir` from `init.ts`

### Overview
Make the two resolution helpers reusable by `upgrade.ts` without duplicating their candidate lists or `HERE` anchoring.

### Changes Required
**File**: `src/cli/init.ts`
**Changes**: Add `export` to both function declarations. No other change — `HERE` stays module-level and correctly anchored to `init.ts`'s own `import.meta.url`.
```ts
export async function locateEngineBundle(): Promise<string> { /* unchanged */ }
export async function locateDefaultsDir(): Promise<string> { /* unchanged */ }
```

### Success Criteria
- [ ] Compiles/builds cleanly (`npm run build`).
- [ ] `npm run typecheck` clean.
- [ ] Existing `tests/cli/init.test.ts` still passes (no behavior change).
- [ ] `runInit` behavior byte-for-byte unchanged.

---

## Task 2: Implement `runUpgrade` in `src/cli/upgrade.ts`

### Overview
The core command: always-refresh engine artifacts, default-preserve user config, per-category opt-in overwrite, never touch state, error on uninitialized repo / unknown flag, return a summary.

### Changes Required
**File**: `src/cli/upgrade.ts` (new)
**Changes**:
```ts
import { cp, mkdir, stat, chmod, copyFile, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { locateEngineBundle, locateDefaultsDir } from "./init.ts";

export type UpgradeResult = { exitCode: number; stdout: string; stderr: string };

const KNOWN_FLAGS = [
  "--overwrite-prompts",
  "--overwrite-workflows",
  "--overwrite-scripts",
  "--overwrite-all",
];

export async function runUpgrade(
  opts: { targetRoot: string; argv: string[] },
): Promise<UpgradeResult> {
  const { targetRoot: t, argv } = opts;

  // 1. Unknown-flag guard (before any I/O) — cleanup.ts convention.
  const unknown = argv.filter(a => a.startsWith("-") && !KNOWN_FLAGS.includes(a));
  if (unknown.length > 0) {
    return { exitCode: 1, stdout: "", stderr: "Unknown flag(s): " + unknown.join(", ") };
  }

  const all = argv.includes("--overwrite-all");
  const owPrompts   = all || argv.includes("--overwrite-prompts");
  const owWorkflows = all || argv.includes("--overwrite-workflows");
  const owScripts   = all || argv.includes("--overwrite-scripts");

  // 2. Initialized guard (before any write).
  try {
    const sb = await stat(join(t, ".cycle"));
    if (!sb.isDirectory()) throw new Error("not a dir");
  } catch {
    return {
      exitCode: 1,
      stdout: "",
      stderr: "cycle upgrade: no .cycle/ found in " + t + " — run `cycle init` first.",
    };
  }

  // 3. Locate sources (throws propagate — never swallowed).
  const enginePath = await locateEngineBundle();
  const defaults = await locateDefaultsDir();

  // 4. ALWAYS refresh engine artifacts (mirror init.ts exactly).
  await mkdir(join(t, ".cycle/bin"), { recursive: true });
  await copyFile(enginePath, join(t, ".cycle/bin/cycle.js"));
  await chmod(join(t, ".cycle/bin/cycle.js"), 0o755);
  await writeFile(
    join(t, ".cycle/package.json"),
    JSON.stringify({ type: "module", private: true }, null, 2) + "\n",
  );

  const refreshed = [".cycle/bin/cycle.js", ".cycle/package.json"];
  const preserved: string[] = [];
  const overwritten: string[] = [];

  // 5. Per-category opt-in overwrite (clean-replace for dirs; copyFile for file).
  if (owWorkflows) {
    await copyFile(join(defaults, "workflows.yml"), join(t, ".cycle/workflows.yml"));
    overwritten.push(".cycle/workflows.yml");
  } else preserved.push(".cycle/workflows.yml");

  for (const [flag, name] of [
    [owPrompts, "prompts"],
    [owScripts, "scripts"],
  ] as const) {
    const dest = join(t, ".cycle", name);
    if (flag) {
      await rm(dest, { recursive: true, force: true });
      await cp(join(defaults, name), dest, { recursive: true });
      overwritten.push(`.cycle/${name}/`);
    } else preserved.push(`.cycle/${name}/`);
  }

  // 6. Summary (human-readable stdout).
  const lines = [
    "cycle upgrade complete.",
    "  Refreshed (engine): " + refreshed.join(", "),
  ];
  if (overwritten.length) lines.push("  Overwritten (from defaults): " + overwritten.join(", "));
  if (preserved.length)   lines.push("  Preserved (user config): " + preserved.join(", "));
  lines.push("  Untouched (state): .cycle/.env, .cycle/tbd.jsonl, .cycle/log.jsonl, docs/cycle/issues/**");

  return { exitCode: 0, stdout: lines.join("\n") + "\n", stderr: "" };
}
```
Note: the `package.json` literal must reproduce `init.ts`'s exact form so the always-refresh acceptance assertion holds. State files are never named in any write path — preservation is structural.

### Success Criteria
- [ ] Compiles/builds cleanly; `npm run typecheck` clean.
- [ ] No-flag run leaves `workflows.yml`, `prompts/**`, `scripts/**` byte-for-byte unchanged.
- [ ] Engine artifacts always refreshed and match the shipped bundle / literal.
- [ ] Each `--overwrite-*` overwrites only its category; `--overwrite-all` overwrites all three.
- [ ] State files never written/deleted.
- [ ] Uninitialized repo → exitCode 1, error names `.cycle/` + `cycle init`, no files written.
- [ ] Unknown flag → exitCode 1, no files written.
- [ ] Failure paths surface (no swallowed errors).

---

## Task 3: Wire `cycle upgrade` into dispatch and `cycle help`

### Overview
Route `argv[0] === "upgrade"` to `runUpgrade` (result-object model) and document the command + flags in the help block.

### Changes Required
**File**: `src/cli.ts`
**Changes**: Add a dispatch branch mirroring `cleanup` (after the `init` branch, e.g. near `src/cli.ts:56`):
```ts
if (argv[0] === "upgrade") {
  const { runUpgrade } = await import("./cli/upgrade.ts");
  const result = await runUpgrade({ targetRoot: process.cwd(), argv: argv.slice(1) });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr + String.fromCharCode(10));
  process.exit(result.exitCode);
}
```
Extend the help string literal (`src/cli.ts:109-131`) with an `upgrade` usage line and its flags:
```
  cycle upgrade [--overwrite-prompts] [--overwrite-workflows]
                [--overwrite-scripts] [--overwrite-all]
                                Refresh engine bundle in place; preserve user config by default
```
All four flag strings (`--overwrite-prompts`, `--overwrite-workflows`, `--overwrite-scripts`, `--overwrite-all`) must appear literally in the printed output.

### Success Criteria
- [ ] `node dist/cycle.js upgrade` in an initialized temp repo exits 0 and prints the summary.
- [ ] `cycle help` output contains `cycle upgrade` and all four flag strings.
- [ ] Existing help/dispatch tests (`help.test.ts` six-subcommand + compress-output) still pass.
- [ ] Build + typecheck clean.

---

## Task 4: Coverage floor + documentation

### Overview
Add the per-file coverage floor and the required docs so the cycle is "done."

### Changes Required
**File**: `scripts/coverage-gate.mjs`
**Changes**: Add `"src/cli/upgrade.ts": 70,` to the `FLOORS` table (after the `cleanup.ts` entry, `scripts/coverage-gate.mjs:21`).

**File**: `CLAUDE.md`
**Changes**: Add a `cycle upgrade` row to the Commands table summarizing default-preserve + per-category overwrite flags + always-refresh / never-touch-state contract.

**File**: `README.md`
**Changes**: Add an "Upgrading" section (adjacent to Quick start, `README.md:93-132`) distinguishing `cycle init` (first-time scaffolding) from `cycle upgrade` (safe in-place refresh); document the four overwrite flags and the never-touched state list.

**File**: `docs/upgrade.md` (new)
**Changes**: Detail the three user-editable categories, the always-refreshed engine artifacts, the never-touched state list (`.cycle/.env`, `.cycle/tbd.jsonl`, `.cycle/log.jsonl`, `docs/cycle/issues/**`), per-flag behavior (each overwrites only its category; `--overwrite-all` = all three; clean-replace semantics for `prompts/`/`scripts/`), and the uninitialized-repo / unknown-flag error behavior.

### Success Criteria
- [ ] `npm run check:coverage` enforces and passes the new `src/cli/upgrade.ts` floor.
- [ ] `CLAUDE.md`, `README.md`, `docs/upgrade.md` describe the command accurately.
- [ ] No broken doc links.

---

## SPEC Acceptance Traceability

| SPEC Acceptance Bullet (verbatim) | Covering Task | Notes |
|---|---|---|
| `[ ] cycle upgrade with no flags, run against an initialized repo whose .cycle/workflows.yml, .cycle/prompts/**, and .cycle/scripts/** have been user-edited, leaves all three categories byte-for-byte unchanged.` | Task 2 | Default-preserve path performs no write to user categories. |
| `[ ] After any cycle upgrade invocation, .cycle/bin/cycle.js and .cycle/package.json match the shipped engine bundle / defaults (always refreshed).` | Task 2 | Always-refresh block mirrors `init.ts` exactly. |
| `[ ] --overwrite-prompts replaces .cycle/prompts/** with shipped defaults while .cycle/workflows.yml and .cycle/scripts/** remain user-edited; analogous assertions hold for --overwrite-workflows and --overwrite-scripts overwriting only their own category.` | Task 2 | Per-category conditional, clean-replace for dirs. |
| `[ ] --overwrite-all overwrites all three user-editable categories.` | Task 2 | `--overwrite-all` sets all three category flags. |
| `[ ] State files .cycle/.env, .cycle/tbd.jsonl, .cycle/log.jsonl, and any file under docs/cycle/issues/** are unchanged across all of the above invocations.` | Task 2 | No write path ever names state files (structural). |
| `[ ] Failure path: running cycle upgrade in a directory with no .cycle/ returns a non-zero exit code, writes an error naming the missing .cycle/ (pointing to cycle init), and writes no files.` | Task 2, Task 3 | Initialized-guard returns before any write; dispatcher exits non-zero. |
| `[ ] cycle help output contains cycle upgrade and the strings --overwrite-prompts, --overwrite-workflows, --overwrite-scripts, and --overwrite-all.` | Task 3 | Help block extended with command + all four flags. |
| `[ ] All existing tests still pass.` | Task 1, Task 2, Task 3 | No behavior change to `runInit`/dispatch of existing commands; full `npm test`. |
| `[ ] No compiler/linter warnings introduced (npm run typecheck clean).` | Task 1, Task 2, Task 3 | `npm run typecheck` in every task's success criteria. |

---

## Testing Strategy

### Unit Tests
**File**: `tests/cli/upgrade.test.ts` (new) — follows `init.test.ts` temp-dir template: `mkdtemp(join(tmpdir(), "cycle-test-"))` per test, real filesystem (no `mock.method` on `node:fs/promises`), `rm(root, { recursive: true, force: true })` in `finally`.

A shared `seedInitializedRepo(root)` helper: run `runInit({ targetRoot: root, force: false })`, then overwrite `.cycle/workflows.yml`, a file under `.cycle/prompts/`, and `.cycle/scripts/verify.sh` with sentinel content, and write sentinel state files (`.cycle/.env`, `.cycle/tbd.jsonl`, `.cycle/log.jsonl`, a file under `docs/cycle/issues/todo/`).

Cases:
- **Happy path / default-preserve**: after `runUpgrade({ argv: [] })`, the three sentinel user-config artifacts read back byte-for-byte unchanged; result `exitCode === 0`; summary stdout includes "Preserved".
- **Always-refresh**: after the same call, `.cycle/bin/cycle.js` is exec-bit set (`(mode & 0o111) !== 0`) with the `#!/usr/bin/env node` shebang, and `.cycle/package.json` parses with `type === "module"` — even though prompts/workflows/scripts were preserved.
- **`--overwrite-prompts` in isolation**: prompts match shipped defaults (sentinel prompt gone / replaced); `workflows.yml` and `scripts/verify.sh` still hold sentinels.
- **`--overwrite-workflows` in isolation** and **`--overwrite-scripts` in isolation**: analogous, only the named category changes.
- **Clean-replace semantics**: seed an extra stray file in `.cycle/prompts/` then `--overwrite-prompts`; assert the stray file is gone (ENOENT).
- **`--overwrite-all`**: all three categories match shipped defaults.
- **State untouched (all of the above)**: sentinel `.cycle/.env`, `.cycle/tbd.jsonl`, `.cycle/log.jsonl`, and `docs/cycle/issues/todo/*` read back unchanged after each invocation variant.

**Failure-path tests**:
- **Uninitialized repo**: `mkdtemp` with no `runInit`; `runUpgrade({ argv: [] })` returns `exitCode === 1`, stderr matches `/\.cycle\//` and `/cycle init/`; assert `.cycle/` still absent (no files written).
- **Unknown flag**: `runUpgrade({ argv: ["--overwrite-foo"] })` against an initialized repo returns `exitCode === 1`, stderr includes `Unknown flag(s): --overwrite-foo`; assert sentinel config still unchanged (no write occurred).
- **Locate propagation**: documented as covered by reuse of `init.ts`'s `locate*` (already-throwing helpers); no additional mock-based test (mocking `node:fs/promises` is disallowed and the locate failure requires an environment with no bundle/defaults, which the temp-dir harness cannot construct without relocating `dist/`). Covered by inspection + the existing locate behavior; noted as a deliberate gap, not a silent one.

**Mocking strategy**: none — real temp dirs throughout, per CLAUDE.md and SPEC.

### Integration / E2E Tests
- Extend `tests/cli/help.test.ts` (or add an assertion in the new test file using `spawnSync(node, [dist, "help"])`) asserting `cycle help` output contains `upgrade`, `--overwrite-prompts`, `--overwrite-workflows`, `--overwrite-scripts`, `--overwrite-all`.
- Optional dispatch smoke: `spawnSync(node, [dist, "upgrade"], { cwd: <uninitialized temp> })` exits non-zero with the `.cycle/` error on stderr; and against an initialized temp repo exits 0.

## Risk Assessment
- **`HERE` anchoring after exporting locators**: exporting (not moving) keeps `import.meta.url` resolution intact. Mitigation: no relocation; `init.test.ts` continues to exercise `runInit` → `locate*` from the same module.
- **Clean-replace `rm` racing engine state**: `rm` targets only `.cycle/prompts` / `.cycle/scripts`, never state dirs; `force: true` tolerates a missing target. Mitigation: category list is hardcoded and excludes all state paths; covered by the state-untouched tests.
- **Help-string drift breaking the hardcoded six-subcommand test**: adding `upgrade` is additive (substring assertions only). Mitigation: do not remove any existing subcommand token; verify `help.test.ts` passes.
- **Coverage floor (70%) not met by initial tests**: the command is small and branch-heavy. Mitigation: the case matrix above exercises every branch (each flag, default, unknown-flag, uninitialized, clean-replace), comfortably clearing 70%.
- **`package.json` literal divergence from `init.ts`**: if `init.ts`'s literal ever changes, `upgrade` must match. Mitigation: reproduce the exact `JSON.stringify({ type: "module", private: true }, null, 2) + "\n"` form; the always-refresh acceptance test asserts `type === "module"`.
