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
