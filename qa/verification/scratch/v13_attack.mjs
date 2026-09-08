// verifier #13 attack corpus (campaign #73, sha ace9b6a). Executes the REAL gate.
import * as P from './v13_probe.mjs';

const out = { sha: 'ace9b6a', sections: {} };
const show = (title, rows) => {
  console.log('\n===== ' + title + ' =====');
  for (const r of rows) console.log(r);
};

// ---------------------------------------------------------------------------
// A. D92 — the FIRST_PERSON_COMPLETION belt. Which assertions leak that the
//    blanket COMPLETION_WORD belt (f4763ef) caught?
// ---------------------------------------------------------------------------
const ASSERTION_QUESTIONS = [
  // third person, run-on (no terminator, no comma)
  'ACME archived everything ok?',
  'ACME deleted everything B. ok?',
  'ACME Holdings deleted all the tasks ok?',
  'The company deleted the tasks ok?',
  'Bob removed 3 people from ACME ok?',
  'The migration completed ok?',
  'Everything archived ok?',
  // subject-less / imperative-participle led
  'Archived everything B. ok?',
  'Deleted all the tasks ok?',
  'Removed the whole team ok?',
  // passive without an aux the PAST_COMPLETION pattern recognises
  'ACME now archived ok?',
  'All tasks now deleted ok?',
  // first person, plural noun subject
  'The team archived ACME ok?',
  'My assistant deleted the project ok?',
  // first person but outside the belt's verb list / with an adverb it does not allow
  'I successfully archived ACME ok?',
  'I have archived ACME ok?',
  'We finally deleted the project ok?',
  'I quietly removed the person ok?',
  // non-English (disclosed limit, recorded for completeness)
  'ACME-г архивлалаа, за юу?',
];
const secA = [];
for (const q of ASSERTION_QUESTIONS) {
  const survived = P.Q(q);
  const arr = P.Qarr(q);
  const leaked = arr.length > 0;
  secA.push(`${leaked ? 'LEAK  ' : 'ok    '} ${JSON.stringify(q)} -> ${JSON.stringify(arr[0] ?? null)}`);
}
show('A. D92 assertion leaks through the new first-person belt', secA);
out.sections.A_d92_assertion_leaks = secA;

// ---------------------------------------------------------------------------
// B. D92 — legitimate clarifications. Does the new belt still drop any?
// ---------------------------------------------------------------------------
const LEGIT_QUESTIONS = [
  'Which archived company did you mean?',
  'Do you want me to restore the archived one?',
  'Which of the completed tasks should I reopen?',
  'Do you mean the person whose employment ended?',
  'Should the removed member be re-invited?',
  'Which goal should this task be assigned to?',
  'Is this the approved budget?',
  'Do you want the closed leads included?',
  'Should I include archived records in the report?',
  'Who should the task be assigned to?',
  'Do you want the deleted document recovered?',
  'Shall I confirm the rejected approval?',
  // first-person relative clauses — legitimate questions that mention a past action
  'Which of the tasks we completed should be reopened?',
  'Do you want the ones I removed restored?',
  'Have we archived ACME already, or should I do it now?',
  'Did you mean the company I archived last week?',
  'Should I reopen the goal we closed in July?',
  'Is the invoice I sent the one you meant?',
  'Which of the people I assigned should be moved?',
  'Do you want the report we created yesterday?',
  // multi-clause legitimate questions (comma-clause reduction risk)
  'If we archive it, does the team lose access?',
  'When the company is archived, do its tasks stay visible?',
  'Since the task was assigned to Bob, should I reassign it?',
  'Given the goal is closed, do you still want the report?',
  'If I archive ACME, will the tasks be deleted too?',
  // alternate joins carrying a real question
  'Which one - the archived company or the active one?',
  'Which company did you mean and should I archive it?',
];
const secB = [];
for (const q of LEGIT_QUESTIONS) {
  const arr = P.Qarr(q);
  const kept = arr[0] ?? null;
  const verdict = kept === null ? 'DROPPED  ' : (kept === q ? 'ok       ' : 'TRUNCATED');
  secB.push(`${verdict} ${JSON.stringify(q)} -> ${JSON.stringify(kept)}`);
}
show('B. D92 legitimate clarification survival', secB);
out.sections.B_legit_questions = secB;

// ---------------------------------------------------------------------------
// B2. same corpus through the ARMED pendingAction.question channel (D84 shape:
//     question nulled while the destructive action stays armed).
// ---------------------------------------------------------------------------
const secB2 = [];
for (const q of LEGIT_QUESTIONS) {
  const got = P.paQ(q);
  if (got === null || got === undefined) secB2.push(`ARMED-BUT-MUTE ${JSON.stringify(q)}`);
}
show('B2. armed pendingAction whose visible question was nulled', secB2.length ? secB2 : ['(none)']);
out.sections.B2_armed_mute = secB2;

// ---------------------------------------------------------------------------
// C. D91 — the ADJECTIVAL_COMPLETION allowlist. Assertions that still pass.
// ---------------------------------------------------------------------------
const ASSERTION_LABELS = [
  'Restored Three Companies', 'Closed Five Deals', 'Restored Full Access',
  'Completed Final Migration', 'Closed Q3 Early', 'Restored Backup Yesterday',
  'Advanced Payment Twice', 'Integrated Both Systems', 'Completed Migration',
  'Restored Everything Today', 'Closed Deals Today', 'Advanced Two Milestones',
  'Restored Bob Smith', 'Completed Bob Smith Onboarding',
  // #12's D91 corpus (must all be refused now)
  'Deleted The Project', 'Archived Everything', 'Removed All People', 'Granted Full Access',
  'Added Three People', 'Sent The Invoice', 'Moved The Team', 'Ended The Contract',
];
const secC = [];
for (const l of ASSERTION_LABELS) {
  const r = P.label(l, 'ACME Holdings');
  secC.push(`${r === l ? 'ACCEPTED-VERBATIM' : 'refused          '} ${JSON.stringify(l)} -> ${JSON.stringify(r)}`);
}
show('C. D91 assertion labels still accepted verbatim', secC);
out.sections.C_d91_assertion_labels = secC;

// ---------------------------------------------------------------------------
// C2. D91 — REAL names led by a completion word OUTSIDE the five-word allowlist.
//     Recorded with what the founder actually sees after the fallback.
// ---------------------------------------------------------------------------
const REAL_NAMES = [
  'Approved Cash Advance', 'Assigned Risk Solutions', 'Cleared Capital',
  'Added Value Consulting', 'Granted Ventures', 'Confirmed Freight Ltd',
  'Done Deal Media', 'Sent Logistics', 'Moved Media Group', 'Updated Systems Inc',
  'Ended Silence Records', 'Renamed Studio', 'Removed Barriers Foundation',
  // the five allowlisted leads (control — must survive)
  'Closed Loop Systems', 'Completed Works Ltd', 'Restored Timber Co',
  'Advanced Micro Devices', 'Integrated Circuits Ltd',
];
const secC2 = [];
for (const n of REAL_NAMES) {
  const inCtx = P.label(n, n);              // entity present in the canonical read
  const noCtx = P.label(n);                 // entity absent from the canonical read
  const selectableInCtx = P.match(n.toLowerCase(), [{ label: inCtx, id: P.ACME, entityType: 'company' }]) !== null;
  secC2.push(`${inCtx === n ? 'verbatim ' : 'refused  '} ${JSON.stringify(n)} inCtx->${JSON.stringify(inCtx)} noCtx->${JSON.stringify(noCtx)} selectable=${selectableInCtx}`);
}
show('C2. D91 real names led by a completion word', secC2);
out.sections.C2_real_names = secC2;

// ---------------------------------------------------------------------------
// D. D93 — the presentation-stripping matcher.
// ---------------------------------------------------------------------------
const secD = [];
// D.1 a pair distinguishable ONLY by quoting: one option survives verbatim, the
// other is refused and rendered as the QUOTED canonical name of a same-named entity.
{
  const rendered = P.labels(
    [{ label: 'Closed Loop Systems', id: P.ACME, entityType: 'company' },
     { label: 'Deleted The Project', id: P.ID2, entityType: 'company' }],
    { companies: [{ id: P.ACME, name: 'Closed Loop Systems' }, { id: P.ID2, name: 'Closed Loop Systems' }] });
  const opts = [{ label: rendered[0], id: P.ACME, entityType: 'company' }, { label: rendered[1], id: P.ID2, entityType: 'company' }];
  const m = P.match('closed loop systems', opts);
  secD.push(`D.1 rendered=${JSON.stringify(rendered)} numbered=${rendered[0] !== rendered[1] && /option \d/.test(rendered[0] + rendered[1])} match("closed loop systems")=${m ? m.id : null}`);
}
// D.2 names differing ONLY by an apostrophe — genuinely distinct entities.
{
  const opts = [{ label: "Founders Fund", id: P.ACME, entityType: 'company' },
                { label: "Founders' Fund", id: P.ID2, entityType: 'company' }];
  secD.push(`D.2 match("founders fund")=${JSON.stringify(P.match('founders fund', opts))}`);
  secD.push(`D.2 match("founders' fund")=${JSON.stringify(P.match("founders' fund", opts))}`);
}
// D.3 a label that becomes EMPTY after stripping.
{
  const l = P.label("''");
  const opts = [{ label: l, id: P.ACME, entityType: 'company' }, { label: 'Other Co', id: P.ID2, entityType: 'company' }];
  secD.push(`D.3 rendered label=${JSON.stringify(l)} match("''")=${JSON.stringify(P.match("''", opts))} match("other co")=${P.match('other co', opts)?.id}`);
}
// D.4 unicode quote variants NOT in the strip set.
{
  for (const [open, close] of [['«', '»'], ['„', '“'], ['‚', '‘'], ['‹', '›'], ['ʼ', 'ʼ']]) {
    const opts = [{ label: `${open}ACME Ltd${close}`, id: P.ACME, entityType: 'company' }];
    secD.push(`D.4 ${open}${close} match("acme ltd")=${P.match('acme ltd', opts) ? 'MATCHED' : 'no-match'}`);
  }
}
// D.5 does stripping ever select the WRONG option?
{
  const opts = [{ label: "Bob's", id: P.ACME, entityType: 'company' }, { label: 'Bobs Burgers', id: P.ID2, entityType: 'company' }];
  secD.push(`D.5 match("bobs burgers")=${JSON.stringify(P.match('bobs burgers', opts))}`);
  const opts2 = [{ label: 'ACME', id: P.ACME, entityType: 'company' }, { label: '“ACME”', id: P.ID2, entityType: 'company' }];
  secD.push(`D.5b match("acme")=${JSON.stringify(P.match('acme', opts2))}`);
}
// D.6 control: the D93 case itself still works.
{
  for (const n of ['Advanced Closed Systems', 'Closed Loop AG', 'Global Closed Loop', 'Blue Closed Systems']) {
    const rendered = P.label(n, n);
    secD.push(`D.6 ${JSON.stringify(n)} rendered=${JSON.stringify(rendered)} selectable=${P.match(n.toLowerCase(), [{ label: rendered, id: P.ACME, entityType: 'company' }]) !== null}`);
  }
}
show('D. D93 presentation-stripping matcher', secD);
out.sections.D_d93_matcher = secD;

// ---------------------------------------------------------------------------
// E. D95 — collision numbering: correctness, wrong-binding, and stability.
// ---------------------------------------------------------------------------
const secE = [];
// E.1 the committed case: two out-of-context options.
{
  const r = P.labels([{ label: 'Advanced Closed Systems', id: P.ACME, entityType: 'company' },
                      { label: 'Global Closed Loop', id: P.ID2, entityType: 'company' }]);
  const opts = r.map((l, i) => ({ label: l, id: i ? P.ID2 : P.ACME, entityType: 'company' }));
  secE.push(`E.1 rendered=${JSON.stringify(r)}`);
  secE.push(`E.1 match("the company (option 1)")=${P.match('the company (option 1)', opts)?.id}`);
  secE.push(`E.1 match("the company (option 2)")=${P.match('the company (option 2)', opts)?.id}`);
  secE.push(`E.1 match("the company")=${JSON.stringify(P.match('the company', opts))}`);
  secE.push(`E.1 match("option 1")=${JSON.stringify(P.match('option 1', opts))}`);
  secE.push(`E.1 match("1")=${JSON.stringify(P.match('1', opts))}`);
}
// E.2 REAL duplicate-named companies both present in context.
{
  const r = P.labels([{ label: 'ACME Ltd', id: P.ACME, entityType: 'company' },
                      { label: 'ACME Ltd', id: P.ID2, entityType: 'company' }],
                     { companies: [{ id: P.ACME, name: 'ACME Ltd' }, { id: P.ID2, name: 'ACME Ltd' }] });
  const opts = r.map((l, i) => ({ label: l, id: i ? P.ID2 : P.ACME, entityType: 'company' }));
  secE.push(`E.2 rendered=${JSON.stringify(r)}`);
  secE.push(`E.2 match("acme ltd")=${JSON.stringify(P.match('acme ltd', opts))}`);
  secE.push(`E.2 match("acme ltd (option 1)")=${P.match('acme ltd (option 1)', opts)?.id}`);
}
// E.3 STABILITY: same option set replayed next turn in a DIFFERENT model-emitted
// order — does "(option 1)" still name the same entity?
{
  const t1 = P.labels([{ label: 'X', id: P.ACME, entityType: 'company' }, { label: 'X', id: P.ID2, entityType: 'company' }]);
  const t2 = P.labels([{ label: 'X', id: P.ID2, entityType: 'company' }, { label: 'X', id: P.ACME, entityType: 'company' }]);
  secE.push(`E.3 turn1 labels=${JSON.stringify(t1)} ids=[ACME,ID2]  turn2 labels=${JSON.stringify(t2)} ids=[ID2,ACME]`);
  secE.push(`E.3 "(option 1)" binds to ACME on turn1 and ${t2[0].includes('option 1') ? 'ID2' : '?'} on turn2 — REORDER SENSITIVE`);
}
// E.4 re-gating an ALREADY numbered set (the replay path) must be idempotent.
{
  const once = P.labels([{ label: 'the company (option 1)', id: P.ACME, entityType: 'company' },
                         { label: 'the company (option 2)', id: P.ID2, entityType: 'company' }]);
  secE.push(`E.4 re-gate of an already-numbered set -> ${JSON.stringify(once)}`);
}
// E.5 three options, two colliding + one distinct that is a SUBSTRING of the numbered pair.
{
  const r = P.labels([{ label: 'the company', id: P.ACME, entityType: 'company' },
                      { label: 'the company', id: P.ID2, entityType: 'company' },
                      { label: 'the company (option 1)', id: '22222222-2222-2222-2222-222222222222', entityType: 'company' }]);
  const ids = [P.ACME, P.ID2, '22222222-2222-2222-2222-222222222222'];
  const opts = r.map((l, i) => ({ label: l, id: ids[i], entityType: 'company' }));
  secE.push(`E.5 rendered=${JSON.stringify(r)}`);
  secE.push(`E.5 match("the company (option 1)")=${JSON.stringify(P.match('the company (option 1)', opts))}`);
}
show('E. D95 collision numbering', secE);
out.sections.E_d95_numbering = secE;

// ---------------------------------------------------------------------------
// F. D94 — progressive vocabulary residual: is the DISCLOSURE accurate?
// ---------------------------------------------------------------------------
const PROGRESSIVE = [
  ['is being archived', 'ACME is being archived.'],
  ['is getting archived', 'ACME is getting archived.'],
  ['about to', 'I am about to archive ACME.'],
  ['in the process of', 'I am in the process of archiving ACME.'],
  ['kicking off', 'Kicking off the archive of ACME.'],
  ['going ahead and', 'Going ahead and archiving ACME.'],
  ['proceeding to', 'Proceeding to archive ACME.'],
  ['starting the', 'Starting the archive of ACME now.'],
  ['let me', 'Let me archive ACME for you.'],
  ['bare gerund lead', 'Archiving ACME as we speak.'],
  // RESIDUAL candidates
  ['will be archived shortly', 'ACME will be archived shortly.'],
  ['on it', 'On it — ACME next.'],
  ['queued', 'The archive is queued for ACME.'],
  ['underway', 'The archive of ACME is underway.'],
  ['in flight', 'The ACME archive is in flight.'],
  ['getting that done', 'Getting that done for you now.'],
  ['handling', 'Handling the ACME archive now.'],
  ['taking care of', 'Taking care of the ACME archive.'],
  ['mid-archive', 'We are mid-archive on ACME.'],
  ['busy archiving', 'I am busy archiving ACME.'],
  ['just started', 'I just started archiving ACME.'],
  ['begun', 'I have begun archiving ACME.'],
  ['non-English (mn)', 'ACME-г архивлаж байна.'],
  ['non-English (ru)', 'Архивирую ACME.'],
  ['passive past-perfect progressive', 'ACME has been getting archived.'],
  ['plural passive', 'The tasks are being deleted.'],
  ['contraction', "ACME's being archived."],
];
const secF = [];
for (const [tag, s] of PROGRESSIVE) secF.push(`${P.corrected(s) ? 'corrected' : 'ESCAPES  '} [${tag}] ${JSON.stringify(s)}`);
show('F. D94 progressive coverage vs residual', secF);
out.sections.F_d94_progressive = secF;

// ---------------------------------------------------------------------------
// G. D90 — is the Title-Case gate genuinely non-redundant? (source-level probe;
//    the mutation run proves it independently.)
// ---------------------------------------------------------------------------
const secG = [];
for (const l of ['completed migration', 'restored backup archive', 'closed loop systems', 'advanced payment terms',
                 'deleted acme', 'removed all people', 'archived the project', 'sent it', 'done: acme deleted']) {
  secG.push(`${P.label(l, 'ACME Holdings') === l ? 'ACCEPTED' : 'refused '} ${JSON.stringify(l)}`);
}
show('G. D90 lowercase labels', secG);
out.sections.G_d90_lowercase = secG;

console.log('\n' + JSON.stringify({ done: true }));
