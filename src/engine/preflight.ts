import { spawnSync } from "node:child_process";
import { readFileSync, statSync, accessSync, constants } from "node:fs";
import { join } from "node:path";
import { buildChildEnv } from "./child-env.ts";
import { knownAgents } from "./exec.ts";
import type { CycleConfig } from "./workflow.ts";

/**
 * Engine-start preflight gate. Runs once after lock acquisition / config load
 * and before triage + the first cycle. It resolves every agent CLI the active
 * workflow + triage will use (mirroring the exec lanes' `CYCLE_<AGENT>_BIN ??
 * "<bin>"` resolution), probes each with `<bin> --version`, confirms the
 * required external tools (`bash`/`git` plus statically-detected step tools)
 * resolve on PATH, and warns when a resolved path is shadowed under the WSL
 * `/mnt/c/` mount. It is read-only and never throws: every probe error becomes
 * a recorded failed check, and an unexpected internal error is caught and
 * surfaced as a single synthetic failure so the caller can halt cleanly
 * instead of leaking a raw stack trace.
 */

export type PreflightCheck = {
  kind: "agent" | "tool";
  name: string;
  resolvedPath: string | null;
  ok: boolean;
};

export type PreflightFailure = {
  kind: "agent" | "tool" | "internal";
  name: string;
  resolvedPath: string | null;
  fix: string;
};

export type PreflightWarning = {
  kind: "wsl_shadow";
  target: string;
  resolvedPath: string;
  message: string;
};

export type PreflightResult = {
  ok: boolean;
  checks: PreflightCheck[];
  failures: PreflightFailure[];
  warnings: PreflightWarning[];
};

export type PreflightOpts = {
  cfg: CycleConfig;
  workflowName: string;
  /** CYCLE_<AGENT>_BIN override source; defaults to process.env. */
  env?: Record<string, string | undefined>;
  /** Injectable WSL probe; `undefined` ⇒ read /proc/version, `null` ⇒ not WSL. */
  procVersion?: string | null;
  /** Path prefix treated as the WSL Windows mount; default "/mnt/c/". */
  shadowPrefix?: string;
  /**
   * PATH used for binary resolution; default `buildChildEnv({}).PATH`. Injectable
   * for hermetic tests of the not-found path: `buildChildEnv` unconditionally
   * prepends node's own bin dir (which may itself hold `git`/`bash`/agent CLIs),
   * so narrowing `process.env.PATH` cannot reliably hide a tool. Probes always
   * spawn the resolved absolute path under `buildChildEnv({})` regardless.
   */
  pathEnv?: string;
};

/**
 * Manual mirror of the exec lanes' binary resolution. Keep these keys in sync
 * with `exec.ts` `REGISTRY` and each lane's `CYCLE_<AGENT>_BIN ?? "<bin>"`
 * resolution — for `claudecode` the agent name, env stem, and binary all
 * differ. A new agent added to `REGISTRY` without an entry here surfaces
 * immediately as a loud `internal` failure (not a silent skip).
 */
const AGENT_BINARY: Record<string, { env: string; bin: string; install: string }> = {
  claudecode: { env: "CYCLE_CLAUDE_BIN", bin: "claude", install: "reinstall the Claude Code CLI natively for your platform" },
  codex: { env: "CYCLE_CODEX_BIN", bin: "codex", install: "npm i -g @openai/codex@latest" },
  gemini: { env: "CYCLE_GEMINI_BIN", bin: "gemini", install: "reinstall the Gemini CLI natively for your platform" },
  auggie: { env: "CYCLE_AUGGIE_BIN", bin: "auggie", install: "reinstall the Auggie CLI natively for your platform" },
  opencode: { env: "CYCLE_OPENCODE_BIN", bin: "opencode", install: "reinstall the opencode CLI natively for your platform" },
  pi: { env: "CYCLE_PI_BIN", bin: "pi", install: "reinstall the pi CLI natively for your platform" },
};

function readProcVersion(): string | null {
  try {
    return readFileSync("/proc/version", "utf8");
  } catch {
    return null;
  }
}

function isWsl(procVersion: string | null): boolean {
  return !!procVersion && procVersion.toLowerCase().includes("microsoft");
}

/**
 * Resolve a binary token to an absolute path the same way the exec lanes'
 * spawn would. A token containing "/" is an explicit path (absolute override
 * or repo-relative) — returned verbatim so the probe can fail it loudly if it
 * doesn't exist. A bare name is searched on `pathEnv`, returning the first
 * executable match, else `null`.
 */
function resolveOnPath(bin: string, pathEnv: string): string | null {
  if (bin.includes("/")) return bin;
  for (const dir of pathEnv.split(":")) {
    if (!dir) continue;
    const candidate = join(dir, bin);
    try {
      const st = statSync(candidate);
      if (!st.isFile()) continue;
      accessSync(candidate, constants.X_OK);
      return candidate;
    } catch {
      // not present / not executable in this dir — keep scanning
    }
  }
  return null;
}

function findWorkflow(cfg: CycleConfig, workflowName: string) {
  return cfg.workflows.find((w) => w.name === workflowName);
}

/**
 * Distinct agent set: the active workflow's non-bash step agents plus triage's
 * agent (when a known agent). A missing/unresolved workflow degrades to just
 * the triage agent. Only known agents (present in `REGISTRY`) are returned.
 */
function distinctAgents(cfg: CycleConfig, workflowName: string): string[] {
  const known = new Set(knownAgents());
  const set = new Set<string>();
  const wf = findWorkflow(cfg, workflowName);
  if (wf) {
    for (const step of wf.steps) {
      if (step.agent !== "bash" && known.has(step.agent)) set.add(step.agent);
    }
  }
  const triageAgent = cfg.triage?.agent;
  if (triageAgent && known.has(triageAgent)) set.add(triageAgent);
  return [...set];
}

/**
 * Tool set: `bash`/`git` always, plus the bare-name `argv[0]` head of each
 * configured bash-step command. Tokens containing "/" are repo-relative script
 * paths (e.g. `scripts/verify.sh`) and are skipped — only literal tool
 * invocations (e.g. `diff a b`) contribute. A missing workflow ⇒ `bash`/`git`.
 */
function detectTools(cfg: CycleConfig, workflowName: string): string[] {
  const set = new Set<string>(["bash", "git"]);
  const wf = findWorkflow(cfg, workflowName);
  if (wf) {
    for (const step of wf.steps) {
      if (step.agent !== "bash") continue;
      const command = step.command?.trim();
      if (!command) continue;
      const head = command.split(/\s+/)[0];
      if (head && !head.includes("/")) set.add(head);
    }
  }
  return [...set];
}

function shadowWarning(target: string, resolvedPath: string): PreflightWarning {
  return {
    kind: "wsl_shadow",
    target,
    resolvedPath,
    message: `${target} resolves under ${resolvedPath} (WSL /mnt/c) — this likely shadows a native Linux install; prefer a linux-x64 build or set CYCLE_<AGENT>_BIN.`,
  };
}

function agentFix(
  agent: string,
  resolved: string,
  spec: { install: string },
  shadowPrefix: string,
  probe: { status: number | null },
): string {
  if (resolved.startsWith(shadowPrefix)) {
    return `${agent} resolved to ${resolved} — a Windows build missing the linux-x64 binary. Install natively: ${spec.install}`;
  }
  return `${agent} resolved to ${resolved} — its \`--version\` probe failed (exit ${probe.status}). ${spec.install}`;
}

export function runPreflight(opts: PreflightOpts): PreflightResult {
  try {
    const env = opts.env ?? process.env;
    const childPath = opts.pathEnv ?? buildChildEnv({}).PATH ?? "";
    const wsl = isWsl(opts.procVersion === undefined ? readProcVersion() : opts.procVersion);
    const shadowPrefix = opts.shadowPrefix ?? "/mnt/c/";
    const checks: PreflightCheck[] = [];
    const failures: PreflightFailure[] = [];
    const warnings: PreflightWarning[] = [];

    for (const agent of distinctAgents(opts.cfg, opts.workflowName)) {
      // AGENT_BINARY mirrors knownAgents(), so spec is always defined here. If a
      // future agent is added to REGISTRY without an AGENT_BINARY entry, the
      // `spec.env` access below throws and the outer try/catch surfaces it as a
      // loud `internal` failure (never a silent skip) — see the table comment.
      const spec = AGENT_BINARY[agent];
      const override = env[spec.env];
      const resolved = override ?? resolveOnPath(spec.bin, childPath);
      if (!resolved) {
        failures.push({
          kind: "agent",
          name: agent,
          resolvedPath: null,
          fix: `${agent} binary "${spec.bin}" not found on PATH. Install it or set ${spec.env} to its path.`,
        });
        checks.push({ kind: "agent", name: agent, resolvedPath: null, ok: false });
        continue;
      }
      const probe = spawnSync(resolved, ["--version"], { env: buildChildEnv({}), shell: false });
      const ok = !probe.error && probe.status === 0;
      checks.push({ kind: "agent", name: agent, resolvedPath: resolved, ok });
      if (!ok) {
        failures.push({
          kind: "agent",
          name: agent,
          resolvedPath: resolved,
          fix: agentFix(agent, resolved, spec, shadowPrefix, probe),
        });
      }
      if (wsl && resolved.startsWith(shadowPrefix)) warnings.push(shadowWarning(agent, resolved));
    }

    for (const tool of detectTools(opts.cfg, opts.workflowName)) {
      const resolved = resolveOnPath(tool, childPath);
      const ok = resolved !== null;
      checks.push({ kind: "tool", name: tool, resolvedPath: resolved, ok });
      if (!ok) {
        failures.push({
          kind: "tool",
          name: tool,
          resolvedPath: null,
          fix: `${tool} not found on PATH. Install ${tool} before running cycle (or use --skip-preflight).`,
        });
      } else if (wsl && resolved.startsWith(shadowPrefix)) {
        warnings.push(shadowWarning(tool, resolved));
      }
    }

    return { ok: failures.length === 0, checks, failures, warnings };
  } catch (err) {
    return {
      ok: false,
      checks: [],
      warnings: [],
      failures: [
        { kind: "internal", name: "preflight", resolvedPath: null, fix: (err as Error).message },
      ],
    };
  }
}
