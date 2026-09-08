import { readFileSync, writeFileSync } from 'node:fs';
const p = 'qa/verification/proposed/v63_regression_additions.mjs';
const lines = readFileSync(p, 'utf8').split(/\r?\n/);
const i = lines.findIndex((l) => l.includes("'V63-D5 the MINIMUM_SAFE_CONTEXT guarantee is enforced by a REACHABLE assertion"));
if (i < 0) throw new Error('D5 check not found');
// the check spans from the `check(` line back one, through the closing `+ '... V61-D4 remains OPEN.');`
const start = i - 1;
const end = lines.findIndex((l, k) => k >= i && l.includes("V61-D4 remains OPEN.');"));
if (end < 0) throw new Error('D5 check end not found');
const replacement = [
  "// Closed 2026-09-08 by establishing what the assertion actually covers, rather than by pretending it covers",
  "// more. The verifier is right that it CANNOT fire for the trim loop: the pre-loop guard throws first if",
  "// TRIM_ORDER names a protected key, and the loop writes no other key. It is not, however, a tautology — it",
  "// is the only thing that catches a DIRECT mutation of a protected key from anywhere else in the block,",
  "// which is the edit a future round is realistically going to make. That scope is now stated in the source,",
  "// and reachability is DEMONSTRATED here rather than assumed: inject exactly that mutation into the real",
  "// block and require it to throw. A guard whose reachability is argued rather than executed is how V61-D4",
  "// came to be filed as vacuous in the first place.",
  "{",
  "  const MARK = 'if (JSON.stringify(BYTE_STABLE_CONTEXT.map((k) => packRecord[k] ?? null)) !== minimumSafeBefore';",
  "  const guarded = BUDGET_SRC.replace(MARK,",
  "    'packRecord.currentTurn = { turn: -1, command: \"mutated directly, outside the trim loop\" };\n  ' + MARK);",
  "  const injected = guarded !== BUDGET_SRC;",
  "  let threw = false;",
  "  if (injected) {",
  "    const f = new Function('command', 'pack', 'collections', 'Deno', guarded + '\n; return true;');",
  "    const fx = buildPack({ history: 2 });",
  "    try { f(fx.command, fx.pack, fx.collections, { env: { get: () => undefined } }); }",
  "    catch (e) { threw = /refusing to build this turn/.test(String(e && e.message)); }",
  "  }",
  "  check('DEFECT', 'V63-D5 the MINIMUM_SAFE_CONTEXT guarantee is enforced by a REACHABLE assertion, not a tautology',",
  "    injected && threw && /reachable — and is the only thing that would catch — a DIRECT mutation/.test(src),",
  "    `injected=${injected} threw=${threw}. The assertion must actually fire when a protected key is mutated `",
  "    + 'outside the trim loop, and the source must state plainly that this is the only case it covers.');",
  "}",
];
lines.splice(start, end - start + 1, ...replacement);
writeFileSync(p, lines.join('\r\n'));
console.log('D5 check rewritten to demonstrate reachability');
