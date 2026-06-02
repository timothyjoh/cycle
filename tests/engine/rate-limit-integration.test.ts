import { test } from "node:test";
import { strict as assert } from "node:assert";
import { mkdtemp, mkdir, writeFile, readFile, rm, chmod } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { runCycle } from "../../src/engine/run-cycle.ts";
import { expectExactlyOne } from "../helpers.ts";

function git(cwd: string, args: string[]) {
  const r = spawnSync("git", args, { cwd, encoding: "utf8" });
  if (r.status !== 0) throw new Error(`git ${args.join(" ")}: ${r.stderr}`);
  return r.stdout;
}

function workflowYml(
  _agentBin: string,
  opts: { cap?: number | string; secondStep?: boolean } = {},
): string {
  const capLine = opts.cap === undefined ? "" : `  max_rate_limit_retries: ${opts.cap}\n`;
  const secondStep = opts.secondStep
    ? "      - { name: build, agent: claudecode, prompt: prompts/build.md }\n"
    : "";
  return `engine:
  max_consecutive_failures: 2
  base_branch: main
  rate_limit_backoff_ms: 100
${capLine}  commit:
    mode: trunk
    push: false
triage:
  agent: claudecode
  prompt: prompts/triage.md
  max_turns: 10
workflows:
  - name: feature
    max_cycle_attempts: 3
    steps:
      - { name: research, agent: claudecode, prompt: prompts/research.md }
${secondStep}`;
}

function parseEvents(log: string): Array<{ event: string; [k: string]: unknown }> {
  return log.trim().split("\n").filter(Boolean).map(l => JSON.parse(l));
}

const noopSleep = async (_ms: number) => {};

async function setupRepo(
  root: string,
  bin: string,
  fakeScript: string,
  ymlOpts: { cap?: number | string; secondStep?: boolean } = {},
) {
  git(root, ["init", "-b", "main"]);
  git(root, ["config", "user.email", "t@t"]);
  git(root, ["config", "user.name", "t"]);
  git(root, ["commit", "--allow-empty", "-m", "init"]);

  await mkdir(join(root, ".cycle/prompts"), { recursive: true });

  await writeFile(join(root, ".cycle/workflows.yml"), workflowYml(bin, ymlOpts), "utf8");
  await writeFile(join(root, ".cycle/prompts/research.md"), "research body", "utf8");
  await writeFile(join(root, ".cycle/prompts/build.md"), "build body", "utf8");

  const fake = join(bin, "claude");
  await writeFile(fake, fakeScript, "utf8");
  await chmod(fake, 0o755);
}

test("rate-limit: happy path — rate-limit once then success emits paused/resumed, cycle ok", async () => {
  const root = await mkdtemp(join(tmpdir(), "rl-int-"));
  const bin = await mkdtemp(join(tmpdir(), "rl-bin-"));
  try {
    const countFile = join(bin, "call_count");
    const script = `#!/bin/sh
COUNT_FILE="${countFile}"
count=$(cat "$COUNT_FILE" 2>/dev/null || echo 0)
count=$((count + 1))
echo "$count" > "$COUNT_FILE"
if [ "$count" -le 1 ]; then
  echo "rate limit exceeded" >&2
  exit 1
fi
yes BUILD | head -50
`;
    await setupRepo(root, bin, script);

    const r = await runCycle(root, {
      issueId: "RL-1",
      title: "rate limit test",
      workflow: "feature",
      env: { PATH: `${bin}:${process.env.PATH}`, CYCLE_BASE: "main", CYCLE_TRUNK_BASED: "1" },
      sleepFn: noopSleep,
    });

    assert.equal(r.status, "ok");

    const log = await readFile(join(root, ".cycle/log.jsonl"), "utf8");
    const events = parseEvents(log);

    const paused = expectExactlyOne(events, "engine.paused");
    assert.equal((paused as unknown as { reason: string }).reason, "rate_limit");
    assert.ok(typeof (paused as unknown as { retry_at: string }).retry_at === "string");

    const resumed = expectExactlyOne(events, "engine.resumed");
    assert.equal((resumed as unknown as { reason: string }).reason, "rate_limit_cleared");

    assert.ok(!events.some(e => e.event === "cycle.end" && (e as unknown as { status: string }).status === "failed"),
      "cycle must not end as failed");
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(bin, { recursive: true, force: true });
  }
});

test("rate-limit: persistent rate-limit (twice) then success — two paused events, one resumed", async () => {
  const root = await mkdtemp(join(tmpdir(), "rl-int-"));
  const bin = await mkdtemp(join(tmpdir(), "rl-bin-"));
  try {
    const countFile = join(bin, "call_count");
    const script = `#!/bin/sh
COUNT_FILE="${countFile}"
count=$(cat "$COUNT_FILE" 2>/dev/null || echo 0)
count=$((count + 1))
echo "$count" > "$COUNT_FILE"
if [ "$count" -le 2 ]; then
  echo "rate limit exceeded" >&2
  exit 1
fi
yes BUILD | head -50
`;
    await setupRepo(root, bin, script);

    const r = await runCycle(root, {
      issueId: "RL-2",
      title: "persistent rate limit test",
      workflow: "feature",
      env: { PATH: `${bin}:${process.env.PATH}`, CYCLE_BASE: "main", CYCLE_TRUNK_BASED: "1" },
      sleepFn: noopSleep,
    });

    assert.equal(r.status, "ok");

    const log = await readFile(join(root, ".cycle/log.jsonl"), "utf8");
    const events = parseEvents(log);

    const pausedEvents = events.filter(e => e.event === "engine.paused");
    assert.equal(pausedEvents.length, 2, `expected exactly 2 engine.paused events, got ${pausedEvents.length}`);

    const resumed = expectExactlyOne(events, "engine.resumed");
    assert.equal((resumed as unknown as { reason: string }).reason, "rate_limit_cleared");
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(bin, { recursive: true, force: true });
  }
});

test("rate-limit: rate-limit then hard failure — paused emitted, resumed NOT emitted, cycle fails", async () => {
  const root = await mkdtemp(join(tmpdir(), "rl-int-"));
  const bin = await mkdtemp(join(tmpdir(), "rl-bin-"));
  try {
    const countFile = join(bin, "call_count");
    const script = `#!/bin/sh
COUNT_FILE="${countFile}"
count=$(cat "$COUNT_FILE" 2>/dev/null || echo 0)
count=$((count + 1))
echo "$count" > "$COUNT_FILE"
if [ "$count" -le 1 ]; then
  echo "rate limit exceeded" >&2
  exit 1
fi
echo "hard failure" >&2
exit 1
`;
    await setupRepo(root, bin, script);

    const r = await runCycle(root, {
      issueId: "RL-3",
      title: "rate limit then hard failure",
      workflow: "feature",
      env: { PATH: `${bin}:${process.env.PATH}`, CYCLE_BASE: "main", CYCLE_TRUNK_BASED: "1" },
      sleepFn: noopSleep,
    });

    assert.equal(r.status, "failed");

    const log = await readFile(join(root, ".cycle/log.jsonl"), "utf8");
    const events = parseEvents(log);

    expectExactlyOne(events, "engine.paused");

    assert.ok(!events.some(e => e.event === "engine.resumed"),
      "engine.resumed must NOT be emitted when retry fails");

    const cycleEnd = expectExactlyOne(events, "cycle.end");
    assert.equal((cycleEnd as unknown as { status: string }).status, "failed");
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(bin, { recursive: true, force: true });
  }
});

// Fake-agent script: rate-limit (exit 1, "rate limit exceeded") for the first
// N calls, then succeed. N is read from the LIMIT env baked into the script.
function rateLimitNTimesScript(countFile: string, n: number): string {
  return `#!/bin/sh
COUNT_FILE="${countFile}"
count=$(cat "$COUNT_FILE" 2>/dev/null || echo 0)
count=$((count + 1))
echo "$count" > "$COUNT_FILE"
if [ "$count" -le ${n} ]; then
  echo "rate limit exceeded" >&2
  exit 1
fi
yes BUILD | head -50
`;
}

test("rate-limit cap: boundary-below — rate-limit exactly cap times then success, no halt", async () => {
  const root = await mkdtemp(join(tmpdir(), "rl-int-"));
  const bin = await mkdtemp(join(tmpdir(), "rl-bin-"));
  try {
    const countFile = join(bin, "call_count");
    // cap=3, rate-limit exactly 3 times then succeed.
    await setupRepo(root, bin, rateLimitNTimesScript(countFile, 3), { cap: 3 });

    const r = await runCycle(root, {
      issueId: "RL-CAP-1",
      title: "boundary below cap",
      workflow: "feature",
      env: { PATH: `${bin}:${process.env.PATH}`, CYCLE_BASE: "main", CYCLE_TRUNK_BASED: "1" },
      sleepFn: noopSleep,
    });

    assert.equal(r.status, "ok");

    const log = await readFile(join(root, ".cycle/log.jsonl"), "utf8");
    const events = parseEvents(log);

    assert.equal(events.filter(e => e.event === "engine.halted").length, 0,
      "engine.halted must NOT be emitted when rate-limited exactly cap times");

    const resumed = expectExactlyOne(events, "engine.resumed");
    assert.equal((resumed as unknown as { reason: string }).reason, "rate_limit_cleared");

    const cycleEnd = expectExactlyOne(events, "cycle.end");
    assert.equal((cycleEnd as unknown as { status: string }).status, "ok");

    // The step completes via the normal success path: exactly one step.end for
    // "research" with status "ok" — no spurious halt-path step.end.
    const researchEnds = events.filter(e =>
      e.event === "step.end" && (e as unknown as { step: string }).step === "research");
    assert.equal(researchEnds.length, 1,
      `expected exactly 1 success-path step.end for research, got ${researchEnds.length}`);
    assert.equal((researchEnds[0] as unknown as { status: string }).status, "ok");
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(bin, { recursive: true, force: true });
  }
});

test("rate-limit cap: boundary-above — rate-limit cap+1 times halts with rate_limit_max_retries, no later step", async () => {
  const root = await mkdtemp(join(tmpdir(), "rl-int-"));
  const bin = await mkdtemp(join(tmpdir(), "rl-bin-"));
  try {
    const countFile = join(bin, "call_count");
    // cap=3, rate-limit 4 times (= cap + 1) — never reaches success.
    // Two-step workflow so we can assert no later step.start fires.
    await setupRepo(root, bin, rateLimitNTimesScript(countFile, 4), { cap: 3, secondStep: true });

    const r = await runCycle(root, {
      issueId: "RL-CAP-2",
      title: "boundary above cap",
      workflow: "feature",
      env: { PATH: `${bin}:${process.env.PATH}`, CYCLE_BASE: "main", CYCLE_TRUNK_BASED: "1" },
      sleepFn: noopSleep,
    });

    assert.equal(r.status, "failed");
    assert.equal(r.failingStep, "research");

    const log = await readFile(join(root, ".cycle/log.jsonl"), "utf8");
    const events = parseEvents(log);

    const halted = events.filter(e =>
      e.event === "engine.halted" &&
      (e as unknown as { reason: string }).reason === "rate_limit_max_retries");
    assert.equal(halted.length, 1,
      `expected exactly 1 engine.halted{rate_limit_max_retries}, got ${halted.length}`);
    assert.equal((halted[0] as unknown as { retries: number }).retries, 4);
    assert.equal((halted[0] as unknown as { step_index: number }).step_index, 0);

    const cycleEnd = expectExactlyOne(events, "cycle.end");
    assert.equal((cycleEnd as unknown as { status: string }).status, "failed");

    // The halt path now emits exactly one step.end for the rate-limited
    // "research" step, mirroring every other terminal path's step.start/step.end
    // pairing. Cardinality-pinned via filter(...).length === 1.
    const researchEnds = events.filter(e =>
      e.event === "step.end" && (e as unknown as { step: string }).step === "research");
    assert.equal(researchEnds.length, 1,
      `expected exactly 1 halt-path step.end for research, got ${researchEnds.length}`);
    assert.equal((researchEnds[0] as unknown as { status: string }).status, "failed");
    const haltDuration = (researchEnds[0] as unknown as { duration_ms: number }).duration_ms;
    assert.equal(Number.isInteger(haltDuration), true,
      `halt-path step.end duration_ms must be an integer, got ${haltDuration}`);
    assert.ok(haltDuration >= 0, "halt-path step.end duration_ms must be non-negative");

    // Ordering: step.end -> engine.halted -> cycle.end (by event index).
    const iStepEnd = events.findIndex(e =>
      e.event === "step.end" && (e as unknown as { step: string }).step === "research");
    const iHalted = events.findIndex(e =>
      e.event === "engine.halted" &&
      (e as unknown as { reason: string }).reason === "rate_limit_max_retries");
    const iCycleEnd = events.findIndex(e =>
      e.event === "cycle.end" && (e as unknown as { status: string }).status === "failed");
    assert.ok(iStepEnd >= 0 && iStepEnd < iHalted && iHalted < iCycleEnd,
      `expected step.end (${iStepEnd}) < engine.halted (${iHalted}) < cycle.end (${iCycleEnd})`);

    // start/end pairing for the rate-limited step: both 1 on the halt path.
    const researchStarts = events.filter(e =>
      e.event === "step.start" && (e as unknown as { step: string }).step === "research").length;
    assert.equal(researchStarts, researchEnds.length,
      "rate-limited step must have matching step.start and step.end counts");

    // No later step (the "build" step at index 1) ever started.
    assert.ok(!events.some(e =>
      e.event === "step.start" && (e as unknown as { step: string }).step === "build"),
      "no later step.start must fire after the halt");
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(bin, { recursive: true, force: true });
  }
});

for (const badCap of [0, -1, "2.5"] as const) {
  test(`rate-limit cap: malformed cap (${badCap}) degrades to default 24 — 5 retries then success, no halt`, async () => {
    const root = await mkdtemp(join(tmpdir(), "rl-int-"));
    const bin = await mkdtemp(join(tmpdir(), "rl-bin-"));
    try {
      const countFile = join(bin, "call_count");
      // A bad cap of 0/negative/non-integer must resolve to the default 24, so
      // 5 rate-limited attempts (well under 24, comfortably over a literal 0)
      // must NOT halt and the cycle must complete after the 6th call succeeds.
      await setupRepo(root, bin, rateLimitNTimesScript(countFile, 5), { cap: badCap });

      const r = await runCycle(root, {
        issueId: "RL-CAP-3",
        title: `malformed cap ${badCap}`,
        workflow: "feature",
        env: { PATH: `${bin}:${process.env.PATH}`, CYCLE_BASE: "main", CYCLE_TRUNK_BASED: "1" },
        sleepFn: noopSleep,
      });

      assert.equal(r.status, "ok");

      const log = await readFile(join(root, ".cycle/log.jsonl"), "utf8");
      const events = parseEvents(log);

      assert.equal(events.filter(e => e.event === "engine.halted").length, 0,
        `malformed cap ${badCap} must degrade to default 24, not halt at 5 retries`);
      expectExactlyOne(events, "engine.resumed");
    } finally {
      await rm(root, { recursive: true, force: true });
      await rm(bin, { recursive: true, force: true });
    }
  });
}

test("rate-limit: non-claudecode artifact step — step.warning emitted exactly once despite rate-limit retry", async () => {
  const root = await mkdtemp(join(tmpdir(), "rl-int-"));
  const bin = await mkdtemp(join(tmpdir(), "rl-bin-"));
  try {
    const countFile = join(bin, "call_count");
    const script = `#!/bin/sh
COUNT_FILE="${countFile}"
count=$(cat "$COUNT_FILE" 2>/dev/null || echo 0)
count=$((count + 1))
echo "$count" > "$COUNT_FILE"
if [ "$count" -le 1 ]; then
  echo "rate limit exceeded" >&2
  exit 1
fi
mkdir -p src
echo "// stub" > src/stub.ts
yes BUILD | head -50
`;

    git(root, ["init", "-b", "main"]);
    git(root, ["config", "user.email", "t@t"]);
    git(root, ["config", "user.name", "t"]);
    git(root, ["commit", "--allow-empty", "-m", "init"]);

    await mkdir(join(root, ".cycle/prompts"), { recursive: true });
    await writeFile(join(root, ".cycle/workflows.yml"), `engine:
  max_consecutive_failures: 2
  base_branch: main
  rate_limit_backoff_ms: 100
  commit:
    mode: trunk
    push: false
triage:
  agent: claudecode
  prompt: prompts/triage.md
  max_turns: 10
workflows:
  - name: feature
    max_cycle_attempts: 3
    steps:
      - { name: build, agent: gemini, prompt: prompts/build.md }
`, "utf8");
    await writeFile(join(root, ".cycle/prompts/build.md"), "build body", "utf8");

    const fake = join(bin, "gemini");
    await writeFile(fake, script, "utf8");
    await chmod(fake, 0o755);
    process.env.CYCLE_GEMINI_BIN = fake;

    const r = await runCycle(root, {
      issueId: "RL-5",
      title: "non-claudecode artifact rate limit",
      workflow: "feature",
      env: { PATH: `${bin}:${process.env.PATH}`, CYCLE_BASE: "main", CYCLE_TRUNK_BASED: "1" },
      sleepFn: noopSleep,
    });

    assert.equal(r.status, "ok");

    const log = await readFile(join(root, ".cycle/log.jsonl"), "utf8");
    const events = parseEvents(log);

    const warnings = events.filter(e =>
      e.event === "step.warning" &&
      (e as unknown as { reason: string }).reason === "append_system_prompt_ignored"
    );
    assert.equal(warnings.length, 1, `expected exactly 1 step.warning(append_system_prompt_ignored), got ${warnings.length}`);

    expectExactlyOne(events, "engine.paused");
    expectExactlyOne(events, "engine.resumed");
  } finally {
    delete process.env.CYCLE_GEMINI_BIN;
    await rm(root, { recursive: true, force: true });
    await rm(bin, { recursive: true, force: true });
  }
});

test("rate-limit: normal failure baseline — no pause/resume events, consecutive_failures path taken", async () => {
  const root = await mkdtemp(join(tmpdir(), "rl-int-"));
  const bin = await mkdtemp(join(tmpdir(), "rl-bin-"));
  try {
    const script = `#!/bin/sh
echo "something went wrong" >&2
exit 1
`;
    await setupRepo(root, bin, script);

    const r = await runCycle(root, {
      issueId: "RL-4",
      title: "normal failure baseline",
      workflow: "feature",
      env: { PATH: `${bin}:${process.env.PATH}`, CYCLE_BASE: "main", CYCLE_TRUNK_BASED: "1" },
      sleepFn: noopSleep,
    });

    assert.equal(r.status, "failed");

    const log = await readFile(join(root, ".cycle/log.jsonl"), "utf8");
    const events = parseEvents(log);

    assert.ok(!events.some(e => e.event === "engine.paused"),
      "engine.paused must NOT be emitted for non-rate-limit failures");
    assert.ok(!events.some(e => e.event === "engine.resumed"),
      "engine.resumed must NOT be emitted for non-rate-limit failures");

    const cycleEnd = expectExactlyOne(events, "cycle.end");
    assert.equal((cycleEnd as unknown as { status: string }).status, "failed");
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(bin, { recursive: true, force: true });
  }
});
