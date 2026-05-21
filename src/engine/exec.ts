import type { StepResult } from "./exec-bash.ts";
import { auggieExec } from "./exec-auggie.ts";
import { claudecodeExec } from "./exec-claudecode.ts";
import { codexExec } from "./exec-codex.ts";
import { geminiExec } from "./exec-gemini.ts";
import { opencodeExec } from "./exec-opencode.ts";
import { piExec } from "./exec-pi.ts";

export interface ExecModule {
  /**
   * Runs a single workflow step for an agent.
   *
   * `appendSystemPrompt`: honoured only by `claudecodeExec` (forwarded as
   * `--append-system-prompt <value>` before `-p`). Per-agent findings from
   * cycle 0222: `codex` — not supported; `opencode` — not supported;
   * `gemini` — unknown (CLI not installed); `auggie` — unknown, CLI unstable;
   * `pi` — unknown, CLI unstable. See ENGINE.md Known Limitations for details.
   * `run-cycle.ts` emits `step.warning { reason: "append_system_prompt_ignored" }`
   * for any non-claudecode agent that receives a non-undefined value (cycle 0219).
   */
  runStep(args: {
    repoRoot: string;
    promptPath: string;
    env?: Record<string, string>;
    model?: string;
    thinking?: string;
    appendSystemPrompt?: string;
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
  opencode: opencodeExec,
  pi: piExec,
};

export function resolveAgent(name: string): ExecModule {
  const mod = REGISTRY[name];
  if (!mod) throw new UnknownAgentError(name, Object.keys(REGISTRY));
  return mod;
}
