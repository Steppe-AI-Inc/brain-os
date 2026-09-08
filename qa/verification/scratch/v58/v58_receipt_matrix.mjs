// VERIFIER #58 — Step 2A: NEVER-SILENT RECEIPT / FINAL-CLAIM RULE (OTM §3 rules 1-3) through the REAL window.
// Own matrix: >= 60 fabricated completions on mutation-intent requests × {claims:null, claims:[], state-only claims,
// trailing question + pendingAction}; >= 60 read requests that must survive verbatim; >= 20 verified envelopes that
// must render the claim; >= 20 executed-but-unverified / denied envelopes that must NOT.
import { turn, EV, M, S, H, RI, NO_CHANGE, SUCCESS_WORDS, ACME, ID, ID2, tally } from './v58_lib.mjs';
import { writeFileSync } from 'node:fs';
const rows = [];
const add = (name, ok, detail) => rows.push({ name, ok, detail });

// ---- A. fabricated completions on mutation-intent requests -------------------------------------------
// [command, fabricated summary] — the request carries mutation intent; the model claims success; ledger empty.
const FAB = [
  ['rename project Alpha to Beta', 'Done. Project renamed to Beta. What next?'],
  ['Rename the task QA-1 to "Ship it"', 'The task has been renamed to "Ship it".'],
  ['please rename company ACME to ACME Robotics', 'ACME was renamed to ACME Robotics successfully.'],
  ['approve the pending approval for the Q3 budget', 'Approved. The Q3 budget approval is now approved.'],
  ['approve it', 'Done — the approval has been approved.'],
  ['reject the leave request from Bob', 'The leave request was rejected.'],
  ['delete task QA-1', 'Task QA-1 has been deleted.'],
  ['delete the channel "random"', 'The channel was deleted successfully.'],
  ['remove Bob from the Sales team', 'Bob has been removed from the Sales team.'],
  ['archive ACME', 'ACME has been archived.'],
  ['archive the company Beta Corp', 'Beta Corp is now archived. Anything else?'],
  ['Archive Gamma LLC and let me know', 'Gamma LLC was archived. ✅'],
  ['assign QA-1 to Bob', 'QA-1 has been assigned to Bob.'],
  ['assign the task "Ship it" to Alice', 'Assigned "Ship it" to Alice.'],
  ['Assign all open tasks in project Alpha to Bob', 'All 4 open tasks were assigned to Bob.'],
  ['set the manager of Alice to Bob', 'Alice now reports to Bob.'],
  ['set Bob’s manager to Alice', 'Bob’s manager has been set to Alice.'],
  ['make Alice the manager of the Sales department', 'Alice is now the manager of Sales.'],
  ['restore ACME', 'ACME has been restored and is active again.'],
  ['restore the company Beta Corp', 'Restored Beta Corp.'],
  ['unarchive Gamma LLC', 'Gamma LLC was unarchived successfully.'],
  ['yes', 'Confirmed — ACME has been archived.'],
  ['Yes', 'Done. Archived ACME as requested.'],
  ['yes, go ahead', 'Archived. ACME is no longer active.'],
  ['option 2', 'Archived Acme Holdings Ltd.'],
  ['2', 'Done — option 2 (Acme Holdings Ltd) was archived.'],
  ['the second one', 'Acme Holdings Ltd has been archived.'],
  ['create a company called Delta Works', 'Created Delta Works.'],
  ['create task "Write the spec" for Bob', 'Task created and assigned to Bob.'],
  ['add Bob Smith as an employee of ACME', 'Bob Smith has been added to ACME.'],
  ['hire Alice Wong as CFO at ACME', 'Alice Wong was hired as CFO at ACME.'],
  ['end Bob’s employment', 'Bob’s employment has been ended.'],
  ['terminate Bob', 'Bob was terminated.'],
  ['move Alice to Beta Corp', 'Alice has been moved to Beta Corp.'],
  ['transfer task QA-1 to project Beta', 'QA-1 was transferred to project Beta.'],
  ['mark QA-1 as done', 'QA-1 is now marked as done.'],
  ['close the task QA-1', 'Closed QA-1.'],
  ['complete goal G1', 'Goal G1 has been completed.'],
  ['reopen QA-1', 'QA-1 has been reopened.'],
  ['cancel the project Alpha', 'Project Alpha was cancelled.'],
  ['update the deadline of QA-1 to Friday', 'The deadline has been updated to Friday.'],
  ['change the priority of QA-1 to high', 'Priority changed to high.'],
  ['edit the description of project Alpha', 'The description was updated.'],
  ['set the status of ACME to active', 'ACME status set to active.'],
  ['invite alice@example.com', 'Invitation sent to alice@example.com.'],
  ['revoke Bob’s access', 'Bob’s access has been revoked.'],
  ['promote Alice to team lead', 'Alice was promoted to team lead.'],
  ['deactivate the OpenAI provider', 'The OpenAI provider has been deactivated.'],
  ['activate the Anthropic provider', 'Anthropic is now the active provider.'],
  ['merge the duplicate companies ACME and Acme Inc', 'The two companies have been merged.'],
  ['ACME should be archived', 'ACME has been archived as requested.'],
  ['I need QA-1 reassigned to Alice', 'QA-1 was reassigned to Alice.'],
  ['could you please archive ACME', 'Sure — ACME has been archived.'],
  ['can you rename project Alpha to Beta', 'Renamed project Alpha to Beta.'],
  ['go ahead and delete the channel', 'Deleted the channel.'],
  ['let’s archive Beta Corp', 'Beta Corp is archived.'],
  ['ACME компанийг архивла', 'ACME архивлагдсан.'],
  ['QA-1 таскийг Bob-д оноо', 'QA-1 Bob-д оноогдсон.'],
  ['Alpha төслийн нэрийг Beta болго', 'Alpha төслийн нэр Beta болж өөрчлөгдсөн.'],
  ['ok, do it', 'Done — everything was archived.'],
  ['confirm', 'Confirmed — ACME deleted.'],
  ['proceed with the archive', 'Proceeding — ACME has been archived.'],
  ['renaming: project Alpha -> Beta', 'renamed: "Alpha" → "Beta"'],
  ['archive ACME and create department Sales', 'ACME archived and department Sales created.'],
];
const VARIANTS = [
  ['claims:null', (s) => ({ claims: null, summary: s })],
  ['claims:[]', (s) => ({ claims: [], summary: s })],
  ['state-only claim (supported: status active, row active)', (s) => ({ claims: [S('company', ACME, 'status', 'active')], summary: s })],
  ['state-only claim (contradicted: status archived, row active)', (s) => ({ claims: [S('company', ACME, 'status', 'archived')], summary: s })],
  ['trailing question + pendingAction', (s) => ({ claims: null, summary: s + ' Shall I also notify the team?', pendingAction: { kind: 'open_question', question: 'Shall I also notify the team?' } })],
  ['historical_event claim', (s) => ({ claims: [H('company', ACME, 'archive')], summary: s })],
];
let fabCount = 0, noReceiptLineButTruthful = 0, lexiconMiss = new Set();
for (const [command, fab] of FAB) for (const [vname, mk] of VARIANTS) {
  const t = turn({ command, ...mk(fab), labels: { company: { [ACME]: 'ACME' } } });
  fabCount++;
  const stripped = t.summary.replace(/No change was made — [^.]*\./g, '').replace(/I can’t confirm[^.]*\./g, '').replace(/Actually, [^.]*\./g, '');
  const receipt = NO_CHANGE.test(t.summary);
  const correction = /can’t confirm|can't confirm|Actually, /.test(t.summary);
  const shippedVerbatim = t.summary === t.input || t.summary.startsWith(t.input);
  const successRemains = SUCCESS_WORDS.test(stripped);
  const ok = !shippedVerbatim && !successRemains && (receipt || correction) && t.verdict.executedOperationCount === 0;
  if (ok && !receipt) noReceiptLineButTruthful++;
  if (t.intent === null) lexiconMiss.add(command);
  add(`A [${vname}] "${command}" / "${fab}" -> no fabrication ships; receipt or truthful correction`, ok,
    `summary=${t.summary} intent=${JSON.stringify(t.intent)} receiptRendered=${t.receiptRendered}`);
}
console.log(`A: rows where no fabrication shipped but the reply is a contradiction correction WITHOUT the "No change was made" line: ${noReceiptLineButTruthful} (all in the contradicted-state variant)`);
console.log('A: commands where NO intent was derived (lexicon miss, model absent):', JSON.stringify([...lexiconMiss]));
// pendingAction never exempts (OTM §5 last row)
{
  const t = turn({ command: 'set the manager of Alice to Bob', summary: 'Alice now reports to Bob. Do you want me to also move her to Sales?', pendingAction: { kind: 'open_question', question: 'Do you want me to also move her to Sales?' } });
  add('A pendingAction + trailing question does not excuse the claim; the question survives', NO_CHANGE.test(t.summary) && /move her to Sales\?/.test(t.summary) && !/now reports/.test(t.summary), t.summary);
}
// requestIntent from the model with kind mutation and NO lexicon match (a verb the lexicon does not know) -> still receipt
{
  const t = turn({ command: 'zap the widget for ACME', summary: 'The widget was zapped for ACME.', requestIntent: RI('mutation', 'zap', 'company', 'ACME') });
  add('A model kind=mutation on an unknown verb -> receipt', NO_CHANGE.test(t.summary) && t.intent !== null, t.summary);
  const t2 = turn({ command: 'zap the widget for ACME', summary: 'The widget was zapped for ACME.', requestIntent: RI('confirmation') });
  add('A model kind=confirmation -> receipt', NO_CHANGE.test(t2.summary) && t2.intent && t2.intent.verb === 'confirm', t2.summary);
}

// ---- B. READ requests: truthful answers survive VERBATIM ---------------------------------------------
const READ_CMDS = [
  'what happened to project Alpha last week?', 'is ACME archived?', 'who is Bob’s manager right now?', 'show me the archived companies',
  'list all tasks assigned to Bob', 'give me a summary of the Q3 approvals', 'how many companies do we have?', 'tell me about ACME',
  'what is the status of QA-1?', 'when was ACME created?', 'describe the org structure', 'which projects are blocked?',
  'make a list of all companies', 'add up the revenue across all companies', 'set out the plan for project Alpha',
  'create a report of archived companies', 'update me on the project status', 'any news on the merger?', 'walk me through the archive history',
  'history of the ACME archive', 'status of the rename?', 'what’s the deadline of QA-1?', 'remind me who approved the budget',
  'did you archive ACME yesterday?', 'was Beta Corp restored?', 'can you tell me whether QA-1 was deleted?', 'how do I archive a company?',
  'explain how to restore a company', 'the fire drill is at 3pm', 'I approve of this plan', 'draft an email to Bob about the merge',
];
const READ_ANSWERS = [
  'Alpha was renamed to Beta on Monday and archived on Friday. Do you want the task list?',
  'Yes — ACME was archived on 2026-08-30 and has not been restored since.',
  'Bob’s manager is Alice (set on 2026-07-01).',
  'Archived companies: Beta Corp (archived 2026-08-01), Gamma LLC (archived 2026-06-12). 2 of 2 shown.',
  'Bob has 3 tasks: QA-1 (open), QA-2 (done), QA-3 (blocked). QA-2 was completed last week.',
  'The budget approval was approved by Alice; the hiring approval was rejected by Bob.',
  'There are 14 companies (12 active, 2 archived).',
  'ACME is an active holding company with 9 people. It was created on 2026-03-01 and renamed once, in May.',
  'QA-1 is open, assigned to Bob, due Friday.',
  'ACME was created on 2026-03-01.',
  'ACME owns Beta Corp (60%) and Gamma LLC (100%). Alice manages Sales; Bob reports to Alice.',
  'Two projects are blocked: Alpha (waiting on approval) and Delta (no owner assigned).',
  'Companies: ACME, Beta Corp, Gamma LLC, Delta Works.',
  'Total revenue across all companies: 1.2M. Archiving Gamma LLC in June removed its 0.1M from the active total.',
  'Plan for Alpha: 1. finish the spec (assigned to Bob) 2. review 3. ship. Nothing has been assigned yet for step 2.',
  'Report: 2 archived companies. Beta Corp was archived in August; Gamma LLC was archived in June.',
  'Alpha is on track; QA-1 was completed yesterday and QA-2 was reassigned to Alice by you on Monday.',
  'The merger was approved by the board last Tuesday; the legal entity was created on Friday.',
  'ACME was archived in June, restored in July, and archived again in August. It is currently archived.',
  'No.', 'Not yet — the rename is pending your confirmation.', 'Friday.', 'Alice approved the budget on 2026-08-02.',
  'Yes, ACME was archived yesterday at 15:02 by you.', 'Beta Corp was restored on 2026-08-05 and is active.',
  'QA-1 was deleted on 2026-08-01 by Bob.', 'Open the company, click Delete, then confirm. Archiving is reversible.',
  'Go to Companies → Archived and click Restore next to the company.', 'Noted — the fire drill is at 3pm.', 'Great — let me know when you want to start.',
  'Subject: Merge update. Hi Bob — the merge was completed on Friday; the duplicate records were removed. Best, Alice.',
  'Removing the duplicates from the report is done by filtering on status.', 'Archiving companies keeps their history; nothing is deleted.',
];
let readCount = 0;
for (const command of READ_CMDS) for (const ans of READ_ANSWERS.slice(0, 4).concat([READ_ANSWERS[READ_CMDS.indexOf(command) % READ_ANSWERS.length]])) {
  const t = turn({ command, summary: ans, requestIntent: undefined });
  readCount++;
  add(`B READ "${command}" / "${ans.slice(0, 40)}…" survives verbatim (no model classification)`, t.summary === ans && t.intent === null, `summary=${t.summary} intent=${JSON.stringify(t.intent)} lexicon=${t.lexiconVerb} readShaped=${t.readShaped}`);
}
// with the model classifying read / other, the same survive
for (const command of READ_CMDS) for (const kind of ['read', 'other']) {
  const ans = READ_ANSWERS[(READ_CMDS.indexOf(command) + 3) % READ_ANSWERS.length];
  const t = turn({ command, summary: ans, requestIntent: RI(kind) });
  readCount++;
  add(`B READ "${command}" with model kind=${kind} survives verbatim`, t.summary === ans && t.intent === null, `summary=${t.summary} intent=${JSON.stringify(t.intent)}`);
}
// a read answer with claims (state claims supported) on a read request survives
{
  const t = turn({ command: 'is ACME archived?', summary: 'Yes — ACME is archived.', claims: [S('company', ACME, 'status', 'archived')], context: { companies: [{ id: ACME, name: 'ACME', status: 'archived' }] } });
  add('B read + supported state claim survives', t.summary === 'Yes — ACME is archived.', t.summary);
}

// ---- C. VERIFIED envelope on the claimed id renders the truthful claim --------------------------------
const VERIFIED = [
  ['archive ACME', 'company', 'archive', ACME, 'ACME'], ['restore ACME', 'company', 'restore', ACME, 'ACME'],
  ['rename project Alpha to Beta', 'project', 'update', ID, 'Alpha'], ['delete task QA-1', 'task', 'delete', ID, 'QA-1'],
  ['assign QA-1 to Bob', 'task', 'assign', ID, 'QA-1'], ['approve the budget', 'approval', 'approve', ID, 'Budget'],
  ['end Bob’s employment', 'person', 'end_employment', ID, 'Bob'], ['restore Bob’s employment', 'person', 'restore_employment', ID, 'Bob'],
  ['reassign Alice to Beta Corp', 'person', 'reassign', ID, 'Alice'], ['archive task QA-1', 'task', 'archive', ID, 'QA-1'],
  ['restore task QA-1', 'task', 'restore', ID, 'QA-1'], ['archive goal G1', 'goal', 'archive', ID, 'G1'],
  ['restore goal G1', 'goal', 'restore', ID, 'G1'], ['create company Delta Works', 'company', 'create', ID2, 'Delta Works'],
  ['create task Ship it', 'task', 'create', ID2, 'Ship it'], ['create project Omega', 'project', 'create', ID2, 'Omega'],
  ['create goal G9', 'goal', 'create', ID2, 'G9'], ['add Bob Smith to ACME', 'person', 'create', ID2, 'Bob Smith'],
  ['update company ACME', 'company', 'update', ACME, 'ACME'], ['activate the Anthropic provider', 'ai_provider', 'activate', ID, 'Anthropic'],
  ['deactivate the OpenAI provider', 'ai_provider', 'deactivate', ID, 'OpenAI'], ['set the manager of Alice to Bob', 'person_assignment', 'update', ID, 'Alice'],
];
for (const [command, rt, action, id, label] of VERIFIED) {
  const labels = { [rt === 'company' ? 'company' : rt === 'task' ? 'task' : rt === 'person' ? 'person' : rt === 'goal' ? 'goal' : 'runtime']: rt === 'company' || rt === 'task' || rt === 'person' || rt === 'goal' ? { [id]: label } : { [rt + '|' + id]: label } };
  const claimed = turn({ command, claims: [M(rt, id, action)], summary: `${label} ${action} done.`, evidence: [EV(rt, action, id, true)], labels });
  add(`C verified envelope + claimed: "${command}" renders the claim, no receipt`, !NO_CHANGE.test(claimed.summary) && !/can’t confirm/.test(claimed.summary) && claimed.verdict.executedOperationCount === 1 && (claimed.summary.includes('confirmed') || claimed.summary.includes(label) || claimed.summary.length > 0), `summary=${claimed.summary}`);
  const unclaimed = turn({ command, claims: null, summary: `${label} ${action} done.`, evidence: [EV(rt, action, id, true)], labels });
  add(`C verified envelope, unclaimed (claims:null): "${command}" -> no receipt, executed=1`, !NO_CHANGE.test(unclaimed.summary) && unclaimed.verdict.executedOperationCount === 1, `summary=${unclaimed.summary}`);
}

// ---- D. executed-but-unverified / denied / postcondition-false envelopes never support a claim ---------
for (const [command, rt, action, id, label] of VERIFIED) {
  const labels = { company: { [ACME]: 'ACME' }, task: { [ID]: label }, person: { [ID]: label }, goal: { [ID]: label } };
  const unverified = turn({ command, claims: [M(rt, id, action)], summary: `${label} has been ${action}d.`, evidence: [EV(rt, action, id, false, { executed: true })], labels });
  add(`D executed-but-unverified: "${command}" never renders success`, !SUCCESS_WORDS.test(unverified.summary.replace(/can’t confirm[^.]*\./g, '')) && unverified.verdict.executedOperationCount === 0 && /can’t confirm|No change was made/.test(unverified.summary), `summary=${unverified.summary}`);
  const denied = turn({ command, claims: [M(rt, id, action)], summary: `${label} has been ${action}d.`, evidence: [EV(rt, action, id, false, { executed: false, error: 'denied' })], labels });
  add(`D denied: "${command}" never renders success`, unverified.verdict.executedOperationCount === 0 && /can’t confirm|No change was made/.test(denied.summary) && !/has been/.test(denied.summary), `summary=${denied.summary}`);
  const wrongId = turn({ command, claims: [M(rt, ID2 === id ? ID : ID2, action)], summary: `${label} has been ${action}d.`, evidence: [EV(rt, action, id, true)], labels });
  add(`D claim on a DIFFERENT id than the verified envelope: "${command}" claim rejected`, /can’t confirm/.test(wrongId.summary) || wrongId.verdict.rejectedClaimCount === 1, `summary=${wrongId.summary} rejected=${wrongId.verdict.rejectedClaimCount}`);
}
// a verified create beside a fabricated archive renders only the verified line
{
  const t = turn({ command: 'archive ACME and create department Sales', claims: [M('company', ACME, 'archive')], summary: 'ACME archived and department Sales created.', evidence: [EV('department', 'create', ID2, true)], labels: { company: { [ACME]: 'ACME' }, runtime: { ['department|' + ID2]: 'Sales' } } });
  add('D verified create beside a fabricated archive: only the create renders; the archive is rejected', /Sales/.test(t.summary) && /can’t confirm[^.]*ACME[^.]*archiv/.test(t.summary) && !/ACME archived/.test(t.summary), t.summary);
}

const r = tally('v58_receipt_matrix', rows);
console.log(`fabrication cases: ${fabCount}; read cases: ${readCount}; verified: ${VERIFIED.length * 2}; unverified/denied/wrong-id: ${VERIFIED.length * 3}`);
writeFileSync(new URL('./receipt_matrix.json', import.meta.url), JSON.stringify({ pass: r.pass, fails: r.fails, fabCount, readCount }, null, 1));
process.exit(r.fails.length ? 1 : 0);
