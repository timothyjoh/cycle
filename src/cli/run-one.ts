import { runCycle } from "../engine/run-cycle.ts";
import {
  activeChildCount,
  anyChildAlive,
  killActiveChildren,
  WORKER_CHILD_KILL_GRACE_MS,
} from "../engine/active-child.ts";

// Signal cascade: when the supervisor reaps this worker (SIGTERM→grace→SIGKILL),
// forward the signal to every detached child group (agent / bash) so no orphan
// keeps mutating the repo. Bounded SIGTERM→poll→SIGKILL backstop, mirroring the
// supervisor's discipline. The handler must never throw and must guarantee the
// process exits — we must not exit before the children are dead, or we re-create
// the orphan we are trying to prevent (detached children survive the parent).

/** Injectable dependencies for {@link reapAndExit} so the reap orchestration is
 *  unit-testable without actually killing processes or exiting the test runner. */
export interface ReapDeps {
  count: () => number;
  killChildren: (sig: NodeJS.Signals) => void;
  anyAlive: () => boolean;
  exit: (code: number) => void;
  write: (s: string) => void;
  graceMs: number;
  setIntervalFn?: (fn: () => void, ms: number) => { unref?: () => void };
  setTimeoutFn?: (fn: () => void, ms: number) => { unref?: () => void };
  clearIntervalFn?: (handle: unknown) => void;
}

// Pure(ish) reap orchestration: SIGTERM every child group, then exit as soon as
// they are all gone (fast poll), with a hard SIGKILL-after-grace backstop for any
// child that ignores SIGTERM. With no children registered, exits immediately.
export function reapAndExit(sig: NodeJS.Signals, code: number, deps: ReapDeps): void {
  const n = deps.count();
  if (n === 0) {
    deps.exit(code);
    return;
  }
  deps.write(`run-one: interrupted by ${sig}, reaping ${n} child group(s)\n`);
  deps.killChildren("SIGTERM");
  const si = deps.setIntervalFn ?? setInterval;
  const st = deps.setTimeoutFn ?? setTimeout;
  const ci = deps.clearIntervalFn ?? ((h: unknown) => clearInterval(h as ReturnType<typeof setInterval>));
  // Fast-path: exit as soon as every child group is gone, rather than always
  // burning the full grace window.
  const poll = si(() => {
    if (!deps.anyAlive()) {
      ci(poll);
      deps.exit(code);
    }
  }, 100);
  poll.unref?.();
  // Hard backstop: a child that ignores SIGTERM is SIGKILLed after the grace
  // window; only then do we exit (children guaranteed dead).
  const killTimer = st(() => {
    deps.killChildren("SIGKILL");
    ci(poll);
    deps.exit(code);
  }, deps.graceMs);
  killTimer.unref?.();
}

let handlingSignal = false;
function onWorkerSignal(sig: NodeJS.Signals, code: number): void {
  if (handlingSignal) return;
  handlingSignal = true;
  reapAndExit(sig, code, {
    count: activeChildCount,
    killChildren: killActiveChildren,
    anyAlive: anyChildAlive,
    exit: (c) => process.exit(c),
    write: (s) => { process.stderr.write(s); },
    graceMs: WORKER_CHILD_KILL_GRACE_MS,
  });
}
process.on("SIGTERM", () => onWorkerSignal("SIGTERM", 143));
process.on("SIGINT", () => onWorkerSignal("SIGINT", 130));

export type RunOneArgs = {
  cycleId: string;
  issueId: string;
  title: string;
  workflow: string;
  attempt: number;
  skipCompletedOnRetry: boolean;
  baseBranch?: string;
  resumeFromStep?: number;
};

export function parseRunOneArgs(argv: string[]): RunOneArgs {
  let cycleId: string | undefined;
  let issueId: string | undefined;
  let title: string | undefined;
  let workflow: string | undefined;
  let attempt: number | undefined;
  let skipCompletedOnRetry = false;
  let baseBranch: string | undefined;
  let resumeFromStep: number | undefined;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case "--cycle-id":
        cycleId = argv[++i];
        break;
      case "--issue-id":
        issueId = argv[++i];
        break;
      case "--title":
        title = argv[++i];
        break;
      case "--workflow":
        workflow = argv[++i];
        break;
      case "--attempt": {
        const n = Number(argv[++i]);
        if (!Number.isInteger(n)) throw new Error("--attempt must be integer");
        attempt = n;
        break;
      }
      case "--skip-completed-on-retry":
        skipCompletedOnRetry = true;
        break;
      case "--base-branch":
        baseBranch = argv[++i];
        break;
      case "--resume-from-step": {
        const n = Number(argv[++i]);
        if (!Number.isInteger(n)) throw new Error("--resume-from-step must be integer");
        resumeFromStep = n;
        break;
      }
    }
  }

  if (!cycleId) throw new Error("--cycle-id is required");
  if (!issueId) throw new Error("--issue-id is required");
  if (title === undefined) throw new Error("--title is required");
  if (!workflow) throw new Error("--workflow is required");
  if (attempt === undefined) throw new Error("--attempt is required");

  return { cycleId, issueId, title, workflow, attempt, skipCompletedOnRetry, baseBranch, resumeFromStep };
}

// POSIX O_APPEND (used by createLogger via appendFile) makes concurrent
// supervisor + inner-runner log writes safe without a lock file.
export async function runOne(argv: string[], cwd: string): Promise<never> {
  let params!: RunOneArgs;
  try {
    params = parseRunOneArgs(argv);
  } catch (e) {
    process.stderr.write(`run-one: bad args: ${(e as Error).message}\n`);
    process.exit(2);
  }
  try {
    const result = await runCycle(cwd, {
      cycleId: params.cycleId,
      issueId: params.issueId,
      title: params.title,
      workflow: params.workflow,
      attempt: params.attempt,
      skipCompletedOnRetry: params.skipCompletedOnRetry,
      baseBranch: params.baseBranch,
      ...(params.resumeFromStep !== undefined
        ? { resume: { startStepIndex: params.resumeFromStep } }
        : {}),
    });
    // Exit 3 is the no-op channel consumed by the supervisor; ok ⇒ 0, any other
    // status ⇒ 1 (unchanged). A thrown error ⇒ 2 (catch below).
    process.exit(result.status === "ok" ? 0 : result.status === "noop" ? 3 : 1);
  } catch {
    process.exit(2);
  }
}
