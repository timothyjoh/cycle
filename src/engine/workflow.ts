import { readFile } from "node:fs/promises";
import { join } from "node:path";
import YAML from "yaml";
import { knownAgents } from "./exec.ts";

export type Step = {
  name: string;
  agent: "claudecode" | "bash" | "codex" | "gemini" | "auggie" | "opencode" | "pi";
  prompt?: string;
  command?: string;
  skip_unless?: string;
  model?: string;
  thinking?: string;
};

export type CommitConfig = {
  mode: "trunk" | "local-only" | "worktree-pr";
  push: boolean;
};

export type Workflow = {
  name: string;
  description?: string;
  max_cycle_attempts: number;
  steps: Step[];
};

export type EngineConfig = {
  max_consecutive_failures: number;
  base_branch: string;
  skip_completed_on_retry?: boolean;
  commit: CommitConfig;
  rate_limit_backoff_ms?: number;
  /** Per-step wall-clock timeout (ms); 0/undefined disables. Guards against a
   * step subprocess that completes its work but never exits (claude -p exit hang). */
  step_timeout_ms?: number;
  /** Minimum acceptable step wall-clock (ms) before the iteration-too-fast
   * guard counts a failure as "instant". Default 2000; 0/absent/malformed
   * disables the guard (never fast-bails). Resolved at the supervisor read site. */
  min_step_duration_ms?: number;
  /** Opt-in: route claudecode Bash read-commands through `cycle compress-output`.
   * Default false; absent/non-boolean/malformed ⇒ false (resolved defensively at
   * the read site as `=== true`). claudecode-only, fail-open. */
  compress_output?: boolean;
};

export type TriageConfig = {
  agent: string;
  prompt: string;
  max_turns: number;
};

export type Defaults = {
  agent?: Step["agent"];
  model?: string;
  thinking?: string;
};

export type CycleConfig = {
  engine: EngineConfig;
  triage: TriageConfig;
  workflows: Workflow[];
  defaults?: Defaults;
};

export async function loadConfig(repoRoot: string, env: Record<string, string | undefined> = process.env as Record<string, string | undefined>): Promise<CycleConfig> {
  const path = join(repoRoot, ".cycle/workflows.yml");
  let body: string;
  try {
    body = await readFile(path, "utf8");
  } catch {
    throw new Error(`workflows.yml missing: ${path}`);
  }
  const parsed = YAML.parse(body);
  if (!parsed || typeof parsed !== "object") {
    throw new Error(`workflows.yml malformed: not an object (${path})`);
  }
  if (!parsed.engine || typeof parsed.engine !== "object") {
    throw new Error(`workflows.yml malformed: missing engine (${path})`);
  }
  if (!parsed.triage || typeof parsed.triage !== "object") {
    throw new Error(`workflows.yml malformed: missing triage (${path})`);
  }
  if (!Array.isArray(parsed.workflows)) {
    throw new Error(`workflows.yml malformed: workflows must be an array (${path})`);
  }
  for (const w of parsed.workflows) {
    if (!w?.name || !Array.isArray(w.steps)) {
      throw new Error(`workflows.yml malformed: workflow entry missing name or steps (${path})`);
    }
  }
  const COMMIT_DEFAULTS: CommitConfig = { mode: "trunk", push: true };
  const rawCommit = parsed.engine.commit;
  let commitConfig: CommitConfig;
  if (!rawCommit) {
    commitConfig = COMMIT_DEFAULTS;
  } else {
    const mode = rawCommit.mode;
    if (mode !== "trunk" && mode !== "local-only" && mode !== "worktree-pr") {
      throw new Error(
        `workflows.yml malformed: engine.commit.mode must be "trunk", "local-only", or "worktree-pr", got "${mode}" (${path})`
      );
    }
    commitConfig = { mode, push: rawCommit.push !== false };
  }
  if (env.CYCLE_TRUNK_BASED === "1") {
    commitConfig.mode = "trunk";
  }
  parsed.engine.commit = commitConfig;

  // Resolve top-level defaults into every step (step.X overrides defaults.X).
  const rawDefaults = parsed.defaults;
  if (
    rawDefaults !== undefined &&
    (rawDefaults === null || typeof rawDefaults !== "object" || Array.isArray(rawDefaults))
  ) {
    throw new Error(`workflows.yml malformed: defaults must be an object (${path})`);
  }
  const defaults: Defaults = rawDefaults ?? {};
  const validAgents = new Set<string>([...knownAgents(), "bash"]);
  for (const w of parsed.workflows) {
    for (const step of w.steps) {
      const agent = step.agent ?? defaults.agent;
      if (!agent) {
        throw new Error(
          `workflows.yml malformed: workflow "${w.name}" step "${step.name}" has no agent and no defaults.agent (${path})`
        );
      }
      if (!validAgents.has(agent)) {
        throw new Error(
          `workflows.yml malformed: workflow "${w.name}" step "${step.name}" has unknown agent "${agent}" (${path})`
        );
      }
      step.agent = agent;
      if (step.model === undefined && defaults.model !== undefined) step.model = defaults.model;
      if (step.thinking === undefined && defaults.thinking !== undefined) step.thinking = defaults.thinking;
    }
  }

  return parsed as CycleConfig;
}

export async function loadWorkflow(repoRoot: string, name: string): Promise<Workflow> {
  const cfg = await loadConfig(repoRoot);
  const wf = cfg.workflows.find((w) => w.name === name);
  if (!wf) throw new Error(`unknown workflow: ${name}`);
  return wf;
}
