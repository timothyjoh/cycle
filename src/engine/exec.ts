import type { StepResult } from "./exec-bash.ts";
import { auggieExec } from "./exec-auggie.ts";
import { claudecodeExec } from "./exec-claudecode.ts";
import { codexExec } from "./exec-codex.ts";
import { geminiExec } from "./exec-gemini.ts";

export interface ExecModule {
  runStep(args: {
    repoRoot: string;
    promptPath: string;
    env?: Record<string, string>;
    model?: string;
    thinking?: string;
  }): Promise<StepResult>;
}

export class UnknownAgentError extends Error {
  constructor(name: string, known: readonly string[]) {
    const list = [...known].sort().join(", ");
    super(`agent "${name}" is not registered; known agents: ${list}`);
    this.name = "UnknownAgentError";
  }
}

const REGISTRY: Record<string, ExecModule> = {
  auggie: auggieExec,
  claudecode: claudecodeExec,
  codex: codexExec,
  gemini: geminiExec,
};

export function resolveAgent(name: string): ExecModule {
  const mod = REGISTRY[name];
  if (!mod) throw new UnknownAgentError(name, Object.keys(REGISTRY));
  return mod;
}
