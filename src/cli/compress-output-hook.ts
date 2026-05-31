import { classifyCommand, buildRewriteCommand } from "../engine/compress-filter.ts";

export type HookResult = { stdout: string; exitCode: number };

/**
 * `cycle compress-output-hook`: a claude PreToolUse hook. Reads a PreToolUse
 * JSON event (as a string), and when the Bash command is a simple, operator-free
 * read command, emits a `hookSpecificOutput.updatedInput.command` rewrite that
 * routes it through `cycle compress-output`. Everything else — malformed JSON,
 * missing command, non-allowlisted binary, shell metacharacters — produces no
 * rewrite.
 *
 * FAIL-OPEN: the exit code is ALWAYS 0 and any parse/classify error degrades to
 * empty stdout (original command runs unchanged). A hook bug must never block a
 * legitimate claudecode Bash call.
 */
export function runCompressOutputHook(
  stdinJson: string,
  ctx: { execPath: string; cliPath: string },
): HookResult {
  try {
    const evt = JSON.parse(stdinJson);
    const command = evt?.tool_input?.command;
    if (typeof command !== "string") return { stdout: "", exitCode: 0 };
    if (!classifyCommand(command).rewrite) return { stdout: "", exitCode: 0 };
    const updatedCommand = buildRewriteCommand({ ...ctx, command });
    return {
      stdout: JSON.stringify({
        hookSpecificOutput: {
          hookEventName: "PreToolUse",
          updatedInput: { command: updatedCommand },
        },
      }),
      exitCode: 0,
    };
  } catch {
    // Fail open: never block a tool call on a hook/parse error.
    return { stdout: "", exitCode: 0 };
  }
}
