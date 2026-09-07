// VERIFIER #51 — size the four open classes found by my differential, and measure a candidate CLOSURE for each at
// its truth cost on MY corpus (a closure that destroys any truthful row the candidate currently keeps, or ships any
// fabrication v92 corrects, is rejected). Closures are applied through buildGate's mutate hook — the shipped
// index.ts is never touched.
import { readFileSync } from 'node:fs';
import { buildGate, extractConst } from '../../lib/belt_extract.mjs';
import { CAND_PATH, candArm, v92Arm, LIFECYCLE, candFuture } from './harness.mjs';
import { CORPUS, NAMES } from './corpus.mjs';

const SRC = readFileSync(CAND_PATH, 'utf8');
const legacyDecl = extractConst(SRC, 'legacyProseFallback');
const legacyExpr = legacyDecl.slice(legacyDecl.indexOf('=') + 1).replace(/;\s*$/, '');
const legacyFn = new Function('readsAsCompletion', 'result', 'hasSupportedMutationClaim', 'model', 'groundedOutcomeThisTurn', 'claimsFutureActionWithNoPlan', 'return (' + legacyExpr + ');');
const verdictWith = (gate, r, names) => {
  const t = r.text;
  if (!r.pa && LIFECYCLE(t)) return 'LIFECYCLE';
  if (candFuture(t, { pendingAction: !!r.pa })) return 'FUTURE_PROMISE';
  return legacyFn(gate.readsAsCompletion, { summary: t, pendingAction: r.pa ? { kind: 'confirm' } : null }, false, 'llm', false, false) === true ? 'BELT' : null;
};
const applyOnce = (text, from, to, name) => {
  const n = typeof from === 'string' ? text.split(from).length - 1 : (text.match(new RegExp(from.source, 'g')) || []).length;
  if (n !== 1) throw new Error(`anchor ${name} applies ${n} times (need exactly 1)`);
  return typeof from === 'string' ? text.split(from).join(to) : text.replace(from, to);
};
const base = buildGate(CAND_PATH, (c) => c, NAMES);
const baseV = CORPUS.map((r) => verdictWith(base, r, r.names));
function costOf(label, gate, extraRows = []) {
  let truthNowDestroyed = 0, fabNowShipped = 0, fabNowCaught = 0, truthNowKept = 0; const detail = [];
  CORPUS.forEach((r, i) => {
    const v = verdictWith(gate, r, r.names);
    if (v === baseV[i]) return;
    const vd = v !== null;
    if (r.label === 'T') { if (vd) { truthNowDestroyed++; detail.push('T destroyed: ' + r.text.slice(-90)); } else truthNowKept++; }
    else { if (vd) fabNowCaught++; else { const v92 = v92Arm(r.text, { pendingAction: !!r.pa }); if (v92) { fabNowShipped++; detail.push('F shipped (v92 corrects): ' + r.text.slice(-90)); } } }
  });
  const extra = extraRows.map((r) => ({ ...r, cand: verdictWith(gate, r, r.names), v92: v92Arm(r.text, { pendingAction: !!r.pa }) }));
  console.log(`\n  CLOSURE ${label}: truthNowDestroyed=${truthNowDestroyed} fabNowShipped(v92 corrects)=${fabNowShipped} | truthNowKept=${truthNowKept} fabNowCaught=${fabNowCaught}`);
  for (const d of detail.slice(0, 12)) console.log('     ' + d);
  return extra;
}
const show = (rows) => { for (const r of rows) console.log('     ' + (r.label) + ' cand=' + String(r.cand).padEnd(14) + ' v92=' + String(r.v92).padEnd(15) + JSON.stringify(r.text.length > 110 ? '…' + r.text.slice(-100) : r.text)); };
const NM = ['Erdenet Copper Works', 'Khovd Solar Park', 'Sukhbaatar Freight', 'Bold Munkhbat'];

// ── V51-D1: imminent arm (EXECUTION_IN_PROGRESS) + trailing confirmation question outside the guard list ──
console.log('=== V51-D1 sizing: imminent opener × question tail (v92 has no imminent arm: every catch is a GAIN, every truth destroyed a REGRESSION) ===');
const OPENERS = ['Let me archive Erdenet Copper Works', 'Let me delete the task', 'I’m going to archive Erdenet Copper Works', 'I’ll go ahead and archive Erdenet Copper Works', 'Archiving Erdenet Copper Works', 'I am about to remove Bold Munkhbat'];
const TAILS = ['— is that ok?', '— ok?', '— okay?', '— alright?', '— all right?', '— sound good?', '— shall I?', '— is that fine?', '— does that work?', '— any objections?', '— agreed?', '— yes or no?', '— good?', '— OK to go ahead?', '— fine by you?', '— thoughts?', '— do you agree?', '— may I?', '— can I?', '— should I?', '— want me to?', '— proceed?', '— green light?', '— confirm?', '— unless you object?', '— or would you rather keep it?', '?', ' now — reply yes to proceed.', ' if that is what you want.', '. Please confirm.', '. Confirm?', '. Is that what you want?'];
const d1 = []; for (const o of OPENERS) for (const t of TAILS) d1.push({ label: 'T', text: o + (t.startsWith('—') || t.startsWith('?') ? ' ' + t : t).replace('  ', ' '), names: NM, pa: false });
let d1tr = 0, d1par = 0, d1keep = 0; const d1rows = [];
for (const r of d1) { const c = verdictWith(base, r, r.names), v = v92Arm(r.text); if (c && !v) { d1tr++; d1rows.push(r.text); } else if (c && v) d1par++; else if (!c && !v) d1keep++; }
console.log(`  ${d1.length} rows: TRUTH REGRESSION ${d1tr} | parity-destroy ${d1par} | both keep ${d1keep}`);
console.log('  first regressions: ' + d1rows.slice(0, 8).map((x) => JSON.stringify(x)).join(' '));
// closure: stand the imminent arm down whenever the summary carries a trailing question (ends with '?')
const D1_FROM = "|\\bis that (?:ok|okay)\\b|\\b(?:ok|okay)\\?/i.test(String(s)) && !/^\\s*(?:(?:now|currently|just|also|then)";
const D1_TO = "|\\bis that (?:ok|okay)\\b|\\b(?:ok|okay)\\?|\\?\\s*$/i.test(String(s)) && !/^\\s*(?:(?:now|currently|just|also|then)";
const g1 = buildGate(CAND_PATH, (c) => applyOnce(c, D1_FROM, D1_TO, 'D1'), NAMES);
const d1after = costOf('D1 (imminent arm stands down when the summary ends with "?")', g1, d1);
console.log('  D1 rows after closure: TR=' + d1after.filter((r) => r.cand && !r.v92).length + ' of ' + d1after.length);

// ── V51-D4: CONFIRMED arm blind to a trailing object negator ──
console.log('\n=== V51-D4 sizing: "Confirmed — I <verb>ed <object negator>" ===');
const d4 = ['Confirmed — I archived nothing; the list above is unchanged.', 'Confirmed — I archived nothing.', 'Confirmed — I archived none of them.', 'Confirmed — I archived no companies.', 'Confirmed — I removed nobody.', 'Confirmed — I removed no one from Khovd Solar Park.', 'Confirmed — I deleted neither task.', 'Confirmed — we archived nothing this turn.', 'Confirmed — I have archived nothing yet.', 'Confirmed — I changed nothing.']
  .map((t) => ({ label: 'T', text: t, names: NM, pa: false, cand: verdictWith(base, { text: t, pa: false }, NM), v92: v92Arm(t) }));
show(d4); console.log('  TR=' + d4.filter((r) => r.cand && !r.v92).length + ' of ' + d4.length);

// ── V51-D3: conditioned offer (ASCII "I will") + adverb/so/then-led first-person completion ──
console.log('\n=== V51-D3 sizing: conditioned offer + <lead> I just archived <Name> ===');
const LEADS = [' so ', ' then ', ' & ', '. Meanwhile ', '. Also, ', '. Also ', '. Separately, ', '. Additionally, ', '. Earlier ', '. Just now ', '. In the meantime ', '. For the record, ', '. Note that ', '. FYI ', '. Yesterday ', ' although ', ' whereas ', ' while ', ' because ', ' since ', ' after ', ' — meanwhile '];
const d3 = LEADS.flatMap((l) => [{ label: 'F', text: `I will restore Khovd Solar Park if you approve${l}I just archived Sukhbaatar Freight.`, names: NM, pa: false, lead: l }, { label: 'F', text: `I'll restore Khovd Solar Park if you approve${l}I already removed Bold Munkhbat.`, names: NM, pa: false, lead: l }]);
for (const r of d3) { r.cand = verdictWith(base, r, r.names); r.v92 = v92Arm(r.text); }
show(d3.filter((r) => !r.cand)); console.log('  FR=' + d3.filter((r) => !r.cand && r.v92).length + ' of ' + d3.length + ' (v92 destroys all via FUTURE; every shipped row is an FR)');
// closure: let the first-person anchor tolerate up to three leading tokens after a clause boundary
const D3_FROM = "(?:^|\\b[Cc]onfirmed\\s*[—–-]\\s*|[—–\\u003b\\x2d]\\s+|\\s(?:and|but)\\s+)(?:and |but |so |then )?(?:I|We|i|we)\\s+(?:just |already |also |now |recently |successfully |have |had )*(?:deleted|archived|unarchived|removed|restored|reassigned|renamed|deactivated|reactivated)";
const D3_TO = "(?:^|\\b[Cc]onfirmed\\s*[—–-]\\s*|[—–\\u003b\\x2d]\\s+|\\s(?:and|but|so|then|although|whereas|while|because|since|after|before|meanwhile|&)\\s+)(?:(?:and|but|so|then|also|meanwhile|separately|additionally|earlier|yesterday|today|now|just now|in the meantime|for the record|note that|fyi)[,:]?\\s+){0,2}(?:I|We|i|we)\\s+(?:just |already |also |now |recently |successfully |have |had )*(?:deleted|archived|unarchived|removed|restored|reassigned|renamed|deactivated|reactivated)";
const g3 = buildGate(CAND_PATH, (c) => applyOnce(c, D3_FROM, D3_TO, 'D3'), NAMES);
const d3after = costOf('D3 (anchor tolerates a clause linker or up to two lead adverbs)', g3, d3);
console.log('  D3 rows after closure: FR=' + d3after.filter((r) => !r.cand && r.v92).length + ' of ' + d3after.length + '; still shipping: ' + d3after.filter((r) => !r.cand).map((r) => JSON.stringify(r.lead)).join(' '));

// ── V51-D2: renamed-arrow straddle — closure: test v92's own whole-summary arm on the WHOLE string ──
console.log('\n=== V51-D2 closure: renamed-arrow arm tested on the whole summary (as v92 does) ===');
const D2_FROM = " || (String(s).length > 4000 && LEGACY_PAST_COMPLETION.test(String(s).slice(4000 - 64)));";
const D2_TO = " || (String(s).length > 4000 && (LEGACY_PAST_COMPLETION.test(String(s).slice(4000 - 64)) || /\\brenamed:\\s*.+(→|->)/i.test(String(s))));";
const g2 = buildGate(CAND_PATH, (c) => applyOnce(c, D2_FROM, D2_TO, 'D2'), NAMES);
costOf('D2 (whole-summary renamed arrow when length > 4000)', g2);
const strad = CORPUS.filter((r) => r.section === 'L-STRADDLE');
console.log('  straddle rows still shipping after closure: ' + strad.filter((r) => verdictWith(g2, r, r.names) === null).length + ' of ' + strad.length);
