import { readFile } from "node:fs/promises";
import { join } from "node:path";
import YAML from "yaml";

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
};

export type TriageConfig = {
  agent: string;
  prompt: string;
  max_turns: number;
};

export type CycleConfig = {
  engine: EngineConfig;
  triage: TriageConfig;
  workflows: Workflow[];
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
  return parsed as CycleConfig;
}

export async function loadWorkflow(repoRoot: string, name: string): Promise<Workflow> {
  const cfg = await loadConfig(repoRoot);
  const wf = cfg.workflows.find((w) => w.name === name);
  if (!wf) throw new Error(`unknown workflow: ${name}`);
  return wf;
}
