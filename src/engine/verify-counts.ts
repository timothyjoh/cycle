// Degenerate-verification parser (no false greens). A pure, side-effect-free
// function that extracts {executed, skipped, total} from common test-runner
// summaries, returning null when no recognized summary line is present. Models
// the pure half of noop-marker.ts: module-level regex constants, never throws,
// discriminated (null-able) return type.
//
// executed = non-skipped tests that produced a pass/fail result (passed + failed).
// skipped  = skipped/ignored/todo tests.
// total    = the reporter's explicit total when present, else executed + skipped.

export type VerifyCounts = { executed: number; skipped: number; total: number };

// jest:   "Tests:       12 passed, 3 skipped, 15 total"  (also failed, todo)
const JEST_RE = /Tests:\s+(.+)$/m;
// vitest: "Tests  12 passed | 3 skipped (15)"  ("Test Files ..." line ignored)
const VITEST_RE = /\bTests\s+(\d+ (?:passed|failed|skipped|todo)(?:\s*\|\s*\d+ \w+)*)\s*\((\d+)\)/;
// pytest: "===== 12 passed, 3 skipped in 1.23s ====="
const PYTEST_RE = /=+\s*(.+?)\s+in\s+[\d.]+s\s*=+/;
// cargo:  "test result: ok. 12 passed; 0 failed; 3 ignored; 0 measured; 0 filtered out"
const CARGO_RE = /test result:\s*\w+\.\s*(\d+) passed;\s*(\d+) failed;\s*(\d+) ignored/;
// node:test: "# tests 15" / "# pass 12" / "# fail 0" / "# skip 3" / "# todo 0"
const NODE_TESTS_RE = /^# tests (\d+)/m;
const NODE_PASS_RE = /^# pass (\d+)/m;
const NODE_FAIL_RE = /^# fail (\d+)/m;
const NODE_SKIP_RE = /^# skip (\d+)/m;
const NODE_TODO_RE = /^# todo (\d+)/m;

export function parseVerifyCounts(output: string): VerifyCounts | null {
  if (typeof output !== "string" || output.length === 0) return null;

  // node:test first — multi-line, most specific markers.
  const ntTests = NODE_TESTS_RE.exec(output);
  if (ntTests) {
    const pass = num(NODE_PASS_RE, output);
    const fail = num(NODE_FAIL_RE, output);
    const skip = num(NODE_SKIP_RE, output);
    const todo = num(NODE_TODO_RE, output);
    const total = Number.parseInt(ntTests[1], 10);
    return { executed: pass + fail, skipped: skip + todo, total };
  }

  // cargo
  const cg = CARGO_RE.exec(output);
  if (cg) {
    const passed = Number.parseInt(cg[1], 10);
    const failed = Number.parseInt(cg[2], 10);
    const ignored = Number.parseInt(cg[3], 10);
    return { executed: passed + failed, skipped: ignored, total: passed + failed + ignored };
  }

  // jest / pytest: parse a "N word, N word, …" clause field-wise.
  const clauseStr = JEST_RE.exec(output)?.[1] ?? PYTEST_RE.exec(output)?.[1] ?? null;
  if (clauseStr) {
    const c = parseClause(clauseStr);
    if (c) return c;
  }

  // vitest: the trailing "(N)" is the explicit total.
  const vt = VITEST_RE.exec(output);
  if (vt) {
    const c = parseClause(vt[1]);
    if (c) return { executed: c.executed, skipped: c.skipped, total: Number.parseInt(vt[2], 10) };
  }

  return null;
}

// "12 passed, 3 skipped, 15 total" / "12 passed | 3 skipped" → counts.
function parseClause(s: string): VerifyCounts | null {
  let passed = 0;
  let failed = 0;
  let skipped = 0;
  let total: number | null = null;
  let saw = false;
  for (const m of s.matchAll(/(\d+)\s+(passed|failed|skipped|ignored|todo|total)/g)) {
    saw = true;
    const n = Number.parseInt(m[1], 10);
    switch (m[2]) {
      case "passed":
        passed = n;
        break;
      case "failed":
        failed = n;
        break;
      case "skipped":
      case "ignored":
      case "todo":
        skipped += n;
        break;
      case "total":
        total = n;
        break;
    }
  }
  if (!saw) return null;
  const executed = passed + failed;
  return { executed, skipped, total: total ?? executed + skipped };
}

const num = (re: RegExp, s: string): number => {
  const m = re.exec(s);
  return m ? Number.parseInt(m[1], 10) : 0;
};
