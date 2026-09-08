// The #65 closure gave three concepts ONE body and left the second name as a reference to it
// (V65-D3a/D3b). Suites that slice a window by naming statements therefore have to pull the SURVIVOR
// alongside the alias, or the composed window evaluates `const LEGACY_PAST_COMPLETION =
// PAST_COMPLETION_CLAIM_PATTERN;` with nothing to point at.
//
// These suites each carry a PRIVATE stripTS instead of the shared extractor, which is why the shared
// constant list cannot reach them (that re-implementation is itself registered debt, V65-D7). This teaches
// them, mechanically and idempotently: insert the survivor's statement immediately before the alias's, and
// never twice.
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';

const PAIRS = [
  ['LEGACY_PAST_COMPLETION', 'PAST_COMPLETION_CLAIM_PATTERN'],
  ['COMPLETION_PARTICIPLE', 'COMPLETION_WORD'],
  ['FUTURE_PROMISE_IN_QUESTION', 'FUTURE_PROMISE_PATTERN'],
];
const dir = 'qa/scenarios-runner';
let touched = 0;
for (const f of readdirSync(dir).filter((x) => x.endsWith('.mjs'))) {
  const p = dir + '/' + f;
  const before = readFileSync(p, 'utf8');
  let s = before.replace(/\r\n/g, '\n');
  for (const [alias, target, fn] of PAIRS.flatMap(([a, t]) => [[a, t, 'stmt'], [a, t, 'statementAt']])) {
    const aliasStmt = fn + "(src, 'const " + alias + " =')";
    const targetStmt = fn + "(src, 'const " + target + " =')";
    // Per COMPOSITION, not per file: several of these suites build more than one window from the same
    // source, and the survivor already being named in a DIFFERENT window says nothing about this one.
    // A file-wide check skipped every real insertion and left the suites red.
    for (let at = s.indexOf(aliasStmt); at >= 0; at = s.indexOf(aliasStmt, at + 1)) {
      const open = s.lastIndexOf('[', at);
      const close = s.indexOf(']', at);
      if (open < 0 || close < 0) continue;
      if (s.slice(open, close).includes(targetStmt)) continue;   // already in THIS window
      s = s.slice(0, at) + targetStmt + ', ' + s.slice(at);
      at += targetStmt.length + 2;
    }
  }
  if (s !== before.replace(/\r\n/g, '\n')) {
    writeFileSync(p, s.replace(/\n/g, '\r\n'));
    touched++;
    console.log('taught: ' + f);
  }
}
console.log(touched + ' suite(s) taught the surviving declaration');
