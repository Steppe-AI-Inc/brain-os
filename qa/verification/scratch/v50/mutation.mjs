// VERIFIER #50 — independent mutation proof of the SEVEN components this round shipped, on MY corpus,
// with MY anchors on the CURRENT bytes (no anchor inherited from #49's tool, which no longer applies).
// Each component is reverted in the extracted source; a revert that changes no verdict is a NO-OP.
// D1 and D6 live at the CONSUMER, so those mutants are evaluated through the shipped consumer
// expression (legacyProseFallback), not through readsAsCompletion alone.
import { readFileSync } from 'node:fs';
import { buildGate, extractConst } from '../../lib/belt_extract.mjs';
import { CAND_PATH } from './harness.mjs';
import { CORPUS } from './corpus.mjs';

const SRC = readFileSync(CAND_PATH, 'utf8');
const NAMES = [...new Set(CORPUS.flatMap((r) => r.names || []))];
const legacyDecl = extractConst(SRC, 'legacyProseFallback');
const legacyExpr = legacyDecl.slice(legacyDecl.indexOf('=') + 1).replace(/;\s*$/, '');

// anchors (must apply exactly once each, or the proof is vacuous)
const A = {
  D1_strip: [/readsAsCompletion\(result\.pendingAction \? String\(result\.summary \|\| ''\)\.replace\(\/(?:[^\/\\\n]|\\.)+\/g, ' '\) : String\(result\.summary \|\| ''\)\)/, "readsAsCompletion(String(result.summary || ''))"],
  D2_tailFloor: [" || (String(s).length > 4000 && LEGACY_PAST_COMPLETION.test(String(s).slice(4000)));", ';'],
  D3_cursorAdvance: [/ if \(nameInternal\) \{ const __hit = [^\n]*?if \(__hit\) \{ scan\.lastIndex = mm\.index \+ mm\[0\]\.length \+ __hit; continue; \} \}/, ''],
  D4_lowercaseRun: [" || ((__l) => __l !== null && knownEntityNames.has((mm[0] + __l[0]).replace(/\\s+$/, '').replace(/['’]s$/, '').toLowerCase()))(/^(?:\\s+[a-z][\\w&.'’-]*){1,6}?(?=\\s+(?:was|were|has|have|had|is|are)\\b)/.exec(after))", ''],
  D5D6_vocab: ["|pending|before|until|only with|but first|first)\\b[^.]{0,40}?\\byou(?:r|rs)?\\b|\\byou(?:r|rs)?\\b[^.]{0,40}?\\b(?:confirmation|approval|go-ahead|permission|sign-off|say-so|consent|okay|ok)\\b|\\b(?:just )?say (?:yes|the word|go|ok)\\b|\\bsay so\\b/i.test(String(s))", "|pending)\\b[^.]{0,40}?\\byou(?:r|rs)?\\b/i.test(String(s))"],
  D6_wholeSummary: ["|\\bsay so\\b/i.test(String(s)) && !/^\\s*(?:(?:now|currently|just|also|then)", "|\\bsay so\\b/i.test(c) && !/^\\s*(?:(?:now|currently|just|also|then)"],
  D7_anchor: ["(?:^|\\b[Cc]onfirmed\\s*[—–-]\\s*|[—–\\u003b]\\s+)(?:and |but |so |then )?(?:I|We|i|we)", "(?:^|\\b[Cc]onfirmed\\s*[—–-]\\s*)(?:and |but |so |then )?(?:I|We|i|we)"],
};
const applyOnce = (text, [from, to], name) => {
  const n = typeof from === 'string' ? text.split(from).length - 1 : (text.match(new RegExp(from.source, 'g')) || []).length;
  if (n !== 1) throw new Error(`anchor ${name} applies ${n} times (need exactly 1)`);
  return typeof from === 'string' ? text.split(from).join(to) : text.replace(from, to);
};

// belt-level mutants (D2, D3, D4, D5/D6 vocab, D6 whole-summary, D7) go through buildGate's mutate hook;
// the consumer-level mutant (D1) rewrites the legacyProseFallback expression.
function verdicts(gate, legacy = legacyExpr) {
  const fn = new Function('readsAsCompletion', 'result', 'hasSupportedMutationClaim', 'model', 'groundedOutcomeThisTurn', 'claimsFutureActionWithNoPlan', 'return (' + legacy + ');');
  return CORPUS.map((r) => fn(gate.readsAsCompletion, { summary: r.text, pendingAction: r.pa ? { kind: 'confirm' } : null }, false, 'llm', false, false) === true);
}
const base = buildGate(CAND_PATH, (c) => c, NAMES);
const baseV = verdicts(base);
console.log('=== VERIFIER #50 seven-component mutation proof (corpus ' + CORPUS.length + ', pack populated with every corpus name) ===');
const report = (name, v) => {
  const changed = [];
  for (let i = 0; i < CORPUS.length; i++) if (v[i] !== baseV[i]) changed.push({ r: CORPUS[i], to: v[i] });
  const truthDestroyed = changed.filter((x) => x.r.label === 'T' && x.to === true).length;
  const fabShipped = changed.filter((x) => x.r.label === 'F' && x.to === false).length;
  console.log(`  ${name.padEnd(20)} changed=${String(changed.length).padStart(3)} truthNowDestroyed=${truthDestroyed} fabNowShipped=${fabShipped}  ${changed.length ? 'LOAD-BEARING' : '*** NO-OP on my corpus ***'}`);
  for (const x of changed.slice(0, process.env.V50_ALL ? 40 : 3)) console.log('       ' + x.r.label + ' -> ' + x.to + '  ' + JSON.stringify(x.r.text.length > 140 ? '…' + x.r.text.slice(-100) : x.r.text));
};
report('D1 history strip', verdicts(base, applyOnce(legacyExpr, A.D1_strip, 'D1')));
for (const k of ['D2_tailFloor', 'D3_cursorAdvance', 'D4_lowercaseRun', 'D5D6_vocab', 'D6_wholeSummary', 'D7_anchor']) {
  const g = buildGate(CAND_PATH, (c) => applyOnce(c, A[k], k), NAMES);
  report(k, verdicts(g));
}
// D6 whole-summary guard also has a truth-side witness on the FUTURE consumer? No — the FUTURE consumer
// is a separate declaration; its vocabulary revert is measured by the harness' candFuture in the suite.
