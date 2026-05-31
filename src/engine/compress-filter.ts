// Pure, deterministic core for the opt-in command-output compression path.
// No I/O: every export is a string/object transform so the whole module is
// unit-testable and trivially fail-safe. The CLI handlers
// (src/cli/compress-output.ts, src/cli/compress-output-hook.ts) and the
// run-cycle settings materialization wrap thin I/O around these functions.
//
// See docs/ENGINE.md → "Command-output compression (opt-in)" for the contract.

/** Default byte threshold: stdout at or below this passes through verbatim. */
export const DEFAULT_THRESHOLD_BYTES = 4000;
/** Default number of leading lines retained when compressing. */
export const DEFAULT_HEAD_LINES = 40;
/** Default number of trailing lines retained when compressing. */
export const DEFAULT_TAIL_LINES = 20;

// Read-oriented binaries safe to wrap: they never mutate state, so wrapping
// them through `cycle compress-output` only filters stdout.
export const ALLOWLIST = new Set([
  "git",
  "ls",
  "cat",
  "grep",
  "rg",
  "diff",
  "head",
  "tail",
  "wc",
  "tree",
  "stat",
]);

// Any shell operator / metacharacter ⇒ the command is composed (pipe, redirect,
// subshell, multiple commands, …) and is NOT safely rewritable. Conservative by
// design: anything ambiguous passes through unmodified.
export const DENY_PATTERN = /[|&;<>$`(){}\n\r]/;

// Lines matching this are diagnostics that MUST survive compression — error
// visibility is preserved even at maximum density reduction.
export const ERROR_LINE_PATTERN =
  /\b(error|fatal|fail(ed|ure)?|denied|cannot|no such|warning)\b/i;

export type CompressOpts = {
  thresholdBytes?: number;
  headLines?: number;
  tailLines?: number;
};

export type CompressResult = { text: string; compressed: boolean };

/**
 * Density-reduce `stdout`. Verbatim passthrough when at/below the byte
 * threshold, or when there is no line-elidable middle (head+tail covers every
 * line). Otherwise: keep `headLines` leading + `tailLines` trailing lines,
 * retain every error-pattern line from the middle (original order), and elide
 * the dense remainder behind a single `[… N lines/B bytes elided …]` marker.
 * Deterministic and never drops stderr (callers pass stderr through verbatim)
 * or middle error lines.
 */
export function compressOutput(stdout: string, opts: CompressOpts = {}): CompressResult {
  const thresholdBytes = opts.thresholdBytes ?? DEFAULT_THRESHOLD_BYTES;
  const headLines = opts.headLines ?? DEFAULT_HEAD_LINES;
  const tailLines = opts.tailLines ?? DEFAULT_TAIL_LINES;

  if (Buffer.byteLength(stdout, "utf8") <= thresholdBytes) {
    return { text: stdout, compressed: false };
  }

  const lines = stdout.split("\n");
  // No line-elidable middle: a few very long lines can exceed the byte
  // threshold without enough lines to elide. Documented passthrough edge.
  if (lines.length <= headLines + tailLines) {
    return { text: stdout, compressed: false };
  }

  const head = lines.slice(0, headLines);
  const tail = lines.slice(lines.length - tailLines);
  const middle = lines.slice(headLines, lines.length - tailLines);
  const retained = middle.filter((l) => ERROR_LINE_PATTERN.test(l));
  const elided = middle.filter((l) => !ERROR_LINE_PATTERN.test(l));
  const elidedBytes = Buffer.byteLength(elided.join("\n"), "utf8");
  const marker = `[… ${elided.length} lines/${elidedBytes} bytes elided …]`;

  const text = [...head, marker, ...retained, ...tail].join("\n");
  return { text, compressed: true };
}

export type ClassifyResult = { rewrite: boolean };

/**
 * Decide whether a Bash command is a simple, operator-free read command that
 * may be transparently rewritten through `cycle compress-output`. Rejects
 * (rewrite:false) empty input, any shell metacharacter, and any first token not
 * in the read-only ALLOWLIST.
 */
export function classifyCommand(command: string): ClassifyResult {
  const c = command.trim();
  if (c.length === 0) return { rewrite: false };
  if (DENY_PATTERN.test(c)) return { rewrite: false };
  const first = c.split(/\s+/)[0];
  if (!ALLOWLIST.has(first)) return { rewrite: false };
  return { rewrite: true };
}

// Double-quote a path for embedding in a command string. Used for the
// interpreter / CLI absolute paths only — never for the wrapped command, which
// is already operator-free per classifyCommand.
function q(s: string): string {
  return `"${s}"`;
}

export type RewriteCtx = { execPath: string; cliPath: string; command: string };

/**
 * Build the rewritten command string that runs `command` through
 * `cycle compress-output`, using absolute interpreter + CLI paths so `cycle` is
 * always resolvable (guaranteeing the hook can never break a step by failing to
 * find the binary).
 */
export function buildRewriteCommand({ execPath, cliPath, command }: RewriteCtx): string {
  return `${q(execPath)} ${q(cliPath)} compress-output -- ${command.trim()}`;
}

export type HookCtx = { execPath: string; cliPath: string };

/**
 * Build the claude `--settings` object that registers the PreToolUse Bash hook
 * pointing at `cycle compress-output-hook` (absolute paths).
 */
export function buildCompressHookSettings({ execPath, cliPath }: HookCtx): object {
  return {
    hooks: {
      PreToolUse: [
        {
          matcher: "Bash",
          hooks: [
            {
              type: "command",
              command: `${q(execPath)} ${q(cliPath)} compress-output-hook`,
            },
          ],
        },
      ],
    },
  };
}
