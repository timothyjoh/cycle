All open questions resolved. Writing the plan now.

`★ Insight ─────────────────────────────────────`
The three providers are byte-for-byte identical except binary name + delivery mode. The `...args` spread trick lets `ExecModule.runStep` delegate to `runAgent` in a single line — no destructuring needed, since `repoRoot/promptPath/env` map directly onto `RunAgentOptions` fields.
`─────────────────────────────────────────────────`

```markdown
# Implementation Plan: Cycle 0162

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Extract a shared `runAgent` helper into `src/engine/exec-spawn.ts` and reduce all three provider modules (`exec-codex.ts`, `exec-claudecode.ts`, `exec-gemini.ts`) to single-call config wrappers.

**Architecture:** A new `runAgent(opts: RunAgentOptions): Promise<StepResult>` function handles all spawn wiring — prompt resolution, stdout/stderr accumulation, close/error handlers, and delivery-mode branching. Each provider becomes 4–6 lines: one object export that calls `runAgent` with its config spread over the `ExecModule.runStep` args.

**Tech Stack:** Node ≥ 22.6, `node:child_process` spawn, `node:test` + `node:assert` for tests, TypeScript ES2023.

---

## Current State (from Research)

- `exec-codex.ts` (43 lines), `exec-claudecode.ts` (41 lines), `exec-gemini.ts` (47 lines) are ~95% identical. They differ only in binary name, argv, `stdio` option, and prompt delivery channel.
- `exec-gemini.ts` still has a stale try/catch around `stdin.write`/`stdin.end` that cycle 0161 removed from codex.
- `StepResult = { status, exitCode, stdout, stderr }` is defined in `exec-bash.ts:5-10`. No `stderr_excerpt` field.
- `run-cycle.ts:243` applies `truncateHeadCapped(r.stderr, 2000)` post-hoc after `runStep` returns. That stays — no stderr capping inside `runAgent`.
- `buildChildEnv(extra)` lives in `child-env.ts`. `truncateHeadCapped` is in `log-fmt.ts` (not needed by `runAgent`).
- Existing tests for all three providers use real tmpdir + real fake shell binaries (no `child_process` mocking).
- `scripts/coverage-gate.mjs` FLOORS table has no entry for `exec-spawn.ts` yet.
- `tests/engine/_helpers/` directory exists but is empty.

## Desired End State

- `src/engine/exec-spawn.ts` exports `RunAgentOptions` interface and `runAgent` function.
- `exec-codex.ts`, `exec-claudecode.ts`, `exec-gemini.ts` each contain only an import and a 4–6 line `ExecModule` export that calls `runAgent`. Each fits on one screen.
- `tests/engine/exec-spawn.test.ts` has 4 tests: argv delivery, stdin delivery, ENOENT, non-zero exit + stderr.
- All 8 existing provider tests (codex×3, claudecode×2, gemini×3) pass unchanged.
- `npm test` green, `npm run typecheck` zero errors, `npm run test:coverage` green with per-file floors met.

## What We're NOT Doing

- Adding stderr capping inside `runAgent` — capping stays in `run-cycle.ts:243`.
- Changing `StepResult` type — `stderr` field stays as-is; no `stderr_excerpt`.
- Touching `ExecModule` interface or `exec.ts` registry (imports unchanged, just provider internals change).
- Adding abort/signal wiring beyond passing `signal` through to `spawn` options.
- Adding a Gemini provider (`exec-gemini.ts` already exists — this refactor shrinks it, doesn't add it).
- `ExecModule` `promptPath`→`prompt` contract redesign (refl-0029, different issue).

## Implementation Approach

Single new file, two delivery modes handled by a `promptDelivery` discriminant. For `"stdin"`: omit `stdio` option (Node defaults to `pipe/pipe/pipe`), attach error listener on `child.stdin`, write + end. For `"argv"`: set `stdio: ["ignore","pipe","pipe"]` explicitly (matching current claudecode behavior), append prompt as final argv element. Providers spread their `ExecModule.runStep` args directly into `runAgent` options alongside their fixed config.

---

## Task 1: Create `src/engine/exec-spawn.ts`

### Overview
New file exporting `RunAgentOptions` and `runAgent`. Handles all spawn mechanics for both delivery modes.

### Changes Required

**File**: `src/engine/exec-spawn.ts` (new)

```typescript
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { buildChildEnv } from "./child-env.ts";
import type { StepResult } from "./exec-bash.ts";

export interface RunAgentOptions {
  binary: string;
  argv: string[];
  promptDelivery: "stdin" | "argv";
  promptPath: string;
  repoRoot: string;
  env?: Record<string, string>;
  signal?: AbortSignal;
}

export async function runAgent(opts: RunAgentOptions): Promise<StepResult> {
  const { binary, argv, promptDelivery, promptPath, repoRoot, env, signal } = opts;
  const abs = join(repoRoot, ".cycle", promptPath);
  const prompt = await readFile(abs, "utf8");

  const finalArgv = promptDelivery === "argv" ? [...argv, prompt] : argv;

  return new Promise<StepResult>((resolve) => {
    const child = spawn(binary, finalArgv, {
      cwd: repoRoot,
      env: buildChildEnv(env ?? {}),
      shell: false,
      signal,
      ...(promptDelivery === "argv" ? { stdio: ["ignore", "pipe", "pipe"] as const } : {}),
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => { stdout += d.toString(); });
    child.stderr.on("data", (d) => { stderr += d.toString(); });
    child.on("close", (code) => {
      resolve({ status: code === 0 ? "ok" : "failed", exitCode: code ?? -1, stdout, stderr });
    });
    child.on("error", (err) => {
      resolve({ status: "failed", exitCode: -1, stdout: "", stderr: (err as Error).message });
    });
    if (promptDelivery === "stdin") {
      child.stdin.on("error", () => {});
      child.stdin.write(prompt);
      child.stdin.end();
    }
  });
}
```

### Success Criteria
- [ ] `npm run typecheck` zero errors
- [ ] File compiles as part of build (`npm run build`)

---

## Task 2: Create `tests/engine/exec-spawn.test.ts`

### Overview
4 integration tests using real tmpdir + fake shell binaries (no mocking). Covers both delivery modes plus error cases.

### Changes Required

**File**: `tests/engine/exec-spawn.test.ts` (new)

```typescript
import { test } from "node:test";
import { strict as assert } from "node:assert";
import { mkdtemp, mkdir, writeFile, rm, chmod } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runAgent } from "../../src/engine/exec-spawn.ts";

test("runAgent argv delivery: appends prompt as final arg, captures stdout", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-test-"));
  const bin = await mkdtemp(join(tmpdir(), "cycle-bin-"));
  try {
    await mkdir(join(root, ".cycle/prompts"), { recursive: true });
    await writeFile(join(root, ".cycle/prompts/spec.md"), "ARGV-PROMPT", "utf8");
    const fake = join(bin, "fake-agent");
    await writeFile(fake, "#!/bin/bash\necho ARGS $@\n", "utf8");
    await chmod(fake, 0o755);
    const r = await runAgent({
      binary: "fake-agent",
      argv: ["--flag"],
      promptDelivery: "argv",
      promptPath: "prompts/spec.md",
      repoRoot: root,
      env: { PATH: `${bin}:${process.env.PATH}` },
    });
    assert.equal(r.status, "ok");
    assert.equal(r.exitCode, 0);
    assert.match(r.stdout, /ARGV-PROMPT/);
    assert.match(r.stdout, /--flag/);
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(bin, { recursive: true, force: true });
  }
});

test("runAgent stdin delivery: pipes prompt to stdin, captures stdout", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-test-"));
  const bin = await mkdtemp(join(tmpdir(), "cycle-bin-"));
  try {
    await mkdir(join(root, ".cycle/prompts"), { recursive: true });
    await writeFile(join(root, ".cycle/prompts/spec.md"), "STDIN-PROMPT", "utf8");
    const fake = join(bin, "fake-agent");
    await writeFile(fake, "#!/bin/bash\ncat\n", "utf8");
    await chmod(fake, 0o755);
    const r = await runAgent({
      binary: "fake-agent",
      argv: [],
      promptDelivery: "stdin",
      promptPath: "prompts/spec.md",
      repoRoot: root,
      env: { PATH: `${bin}:${process.env.PATH}` },
    });
    assert.equal(r.status, "ok");
    assert.equal(r.exitCode, 0);
    assert.match(r.stdout, /STDIN-PROMPT/);
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(bin, { recursive: true, force: true });
  }
});

test("runAgent ENOENT: resolves status:failed exitCode:-1 when binary missing", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-test-"));
  try {
    await mkdir(join(root, ".cycle/prompts"), { recursive: true });
    await writeFile(join(root, ".cycle/prompts/spec.md"), "body", "utf8");
    const r = await runAgent({
      binary: "no-such-binary",
      argv: [],
      promptDelivery: "stdin",
      promptPath: "prompts/spec.md",
      repoRoot: root,
      env: { PATH: "/nonexistent" },
    });
    assert.equal(r.status, "failed");
    assert.equal(r.exitCode, -1);
    assert.ok(r.stderr.length > 0, "stderr carries spawn error message");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("runAgent non-zero exit: resolves status:failed and captures stderr", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-test-"));
  const bin = await mkdtemp(join(tmpdir(), "cycle-bin-"));
  try {
    await mkdir(join(root, ".cycle/prompts"), { recursive: true });
    await writeFile(join(root, ".cycle/prompts/spec.md"), "body", "utf8");
    const fake = join(bin, "fake-agent");
    await writeFile(fake, "#!/bin/bash\necho ERROR-MSG >&2\nexit 2\n", "utf8");
    await chmod(fake, 0o755);
    const r = await runAgent({
      binary: "fake-agent",
      argv: [],
      promptDelivery: "stdin",
      promptPath: "prompts/spec.md",
      repoRoot: root,
      env: { PATH: `${bin}:${process.env.PATH}` },
    });
    assert.equal(r.status, "failed");
    assert.equal(r.exitCode, 2);
    assert.match(r.stderr, /ERROR-MSG/);
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(bin, { recursive: true, force: true });
  }
});
```

### Success Criteria
- [ ] `npm test` includes all 4 new exec-spawn tests and they pass
- [ ] Both `promptDelivery` branches covered

---

## Task 3: Reduce `exec-codex.ts`, `exec-claudecode.ts`, `exec-gemini.ts` to thin wrappers

### Overview
Replace all spawn/stream/resolve logic in each provider with a single `runAgent` call. Also removes the stale try/catch from `exec-gemini.ts`.

### Changes Required

**File**: `src/engine/exec-codex.ts` — replace entire content:

```typescript
import { runAgent } from "./exec-spawn.ts";
import type { ExecModule } from "./exec.ts";

export const codexExec: ExecModule = {
  runStep(args) {
    return runAgent({ binary: "codex", argv: [], promptDelivery: "stdin", ...args });
  },
};
```

**File**: `src/engine/exec-claudecode.ts` — replace entire content:

```typescript
import { runAgent } from "./exec-spawn.ts";
import type { ExecModule } from "./exec.ts";

export const claudecodeExec: ExecModule = {
  runStep(args) {
    return runAgent({ binary: "claude", argv: ["--dangerously-skip-permissions", "-p"], promptDelivery: "argv", ...args });
  },
};
```

**File**: `src/engine/exec-gemini.ts` — replace entire content (also removes stale try/catch):

```typescript
import { runAgent } from "./exec-spawn.ts";
import type { ExecModule } from "./exec.ts";

export const geminiExec: ExecModule = {
  runStep(args) {
    return runAgent({ binary: "gemini", argv: [], promptDelivery: "stdin", ...args });
  },
};
```

No changes needed to `exec.ts` — registry imports (`codexExec`, `claudecodeExec`, `geminiExec`) and `ExecModule` interface are untouched.

### Success Criteria
- [ ] All three files fit on one screen (≤15 lines each)
- [ ] `npm run typecheck` zero errors
- [ ] All 8 existing provider tests pass: `exec-codex.test.ts` (3 tests), `exec-claudecode.test.ts` (2 tests), `exec-gemini.test.ts` (3 tests)

---

## Task 4: Add `exec-spawn.ts` floor to `scripts/coverage-gate.mjs`

### Overview
Add a per-file line-coverage floor for the new module so it's enforced by `npm run check:coverage`.

### Changes Required

**File**: `scripts/coverage-gate.mjs:12-22`

In the `FLOORS` object, add one entry:

```js
const FLOORS = {
  "src/engine/exec-spawn.ts": 90,   // ← add this line
  "src/engine/triage.ts": 95,
  // ... rest unchanged
};
```

### Success Criteria
- [ ] `npm run check:coverage` passes with the new floor present
- [ ] `exec-spawn.ts` line coverage is ≥ 90% (4 tests hit both delivery branches, ENOENT, non-zero exit)

---

## Task 5: Quality gates and BUILD.md

### Overview
Verify all gates, then write `BUILD.md` with required coverage numbers.

### Steps

```bash
npm test                    # must be green
npm run typecheck           # must be zero errors
npm run test:coverage       # generates .cycle/coverage.lcov, runs check:coverage + check:invariants
```

Capture line/branch/function numbers from coverage output and write `docs/cycle/0162-feature-extract-shared-runagent-helper-before-ge/BUILD.md`:

```markdown
# BUILD — Cycle 0162

## Test Results
All tests pass: <N> passing, 0 failing.

## Coverage
| Metric   | Value |
|----------|-------|
| Line     | XX.XX% |
| Branch   | XX.XX% |
| Function | XX.XX% |

Floors: line ≥ 95%, branch ≥ 75%, function ≥ 90%. Per-file floor added: `src/engine/exec-spawn.ts` ≥ 90%.
```

### Success Criteria
- [ ] `npm test` exits 0
- [ ] `npm run typecheck` exits 0
- [ ] `npm run test:coverage` exits 0 (all aggregate + per-file floors met)
- [ ] `BUILD.md` exists with real coverage numbers

---

## SPEC Acceptance Traceability

| SPEC Acceptance Bullet (verbatim) | Covering Task | Notes |
|---|---|---|
| `[ ] src/engine/exec-spawn.ts` exists and exports `runAgent` with documented signature | Task 1 | Full file written with `RunAgentOptions` interface + `runAgent` export |
| `[ ] exec-codex.ts` contains only config + one `runAgent(...)` call (fits on screen) | Task 3 | Reduced to 7 lines |
| `[ ] exec-claudecode.ts` contains only config + one `runAgent(...)` call (fits on screen) | Task 3 | Reduced to 7 lines |
| `[ ] tests/engine/exec-spawn.test.ts` covers: argv delivery, stdin delivery, ENOENT exit, non-zero exit with stderr capture | Task 2 | 4 tests, one per case |
| `[ ] All existing exec-codex.test.ts and exec-claudecode.test.ts tests pass without behavioral change | Tasks 3, 5 | Verified by `npm test`; behavior identical via `resolveAgent` |
| `[ ] npm test green` | Task 5 | Final gate |
| `[ ] npm run typecheck zero errors` | Task 5 | Final gate |
| `[ ] npm run test:coverage green; line ≥ 95%, branch ≥ 75%, function ≥ 90%; per-file floors held` | Tasks 4, 5 | exec-spawn.ts floor added at 90% |
| `[ ] BUILD.md reports line/branch/func coverage numbers` | Task 5 | Written as final step |

---

## Testing Strategy

### Unit / Integration Tests
- **`exec-spawn.test.ts`**: 4 tests against `runAgent` directly. Real tmpdir + real fake binaries (shell scripts). No `child_process` mocking — consistent with project test pattern for all other exec modules.
- **Key cases**: (1) argv delivery passes prompt as final arg; (2) stdin delivery pipes prompt body; (3) ENOENT resolves `{status:"failed",exitCode:-1}`; (4) non-zero exit resolves `{status:"failed"}` with stderr captured.
- **Existing provider tests** (`exec-codex.test.ts`, `exec-claudecode.test.ts`, `exec-gemini.test.ts`): no changes — they test via `resolveAgent`, which is untouched. Pass/fail behavior is identical since `runAgent` is a direct extraction.

### Mocking Decision
The SPEC suggested mocking `child_process.spawn` but the project's established pattern for exec modules uses real fake binaries. Real binaries test the full pipe/close/error lifecycle and catch subtle Node stream ordering bugs that mocks would miss. Staying consistent with the existing 8 tests.

## Risk Assessment
- **`stdio` mismatch on argv path**: claudecode currently sets `stdio: ["ignore","pipe","pipe"]` explicitly. `runAgent` replicates this only for `promptDelivery: "argv"`. If the `...` spread on the conditional is wrong, `child.stdout` could be null. Mitigation: the existing claudecode tests (stdout assertion) catch this immediately.
- **`exec-gemini.ts` stale try/catch removal**: removing it changes gemini's behavior only when `stdin.write` throws synchronously — which it cannot in modern Node (writes are async; errors surface via the `error` event). Cycle 0161 established this for codex; same reasoning applies. Existing gemini integration tests confirm the path still works.
- **Coverage floor for exec-spawn.ts**: set at 90%. The 4 tests hit both delivery branches, error handler, and close handler. Branch coverage may be slightly below 100% (e.g., `signal` undefined branch in spawn options), but 90% is achievable.
```

`─────────────────────────────────────────────────`

Plan written to stdout. The engine will capture this and write it to `docs/cycle/0162-feature-extract-shared-runagent-helper-before-ge/PLAN.md`.

**Two execution options:**

**1. Subagent-Driven (this session)** — I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Parallel Session (separate)** — Open a new session with executing-plans, batch execution with checkpoints

Which approach?
