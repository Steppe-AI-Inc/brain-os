// VERIFIER #51 — targeted witnesses for the mutants my corpus did not exercise (F3 ppInternal, F4 idiom strip,
// F5 R-AUXGAP, M5b FUTURE-arm guard). A mutant is LOAD-BEARING if at least one witness verdict flips.
import { readFileSync } from 'node:fs';
import { buildGate, extractConst } from '../../lib/belt_extract.mjs';
import { CAND_PATH, CAND_FUTURE } from './harness.mjs';
const SRC = readFileSync(CAND_PATH, 'utf8');
const once = (t, from, to, n) => { const k = t.split(from).length - 1; if (k !== 1) throw new Error(n + ' applies ' + k + ' times'); return t.split(from).join(to); };
const NM = ['Erdenet Copper Works', 'Khovd Solar Park'];
const base = buildGate(CAND_PATH, (c) => c, NM);
const W = {
  F3_ppInternal: [['const ppInternal = /\\b(?:with|without|since|despite', 'const ppInternal = false && /\\b(?:with|without|since|despite'],
    ['The company with no active tasks was archived.', 'Despite no approvals Erdenet Copper Works was archived.', 'Since no one objected the task was deleted.', 'After no reply from you Khovd Solar Park was archived.']],
  F4_idiomStrip: [["(?:\\s+at all)?\\s*[—–-]\\s*)+/i, '')", "(?:\\s+at all)?\\s*[—–-]\\s*)+/i, '$&')"],
    ['No problem — Erdenet Copper Works was archived.', 'No worries — the task was deleted.', 'Not to worry — Khovd Solar Park has been archived.', 'No problem at all — Erdenet Copper Works was archived.']],
  F5_rAuxGap: [["', 'gi'), '$1 ')", "', 'gi'), '$&')"],
    ['Erdenet Copper Works was, in the end, archived.', 'The task was, as requested, deleted.', 'Khovd Solar Park has been, as you asked, archived.', 'Erdenet Copper Works was — per your instruction — archived.']],
};
for (const [name, [[from, to], rows]] of Object.entries(W)) {
  const g = buildGate(CAND_PATH, (c) => once(c, from, to, name), NM);
  const flips = rows.filter((s) => base.readsAsCompletion(s) !== g.readsAsCompletion(s));
  console.log(name.padEnd(16) + (flips.length ? 'LOAD-BEARING' : '*** NO-OP ***') + '  base=' + rows.map((s) => +base.readsAsCompletion(s)).join('') + ' mutant=' + rows.map((s) => +g.readsAsCompletion(s)).join('') + '  flipped: ' + flips.map((s) => JSON.stringify(s)).join(' '));
}
// M5b: the FUTURE-arm guard
const fx = (() => { const d = extractConst(SRC, 'claimsFutureActionWithNoPlan'); return d.slice(d.indexOf('=') + 1).replace(/;\s*$/, ''); })();
const mk = (e) => { const f = new Function('FUTURE_PROMISE_PATTERN', 'model', 'result', 'groundedOutcomeThisTurn', 'return (' + e + ');'); return (s) => f(CAND_FUTURE, 'llm', { summary: s, pendingAction: null }, false) === true; };
const f0 = mk(fx), f1 = mk(once(fx, "|\\bsay so\\b|\\bis that (?:ok|okay)\\b|\\b(?:ok|okay)\\?/i.test(__s)", "|\\bsay so\\b/i.test(__s)", 'M5b'));
const rows = ['I’ll archive Erdenet Copper Works — is that ok?', 'I’ll archive Erdenet Copper Works — okay?', 'I will archive Erdenet Copper Works. Ok?'];
console.log('M5b_futureGuard '.padEnd(16) + (rows.some((s) => f0(s) !== f1(s)) ? 'LOAD-BEARING' : '*** NO-OP ***') + '  shipped=' + rows.map((s) => +f0(s)).join('') + ' mutant=' + rows.map((s) => +f1(s)).join(''));
