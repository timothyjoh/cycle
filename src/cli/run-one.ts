import { runCycle } from "../engine/run-cycle.ts";

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
    process.exit(result.status === "ok" ? 0 : 1);
  } catch {
    process.exit(2);
  }
}
