export type WorkflowValidation =
  | { ok: true; name: string }
  | { ok: false; message: string };

/**
 * Validate a resolved `--workflow` value against the available workflow names.
 * `undefined` (flag absent) ⇒ default "feature" (never rejected). "" (flag
 * present, no value) ⇒ rejected. An unknown explicit name ⇒ rejected. A known
 * name ⇒ accepted. Pure; never throws for any string/empty/undefined input.
 * `prefix` is the command label embedded in the diagnostic (e.g. "doctor",
 * "run"), so both call sites share one message body and cannot drift.
 */
export function validateWorkflowName(
  workflow: string | undefined,
  available: string[],
  prefix: string,
): WorkflowValidation {
  const availableList = available.join(", ");
  if (workflow === undefined) return { ok: true, name: "feature" };
  if (workflow === "") {
    return {
      ok: false,
      message: `${prefix}: --workflow requires a value — available workflows: ${availableList}`,
    };
  }
  if (!available.includes(workflow)) {
    return {
      ok: false,
      message: `${prefix}: unknown workflow "${workflow}" — available workflows: ${availableList}`,
    };
  }
  return { ok: true, name: workflow };
}
