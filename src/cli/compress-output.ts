import { spawnSync } from "node:child_process";
import { buildChildEnv } from "../engine/child-env.ts";
import { compressOutput } from "../engine/compress-filter.ts";

export type CompressOutputResult = { stdout: string; stderr: string; exitCode: number };

const USAGE =
  "usage: cycle compress-output [--threshold-bytes N] [--head-lines N] [--tail-lines N] -- <cmd> [args...]\n";

type SpawnFn = typeof spawnSync;

// Parse a numeric flag value; non-finite/negative/NaN ⇒ undefined (fall back to
// the filter's documented default rather than throwing on malformed input).
function parseNum(v: string | undefined): number | undefined {
  if (v === undefined) return undefined;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : undefined;
}

/**
 * `cycle compress-output [flags] -- <cmd>...`: spawn <cmd> with array args (no
 * shell), density-filter its stdout when over threshold, pass stderr through
 * verbatim, and propagate the child's exit code. Never masks a child failure.
 *
 * Failure paths:
 *  - no command after `--` (or no `--`) → usage to stderr, exit 2, spawn nothing.
 *  - missing binary / spawn error → surface the error to stderr, exit 127.
 *  - child non-zero exit → propagate that exact code; child stderr + any
 *    error-pattern stdout lines are preserved (never dropped by the filter).
 */
export function runCompressOutput(argv: string[], spawnFn: SpawnFn = spawnSync): CompressOutputResult {
  let thresholdBytes: number | undefined;
  let headLines: number | undefined;
  let tailLines: number | undefined;

  let i = 0;
  for (; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--") {
      i++;
      break;
    }
    if (a === "--threshold-bytes") thresholdBytes = parseNum(argv[++i]);
    else if (a === "--head-lines") headLines = parseNum(argv[++i]);
    else if (a === "--tail-lines") tailLines = parseNum(argv[++i]);
    else {
      // Unknown token before `--`: treat as malformed usage rather than
      // silently spawning it as a command.
      return { stdout: "", stderr: USAGE, exitCode: 2 };
    }
  }

  const cmd = argv.slice(i);
  if (cmd.length === 0) {
    return { stdout: "", stderr: USAGE, exitCode: 2 };
  }

  const [bin, ...rest] = cmd;
  const res = spawnFn(bin, rest, {
    shell: false,
    encoding: "utf8",
    env: buildChildEnv({}),
    maxBuffer: 64 * 1024 * 1024,
  });

  if (res.error) {
    return { stdout: "", stderr: String(res.error.message) + "\n", exitCode: 127 };
  }

  const { text } = compressOutput(res.stdout ?? "", { thresholdBytes, headLines, tailLines });
  return { stdout: text, stderr: res.stderr ?? "", exitCode: res.status ?? 0 };
}
