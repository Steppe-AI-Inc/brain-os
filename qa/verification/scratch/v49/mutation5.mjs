// VERIFIER #49 — independent mutation test of the FIVE shipped fixes (2b04857). Each fix is reverted
// in the extracted source and the verdict change is measured on MY corpus. A revert that changes
// no verdict is reported as NO-OP; a load-bearing fix must re-open its own shapes.
import { readFileSync } from 'node:fs';
import { buildGate, extractConst } from '../../lib/belt_extract.mjs';
import { CAND_PATH, CAND_FUTURE, CAND_FUTURE_GUARD } from './harness.mjs';
import { CORPUS } from './corpus.mjs';

const SRC = readFileSync(CAND_PATH, 'utf8');
const NAMES = [...new Set(CORPUS.flatMap((r) => r.names || []))];

// ---- D1 rescue: remove the lowercase <prep> <quantifier> <noun-s> alternative ----
const D1_ANCHOR = "|(?:[a-z][a-z'’-]*\\s+){1,8}?\\b(?:at|of|to|for|in|on|by|with|among|across)\\s+(?:all|any|these|those|each|every|some|many|few|several|both|them)\\s+(?!(?:as|its|his|this|us|thus|plus|less|yes|hers|ours|yours|theirs|always|perhaps|sometimes|unless|whereas|besides|various|previous|obvious|serious|numerous|instead|indeed|ahead|else|ok)\\b)[a-z]{3,}(?:s|es)\\b(?=\\s+\\S)";
// ---- D2 prefix: make the executing/processing arms unconditional again ----
const D2_A = "'(?:^|\\\\b(?:i(?:\\x27|\\u2019)?m |i am |we(?:\\x27|\\u2019)?re |we are )(?:now |currently |just )?)executing (?:the )?(?:plan|request|action|changes?)' +";
const D2_A_OLD = "'executing (?:the )?(?:plan|request|action|changes?)' +";
const D2_B = "'|(?:^|\\\\b(?:i(?:\\x27|\\u2019)?m |i am |we(?:\\x27|\\u2019)?re |we are )(?:now |currently |just )?)processing (?:the |your )?(?:plan|request|action|changes?)' +";
const D2_B_OLD = "'|processing (?:the |your )?(?:plan|request|action|changes?)' +";
// ---- D3 entity gate: accept ANY capitalised object again ----
const D3_ANCHOR = "(__f[1] === undefined || knownEntityNames.has(String(__f[1]).replace(/['’]s$/, '').trim().toLowerCase()))";
// ---- D5 cap ----
const D5_ANCHOR = ')(String(s).slice(0, 4000));';

const MUTANTS = [
  ['D1 gerund-subject rescue', (s) => s.split(D1_ANCHOR).join('')],
  ['D2 executing/processing prefix', (s) => s.split(D2_A).join(D2_A_OLD).split(D2_B).join(D2_B_OLD)],
  ['D3 first-person entity gate', (s) => s.split(D3_ANCHOR).join('true')],
  ['D5 4000-char cap', (s) => s.split(D5_ANCHOR).join(')(String(s));')],
];

function verdicts(gate, names) {
  return CORPUS.filter((r) => !r.pa || true).map((r) => gate.readsAsCompletion(r.text));
}
const base = buildGate(CAND_PATH, (c) => c, NAMES);
const baseV = verdicts(base);
console.log('=== VERIFIER #49 five-fix mutation proof (corpus ' + CORPUS.length + ', pack populated with every corpus name) ===');
for (const [name, mut] of MUTANTS) {
  const g = buildGate(CAND_PATH, (c) => { const m = mut(c); if (m === c) throw new Error('anchor did not apply: ' + name); return m; }, NAMES);
  const v = verdicts(g);
  const changed = [];
  for (let i = 0; i < CORPUS.length; i++) if (v[i] !== baseV[i]) changed.push({ r: CORPUS[i], to: v[i] });
  const truthDestroyed = changed.filter((x) => x.r.label === 'T' && x.to === true).length;
  const fabShipped = changed.filter((x) => x.r.label === 'F' && x.to === false).length;
  console.log(`  ${name.padEnd(34)} changed=${String(changed.length).padStart(3)} truthNowDestroyed=${truthDestroyed} fabNowShipped=${fabShipped}  ${changed.length ? 'LOAD-BEARING' : '*** NO-OP on my corpus ***'}`);
  for (const x of changed.slice(0, 4)) console.log('       ' + x.r.label + ' -> ' + x.to + '  ' + JSON.stringify(x.r.text));
}
// ---- D4: the FUTURE consumer guard — evaluate the shipped IIFE with the guard made vacuous ----
{
  const stmt = extractConst(SRC, 'claimsFutureActionWithNoPlan');
  const guardSrc = CAND_FUTURE_GUARD.source;
  const withGuard = (s) => CAND_FUTURE.test(s) && !CAND_FUTURE_GUARD.test(s);
  const noGuard = (s) => CAND_FUTURE.test(s);
  const changed = CORPUS.filter((r) => !r.pa && withGuard(r.text) !== noGuard(r.text));
  const truthDestroyed = changed.filter((r) => r.label === 'T').length;
  const fabShipped = changed.filter((r) => r.label === 'F').length; // (a fabrication the guard stands down on)
  console.log(`  ${'D4 FUTURE conditioned-offer guard'.padEnd(34)} changed=${String(changed.length).padStart(3)} truthNowDestroyed=${truthDestroyed} fabNowStoodDown=${fabShipped}  ${changed.length ? 'LOAD-BEARING' : '*** NO-OP ***'}   (guard present in shipped statement: ${stmt.includes(guardSrc)})`);
  for (const r of changed.slice(0, 4)) console.log('       ' + r.label + '  ' + JSON.stringify(r.text));
}
// ---- D5 timing: 16 KB unsplittable clause with skipped negators, with and without the cap ----
{
  const clause = ('No Limits Inc and Nothing Bundt Cakes and Never Summer Industries with no open tasks ').repeat(180) + 'was archived';
  console.log('  D5 timing input length = ' + clause.length);
  const noCap = buildGate(CAND_PATH, (c) => c.split(D5_ANCHOR).join(')(String(s));'), NAMES);
  for (const [label, g] of [['capped (shipped)', base], ['uncapped (reverted)', noCap]]) {
    const t0 = process.hrtime.bigint(); const v = g.readsAsCompletion(clause); const ms = Number(process.hrtime.bigint() - t0) / 1e6;
    console.log(`    ${label.padEnd(22)} ${ms.toFixed(1)} ms  verdict=${v}`);
  }
  // growth exponent under the cap: 500,1000,2000,4000 chars
  const times = [];
  for (const n of [500, 1000, 2000, 4000]) {
    const s = ('No Limits Inc with no open tasks ').repeat(Math.ceil(n / 34)).slice(0, n - 12) + 'was archived';
    const t0 = process.hrtime.bigint(); base.readsAsCompletion(s); times.push([n, Number(process.hrtime.bigint() - t0) / 1e6]);
  }
  const e = Math.log(times[3][1] / times[1][1]) / Math.log(4);
  console.log('    growth under cap: ' + times.map(([n, t]) => n + 'ch=' + t.toFixed(1) + 'ms').join(', ') + '  exponent(1000->4000)=' + e.toFixed(2));
}
