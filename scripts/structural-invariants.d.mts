// Type surface for the structural-invariants dispatch loop, consumed by
// tests that drive the real module's containment branches in-process.
export interface Invariant {
  file: string;
  reason: string;
  pattern?: RegExp;
  expected?: number;
  validate?: (text: string, file: string) => { ok: boolean; actual?: string; message?: string };
}

export const INVARIANTS: Invariant[];

export function runInvariants(invariants: Invariant[], cwd: string): Promise<number>;
