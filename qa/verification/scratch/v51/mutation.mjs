// VERIFIER #51 — independent mutation proof of the edits THIS round shipped (2f11ee1 -> c2a57ac), on MY corpus, with MY
// anchors on the CURRENT bytes. Each edit is reverted in the extracted source; a revert that changes no verdict is a NO-OP.
//   M1  legacy consumer: `!result.pendingAction &&` term (option 1)          -> revert = drop the term
//   M2  structured consumer: same term                                        -> revert = drop the term
//   M3  tail floor overlap: slice(4000 - 64)                                  -> revert = slice(4000)
//   M4  first-person anchor: `\x2d` and `\s(?:and|but)\s+`                    -> revert = the 2f11ee1 anchor class
//   M5a belt imminent-arm guard: `is that ok|okay` / bare `ok?|okay?`         -> revert = drop
//   M5b FUTURE-arm guard: same                                                -> revert = drop
//   M6  CONFIRMED arm first-person entity gate                                -> revert = drop the gate
import { readFileSync } from 'node:fs';
import { buildGate, extractConst } from '../../lib/belt_extract.mjs';
import { CAND_PATH, CAND_FUTURE, LIFECYCLE } from './harness.mjs';
import { CORPUS, NAMES } from './corpus.mjs';

const SRC = readFileSync(CAND_PATH, 'utf8');
const exprOf = (name) => { const d = extractConst(SRC, name); return d.slice(d.indexOf('=') + 1).replace(/;\s*$/, ''); };
const legacyExpr = exprOf('legacyProseFallback'), unaccExpr = exprOf('unaccountedCompletionProse'), futureExpr = exprOf('claimsFutureActionWithNoPlan');
const applyOnce = (text, from, to, name) => { const n = typeof from === 'string' ? text.split(from).length - 1 : (text.match(new RegExp(from.source, 'g')) || []).length; if (n !== 1) throw new Error(`anchor ${name} applies ${n} times (need exactly 1)`); return typeof from === 'string' ? text.split(from).join(to) : text.replace(from, to); };
const A = {
  M1_legacyTerm: ["&& !result.pendingAction && readsAsCompletion(String(result.summary || ''))", "&& readsAsCompletion(String(result.summary || ''))"],
  M3_floor: ["LEGACY_PAST_COMPLETION.test(String(s).slice(4000 - 64))", "LEGACY_PAST_COMPLETION.test(String(s).slice(4000))"],
  M4_anchor: ["[—–\\u003b\\x2d]\\s+|\\s(?:and|but)\\s+)(?:and |but |so |then )?(?:I|We|i|we)", "[—–\\u003b]\\s+)(?:and |but |so |then )?(?:I|We|i|we)"],
  M5a_beltGuard: ["|\\bsay so\\b|\\bis that (?:ok|okay)\\b|\\b(?:ok|okay)\\?/i.test(String(s))", "|\\bsay so\\b/i.test(String(s))"],
  M5b_futureGuard: ["|\\bsay so\\b|\\bis that (?:ok|okay)\\b|\\b(?:ok|okay)\\?/i.test(__s)", "|\\bsay so\\b/i.test(__s)"],
  M6_confirmedGate: [/ && !\(\(__m\) => __m !== null && __m\[1\] !== undefined && !knownEntityNames\.has\(String\(__m\[1\]\)\.replace\(\/\['’\]s\$\/, ''\)\.trim\(\)\.toLowerCase\(\)\)\)\(String\(s\)\.match\(\/\^\\s\*\[Cc\]onfirmed[^\n]*?\)\)\) && !completionIsNegated/, ' && !completionIsNegated'],
};
const mk = (legacy, future) => {
  const lf = new Function('readsAsCompletion', 'result', 'hasSupportedMutationClaim', 'model', 'groundedOutcomeThisTurn', 'claimsFutureActionWithNoPlan', 'return (' + legacy + ');');
  const ff = new Function('FUTURE_PROMISE_PATTERN', 'model', 'result', 'groundedOutcomeThisTurn', 'return (' + future + ');');
  return (gate, r) => {
    if (!r.pa && LIFECYCLE(r.text)) return 'LIFECYCLE';
    const res = { summary: r.text, pendingAction: r.pa ? { kind: 'confirm' } : null };
    if (ff(CAND_FUTURE, 'llm', res, false) === true) return 'FUTURE_PROMISE';
    return lf(gate.readsAsCompletion, res, false, 'llm', false, false) === true ? 'BELT' : null;
  };
};
const base = buildGate(CAND_PATH, (c) => c, NAMES);
const vBase = mk(legacyExpr, futureExpr);
const baseV = CORPUS.map((r) => vBase(base, r));
console.log('=== VERIFIER #51 mutation proof of this round\'s edits (corpus ' + CORPUS.length + ', pack populated) ===');
const report = (name, gate, vfn) => {
  const changed = [];
  CORPUS.forEach((r, i) => { const v = vfn(gate, r); if (v !== baseV[i]) changed.push({ r, to: v }); });
  const td = changed.filter((x) => x.r.label === 'T' && x.to !== null).length, fs = changed.filter((x) => x.r.label === 'F' && x.to === null).length;
  console.log(`  ${name.padEnd(18)} changed=${String(changed.length).padStart(3)} truthNowDestroyed=${String(td).padStart(3)} fabNowShipped=${String(fs).padStart(3)}  ${changed.length ? 'LOAD-BEARING' : '*** NO-OP on my corpus ***'}`);
  for (const x of changed.slice(0, 3)) console.log('       ' + x.r.label + ' -> ' + x.to + (x.r.pa ? ' [pendingAction]' : '') + '  ' + JSON.stringify(x.r.text.length > 120 ? '…' + x.r.text.slice(-100) : x.r.text));
};
report('M1 legacy term', base, mk(applyOnce(legacyExpr, ...A.M1_legacyTerm, 'M1'), futureExpr));
// M2: the structured consumer is evaluated on its own (the differential already showed it agrees with legacy on every row)
{
  const u0 = new Function('readsAsCompletion', 'result', 'hasSupportedMutationClaim', 'return (' + unaccExpr + ');');
  const u1 = new Function('readsAsCompletion', 'result', 'hasSupportedMutationClaim', 'return (' + applyOnce(unaccExpr, "&& !result.pendingAction && readsAsCompletion", "&& readsAsCompletion", 'M2') + ');');
  let changed = 0, td = 0; for (const r of CORPUS) { const res = { summary: r.text, pendingAction: r.pa ? { kind: 'confirm' } : null }; const a = u0(base.readsAsCompletion, res, false), b = u1(base.readsAsCompletion, res, false); if (a !== b) { changed++; if (r.label === 'T' && b) td++; } }
  console.log(`  ${'M2 structured term'.padEnd(18)} changed=${String(changed).padStart(3)} truthNowDestroyed=${String(td).padStart(3)}  ${changed ? 'LOAD-BEARING' : '*** NO-OP ***'}`);
}
for (const k of ['M3_floor', 'M4_anchor', 'M5a_beltGuard']) report(k, buildGate(CAND_PATH, (c) => applyOnce(c, ...A[k], k), NAMES), vBase);
report('M5b_futureGuard', base, mk(legacyExpr, applyOnce(futureExpr, ...A.M5b_futureGuard, 'M5b')));
// M6: splice out the CONFIRMED first-person entity gate by position (its regex source makes a regex anchor brittle).
report('M6_confirmedGate', buildGate(CAND_PATH, (c) => {
  const startMarker = '&& !((__m) => __m !== null && __m[1] !== undefined && !knownEntityNames.has(';
  const i = c.indexOf(startMarker); if (i < 0 || c.indexOf(startMarker, i + 1) >= 0) throw new Error('M6 start marker not unique');
  const j = c.indexOf(' && !completionIsNegated(String(s).slice(0,', i); if (j < 0) throw new Error('M6 end marker missing');
  return c.slice(0, i) + c.slice(j + 1);
}, NAMES), vBase);
// ---- Step 3: the five earlier-round fixes, each reverted independently (must re-open shapes on MY corpus) ----
console.log('\n=== Step 3 mutation proof of the five earlier fixes ===');
const B = {
  F1_nameInternal: ['const nameInternal = ((capLead && subjectRun)', 'const nameInternal = false && ((capLead && subjectRun)'],
  F2_titleHead: ['const titleHead = /^(?:Pending|Awaiting)$/.test(mm[0]) &&', 'const titleHead = false &&'],
  F3_ppInternal: ['const ppInternal = /\\b(?:with|without|since|despite', 'const ppInternal = false && /\\b(?:with|without|since|despite'],
  F4_idiomStrip: ["(?:\\s+at all)?\\s*[—–-]\\s*)+/i, '')", "(?:\\s+at all)?\\s*[—–-]\\s*)+/i, '$&')"],
  F5_rAuxGap: ["', 'gi'), '$1 ')", "', 'gi'), '$&')"],
};
for (const k of Object.keys(B)) report(k, buildGate(CAND_PATH, (c) => applyOnce(c, ...B[k], k), NAMES), vBase);
