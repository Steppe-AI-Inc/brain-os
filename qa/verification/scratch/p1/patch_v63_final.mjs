// VERIFIER #63 FINDINGS V63-D1 (remainder), V63-D5, V63-D7, V63-D8.
//
// V63-D1 — the count queries added for this are correct, but they do not make the finding go away on their
//   own: `env.truncated = env.total === null ? null : ...` leaves truncated NULL whenever a total is
//   unknown, so a collection that WAS trimmed still could not say so. The two facts are independent. Whether
//   rows were dropped is known for certain — the trim just dropped them — while the true total may not be.
//   So truncated becomes TRUE on any trim, and total stays null when it is genuinely unknown rather than
//   being invented from the surviving array length (the mistake made and reverted in campaign #122).
//
// V63-D5 — the post-trim byte assertion is unreachable FROM THE LOOP, because the pre-loop guard already
//   throws if TRIM_ORDER names a protected key. That is worth saying plainly in the code rather than leaving
//   a reader to assume the assertion is load-bearing where it is not. It is still reachable, and still
//   valuable, for a direct mutation of a protected key from anywhere else in the block — which is the edit
//   it actually defends against — and that reachability is now demonstrated by test rather than asserted.
import { readFileSync, writeFileSync } from 'node:fs';
const p = process.argv[2] || 'supabase/functions/sem-ai-command/index.ts';
let s = readFileSync(p, 'utf8').replace(/\r\n/g, '\n');
let n = 0;
function must(a, b, label) { const c = s.split(a).length - 1; if (c !== 1) throw new Error(label + ': found ' + c); s = s.replace(a, () => b); n++; }

// ---- D1: a trim is a fact; the total may not be. Report each on its own evidence.
must(`    const env = collectionsRecord[key];
    // A collection whose count was never exact (total: null) still must not read as "there are none":
    // what we know for certain is that at least this many rows existed before the trim (V62-D4).
    if (env) {
      env.shown = keep;
      env.truncated = env.total === null ? null : env.total > keep;
    }`,
`    const env = collectionsRecord[key];
    // Two independent facts. That rows were dropped is CERTAIN — this loop just dropped them — so truncated
    // is true whatever the total is. The total itself may be genuinely unknown, and it stays null rather than
    // being invented from the surviving array length (verifier #63, V63-D1; the invented-total mistake was
    // made and reverted in campaign #122).
    if (env) {
      env.shown = keep;
      env.truncated = env.total === null ? true : env.total > keep;
    }`, 'pass1 truncated');

must(`      const envHard = collectionsRecord[key];
      if (envHard) {
        envHard.shown = thisFloor;
        envHard.truncated = envHard.total === null ? null : envHard.total > thisFloor;
      }`,
`      const envHard = collectionsRecord[key];
      if (envHard) {
        envHard.shown = thisFloor;
        envHard.truncated = envHard.total === null ? true : envHard.total > thisFloor;
      }`, 'pass2 truncated');

// ---- D5: say what the assertion does and does not cover.
must(`  // The guarantee is asserted, not assumed: if any protected key changed, the trim loop is wrong and the
  // turn must fail loudly here rather than answer from a pack whose safe minimum was quietly cut.`,
`  // The guarantee is asserted, not assumed: if any protected key changed, the turn fails loudly here rather
  // than answering from a pack whose safe minimum was quietly cut.
  // SCOPE, stated honestly (verifier #63, V63-D5): this cannot fire for the TRIM LOOP, because the guard
  // above already throws if TRIM_ORDER names a protected key and the loop writes no other key. It is
  // reachable — and is the only thing that would catch — a DIRECT mutation of a protected key from anywhere
  // else in this block, which is the edit it defends against. Its reachability is demonstrated by test
  // (architecture_context_budget_contract.mjs), not assumed from its presence.`, 'assertion scope');

const out = s.replace(/\n/g, '\r\n');
if ((out.match(/(^|[^\r])\n/g) || []).length) throw new Error('bare LF');
writeFileSync(p, out); console.log('applied', n);
