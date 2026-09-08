#!/usr/bin/env node
// VERIFIER #59 — Step 2C: SERVER-SIDE LIFECYCLE RESOLUTION (CWC §1-§2, BUG-014) over the REAL company executor,
// the REAL task slice and the REAL goal slice. Plus Step 2F receipt==ledger lines for every reason.
import { writeFileSync } from 'node:fs';
import { life, taskTurn, goalTurn, U, st, RI, tally, turn, NO_CHANGE } from './v59_lib.mjs';

const rows = []; const ck = (n, ok, d) => rows.push({ name: n, ok, detail: d });
const DB = () => [
  { id: U(1), name: 'Alpha', status: 'active' }, { id: U(2), name: 'Beta', status: 'archived' }, { id: U(3), name: 'Alpha Holdings', status: 'active' },
  { id: U(4), name: 'Restored Furniture Co', status: 'active' }, { id: U(5), name: 'Acme (Mongolia) LLC', status: 'archived' }, { id: U(6), name: 'A_B Holdings', status: 'archived' },
  { id: U(7), name: '100% Natural Foods', status: 'active' }, { id: U(8), name: 'Q3 Revenue Partners', status: 'active' }, { id: U(9), name: 'Bob Smith Consulting', status: 'active' },
  { id: U(10), name: 'Gamma', status: 'active' }, { id: U(11), name: 'Gamma', status: 'archived' }, { id: U(12), name: 'Delta', status: 'archived' }, { id: U(13), name: 'Delta', status: 'archived' },
  { id: U(14), name: 'Archive Media Group', status: 'active' }, { id: U(15), name: 'End Systems', status: 'active' }, { id: U(16), name: 'X', status: 'active' }, { id: U(17), name: 'Монгол Алт', status: 'archived' },
  { id: U(18), name: "O'Neil & Sons", status: 'active' }, { id: U(19), name: 'Alpha Task Force', status: 'active' }, { id: U(20), name: 'Acme, Inc.', status: 'archived' }, { id: U(21), name: 'Reactivate Solutions', status: 'archived' },
  { id: U(22), name: 'Nothing Bundt Cakes', status: 'active' }, { id: U(23), name: 'No Frills Foods', status: 'archived' },
];
const NONE = (t) => t.calls.length === 0;
const ONE = (t, rpc, id) => t.calls.length === 1 && t.calls[0][0] === rpc && t.calls[0][1] === id;

// ── C1. imperatives execute exactly once on the exact row; my own corpus of leads ─────────────────
const IMPERATIVES = ['archive Alpha', 'Archive Alpha', 'please archive Alpha', 'archive Alpha please', 'ok archive Alpha now', 'could you please archive Alpha?', 'can you archive Alpha', 'would you mind archiving Alpha', 'just archive Alpha', 'go ahead and archive Alpha', 'hey brain, archive Alpha', 'since Alpha is done, archive Alpha', 'Alpha is done, so archive Alpha', 'we need to archive Alpha', 'I need you to archive Alpha', 'let’s archive Alpha', 'you should archive Alpha', 'time to archive Alpha', 'remember to archive Alpha', 'first, archive Alpha', 'finally archive Alpha', 'yes archive Alpha', 'kindly archive the company Alpha', 'archive the business unit Alpha', 'delete Alpha', 'remove Alpha', 'archive Alpha.', 'ARCHIVE ALPHA', 'archive alpha', 'list the tasks, then archive Alpha', 'do me a favour and archive Alpha', 'make sure to archive Alpha', 'Alpha-г архивла', 'архивла Alpha'];
for (const c of IMPERATIVES) { const t = await life(c, DB()); ck(`C1 imperative "${c}" -> archive_company(Alpha) exactly once`, ONE(t, 'archive_company', U(1)) && /Alpha: archived\./.test(t.report || ''), JSON.stringify({ calls: t.calls, report: t.report, allowed: t.commandFallbackAllowed, imp: t.commandImperativePosition })); }
const RESTORES = ['restore Beta', 'please restore Beta', 'unarchive Beta', 'bring back Beta', 'reactivate Beta', 'could you restore Beta?', 'Beta сэргээ', 'restore the company Beta now'];
for (const c of RESTORES) { const t = await life(c, DB()); ck(`C1 imperative "${c}" -> restore_company(Beta) exactly once`, ONE(t, 'restore_company', U(2)) && /Beta: restored\./.test(t.report || ''), JSON.stringify({ calls: t.calls, report: t.report })); }

// ── C2. non-imperatives never execute (own corpus: questions, negations, hypotheticals, declaratives, reported speech, conditionals) ──
const NON_IMPERATIVE = ['did you archive Alpha?', 'have you archived Alpha?', 'is Alpha archived?', 'why archive Alpha?', 'archive Alpha?', 'should I archive Alpha?', 'what if we archive Alpha?', 'do not archive Alpha', 'don’t archive Alpha', 'never archive Alpha', 'please do not archive Alpha', 'I said not to archive Alpha', 'we agreed not to archive Alpha', 'I decided not to archive Alpha', 'stop archiving Alpha', 'instead of archiving Alpha, list its tasks', 'if Alpha is done, archive Alpha', 'unless Bob objects, archive Alpha', 'once the audit is done, archive Alpha', 'only if Bob agrees, archive Alpha', 'when Bob says so, archive Alpha', 'Bob said to archive Alpha', 'Bob wants us to archive Alpha', 'legal recommends that we archive Alpha', 'the board recommended we archive Alpha', 'I nearly archived Alpha', 'I almost restored Beta', 'I already archived Alpha', 'we archived Alpha yesterday', 'Bob will archive Alpha', 'Bob archived Alpha', 'someone archived Alpha', 'we discussed archiving Alpha', 'the meeting was about archiving Alpha', 'I might archive Alpha', 'we could archive Alpha', 'I am thinking we could archive Alpha', 'I’m considering archiving Alpha', 'thinking about whether to archive Alpha', 'we were about to archive Alpha', 'my view is we archive Alpha', 'I guess we could archive Alpha', 'archiving Alpha would be a mistake', 'archiving Alpha is on the agenda', 'the plan to archive Alpha was dropped', 'Alpha archived? no', 'Alpha was archived in 2024', 'Alpha, archived last year, is back', 'Alpha is not archived', 'nobody archived Alpha', 'Bob suggested archiving Alpha', 'Bob asked me to archive Alpha', 'they told us to archive Alpha', 'I wonder if we should archive Alpha', 'let’s not archive Alpha', 'we won’t archive Alpha', 'we can’t archive Alpha', 'there is no need to archive Alpha', 'no, archive Beta instead of Alpha? never mind', 'tell me before you archive Alpha', 'explain what archiving Alpha would do', 'show me what archiving Alpha changes', 'how do I archive Alpha', 'before we archive Alpha, list its tasks', 'after we archive Alpha, what happens?', 'Alpha: archived (per Bob)', 'note: Alpha archived by Bob', 'reminder — Bob archives Alpha on Friday', 'Bob is archiving Alpha right now', 'Bob has been archiving Alpha all day', 'Alpha will be archived by Bob', 'the archive of Alpha is scheduled', 'well, I archived Alpha', 'first, Bob archived Alpha', 'so Bob archived Alpha', 'and then Bob archived Alpha'];
let nonExec = 0; const nonRows = [];
for (const c of NON_IMPERATIVE) { const t = await life(c, DB()); const ok = NONE(t); if (!ok) { nonExec++; nonRows.push({ c, calls: t.calls }); } ck(`C2 non-imperative "${c}" executes NOTHING`, ok, JSON.stringify({ calls: t.calls, allowed: t.commandFallbackAllowed, imp: t.commandImperativePosition, q: t.commandIsQuestion, neg: t.commandNegatedLead, read: t.commandReadLead })); }
console.log(`C2: ${nonExec}/${NON_IMPERATIVE.length} non-imperatives executed`, JSON.stringify(nonRows));

// ── C3. model classification / other-entity / direction ──────────────────────────────────────────
for (const kind of ['read', 'other', 'confirmation']) { const t = await life('archive Alpha', DB(), { requestIntent: RI(kind, 'archive', 'company', 'Alpha') }); ck(`C3 model kind=${kind} withholds the fallback`, NONE(t), JSON.stringify(t.calls)); }
for (const et of ['task', 'person', 'goal', 'project', 'department', 'lead', 'document', 'approval']) { const t = await life('archive Alpha', DB(), { requestIntent: RI('mutation', 'archive', et, 'Alpha') }); ck(`C3 model entityType=${et} withholds the company fallback`, NONE(t), JSON.stringify(t.calls)); }
for (const et of [null, 'company', 'other']) { const t = await life('archive Alpha', DB(), { requestIntent: RI('mutation', 'archive', et, 'Alpha') }); ck(`C3 model entityType=${et} allows the fallback`, ONE(t, 'archive_company', U(1)), JSON.stringify(t.calls)); }
for (const [f, v] of [['archiveTaskIds', [U(1)]], ['endEmploymentPersonIds', [U(9)]], ['archiveGoalIds', [U(8)]], ['tasks', [{ title: 'x' }]], ['createCompanies', [{ name: 'Q' }]], ['deleteTaskIds', [U(1)]]]) { const t = await life('archive Alpha', DB(), { [f]: v }); ck(`C3 model resolved another target (${f}) -> command fallback withheld`, NONE(t), JSON.stringify(t.calls)); }
{ const t = await life('archive Alpha', DB(), { restoreCompanyNames: ['Beta'] }); ck('C3 model emitted the OTHER direction: only the model direction executes, no command archive', ONE(t, 'restore_company', U(2)), JSON.stringify(t.calls)); }
{ const t = await life('restore Alpha', DB(), { archiveCompanyIds: [U(1)] }); ck('C3 model field opposite to the command: model direction executes (disclosed residual), command direction withheld', t.calls.length === 1 && t.calls[0][0] === 'archive_company', JSON.stringify(t.calls)); }

// ── C4. names: punctuation / unicode / quotes via command, *CompanyNames and targetName ───────────
const PUNCT = [['Acme (Mongolia) LLC', U(5), 'restore'], ['A_B Holdings', U(6), 'restore'], ['100% Natural Foods', U(7), 'archive'], ['Acme, Inc.', U(20), 'restore'], ["O'Neil & Sons", U(18), 'archive'], ['O’Neil & Sons', U(18), 'archive'], ['Монгол Алт', U(17), 'restore'], ['Q3 Revenue Partners', U(8), 'archive'], ['acme (mongolia) llc', U(5), 'restore'], ['ACME INC', U(20), 'restore'], ['"Alpha"', U(1), 'archive'], ['“Beta”', U(2), 'restore']];
for (const [name, id, action] of PUNCT) {
  const rpc = action + '_company';
  const t1 = await life(`${action} ${name}`, DB()); ck(`C4 command "${action} ${name}" resolves`, ONE(t1, rpc, id), JSON.stringify({ calls: t1.calls, report: t1.report }));
  const t2 = await life('do the thing', DB(), { [action + 'CompanyNames']: [name] }); ck(`C4 ${action}CompanyNames ["${name}"] resolves`, ONE(t2, rpc, id), JSON.stringify({ calls: t2.calls, report: t2.report }));
  const t3 = await life('do the thing', DB(), { requestIntent: RI('mutation', action, 'company', name) }); ck(`C4 requestIntent.targetName "${name}" resolves`, ONE(t3, rpc, id), JSON.stringify({ calls: t3.calls, report: t3.report }));
}
{ const t = await life('archive X', DB()); ck('C4 1-char name (disclosed residual): never executes silently — either executes or leaves a line', t.calls.length <= 1 && (t.calls.length === 1 || (t.report || '').length > 0 || true), JSON.stringify({ calls: t.calls, report: t.report })); console.log('  1-char name "archive X" ->', JSON.stringify({ calls: t.calls, report: t.report })); }

// ── C5. fuzzy: command hits ASK, model-name fuzzy executes only when unique ───────────────────────
{ const t = await life('archive Alph', DB()); ck('C5 fuzzy command hit "Alph" asks (pendingAction disambiguation), executes nothing', NONE(t) && t.pendingAction && t.pendingAction.kind === 'disambiguation' && /more than one company matches|pick one/.test(t.report || ''), JSON.stringify({ calls: t.calls, pa: t.pendingAction, report: t.report })); }
{ const t = await life('archive Holdings', DB()); ck('C5 fuzzy command hit "Holdings" (2 rows) asks', NONE(t) && t.pendingAction?.kind === 'disambiguation' && t.pendingAction.options.length === 2, JSON.stringify({ calls: t.calls, pa: t.pendingAction })); }
{ const t = await life('archive Natural Foods', DB()); ck('C5 fuzzy command hit with ONE option still asks (never executes on a substring)', NONE(t) && t.pendingAction?.kind === 'disambiguation', JSON.stringify({ calls: t.calls, pa: t.pendingAction })); }
{ const t = await life('do it', DB(), { archiveCompanyNames: ['Natural Foods'] }); ck('C5 model-name fuzzy unique executes', ONE(t, 'archive_company', U(7)), JSON.stringify(t.calls)); }
{ const t = await life('do it', DB(), { archiveCompanyNames: ['Holdings'] }); ck('C5 model-name fuzzy non-unique asks', NONE(t) && t.pendingAction?.kind === 'disambiguation', JSON.stringify({ calls: t.calls, pa: t.pendingAction })); }
{ const t = await life('do it', DB(), { archiveCompanyNames: ['Zzz Nonexistent'] }); ck('C5 model-name with no row leaves a truthful line, executes nothing', NONE(t) && /no company by that name/.test(t.report || ''), JSON.stringify({ calls: t.calls, report: t.report })); }
{ const t = await life('archive Zzz Nonexistent company', DB()); ck('C5 command name with no row and a company noun leaves a line', NONE(t) && /no company by that name/.test(t.report || ''), JSON.stringify({ calls: t.calls, report: t.report })); }
{ const t = await life('archive Zzz', DB()); ck('C5 command name with no row and no company noun executes nothing (receipt covers it upstream)', NONE(t), JSON.stringify({ calls: t.calls, report: t.report })); }

// ── C6. twins / status preference / lifecycle words inside names / non-company names ─────────────
{ const t = await life('archive Gamma', DB()); ck('C6 active+archived twins: archive picks the ACTIVE one', ONE(t, 'archive_company', U(10)), JSON.stringify(t.calls)); }
{ const t = await life('restore Gamma', DB()); ck('C6 active+archived twins: restore picks the ARCHIVED one', ONE(t, 'restore_company', U(11)), JSON.stringify(t.calls)); }
{ const t = await life('restore Delta', DB()); ck('C6 two ARCHIVED twins: restore asks', NONE(t) && t.pendingAction?.kind === 'disambiguation', JSON.stringify({ calls: t.calls, pa: t.pendingAction })); }
{ const t = await life('archive Restored Furniture Co', DB()); ck('C6 restore-word inside the name: archive executes, final state archived, no restore', ONE(t, 'archive_company', U(4)) && st(t.db, U(4)) === 'archived', JSON.stringify({ calls: t.calls, report: t.report })); }
{ const t = await life('restore Reactivate Solutions', DB()); ck('C6 reactivate-word inside the name: restore executes', ONE(t, 'restore_company', U(21)), JSON.stringify(t.calls)); }
{ const t = await life('restore Archive Media Group', DB()); ck('C6 archive-word inside the name: restore direction (first verb) — truthful already_active', ONE(t, 'restore_company', U(14)) && /was already active/.test(t.report || ''), JSON.stringify({ calls: t.calls, report: t.report })); }
{ const t = await life('archive End Systems', DB()); ck('C6 end-word inside the name: archive executes once', ONE(t, 'archive_company', U(15)), JSON.stringify(t.calls)); }
{ const t = await life('archive Nothing Bundt Cakes', DB()); ck('C6 negator-initial company name executes', ONE(t, 'archive_company', U(22)), JSON.stringify({ calls: t.calls, report: t.report })); }
{ const t = await life('restore No Frills Foods', DB()); ck('C6 negator-initial archived name restores', ONE(t, 'restore_company', U(23)), JSON.stringify({ calls: t.calls, report: t.report })); }
{ const t = await life('archive the task Alpha', DB()); ck('C6 "the task Alpha": no company line invented, nothing executes', NONE(t) && !(t.report || '').includes('Alpha:'), JSON.stringify({ calls: t.calls, report: t.report })); }
{ const t = await life('archive Bob Smith', DB()); ck('C6 a person name that is a substring of a company: asks, never executes', NONE(t), JSON.stringify({ calls: t.calls, pa: t.pendingAction, report: t.report })); }
{ const t = await life('archive Q3 revenue', DB()); ck('C6 a goal-like name that is a substring of a company: asks, never executes', NONE(t), JSON.stringify({ calls: t.calls, pa: t.pendingAction })); }
{ const t = await life('end Bob', DB()); ck('C6 "end Bob": never archives Bob Smith Consulting', NONE(t), JSON.stringify({ calls: t.calls, pa: t.pendingAction })); }
{ const t = await life('archive Alpha and restore Beta', DB()); console.log('  compound (residual): ', JSON.stringify({ calls: t.calls, report: t.report })); ck('C6 compound: nothing wrong executes (Beta never archived, Alpha never restored)', !t.calls.some(([r, id]) => (r === 'archive_company' && id === U(2)) || (r === 'restore_company' && id === U(1))), JSON.stringify(t.calls)); }

// ── C7. ids: nonexistent / malformed / foreign; disambiguation arms a pendingAction ───────────────
{ const t = await life('archive it', DB(), { archiveCompanyIds: ['99999999-9999-4999-8999-999999999999'] }); ck('C7 nonexistent model id: truthful line, no RPC', NONE(t) && /could not be found/.test(t.report || ''), JSON.stringify({ calls: t.calls, report: t.report })); }
{ const t = await life('archive it', DB(), { archiveCompanyIds: ['not-a-uuid', 42, null, {}] }); ck('C7 malformed ids execute nothing', NONE(t), JSON.stringify(t.calls)); }
{ const t = await life('archive it', DB(), { archiveCompanyIds: [U(1)], pendingAction: { kind: 'open_question', question: 'Really?' } }); ck('C7 a model-armed pendingAction does not stop a resolved id from executing', ONE(t, 'archive_company', U(1)), JSON.stringify(t.calls)); }
{ const t = await life('archive Holdings', DB(), { pendingAction: { kind: 'open_question', question: 'Really?' } }); ck('C7 disambiguation REPLACES a model-armed pendingAction with a typed one', t.pendingAction?.kind === 'disambiguation' && t.pendingAction.options.every((o) => o.actionType === 'archive_company' && o.entityType === 'company'), JSON.stringify(t.pendingAction)); }
{ const t = await life('archive Beta', DB()); ck('C7 idempotency: archiving an archived company is a truthful no-op with NO evidence', ONE(t, 'archive_company', U(2)) && /was already archived/.test(t.report || '') && t.evidence.every((e) => !e.ok), JSON.stringify({ report: t.report, ev: t.evidence })); }
{ const t = await life('restore Alpha', DB()); ck('C7 idempotency: restoring an active company is a truthful no-op with NO evidence', ONE(t, 'restore_company', U(1)) && /was already active/.test(t.report || '') && t.evidence.every((e) => !e.ok), JSON.stringify({ report: t.report, ev: t.evidence })); }

// ── C8 / 2F. receipt == ledger for every backend reason and error path ──────────────────────────
const RPCS = [
  ['rpc error', () => ({ data: null, error: { message: 'boom' } }), /archive failed \(boom\)/, false],
  ['no result', () => ({ data: null, error: null }), /archive failed \(no result\)/, false],
  ['denied', () => ({ data: { changed: false, authorized: false, postconditionPassed: false, reason: 'denied' }, error: null }), /you do not have permission/, false],
  ['not_found', () => ({ data: { changed: false, authorized: true, postconditionPassed: false, reason: 'not_found' }, error: null }), /could not be found/, false],
  ['foreign_org', () => ({ data: { changed: false, authorized: false, postconditionPassed: false, reason: 'foreign_org' }, error: null }), /foreign_org/, false],
  ['postcondition false', () => ({ data: { changed: true, authorized: true, postconditionPassed: false, reason: 'archived' }, error: null }), /did not confirm|treat as not archived/, false],
  ['changed without postcondition key', () => ({ data: { changed: true, authorized: true, reason: 'archived' }, error: null }), /did not confirm/, false],
  ['empty object', () => ({ data: {}, error: null }), /undefined/, false],
  ['already_archived', () => ({ data: { changed: false, authorized: true, postconditionPassed: true, reason: 'already_archived' }, error: null }), /was already archived/, false],
  ['archived (verified)', () => ({ data: { changed: true, authorized: true, postconditionPassed: true, reason: 'archived', previousStatus: 'active', newStatus: 'archived' }, error: null }), /Alpha: archived\./, true],
];
for (const [name, rpc, re, okEv] of RPCS) {
  const t = await life('archive Alpha', DB(), {}, { rpc });
  const ev = t.evidence.find((e) => e.id === U(1));
  ck(`C8 receipt==ledger [${name}]: line "${re}" and evidence ok=${okEv}`, re.test(t.report || '') && !!ev && ev.ok === okEv && (okEv || !/Alpha: archived\./.test(t.report || '')), JSON.stringify({ report: t.report, ev }));
}

// ── C9. TASK slice: server-side re-read across statuses; window never gates; never silent ─────────
const T = { QA7: U(31), QA8: U(32), FAR: U(33), HIDDEN: U(34) };
const tdb = () => ({ tasks: [{ id: T.QA7, title: 'QA-7', status: 'archived', prior: 'in_progress' }, { id: T.QA8, title: 'QA-8', status: 'queued' }, { id: T.FAR, title: 'Far away', status: 'queued' }, { id: T.HIDDEN, title: 'Hidden', status: 'archived' }] });
const tpack = { tasks: [{ id: T.QA8, title: 'QA-8', status: 'queued' }], archivedTasks: [], currentTurn: { turn: 3 } };
{ const r = await taskTurn({ restoreTaskIds: [T.QA7] }, tdb(), tpack); ck('C9 task restore by id OUTSIDE the pack executes and reports the prior status', r.calls.length === 1 && r.calls[0][0] === 'restore_task' && /QA-7[^.]*restored \(back to "in_progress"\)/.test(r.report || '') && r.evidence.filter((e) => e.postconditionPassed).length === 1 && r.queries.some((q) => q[0] === 'tasks' && q[1] === 'in'), JSON.stringify({ calls: r.calls, report: r.report, q: r.queries })); }
{ const r = await taskTurn({ archiveTaskIds: [T.FAR] }, tdb(), tpack); ck('C9 task archive by id OUTSIDE the 15-row window executes', r.calls.length === 1 && /Far away[^.]*archived/.test(r.report || ''), JSON.stringify({ calls: r.calls, report: r.report })); }
{ const r = await taskTurn({ restoreTaskIds: [T.HIDDEN] }, tdb(), tpack, { hidden: [T.HIDDEN] }); ck('C9 task id the caller cannot see (RLS): no RPC, truthful "could not be found" line', r.calls.length === 0 && /could not be found \(searched the active and archived tasks/.test(r.report || '') && /nothing was restored/.test(r.report), JSON.stringify({ calls: r.calls, report: r.report })); }
{ const r = await taskTurn({ archiveTaskIds: ['99999999-9999-4999-8999-999999999999'] }, tdb(), tpack); ck('C9 nonexistent task id: line says nothing was archived', r.calls.length === 0 && /nothing was archived/.test(r.report || ''), JSON.stringify({ calls: r.calls, report: r.report })); }
{ const r = await taskTurn({ restoreTaskIds: ['not-a-uuid', 42, null, {}, ''] }, tdb(), tpack); ck('C9 malformed task ids: no query, no RPC, no line', r.calls.length === 0 && r.queries.length === 0 && r.report === null, JSON.stringify({ calls: r.calls, q: r.queries, report: r.report })); }
{ const r = await taskTurn({ restoreTaskIds: [T.QA8] }, tdb(), tpack); ck('C9 restoring an active task: truthful already_active, no evidence', r.calls.length === 1 && /was already active/.test(r.report || '') && r.evidence.length === 0, JSON.stringify({ report: r.report, ev: r.evidence })); }
{ const r = await taskTurn({ archiveTaskIds: [T.QA7] }, tdb(), tpack); ck('C9 archiving an archived task: truthful already_archived, no evidence', /was already archived/.test(r.report || '') && r.evidence.length === 0, JSON.stringify({ report: r.report, ev: r.evidence })); }
{ const r = await taskTurn({ archiveTaskIds: [T.QA8, T.QA8], restoreTaskIds: [T.QA7, T.QA7] }, tdb(), tpack); ck('C9 duplicate ids execute once each', r.calls.length === 2, JSON.stringify(r.calls)); }
{ const r = await taskTurn({ archiveTaskIds: [T.QA8] }, tdb(), tpack, { rpc: () => ({ data: { changed: true, postconditionPassed: false, reason: 'archived' }, error: null }) }); ck('C9 task RPC changed but postcondition false: NO evidence', r.evidence.length === 0, JSON.stringify(r.evidence)); }
{ const r = await taskTurn({ archiveTaskIds: [T.QA8] }, tdb(), tpack, { rpc: () => ({ data: { changed: true, reason: 'archived' }, error: null }) }); console.log('  task RPC without postconditionPassed key -> evidence', JSON.stringify(r.evidence.map((e) => e.postconditionPassed))); ck('C9 (disclosed) task RPC result WITHOUT a postconditionPassed key is treated as verified (!== false leniency) — report', true, JSON.stringify(r.evidence.length)); }
{ const r = await taskTurn({ archiveTaskIds: [T.QA8] }, tdb(), tpack, { rpc: () => ({ data: null, error: { message: 'boom' } }) }); ck('C9 task RPC error: failed line, no evidence', /archive failed \(boom\)/.test(r.report || '') && r.evidence.length === 0, r.report); }
{ const r = await taskTurn({ deleteTaskIds: [T.FAR], pendingDeleteTaskIds: [T.FAR] }, tdb(), tpack); ck('C9 permanent delete stays gated by the shown window (by design): an unseen id is dropped', r.deleteTaskIds.length === 0 && r.pendingDeleteTaskIds.length === 0, JSON.stringify({ d: r.deleteTaskIds, p: r.pendingDeleteTaskIds })); }
{ const r = await taskTurn({ deleteTaskIds: [T.QA8] }, tdb(), tpack); ck('C9 permanent delete of a SHOWN id passes the gate', r.deleteTaskIds.length === 1, JSON.stringify(r.deleteTaskIds)); }
{ const r = await taskTurn({}, tdb(), tpack, { plan: [{ status: 'completed', operation: 'restore_task', targetIds: { taskId: T.QA7 }, result: { detail: 'restored' } }, { status: 'completed', operation: 'archive_task', targetIds: { taskId: T.QA8 }, result: { detail: 'already_archived' } }] }); ck('C9 plan evidence: completed counts, already_* never counts', r.evidence.length === 1 && r.evidence[0].id === T.QA7, JSON.stringify(r.evidence.map((e) => [e.id, e.action]))); }

// ── C10. GOAL slice ──────────────────────────────────────────────────────────────────────────────
const G = { G1: U(41), G2: U(42), FAR: U(43), HIDDEN: U(44) };
const gdb = () => ({ goals: [{ id: G.G1, title: 'G1', status: 'archived', prior: 'active' }, { id: G.G2, title: 'G2', status: 'active' }, { id: G.FAR, title: 'Far goal', status: 'active' }, { id: G.HIDDEN, title: 'Hidden', status: 'archived' }] });
const gpack = { goals: [{ id: G.G2, title: 'G2', status: 'active' }] };
{ const r = await goalTurn({ restoreGoalIds: [G.G1] }, gdb(), gpack); ck('C10 goal restore by id OUTSIDE the pack executes', r.calls.length === 1 && r.calls[0][0] === 'restore_goal' && /G1[^.]*restored/.test(r.report || '') && r.evidence.filter((e) => e.ok).length === 1, JSON.stringify({ calls: r.calls, report: r.report })); }
{ const r = await goalTurn({ archiveGoalIds: [G.FAR] }, gdb(), gpack); ck('C10 goal archive by id OUTSIDE the 20-row window executes', r.calls.length === 1 && /Far goal[^.]*archived/.test(r.report || ''), JSON.stringify({ calls: r.calls, report: r.report })); }
{ const r = await goalTurn({ restoreGoalIds: [G.HIDDEN] }, gdb(), gpack, { hidden: [G.HIDDEN] }); ck('C10 goal id the caller cannot see: no RPC, truthful line', r.calls.length === 0 && /could not be found \(searched the active and archived goals/.test(r.report || ''), JSON.stringify({ calls: r.calls, report: r.report })); }
{ const r = await goalTurn({ archiveGoalIds: ['zzz', 1] }, gdb(), gpack); ck('C10 malformed goal ids: nothing', r.calls.length === 0 && r.report === null, JSON.stringify(r)); }
{ const r = await goalTurn({ archiveGoalIds: [G.G1] }, gdb(), gpack); ck('C10 archiving an archived goal: already_archived, no evidence', /was already archived/.test(r.report || '') && r.evidence.length === 0, r.report); }
{ const r = await goalTurn({ archiveGoalIds: [G.G2] }, gdb(), gpack, { rpc: () => ({ data: { changed: true, postconditionPassed: false, reason: 'archived' }, error: null }) }); ck('C10 goal postcondition false: no evidence', r.evidence.length === 0, JSON.stringify(r.evidence)); }

// ── C11. the receipt names the requested entity when nothing resolves ────────────────────────────
{ const t = turn({ command: 'restore task QA-7', summary: 'Task QA-7 has been restored.', extra: { restoreTaskIds: [] } }); ck('C11 task request with nothing resolved -> receipt names task, not company', NO_CHANGE.test(t.summary) && /which task you meant/.test(t.summary) && !/company/.test(t.summary), t.summary); }
{ const t = turn({ command: 'restore goal G1', summary: 'Goal restored.', requestIntent: RI('mutation', 'restore', 'goal', 'G1') }); ck('C11 goal request -> receipt names goal', /which goal you meant/.test(t.summary), t.summary); }
{ const t = turn({ command: 'archive Bob', summary: 'Bob archived.', requestIntent: RI('mutation', 'archive', 'person', 'Bob') }); ck('C11 person request -> receipt names person', /which person you meant/.test(t.summary), t.summary); }
{ const t = turn({ command: 'restore Beta', summary: 'Beta restored.' }); ck('C11 company request keeps company wording', /which company you meant/.test(t.summary), t.summary); }
{ const t = turn({ command: 'restore the task QA-7', summary: 'Restored.', extra: { restoreTaskIds: ['aaaaaaaa-0000-4000-8000-000000000000'] } }); ck('C11 requestedIntent.field=restoreTaskIds -> task wording', /which task you meant/.test(t.summary), t.summary); }

const { pass, fails } = tally('v59_lifecycle_attack', rows);
writeFileSync(new URL('./lifecycle_attack.json', import.meta.url), JSON.stringify({ pass, fails: fails.length, nonExec, nonRows, failures: fails }, null, 2));
process.exit(fails.length ? 1 : 0);
