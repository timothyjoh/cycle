import { readFile } from "node:fs/promises";
import { join } from "node:path";
import YAML from "yaml";

export type Step = {
  name: string;
  agent: "claudecode" | "bash";
  prompt?: string;
  command?: string;
  skip_unless?: string;
};

export type Workflow = {
  name: string;
  description?: string;
  max_cycle_attempts: number;
  no_branch?: boolean;
  steps: Step[];
};

export type EngineConfig = {
  max_consecutive_failures: number;
  base_branch: string;
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

export async function loadConfig(repoRoot: string): Promise<CycleConfig> {
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
  return parsed as CycleConfig;
}

export async function loadWorkflow(repoRoot: string, name: string): Promise<Workflow> {
  const cfg = await loadConfig(repoRoot);
  const wf = cfg.workflows.find((w) => w.name === name);
  if (!wf) throw new Error(`unknown workflow: ${name}`);
  return wf;
}
