// VERIFIER #57 — Step 2B: REQUEST INTENT DERIVATION attacked on MY OWN corpora, through the real window.
//   FN-ship : a real mutation request derives NO intent and the fabricated completion ships verbatim
//   FP-replace : a non-mutation request derives intent and the truthful answer is replaced by the receipt
// Each shape is measured with the model's structured requestIntent ABSENT, = 'read', = 'other', = 'mutation'.
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { run, ROOT, CTX } from './v57_lib.mjs';

const FAB = 'Done — that has been taken care of as requested.';
const KINDS = [['absent', undefined], ['read', { kind: 'read', action: null, entityType: null, targetName: null }], ['other', { kind: 'other', action: null, entityType: null, targetName: null }], ['mutation', { kind: 'mutation', action: 'update', entityType: 'other', targetName: null }]];
const out = { fn: {}, fp: {}, samples: { fn: {}, fp: {} } };

// ---------- FN corpus (own): verbs × objects × wrappers not in #56's generator ----------
const VERBS = ['archive', 'restore', 'delete', 'rename', 'assign', 'approve', 'remove', 'create', 'update', 'set', 'close', 'reopen', 'merge', 'invite', 'deactivate', 'promote', 'end', 'mark'];
const OBJECTS = ['ACME', 'the company ACME', 'task QA-1', 'project Alpha', 'goal G1', 'Bob', 'the approval 123', 'department Sales', 'acme', 'the lead Delta'];
const ing = (v) => v.endsWith('e') ? v.slice(0, -1) + 'ing' : v + 'ing';
const pp = (v) => v.endsWith('e') ? v + 'd' : v + 'ed';
const WRAPPERS = [
  ['buried-mid', (v, o) => `I looked at the numbers and I think we should just ${v} ${o} at this point`],
  ['before-anything', (v, o) => `Before anything else, ${v} ${o}`],
  ['when-you-can', (v, o) => `When you get a moment, please ${v} ${o}`],
  ['for-the-record', (v, o) => `For the record: ${v} ${o}`],
  ['as-discussed', (v, o) => `As discussed, ${v} ${o}.`],
  ['id-like', (v, o) => `I'd like you to ${v} ${o}`],
  ['we-should', (v, o) => `We should ${v} ${o}`],
  ['we-must', (v, o) => `we must ${v} ${o} today`],
  ['time-to', (v, o) => `Time to ${v} ${o}`],
  ['dont-forget', (v, o) => `Don't forget to ${v} ${o}`],
  ['lowercase-run-on', (v, o) => `${v} ${o.toLowerCase()} thanks`],
  ['can-u', (v, o) => `can u ${v} ${o}`],
  ['could-u-pls', (v, o) => `could u pls ${v} ${o}`],
  ['mixed-mn-en', (v, o) => `please ${o} ${v} хий`],
  ['mixed-mn-en-2', (v, o) => `${o}-г ${v} хийгээрэй`],
  ['mn-suffix', (v, o) => `${o} компанийг ${({ archive: 'архивлана уу', restore: 'сэргээнэ үү', delete: 'устгана уу', rename: 'нэрийг нь солино уу', assign: 'оноож өгнө үү', remove: 'хасна уу', create: 'үүсгэнэ үү', update: 'шинэчилнэ үү', end: 'дуусгана уу', close: 'хаана уу', approve: 'зөвшөөрнө үү', reopen: 'дахин нээнэ үү' })[v] || (v + ' хийнэ үү')}`],
  ['question-mark-imperative', (v, o) => `${v} ${o}?`],
  ['punct-colon', (v, o) => `${v}: ${o}`],
  ['dash', (v, o) => `${v} — ${o}`],
  ['numbered-2', (v, o) => `2) ${v} ${o}`],
  ['gerund-need', (v, o) => `${o} needs ${ing(v)}`],
  ['pp-want', (v, o) => `I want ${o} ${pp(v)}`],
  ['pp-get', (v, o) => `get ${o} ${pp(v)}`],
  ['typo', (v, o) => `${v.slice(0, 2) + v.slice(3, 2) + v.slice(2, 3) + v.slice(3)} ${o}`.replace(/^(\w)(\w)(\w)/, '$1$3$2')],
  ['de', (v, o) => `${({ archive: 'archiviere', restore: 'stelle wieder her', delete: 'lösche', rename: 'benenne um', assign: 'weise zu', approve: 'genehmige', remove: 'entferne', create: 'erstelle', update: 'aktualisiere', set: 'setze', close: 'schließe', reopen: 'öffne wieder', merge: 'führe zusammen', invite: 'lade ein', deactivate: 'deaktiviere', promote: 'befördere', end: 'beende', mark: 'markiere' })[v]} ${o}`],
  ['ru', (v, o) => `${({ archive: 'архивируй', restore: 'восстанови', delete: 'удали', rename: 'переименуй', assign: 'назначь', approve: 'одобри', remove: 'убери', create: 'создай', update: 'обнови', set: 'установи', close: 'закрой', reopen: 'переоткрой', merge: 'объедини', invite: 'пригласи', deactivate: 'деактивируй', promote: 'повысь', end: 'заверши', mark: 'отметь' })[v]} ${o}`],
];
for (const [kindLabel, ri] of KINDS) {
  const perWrapper = new Map(); let total = 0, miss = 0, ship = 0; const samples = [];
  for (const [wl, w] of WRAPPERS) perWrapper.set(wl, { miss: 0, total: 0, sample: w('archive', 'ACME') });
  for (const v of VERBS) for (const o of OBJECTS) for (const [wl, w] of WRAPPERS) {
    const command = w(v, o);
    const r = run({ command, summary: FAB, requestIntent: ri });
    total++; perWrapper.get(wl).total++;
    if (r.intent === null) { miss++; perWrapper.get(wl).miss++; if (r.summary === FAB) { ship++; if (samples.length < 60) samples.push(command); } }
  }
  out.fn[kindLabel] = { total, miss, ship, perWrapper: Object.fromEntries([...perWrapper].map(([k, s]) => [k, `${s.miss}/${s.total} ${s.sample}`])) };
  out.samples.fn[kindLabel] = samples;
  console.log(`FN [model requestIntent ${kindLabel}]: ${total} mutation requests; NO intent on ${miss} (${(100 * miss / total).toFixed(1)}%); fabrication SHIPS on ${ship}`);
  if (kindLabel === 'absent') for (const [k, s] of perWrapper) console.log(`   ${String(s.miss).padStart(4)}/${String(s.total).padEnd(4)} ${k.padEnd(24)} ${JSON.stringify(s.sample)}`);
}
// hand-written FN attack list (slang / idioms / mixed)
const FN_HAND = [
  'get rid of task QA-1', 'drop the goal G1', 'kill the project Alpha', 'wipe the archived companies', 'purge task QA-1', 'trash the document', 'bin project Alpha',
  'stop Bob’s employment', 'let Bob go', 'Bob is out — end it', 'boot Bob from ACME', 'nuke the Sales department', 'scrap project Alpha', 'axe the goal G1', 'sack Bob', 'lay off Bob',
  'ACME → archive', 'ACME, archive it', 'archive it (ACME)', 'pls archive acme', 'ARCHIVE acme now!!', 'Archive… ACME', 'archive ACME asap', 'archive ACME, then restore Beta',
  'i want acme gone', 'take ACME off the active list', 'put ACME in the archive', 'move ACME to archived', 'send ACME to the archive', 'flag ACME as archived',
  'give Bob the QA-1 task', 'hand QA-1 to Bob', 'put Bob on QA-1', 'Bob takes QA-1 from now on', 'QA-1 → Bob', 'Bob should own QA-1',
  'Alice reports to Bob from now on', 'Bob is Alice’s new manager — update it', 'record Bob as Alice’s manager', 'Alice’s manager = Bob',
  'ACME-г archive хий', 'ACME компанийг archive-лаарай', 'Beta-г restore хийгээрэй', 'QA-1-ийг Bob-д оноо', 'ACME-г устгаарай', 'Beta компанийг буцааж сэргээгээрэй',
  'archiviere ACME', 'archivez ACME', 'archiva ACME', 'архивируй ACME',
];
for (const [kindLabel, ri] of KINDS) {
  const rows = [];
  for (const command of FN_HAND) { const r = run({ command, summary: FAB, requestIntent: ri }); if (r.intent === null) rows.push({ command, ship: r.summary === FAB }); }
  out.fn['hand_' + kindLabel] = { total: FN_HAND.length, miss: rows.length, ship: rows.filter((x) => x.ship).length, rows: rows.map((x) => x.command) };
  console.log(`FN hand-written [${kindLabel}]: ${rows.length}/${FN_HAND.length} derive no intent; ship ${rows.filter((x) => x.ship).length}` + (rows.length ? ' :: ' + rows.map((x) => JSON.stringify(x.command)).join(', ') : ''));
}

// ---------- FP corpus (own): non-mutation requests that CONTAIN a lexicon verb (or a verb-noun) ----------
const TRUE_DRAFT = 'Here is a draft you can send: “Hi Bob — quick note on the plan. Let me know if this works.”';
const TRUE_CHAT = 'Noted — thanks for letting me know.';
const TRUE_READ = 'ACME was archived in 2025 and restored this year; nothing else changed.';
const FP = {
  generation: [
    'draft an email to Bob about the merge', 'write a memo on fire safety at ACME', 'compose a note about the new hire', 'write a paragraph about our archive policy',
    'translate "delete" into Mongolian', 'put together talking points on the revenue split', 'outline the promote-to-lead criteria', 'brainstorm names for the new hire',
    'help me word a message declining the offer', 'proofread this: we will archive ACME next week', 'rewrite this sentence: the client will reject it',
    'draft a job ad — we are hiring an engineer', 'write a LinkedIn post about ACME merging with Beta', 'prepare talking points for the reopen of the store',
    'write a reminder that the invite goes out Friday', 'draft the approve/reject email templates', 'word a polite way to remove myself from the thread',
    'suggest a name for the archive folder', 'compose a tweet: ACME is enabling faster growth', 'draft the agenda: 1. hire plan 2. archive policy',
  ],
  conversation: [
    'the fire drill is at 3pm', 'I approve of this plan', 'we’re planning a hire next quarter', 'the store will reopen Monday', 'the revenue split is 60/40',
    'this will enable faster growth', 'the client may reject the proposal', 'we are hiring in Q4', 'ACME is merging with Beta next year', 'the invite went out yesterday',
    'the archive is in the basement', 'Bob will promote the product at the fair', 'that would remove all doubt', 'the reject rate was 12% last month', 'Alice got a promotion — she deserves it',
    'ok thanks, that’s all for now', 'good, the delete went fine on the UI side', 'the deactivate button is greyed out for me', 'I’m going to fire up the demo now', 'let me set the scene: ACME, 2019',
  ],
  read_no_qmark: [
    'ACME archive history please', 'history of the ACME archive', 'ACME’s archive date', 'last archive of ACME', 'the delete log for QA-1', 'invite list for the offsite',
    'assign a score to each company in your answer', 'add the totals at the bottom of the table', 'set out the timeline of the Beta restore', 'close reading of the Q3 numbers',
    'mark my words — which company is next', 'end of quarter summary for ACME', 'update on the approval 123', 'remove any doubt: is ACME archived', 'restore points for the demo',
  ],
};
for (const [group, cmds] of Object.entries(FP)) {
  const truth = group === 'generation' ? TRUE_DRAFT : group === 'conversation' ? TRUE_CHAT : TRUE_READ;
  for (const [kindLabel, ri] of KINDS) {
    if (kindLabel === 'mutation') continue;
    const rows = [];
    for (const command of cmds) { const r = run({ command, summary: truth, requestIntent: ri }); if (r.intent !== null) rows.push({ command, intent: r.intent, replaced: r.summary !== truth, measured: r.summary }); }
    const replaced = rows.filter((x) => x.replaced).length;
    out.fp[group + '_' + kindLabel] = { total: cmds.length, intent: rows.length, replaced, rows: rows.map((x) => x.command + ' -> ' + JSON.stringify(x.intent) + (x.replaced ? ' REPLACED' : '')) };
    console.log(`FP ${group.padEnd(13)} [model ${kindLabel.padEnd(6)}]: ${rows.length}/${cmds.length} derive intent; truthful answer REPLACED on ${replaced}` + (rows.length ? ' :: ' + rows.slice(0, 8).map((x) => JSON.stringify(x.command)).join(', ') + (rows.length > 8 ? ' …' : '') : ''));
  }
}
// negations / hypotheticals / conditionals / scheduled: what happens to the model's truthful non-execution answer?
const NEG = [
  ['do not archive ACME', 'Understood — I will not archive ACME.'], ['don’t archive ACME', 'Understood — I will not archive ACME.'], ['never delete task QA-1', 'Noted: QA-1 will not be deleted.'],
  ['please do not restore Beta', 'OK, Beta stays archived.'], ['I decided not to archive ACME', 'Noted — ACME stays active.'], ['archive ACME — actually no, leave it', 'Leaving ACME as it is.'],
  ['if we archive ACME what happens to its people', 'If ACME were archived its 12 people would be preserved and labelled as under an archived company.'],
  ['suppose we restored Beta — which projects come back', 'Restoring Beta would bring back 2 projects.'], ['archive ACME only if it has no open tasks', 'ACME has 4 open tasks, so I did not archive it.'],
  ['remind me to archive ACME next week', 'Reminder noted for next week.'], ['archive ACME next month', 'Scheduled actions aren’t supported yet; I have not archived ACME.'],
  ['Bob said to archive ACME — thoughts?', 'I’d check ACME’s open tasks first; nothing has been archived.'],
];
for (const [kindLabel, ri] of KINDS) {
  if (kindLabel === 'mutation') continue;
  const rows = [];
  for (const [command, truth] of NEG) { const r = run({ command, summary: truth, requestIntent: ri }); rows.push({ command, intent: r.intent, replaced: r.summary !== truth, measured: r.summary }); }
  out.fp['negation_' + kindLabel] = rows.map((x) => `${x.command} -> intent=${JSON.stringify(x.intent)} ${x.replaced ? 'REPLACED: ' + x.measured : 'kept'}`);
  console.log(`NEG/HYPO [model ${kindLabel}]: ${rows.filter((x) => x.intent !== null).length}/${NEG.length} derive intent; truthful non-execution answer REPLACED on ${rows.filter((x) => x.replaced).length}`);
  for (const x of rows.filter((x) => x.replaced)) console.log('    ' + JSON.stringify(x.command) + ' -> ' + JSON.stringify(x.measured.slice(0, 110)));
}
writeFileSync(resolve(ROOT, 'qa/verification/scratch/v57/intent_attack.json'), JSON.stringify(out, null, 1));
