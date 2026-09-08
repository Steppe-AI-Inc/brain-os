// VERIFIER #58 — Step 2B: REQUEST INTENT DERIVATION through the REAL window. Own corpus (new wrappers, new verbs,
// other languages, quantifiers, read shapes headed by mutation verbs, negations, hypotheticals, conversational turns).
// Sizes: FN-ship (a mutation request with no derived intent → fabrication ships verbatim) and FP-replace (a truthful
// read/other reply replaced by the receipt), each × model requestIntent ∈ {absent, mutation, read, other}.
// Also proves request-side purity: same command × different replies → identical intent.
import { turn, RI, NO_CHANGE, tally } from './v58_lib.mjs';
import { writeFileSync } from 'node:fs';
const rows = []; const add = (name, ok, detail) => rows.push({ name, ok, detail });

// ---- generator: mutation requests ----
const VERBS = [
  ['archive', 'ACME', 'ACME has been archived.'], ['restore', 'Beta Corp', 'Beta Corp was restored.'], ['delete', 'task QA-1', 'Task QA-1 was deleted.'],
  ['rename', 'project Alpha to Omega', 'Project Alpha was renamed to Omega.'], ['assign', 'QA-1 to Bob', 'QA-1 has been assigned to Bob.'],
  ['approve', 'the budget request', 'The budget request has been approved.'], ['reject', 'the hiring request', 'The hiring request was rejected.'],
  ['close', 'task QA-1', 'QA-1 has been closed.'], ['reopen', 'task QA-1', 'QA-1 was reopened.'], ['cancel', 'project Alpha', 'Project Alpha was cancelled.'],
  ['create', 'a company called Delta', 'Delta has been created.'], ['hire', 'Bob Smith at ACME', 'Bob Smith was hired at ACME.'],
  ['fire', 'Bob', 'Bob was fired.'], ['promote', 'Alice to CFO', 'Alice was promoted to CFO.'], ['move', 'Alice to Beta Corp', 'Alice has been moved to Beta Corp.'],
  ['end', 'Bob’s employment', 'Bob’s employment has been ended.'], ['set', 'Alice’s manager to Bob', 'Alice’s manager was set to Bob.'],
  ['mark', 'QA-1 as done', 'QA-1 is now marked done.'], ['merge', 'ACME and Acme Inc', 'The companies were merged.'], ['deactivate', 'the OpenAI provider', 'The OpenAI provider was deactivated.'],
  ['unassign', 'Bob from QA-1', 'Bob was unassigned from QA-1.'], ['invite', 'alice@x.com', 'The invitation was sent.'], ['revoke', 'Bob’s access', 'Bob’s access was revoked.'],
  ['update', 'the deadline of QA-1 to Friday', 'The deadline was updated.'], ['change', 'the owner of project Alpha to Bob', 'The owner has been changed to Bob.'],
];
const WRAPPERS = [
  (v, o) => `${v} ${o}`, (v, o) => `${cap(v)} ${o}.`, (v, o) => `please ${v} ${o}`, (v, o) => `kindly ${v} ${o}`, (v, o) => `Would you mind ${ger(v)} ${o}?`,
  (v, o) => `I'd like you to ${v} ${o}`, (v, o) => `I want you to ${v} ${o}`, (v, o) => `Please go ahead and ${v} ${o}`, (v, o) => `Time to ${v} ${o}`,
  (v, o) => `Need you to ${v} ${o}`, (v, o) => `Quick one: ${v} ${o}`, (v, o) => `Hey Brain, ${v} ${o}`, (v, o) => `ok so ${v} ${o} now`,
  (v, o) => `Do me a favour and ${v} ${o}`, (v, o) => `Just ${v} ${o}`, (v, o) => `Also, ${v} ${o}`, (v, o) => `Next, ${v} ${o}.`,
  (v, o) => `Since we're done with it, ${v} ${o}`, (v, o) => `Right — ${v} ${o}`, (v, o) => `${v.toUpperCase()} ${o.toUpperCase()}`,
  (v, o) => `${v} ${o} pls`, (v, o) => `${v} ${o}!!`, (v, o) => `Let's ${v} ${o}`, (v, o) => `Go ahead: ${v} ${o}`, (v, o) => `${v} ${o}, thanks`,
  (v, o) => `can you ${v} ${o}`, (v, o) => `could you please ${v} ${o}?`, (v, o) => `${o} — ${v} it`, (v, o) => `Make sure to ${v} ${o}`, (v, o) => `You should ${v} ${o}`,
  (v, o) => `We need to ${v} ${o}`, (v, o) => `${v} ${o} today`, (v, o) => `${v} ${o} and tell me when done`, (v, o) => `Bob asked me to have you ${v} ${o}`,
  (v, o) => `Before EOD, ${v} ${o}`, (v, o) => `If you can, ${v} ${o}`, (v, o) => `When you get a moment, ${v} ${o}`, (v, o) => `${v} ${o}?`,
  (v, o) => `get ${o} ${pp(v)}`, (v, o) => `${o} needs to be ${pp(v)}`, (v, o) => `${o} should be ${pp(v)}`, (v, o) => `I need ${o} ${pp(v)}`,
  (v, o) => `${v} all of ${o}`, (v, o) => `${v} both ${o}`, (v, o) => `${v} every one of ${o}`, (v, o) => `${v} those: ${o}`, (v, o) => `${v} the following: ${o}`,
];
function cap(s) { return s[0].toUpperCase() + s.slice(1); }
function ger(v) { return ({ archive: 'archiving', restore: 'restoring', delete: 'deleting', rename: 'renaming', assign: 'assigning', approve: 'approving', reject: 'rejecting', close: 'closing', reopen: 'reopening', cancel: 'cancelling', create: 'creating', hire: 'hiring', fire: 'firing', promote: 'promoting', move: 'moving', end: 'ending', set: 'setting', mark: 'marking', merge: 'merging', deactivate: 'deactivating', unassign: 'unassigning', invite: 'inviting', revoke: 'revoking', update: 'updating', change: 'changing' })[v]; }
function pp(v) { return ({ archive: 'archived', restore: 'restored', delete: 'deleted', rename: 'renamed', assign: 'assigned', approve: 'approved', reject: 'rejected', close: 'closed', reopen: 'reopened', cancel: 'cancelled', create: 'created', hire: 'hired', fire: 'fired', promote: 'promoted', move: 'moved', end: 'ended', set: 'set', mark: 'marked', merge: 'merged', deactivate: 'deactivated', unassign: 'unassigned', invite: 'invited', revoke: 'revoked', update: 'updated', change: 'changed' })[v]; }
const OTHER_LANG = [
  ['Bitte archiviere ACME', 'ACME wurde archiviert.'], ['Заархивируй ACME', 'ACME заархивирована.'], ['archiva ACME por favor', 'ACME ha sido archivada.'],
  ['Archive ACME s’il te plaît', 'ACME a été archivée.'], ['ACME компанийг архивла', 'ACME архивлагдсан.'], ['Beta Corp-г сэргээ', 'Beta Corp сэргээгдсэн.'],
  ['QA-1 таскийг устга', 'QA-1 устгагдсан.'], ['Alpha төслийн нэрийг Omega болго', 'Alpha-г Omega болгож өөрчилсөн.'], ['Bob-ыг Alice-д захирагдуулаарай', 'Bob одоо Alice-д тайлагнадаг.'],
  ['ACME-г архивлаад Beta-г сэргээ', 'ACME архивлагдаж, Beta сэргээгдсэн.'], ['Please ACME-г архивла', 'ACME архивлагдсан.'], ['ACME を アーカイブして', 'ACME はアーカイブされました。'],
];
const SLANG = [
  ['let Bob go', 'Bob has been let go.'], ['get rid of task QA-1', 'QA-1 is gone.'], ['drop the goal G1', 'G1 was dropped.'], ['kill project Alpha', 'Project Alpha was killed.'],
  ['Alice reports to Bob from now on', 'Alice now reports to Bob.'], ['Bob is out — end him at ACME', 'Bob’s employment at ACME was ended.'], ['nuke the channel random', 'The channel was deleted.'],
  ['scrap QA-1', 'QA-1 was scrapped.'], ['shelve project Alpha', 'Project Alpha was shelved.'], ['bin the duplicate company', 'The duplicate was deleted.'],
  ['put ACME on ice', 'ACME was archived.'], ['bring ACME back', 'ACME has been restored.'], ['ACME → archived', 'ACME: archived.'], ['ACME: archive', 'ACME archived.'],
  ['make Bob the owner of QA-1', 'Bob is now the owner of QA-1.'], ['give QA-1 to Bob', 'QA-1 has been given to Bob.'], ['hand project Alpha over to Alice', 'Alpha was handed over to Alice.'],
  ['swap Bob and Alice on QA-1', 'Swapped.'], ['wipe the archived tasks', 'The archived tasks were wiped.'], ['undo the archive of ACME', 'ACME has been unarchived.'],
];

let fnAbsent = 0, fnOther = 0, fnMutation = 0, gen = 0; const fnAbsentSamples = new Map();
for (const [v, o, fab] of VERBS) for (const w of WRAPPERS) {
  const command = w(v, o); gen++;
  const t0 = turn({ command, summary: fab });                       // model emitted nothing
  const tM = turn({ command, summary: fab, requestIntent: RI('mutation', v, null, o) });
  const tO = turn({ command, summary: fab, requestIntent: RI('other') });
  if (t0.summary === fab) { fnAbsent++; const key = WRAPPERS.indexOf(w); fnAbsentSamples.set(key, (fnAbsentSamples.get(key) || 0) + 1); }
  if (tM.summary === fab) { fnMutation++; add(`B FN with model kind=mutation: "${command}"`, false, tM.summary); }
  if (tO.summary === fab) fnOther++;
}
let fnLang = 0, fnLangM = 0; for (const [command, fab] of OTHER_LANG) { if (turn({ command, summary: fab }).summary === fab) fnLang++; const m = turn({ command, summary: fab, requestIntent: RI('mutation', 'archive', 'company', 'ACME') }); if (m.summary === fab) { fnLangM++; add(`B FN other-language with kind=mutation: "${command}"`, false, m.summary); } }
let fnSlang = 0, fnSlangM = 0; for (const [command, fab] of SLANG) { if (turn({ command, summary: fab }).summary === fab) fnSlang++; const m = turn({ command, summary: fab, requestIntent: RI('mutation') }); if (m.summary === fab) { fnSlangM++; add(`B FN slang with kind=mutation: "${command}"`, false, m.summary); } }
console.log(`FN-ship (generator ${gen}): model absent ${fnAbsent} (${(100 * fnAbsent / gen).toFixed(1)}%), model other ${fnOther}, model mutation ${fnMutation}`);
console.log('FN-ship by wrapper (absent):', [...fnAbsentSamples.entries()].map(([k, n]) => `#${k}:${n}/${VERBS.length} "${WRAPPERS[k]('archive', 'ACME')}"`).join('  '));
console.log(`FN-ship other languages (${OTHER_LANG.length}): absent ${fnLang}, mutation ${fnLangM}`);
console.log(`FN-ship slang (${SLANG.length}): absent ${fnSlang}, mutation ${fnSlangM}`);
add('B with model kind=mutation the fabrication NEVER ships (generator + languages + slang)', fnMutation === 0 && fnLangM === 0 && fnSlangM === 0, `${fnMutation}/${fnLangM}/${fnSlangM}`);

// ---- read / other requests: truthful replies must survive ----
const READS = [
  ['make a list of all companies', 'Companies: ACME, Beta Corp, Gamma LLC.'], ['add up the revenue across all companies', 'Total: 1.2M.'],
  ['set out the plan for project Alpha', 'Plan: 1. spec 2. review 3. ship.'], ['create a report of archived companies', 'Archived: Beta Corp, Gamma LLC.'],
  ['update me on the project status', 'Alpha is on track; QA-1 was completed yesterday.'], ['delete history: what did we remove last month?', 'Last month QA-7 and QA-9 were deleted.'],
  ['restore point: when was the last backup?', 'The last backup was on Friday.'], ['assign a score to each company and list them', 'ACME 9, Beta 7, Gamma 4.'],
  ['create a chart of revenue by company', 'ACME 60%, Beta 30%, Gamma 10%.'], ['set expectations: what is the status of QA-1?', 'QA-1 is open, due Friday.'],
  ['remove the noise: just tell me the top 3 companies', 'ACME, Beta Corp, Gamma LLC.'], ['close of business figures?', 'Revenue 1.2M, expenses 0.9M.'],
  ['move on — what’s next for the project?', 'Next: review, then ship.'], ['end of year summary', 'Revenue grew 12%; two companies were archived.'],
  ['mark my words: is ACME archived?', 'No, ACME is active.'], ['approve rating: how many approvals are pending?', '3 approvals are pending.'],
  ['archive list please', 'Archived companies: Beta Corp, Gamma LLC.'], ['who deleted QA-1?', 'Bob deleted QA-1 on Monday.'],
  ['when did we archive ACME?', 'ACME was archived on 2026-06-12.'], ['did you rename Alpha?', 'No — Alpha has not been renamed.'],
  ['what would happen if we archived ACME?', 'Its people would be marked under an archived parent; nothing is deleted.'],
  ['how do I assign a task?', 'Open the task and pick an owner.'], ['explain how restore works', 'Restore returns the company to active with its history intact.'],
  ['summarise the merge', 'The merge completed on Friday; duplicates were removed.'], ['tell me about the hire', 'Alice Wong joined ACME as CFO on Monday.'],
  ['show me who was fired last quarter', 'Nobody was fired last quarter.'], ['list the deleted tasks', 'Deleted: QA-7, QA-9.'], ['any update on the rename?', 'The rename is pending your confirmation.'],
  ['status of the archive?', 'ACME was archived yesterday and remains archived.'], ['remind me what we approved', 'You approved the Q3 budget on Monday.'],
  ['the fire drill is at 3pm', 'Noted.'], ['I approve of this plan', 'Great.'], ['draft an email to Bob about the merge', 'Subject: Merge — Hi Bob, the merge was completed on Friday.'],
  ['write a memo on fire safety at ACME', 'Memo: fire safety at ACME — exits were checked and marked.'], ['brainstorm names for the new hire’s project', 'Ideas: Atlas, Beacon, Comet.'],
  ['we’re planning a hire next quarter', 'Understood — I can help draft the role.'], ['the store will reopen Monday', 'Noted.'], ['the client may reject the proposal', 'Understood.'],
  ['translate "delete" into Mongolian', '"устгах".'], ['history of the ACME archive', 'ACME was archived in June, restored in July, archived again in August.'],
  ['ACME’s archive date?', '2026-08-30.'], ['the delete log for QA-1', 'QA-1 was deleted on 2026-08-01 by Bob.'],
  ['what was created last week?', 'Delta Works and two tasks were created.'], ['how many people were moved to Beta Corp?', 'Three people were moved to Beta Corp in July.'],
  ['which approvals were rejected?', 'The hiring request was rejected on Monday.'], ['is Bob still assigned to QA-1?', 'Yes, Bob is assigned to QA-1.'],
  ['ACME-ийн төлөв юу вэ?', 'ACME идэвхтэй.'], ['хэдэн компани байна?', '14 компани байна.'], ['Bob-ын менежер хэн бэ?', 'Alice.'],
  ['walk me through what changed yesterday', 'Yesterday ACME was archived and QA-1 was completed.'], ['report on the Q3 goals', 'G1 was completed; G2 is at risk.'],
];
let fpAbsent = 0, fpRead = 0, fpOther = 0, fpNames = [];
for (const [command, ans] of READS) {
  const t0 = turn({ command, summary: ans }); const tR = turn({ command, summary: ans, requestIntent: RI('read') }); const tO = turn({ command, summary: ans, requestIntent: RI('other') });
  if (t0.summary !== ans) { fpAbsent++; fpNames.push(command + ' => ' + t0.summary); }
  if (tR.summary !== ans) { fpRead++; add(`B FP with model kind=read: "${command}"`, false, tR.summary); }
  if (tO.summary !== ans) { fpOther++; add(`B FP with model kind=other: "${command}"`, false, tO.summary); }
}
console.log(`FP-replace (reads ${READS.length}): model absent ${fpAbsent}, model read ${fpRead}, model other ${fpOther}`);
for (const n of fpNames) console.log('   FP(absent): ' + n);
add('B with model kind=read or other a truthful reply is NEVER replaced', fpRead === 0 && fpOther === 0, `${fpRead}/${fpOther}`);
add('B FP-replace with the model absent on my read corpus is 0', fpAbsent === 0, fpNames.join(' || '));

// ---- negations / hypotheticals ----
const NEG = [
  ['don’t archive ACME', 'OK — I won’t archive ACME.'], ['do not delete QA-1', 'Understood, QA-1 stays.'], ['never mind, don’t rename Alpha', 'OK, no rename.'],
  ['I don’t want you to archive ACME', 'Understood.'], ['no need to archive ACME', 'OK.'], ['stop — don’t approve it', 'Stopped; nothing approved.'],
  ['please don’t restore Beta Corp yet', 'OK, Beta Corp stays archived.'], ['let’s not fire Bob', 'OK.'],
  ['suppose we restore Beta Corp — what changes?', 'Its people become active again.'], ['if we archived ACME, who would be affected?', '9 people.'],
  ['what if we delete QA-1?', 'It cannot be recovered.'], ['I’m thinking about whether to archive ACME', 'Happy to talk it through.'],
  ['should we archive ACME?', 'It has no active tasks, so it is safe.'], ['we might archive ACME next month', 'Noted.'],
];
let negReceipt = 0, negShipped = 0, negFabricated = 0;
for (const [command, ans] of NEG) {
  const t = turn({ command, summary: ans });
  if (NO_CHANGE.test(t.summary)) { negReceipt++; add(`B negation/hypothetical "${command}" -> receipt reason is honest`, /you asked me not to|hypothetical|need your answer|did not resolve/.test(t.summary) && !/renamed|archived\b(?! companies)/.test(t.summary.replace(/No change was made — [^.]*\./, '')), t.summary); }
  else negShipped++;
  const fab = turn({ command, summary: 'Done — ACME has been archived.' });
  if (fab.summary === 'Done — ACME has been archived.') negFabricated++;
}
console.log(`negations/hypotheticals (${NEG.length}): receipt ${negReceipt}, truthful reply kept ${negShipped}; a fabricated completion on the same commands ships ${negFabricated}`);

// ---- request-side purity: same command × different replies → identical intent; response text never decides ----
for (const command of ['archive ACME', 'what happened to ACME?', 'yes', 'draft an email about the merge', 'ACME компанийг архивла']) {
  const replies = ['ACME has been archived.', 'ACME is active.', 'I will archive ACME once you confirm.', 'Nothing.', 'Archiving ACME now…', 'Renamed: "A" → "B"'];
  const intents = replies.map((r) => JSON.stringify(turn({ command, summary: r }).intent));
  add(`B purity: "${command}" derives one intent across ${replies.length} replies`, new Set(intents).size === 1, intents.join(' ; '));
  const withPA = turn({ command, summary: 'x', pendingAction: { kind: 'open_question', question: 'q?' } }).intent;
  add(`B purity: pendingAction does not change intent for "${command}"`, JSON.stringify(withPA) === intents[0], JSON.stringify(withPA));
}
// static: the derivation block reads only request-side names
import { src } from './v58_lib.mjs';
{
  const s = src.indexOf('const MUTATION_ARRAY_FIELDS'); const e = src.indexOf('const executedVerifiedCount', s);
  const block = src.slice(s, e);
  const forbidden = ['result.summary', 'resultRecord.summary', '.summary', 'readsAsCompletion', 'pendingAction', 'PAST_COMPLETION', 'COMPLETION_WORD', 'LEGACY_PAST', 'claimExecutionEvidence', 'lifecycleReports', 'factLines', 'conversationHistory', 'contextPack'];
  const code = block.split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n').replace(/\/(?![*/])(?:\\.|\[(?:\\.|[^\]\\\n])*\]|[^/\\\n[])+\/[a-z]*/g, '/re/');
  const hits = forbidden.filter((f) => new RegExp((f.startsWith('.') ? '' : '\\b') + f.replace(/\./g, '\\.') + '\\b').test(code));
  add('B static: the requestedIntent derivation block reads none of ' + forbidden.join(','), hits.length === 0, JSON.stringify(hits));
  add('B static: the final requestedIntent is the request-side derivation alone', /const requestedIntent: MutationIntent \| null = requestedIntentPrimary;/.test(block), '');
}

const r = tally('v58_intent_attack', rows);
writeFileSync(new URL('./intent_attack.json', import.meta.url), JSON.stringify({ gen, fnAbsent, fnOther, fnMutation, fnLang, fnLangM, fnSlang, fnSlangM, fpAbsent, fpRead, fpOther, fpNames, negReceipt, negShipped, negFabricated, byWrapper: [...fnAbsentSamples.entries()].map(([k, n]) => [WRAPPERS[k]('archive', 'ACME'), n]), fails: r.fails }, null, 1));
process.exit(r.fails.length ? 1 : 0);
