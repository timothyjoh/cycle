import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { buildChildEnv } from "./child-env.ts";
import { registerActiveChild, unregisterActiveChild } from "./active-child.ts";
import type { StepResult } from "./exec-types.ts";

export interface RunAgentOptions {
  binary: string;
  argv: string[];
  /** "stdin": prompt piped to stdin. "argv": prompt appended as last arg. "file": abs path appended as last arg (no file read). */
  promptDelivery: "stdin" | "argv" | "file";
  promptPath: string;
  repoRoot: string;
  env?: Record<string, string>;
  signal?: AbortSignal;
  /** Per-step wall-clock timeout (ms). When exceeded, the child is killed
   * (SIGTERM, then SIGKILL after a grace period) and the result is marked
   * `timedOut`. 0/undefined disables. */
  timeoutMs?: number;
}

export async function runAgent(opts: RunAgentOptions): Promise<StepResult> {
  const { binary, argv, promptDelivery, promptPath, repoRoot, env, signal, timeoutMs } = opts;
  const abs = join(repoRoot, ".cycle", promptPath);
  // `detached: true` puts the child in its own process group so the timeout
  // path can kill the whole tree (a grandchild holding the stdout pipe open
  // otherwise prevents `close` from ever firing). We never unref — the parent
  // still waits for the child via the `close` event.
  const base = { cwd: repoRoot, env: buildChildEnv(env ?? {}), shell: false, signal, detached: true };

  let finalArgv: string[];
  let prompt: string | undefined;
  if (promptDelivery === "file") {
    finalArgv = [...argv, abs];
  } else {
    prompt = await readFile(abs, "utf8");
    finalArgv = promptDelivery === "argv" ? [...argv, prompt] : argv;
  }

  return new Promise<StepResult>((resolve) => {
    const child = promptDelivery === "stdin"
      ? spawn(binary, finalArgv, base)
      : spawn(binary, finalArgv, { ...base, stdio: ["ignore", "pipe", "pipe"] });
    // Register the group-leader pid so run-one's signal handler can reap this
    // detached subtree on a suspend; unregistered in done() on close/error.
    registerActiveChild(child.pid);

    let stdout = "";
    let stderr = "";
    let timedOut = false;
    let settled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let killTimer: ReturnType<typeof setTimeout> | undefined;
    const done = (r: StepResult) => {
      if (settled) return;
      settled = true;
      unregisterActiveChild(child.pid);
      if (timer) clearTimeout(timer);
      if (killTimer) clearTimeout(killTimer);
      resolve(r);
    };
    child.stdout.on("data", (d) => { stdout += d.toString(); });
    child.stderr.on("data", (d) => { stderr += d.toString(); });
    child.on("close", (code) => {
      done(timedOut
        ? { status: "failed", exitCode: code ?? -1, stdout, stderr, timedOut: true }
        : { status: code === 0 ? "ok" : "failed", exitCode: code ?? -1, stdout, stderr });
    });
    child.on("error", (err) => {
      done({ status: "failed", exitCode: -1, stdout: "", stderr: (err as Error).message });
    });
    // Kill the child's whole process group (negative pid). A grandchild that
    // inherited the stdout pipe would otherwise keep it open and prevent the
    // `close` event from firing even after the direct child is signalled.
    const killTree = (sig: NodeJS.Signals) => {
      try { if (child.pid) process.kill(-child.pid, sig); }
      catch { try { child.kill(sig); } catch { /* already gone */ } }
    };
    if (timeoutMs && timeoutMs > 0) {
      // The claude CLI intermittently completes its turn but never exits the
      // process (lingering handles), so `close` never fires. Bound the wait:
      // on timeout, kill the process group so `close` fires and the step is
      // marked timedOut (run-cycle may salvage it if the artifact is complete).
      timer = setTimeout(() => {
        timedOut = true;
        killTree("SIGTERM");
        killTimer = setTimeout(() => killTree("SIGKILL"), 5_000);
        if (killTimer.unref) killTimer.unref();
      }, timeoutMs);
      if (timer.unref) timer.unref();
    }
    if (promptDelivery === "stdin") {
      child.stdin!.on("error", () => {});
      child.stdin!.write(prompt!);
      child.stdin!.end();
    }
  });
}
