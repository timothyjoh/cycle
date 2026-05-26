const RATE_LIMIT_PATTERNS = ["rate limit", "429", "too many requests"];

export interface ExecResult {
  exitCode: number | null;
  stderr: string;
  stdout: string;
}

export function isRateLimitError(result: ExecResult): boolean {
  if (result.exitCode === 429) return true;
  if (result.exitCode !== 1) return false;
  const combined = (result.stderr + result.stdout).toLowerCase();
  return RATE_LIMIT_PATTERNS.some((p) => combined.includes(p));
}
