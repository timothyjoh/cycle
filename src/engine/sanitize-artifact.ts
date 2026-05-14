const NARRATION_LINE = /^(Now|Next|Here is|Output)\b[^\n]*(?:\n|$)/;
const BLANK_LINE = /^[^\S\n]*\n/;
const OUTER_FENCE = /^```(?:\w+)?\n([\s\S]*)\n```\s*$/;

export function sanitizeArtifactStdout(stdout: string): string {
  let s = stdout.replace(/^\s+/, "");

  while (NARRATION_LINE.test(s)) {
    s = s.replace(NARRATION_LINE, "");
    while (BLANK_LINE.test(s)) s = s.replace(BLANK_LINE, "");
  }

  const fence = s.match(OUTER_FENCE);
  if (fence) s = fence[1];

  s = s.replace(/\s+$/, "");
  return s === "" ? "" : s + "\n";
}
