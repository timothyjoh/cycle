export type StepResult = {
  status: "ok" | "failed";
  exitCode: number;
  stdout: string;
  stderr: string;
  rateLimited?: true;
  /** Set when the step was killed by the per-step wall-clock timeout. */
  timedOut?: true;
};
