export type WorkflowValidation =
  | { ok: true; name: string }
  | { ok: false; message: string };

/** The default workflow used when `--workflow` is absent. Single source of
 *  truth — also referenced by parse-args.ts so the literal lives in one place. */
export const DEFAULT_WORKFLOW = "feature";

/**
 * Validate a resolved `--workflow` value against the available workflow names.
 * `undefined` (flag absent) ⇒ resolves the `DEFAULT_WORKFLOW` constant and
 * validates it against `available` (accepted only when the configured set
 * includes it, otherwise rejected with the same `unknown workflow "feature"`
 * diagnostic as an explicit unknown name). "" (flag present, no value) ⇒
 * rejected. An unknown explicit name ⇒ rejected. A known name ⇒ accepted.
 * Pure; never throws for any string/empty/undefined input. `prefix` is the
 * command label embedded in the diagnostic (e.g. "doctor", "run"), so both
 * call sites share one message body and cannot drift.
 */
export function validateWorkflowName(
  workflow: string | undefined,
  available: string[],
  prefix: string,
): WorkflowValidation {
  const availableList = available.join(", ");
  // "" (flag present, no value) is the value-less signal — reject before the
  // membership check so its distinct message is preserved.
  if (workflow === "") {
    return {
      ok: false,
      message: `${prefix}: --workflow requires a value — available workflows: ${availableList}`,
    };
  }
  // undefined (flag absent) resolves the default, then falls through to the
  // shared membership check so the accept/reject paths and the unknown-name
  // message are produced by one code path and cannot drift in shape.
  const resolved = workflow ?? DEFAULT_WORKFLOW;
  if (!available.includes(resolved)) {
    return {
      ok: false,
      message: `${prefix}: unknown workflow "${resolved}" — available workflows: ${availableList}`,
    };
  }
  return { ok: true, name: resolved };
}
