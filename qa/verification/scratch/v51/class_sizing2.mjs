// VERIFIER #51 — refine the D1 and D3 closures and enumerate what they leave open.
import { readFileSync } from 'node:fs';
import { buildGate, extractConst } from '../../lib/belt_extract.mjs';
import { CAND_PATH, v92Arm, LIFECYCLE, CAND_FUTURE } from './harness.mjs';
import { CORPUS, NAMES } from './corpus.mjs';

const SRC = readFileSync(CAND_PATH, 'utf8');
const exprOf = (name) => { const d = extractConst(SRC, name); return d.slice(d.indexOf('=') + 1).replace(/;\s*$/, ''); };
const legacyFn = new Function('readsAsCompletion', 'result', 'hasSupportedMutationClaim', 'model', 'groundedOutcomeThisTurn', 'claimsFutureActionWithNoPlan', 'return (' + exprOf('legacyProseFallback') + ');');
const futureExprShipped = exprOf('claimsFutureActionWithNoPlan');
const mkFuture = (expr) => { const f = new Function('FUTURE_PROMISE_PATTERN', 'model', 'result', 'groundedOutcomeThisTurn', 'return (' + expr + ');'); return (s, pa) => f(CAND_FUTURE, 'llm', { summary: s, pendingAction: pa ? { kind: 'confirm' } : null }, false) === true; };
const verdict = (gate, futureFn, r) => {
  if (!r.pa && LIFECYCLE(r.text)) return 'LIFECYCLE';
  if (futureFn(r.text, !!r.pa)) return 'FUTURE_PROMISE';
  return legacyFn(gate.readsAsCompletion, { summary: r.text, pendingAction: r.pa ? { kind: 'confirm' } : null }, false, 'llm', false, false) === true ? 'BELT' : null;
};
const applyOnce = (text, from, to, name) => { const n = text.split(from).length - 1; if (n !== 1) throw new Error(`anchor ${name} applies ${n} times`); return text.split(from).join(to); };
const NM = ['Erdenet Copper Works', 'Khovd Solar Park', 'Sukhbaatar Freight', 'Bold Munkhbat'];
const base = buildGate(CAND_PATH, (c) => c, NAMES);
const futureBase = mkFuture(futureExprShipped);
const baseV = CORPUS.map((r) => verdict(base, futureBase, r));
function cost(label, gate, futureFn) {
  let td = 0, fs = 0, tk = 0, fc = 0; const det = [];
  CORPUS.forEach((r, i) => { const v = verdict(gate, futureFn, r); if (v === baseV[i]) return; if (r.label === 'T') { if (v) { td++; det.push('T destroyed: ' + r.text.slice(-100)); } else tk++; } else if (v) fc++; else if (v92Arm(r.text, { pendingAction: !!r.pa })) { fs++; det.push('F shipped (v92 corrects): ' + r.text.slice(-100)); } });
  console.log(`  CLOSURE ${label}: truthNowDestroyed=${td} fabNowShipped(v92 corrects)=${fs} | truthNowKept=${tk} fabNowCaught=${fc}`); for (const d of det.slice(0, 10)) console.log('     ' + d);
}

// D1 — the guard at BOTH sites (belt imminent arm + FUTURE arm): stand down on a trailing "?" and on "reply yes"
const GUARD_TAIL = "|\\bis that (?:ok|okay)\\b|\\b(?:ok|okay)\\?";
const GUARD_TAIL_NEW = "|\\bis that (?:ok|okay)\\b|\\b(?:ok|okay)\\?|\\?\\s*$|\\breply (?:yes|y|ok|okay|go)\\b|\\bplease confirm\\b";
const g1 = buildGate(CAND_PATH, (c) => applyOnce(c, GUARD_TAIL + '/i.test(String(s))', GUARD_TAIL_NEW + '/i.test(String(s))', 'D1-belt'), NAMES);
const f1 = mkFuture(applyOnce(futureExprShipped, GUARD_TAIL + '/i.test(__s)', GUARD_TAIL_NEW + '/i.test(__s)', 'D1-future'));
const OPENERS = ['Let me archive Erdenet Copper Works', 'Let me delete the task', 'I’m going to archive Erdenet Copper Works', 'I’ll go ahead and archive Erdenet Copper Works', 'Archiving Erdenet Copper Works', 'I am about to remove Bold Munkhbat'];
const TAILS = ['— is that ok?', '— ok?', '— okay?', '— alright?', '— all right?', '— sound good?', '— shall I?', '— is that fine?', '— does that work?', '— any objections?', '— agreed?', '— yes or no?', '— good?', '— OK to go ahead?', '— fine by you?', '— thoughts?', '— do you agree?', '— may I?', '— can I?', '— should I?', '— want me to?', '— proceed?', '— green light?', '— confirm?', '— unless you object?', '— or would you rather keep it?', '?', ' now — reply yes to proceed.', ' if that is what you want.', '. Please confirm.', '. Confirm?', '. Is that what you want?'];
const d1 = []; for (const o of OPENERS) for (const t of TAILS) d1.push({ label: 'T', text: (o + ((t.startsWith('—') || t.startsWith('?')) ? ' ' + t : t)).replace('  ', ' '), names: NM, pa: false });
console.log('=== D1 with the guard widened at BOTH sites ===');
cost('D1 both sites', g1, f1);
const left = d1.filter((r) => verdict(g1, f1, r) && !v92Arm(r.text));
console.log('  D1 rows still TR: ' + left.length + ' of ' + d1.length); for (const r of left) console.log('     ' + JSON.stringify(r.text) + ' cand=' + verdict(g1, f1, r));
const before = d1.filter((r) => verdict(base, futureBase, r) && !v92Arm(r.text));
console.log('  by arm (before closure): ' + JSON.stringify(before.reduce((a, r) => { const v = verdict(base, futureBase, r); a[v] = (a[v] || 0) + 1; return a; }, {})));

// D3 — case-tolerant lead list for the first-person anchor
const D3_FROM = "(?:^|\\b[Cc]onfirmed\\s*[—–-]\\s*|[—–\\u003b\\x2d]\\s+|\\s(?:and|but)\\s+)(?:and |but |so |then )?(?:I|We|i|we)\\s+(?:just |already |also |now |recently |successfully |have |had )*(?:deleted|archived|unarchived|removed|restored|reassigned|renamed|deactivated|reactivated)";
const D3_TO = "(?:^|\\b[Cc]onfirmed\\s*[—–-]\\s*|[—–\\u003b\\x2d]\\s+|\\s(?:and|but|so|then|although|whereas|while|because|since|after|before|meanwhile|&)\\s+)(?:(?:[Aa]nd|[Bb]ut|[Ss]o|[Tt]hen|[Aa]lso|[Mm]eanwhile|[Ss]eparately|[Aa]dditionally|[Ee]arlier|[Yy]esterday|[Tt]oday|[Nn]ow|[Jj]ust now|[Ii]n the meantime|[Ff]or the record|[Nn]ote that|FYI|[Ff]yi)[,:]?\\s+){0,2}(?:I|We|i|we)\\s+(?:just |already |also |now |recently |successfully |have |had )*(?:deleted|archived|unarchived|removed|restored|reassigned|renamed|deactivated|reactivated)";
const g3 = buildGate(CAND_PATH, (c) => applyOnce(c, D3_FROM, D3_TO, 'D3'), NAMES);
const LEADS = [' so ', ' then ', ' & ', '. Meanwhile ', '. Also, ', '. Also ', '. Separately, ', '. Additionally, ', '. Earlier ', '. Just now ', '. In the meantime ', '. For the record, ', '. Note that ', '. FYI ', '. Yesterday ', ' although ', ' whereas ', ' while ', ' because ', ' since ', ' after ', ' — meanwhile '];
const d3 = LEADS.flatMap((l) => [{ label: 'F', text: `I will restore Khovd Solar Park if you approve${l}I just archived Sukhbaatar Freight.`, names: NM, pa: false, lead: l }, { label: 'F', text: `I'll restore Khovd Solar Park if you approve${l}I already removed Bold Munkhbat.`, names: NM, pa: false, lead: l }]);
console.log('\n=== D3 with a case-tolerant lead list ===');
cost('D3 case-tolerant leads', g3, futureBase);
console.log('  D3 rows still FR: ' + d3.filter((r) => !verdict(g3, futureBase, r) && v92Arm(r.text)).length + ' of ' + d3.length);
// truth controls for D3: conditionals and out-of-pack objects must stay preserved
const d3t = ['If I archived Erdenet Copper Works now, its 5 tasks would go too.', 'Unless I archived Erdenet Copper Works by mistake, it is active.', 'Had I archived Erdenet Copper Works you would see it in the log; I did not.', 'Yesterday I removed Row 3 from the draft list.', 'Meanwhile I renamed Column B in the table above.', 'Also, I archived nothing.'];
for (const t of d3t) console.log('     T control cand=' + String(verdict(g3, futureBase, { text: t, pa: false })).padEnd(8) + ' v92=' + String(v92Arm(t)).padEnd(8) + JSON.stringify(t));
