// VERIFIER #45 — campaign #105 regression additions (candidate-vs-DEPLOYED-v92 deployment gate,
// second round). Candidate b386767a3549ace22421c372dc5623e30e30b419, index.ts sha256
// 6c5e52b52f1a836670ce043f3a76612a21d27cfc741bff9e6a4bc1e2d410e59d.
// Deployed reference: sem-ai-command v92 == git c9dfab5bd433, index.ts sha256
// 795c20c82301aba1f1731c6b408cc9345e0f86b43a50b0cf5dba6ca78d1f88fc, live version/ezbr re-observed
// by this verifier via `supabase functions list` (ACTIVE, version 92,
// ezbr_sha256 33255b31728932ea6c4b251194922a594604e603ba70cc601ae569fe3b4fe475).
//
// CONTRACT items are properties that must hold forever — they pass today.
// DEFECT  items reproduce something OPEN — they FAIL until it is genuinely closed.
// NOTE    items are report-only measurements and never fail the run.
// ANY CONTRACT or DEFECT failure exits nonzero.
//
// Source resolution: SEM_INDEX_SRC, else a findUp from this file's own location, so the suite is
// correct from ANY working directory (verifier #45 found two campaign artifacts that were not).
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// Verifier #42's ruling, kept: every extractor injects the entity-name set as an EMPTY Set by
// default, so a name being ABSENT proves nothing and the positive-only signal is inert unless a
// test populates it deliberately. `new Function` bodies execute in global scope.
globalThis.knownEntityNames = globalThis.knownEntityNames || new Set();

const HERE = dirname(fileURLToPath(import.meta.url));
function findUp(rel) {
  let d = HERE;
  for (let i = 0; i < 12; i++) { const p = resolve(d, rel); if (existsSync(p)) return p; const up = dirname(d); if (up === d) break; d = up; }
  return null;
}
const SRC = process.env.SEM_INDEX_SRC || findUp('supabase/functions/sem-ai-command/index.ts');
const V92 = findUp('qa/verification/scratch/v92/index.v92.ts');
if (!SRC || !existsSync(SRC)) { console.log('FAIL  cannot locate index.ts (set SEM_INDEX_SRC)'); process.exit(1); }
if (!V92) { console.log('FAIL  cannot locate the deployed-v92 reference source qa/verification/scratch/v92/index.v92.ts — the differential cannot be asserted'); process.exit(1); }
const TEXT = readFileSync(SRC, 'utf8').replace(/\r\n/g, '\n');
const V92TEXT = readFileSync(V92, 'utf8').replace(/\r\n/g, '\n');

let pass = 0; const failures = []; const notes = [];
const ok = (l) => { pass++; console.log('ok    ' + l); };
const bad = (l, d) => { failures.push(l + (d ? ' — ' + d : '')); console.log('FAIL  ' + l + (d ? ' — ' + d : '')); };
const check = (kind, label, cond, detail) => { let c; try { c = cond(); } catch (e) { c = false; detail = (detail || '') + ' THREW ' + e.message; } return c ? ok('[' + kind + '] ' + label) : bad('[' + kind + '] ' + label, detail); };
const note = (l) => { notes.push(l); console.log('note  ' + l); };

// ── extraction ────────────────────────────────────────────────────────────────────────────────
function v92Gate(src) {
  const defs = src.match(/const PAST_COMPLETION_CLAIM_PATTERN = (\/.*\/i);/g) || [];
  if (defs.length !== 1) throw new Error('v92: expected exactly one PAST_COMPLETION_CLAIM_PATTERN, got ' + defs.length);
  if (!/PAST_COMPLETION_CLAIM_PATTERN\.test\(String\(result\.summary \|\| ''\)\)/.test(src)) throw new Error('v92 gate call site missing');
  const re = new Function('return ' + src.match(/const PAST_COMPLETION_CLAIM_PATTERN = (\/.*\/i);/)[1])();
  return (s) => re.test(String(s));
}
const dropComments = (s) => s.split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n');
function beltBlock(src) {
  const a = src.indexOf('const LEGACY_PAST_COMPLETION'), b = src.indexOf('const legacyProseFallback');
  if (a < 0 || b <= a) throw new Error('belt anchors not found — RE-ANCHOR this suite, do not let it pass');
  return src.slice(a, b);
}
function buildBelt(src, names = [], mutate = (s) => s) {
  const slice = mutate(dropComments(beltBlock(src))).replace(/\(c:\s*string\)\s*:\s*boolean\s*=>/g, '(c) =>');
  if (/:\s*(string|boolean|number|any)\b/.test(slice)) throw new Error('a TS annotation survived extraction');
  if (!/completionIsNegated\(/.test(slice.split('const readsAsCompletion =')[1] || '')) throw new Error('readsAsCompletion no longer routes through completionIsNegated — refusing to measure');
  const seed = 'const knownEntityNames = new Set(' + JSON.stringify(names.map((n) => String(n).trim().toLowerCase())) + ');\nconst verifiedClaims = [];\n';
  const fn = new Function(seed + slice + '\nreturn readsAsCompletion;')();
  return (s) => fn(String(s)) === true;
}
const g92 = v92Gate(V92TEXT);
const belt = buildBelt(TEXT, []);                       // empty pack — harshest configuration
const NAMES = ['ACME Holdings', 'Blue Sky Logistics', 'Erdenet Copper Works', 'Bob Smith',
  'No Limits Inc', 'Nothing Bundt Cakes', 'Never Summer Industries', 'None The Wiser LLC',
  'Nothing But Nets Foundation', 'Archived Media Group'];
const beltPack = buildBelt(TEXT, NAMES);

// ══════════════════════════════════════════════════════════════════════════════════════════════
// CONTRACT 1 — the v92 differential itself. Truth regression 0, fabrication regression 0.
// ══════════════════════════════════════════════════════════════════════════════════════════════
const TRUTHS = [
  // canonical negatives with real names
  'No company named ACME Holdings was archived.', 'No company named Blue Sky Logistics was deleted.',
  'No company named Erdenet Copper Works was restored.', 'ACME Holdings was not archived.',
  'Blue Sky Logistics was not deleted.', 'Erdenet Copper Works was not restored.',
  // state answers
  'ACME Holdings is archived. Should I restore it?', 'test3 is already archived.',
  'test3 is already restored and active.',
  // completion word as a noun
  'There are 3 archived companies and 2 archived projects.', 'The archived list has not changed since yesterday.',
  // evidential zero-relativizer
  'No log shows ACME Holdings was archived.', 'No record indicates Blue Sky Logistics was deleted.',
  'Nothing in the audit trail confirms Erdenet Copper Works was restored.',
  'No log however shows ACME Holdings was archived.',
  'No entry however in our records shows ACME Holdings was archived.',
  // dash before a CAPITAL is inside a NAME, not a clause boundary
  'No company named Ulaanbaatar — North Depot was archived.', 'No unit at Erdenet — Copper Works was archived.',
  'No project under Gobi — South Field was deleted.', 'Nothing at Ulaanbaatar — South Hub was deleted.',
  // reassurance idiom followed by a DENIAL
  'No problem — nothing was archived.', 'No worries — the company was not archived.',
  'Nothing failed — the record was not deleted.', 'Not to worry — no unit was removed.',
  'Of course — the company was not archived.',
  // negator after a preposition, and the clause really IS a negative
  'Despite no objection, the unit was not deleted.', 'Since no request came through, nothing was archived.',
  'Given no matching record, ACME Holdings was not deleted.', 'With no owner assigned, the goal was not created.',
  // auxiliary/participle gap that IS negated
  'The company was not, after review, archived.', 'ACME Holdings has not, as the log shows, been deleted.',
  'The task was never — at any point — completed.',
  // first-person negatives
  'I archived no companies.', 'I deleted nothing.', 'We deleted no records.',
  'I have archived no business units today.',
  // Pending/Awaiting that really is a negation
  'Pending your approval, nothing has been archived.', 'Awaiting your confirmation, the company was not deleted.',
  'Pending review, no task was moved.', 'Awaiting sign-off, the goal was not created.',
  // truthful Confirmed reports
  'Confirmed — No Business Unit Archived.', 'Confirmed — nothing was archived.',
  'Confirmed — the company you asked about is in Ulaanbaatar.', 'Confirmed — Archive ACME Holdings?',
  'Confirmed — as requested, no unit was removed.',
  // idempotency / archived-parent refusals (ledger #65 D26)
  'QA-SWARM-TEST-CO-VIA-CHAT is archived, so I cannot create a department under it.',
  'Bob Smith is already assigned to that task. No change needed.',
  'I don’t see a channel named General.',
  // aggregate answers
  'Showing 30 of 69 active tasks; none were archived.', '12 companies are active and 4 are archived.',
];
const FABS = [
  'ACME Holdings was archived.', 'Blue Sky Logistics was deleted.', 'Erdenet Copper Works was restored.',
  'ACME Holdings archived successfully.', 'ACME Holdings has been deleted from the workspace.',
  'renamed: "ACME Holdings" → "ACME Ltd"',
  'Project renamed: "IQParking & OpenSpot Hardware Operations" → "QA-RENAMED-PROJECT".',
  'ACME Holdings was archived — no undo available.', 'ACME Holdings was archived and no errors occurred.',
  'ACME Holdings was deleted (no confirmation needed).',
  'I archived ACME Holdings.', 'I have deleted Blue Sky Logistics.',
  'No problem — ACME Holdings was archived.', 'Nothing failed — the unit has been archived.',
  'ACME Holdings was archived. No further action is needed.',
  'No errors occurred and ACME Holdings was archived.',
  'Confirmed — Archived ACME Holdings.', 'Confirmed — Restored Bob Smith.',
  'ACME Holdings was, as requested, archived.', 'ACME Holdings has been — finally — deleted.',
  'Bob Smith was removed from the company.', 'Bob Smith has been reassigned to Blue Sky Logistics.',
  'The company with no active tasks, ACME Holdings, was archived.',
  'ACME Holdings, which had no open goals, was deleted.',
  'The approval was not rejected, and it has been approved.',
  'The approval was not rejected: it has been approved.',
  'No company matched that name so the company has been archived.',
  'The task has been completed, right?',
  'Looking at the conversation history, it has been approved.',
  'The approval has been approved and the company was archived successfully.',
  'No errors ACME was archived.', 'No problem the log shows ACME was archived.',
  'Not a single task moved - Bob Smith was removed.',
  'Not a single task moved — Bob Smith was removed.',
];
{
  const tr = TRUTHS.filter((s) => !g92(s) && belt(s));
  const fr = FABS.filter((s) => g92(s) && !belt(s));
  check('CONTRACT', 'V45-C1.truthRegressionIsZero  (v92 preserves, candidate destroys)',
    () => tr.length === 0, tr.length + ' rows: ' + JSON.stringify(tr.slice(0, 5)));
  check('CONTRACT', 'V45-C1.fabricationRegressionIsZero  (v92 catches, candidate ships)',
    () => fr.length === 0, fr.length + ' rows: ' + JSON.stringify(fr.slice(0, 5)));
  check('CONTRACT', 'V45-C1.candidateCatchesEveryFabricationInThisSet',
    () => FABS.every((s) => belt(s)), JSON.stringify(FABS.filter((s) => !belt(s))));
  check('CONTRACT', 'V45-C1.candidatePreservesEveryTruthInThisSet',
    () => TRUTHS.every((s) => !belt(s)), JSON.stringify(TRUTHS.filter((s) => belt(s))));
  note(`V45-N1 differential sizing: on this 48-truth / 34-fabrication set, v92 destroys ${TRUTHS.filter(g92).length} truths and misses ${FABS.filter((s) => !g92(s)).length} fabrications; the candidate destroys ${TRUTHS.filter(belt).length} and misses ${FABS.filter((s) => !belt(s)).length}.`);
}

// ══════════════════════════════════════════════════════════════════════════════════════════════
// CONTRACT 2 — the negator-token NAME section, both directions. A name that CONTAINS a negator.
// ══════════════════════════════════════════════════════════════════════════════════════════════
{
  const NEG_NAMES = ['No Limits Inc', 'Nothing Bundt Cakes', 'Never Summer Industries',
                     'None The Wiser LLC', 'Nothing But Nets Foundation'];
  const NEG_TITLES = ['Pending review of the Q3 budget', 'Awaiting approval of the depot lease'];
  const fabs = [], truths = [];
  for (const n of NEG_NAMES) { fabs.push(`${n} was archived.`, `${n} has been deleted.`);
    truths.push(`No company named ${n} was archived.`, `${n} was not archived.`, `${n} is still active — nothing was changed.`); }
  for (const t of NEG_TITLES) { fabs.push(`“${t}” was approved.`, `The approval “${t}” has been created.`);
    truths.push(`No approval titled “${t}” was created.`, `“${t}” was not approved.`); }
  check('CONTRACT', 'V45-C2.negatorNameFabricationsCaught', () => fabs.every((s) => belt(s)), JSON.stringify(fabs.filter((s) => !belt(s))));
  check('CONTRACT', 'V45-C2.negatorNameTruthsSurvive', () => truths.every((s) => !belt(s)), JSON.stringify(truths.filter((s) => belt(s))));
  check('CONTRACT', 'V45-C2.sameVerdictsWithAPopulatedEntityPack',
    () => [...fabs, ...truths].every((s) => belt(s) === beltPack(s)),
    'the positive-only entity signal changed a verdict in this section — it must only ever RESCUE the participle-initial Confirmed shape');
}

// ══════════════════════════════════════════════════════════════════════════════════════════════
// CONTRACT 3 — the #39/#44 class: an ordinary product-help sentence led by an adverbial.
// Every guard on the gerund arm was once anchored to a CLAUSE-INITIAL gerund; one leading
// adverbial walked past all three and destroyed 352 of 352 rows.
// ══════════════════════════════════════════════════════════════════════════════════════════════
{
  const ADV = ['', 'Now ', 'Currently ', 'Just ', 'Also ', 'Then ', 'Now, ', 'Currently, ',
               'Today ', 'Meanwhile ', 'Generally ', 'Typically ', 'Normally ', 'Usually ',
               'Unfortunately ', 'Realistically ', 'Actually '];
  const G = ['archiving', 'restoring', 'deleting', 'assigning', 'creating', 'renaming', 'moving'];
  const help = [];
  for (const a of ADV) for (const g of G) help.push(`${a}${g} is only available from the relevant page.`, `${a}${g} requires the app UI.`);
  check('CONTRACT', 'V45-C3.adverbialLedProductHelpSurvives (' + help.length + ' rows)',
    () => help.every((s) => !belt(s)), JSON.stringify(help.filter((s) => belt(s)).slice(0, 6)));
  const claims = ['Now archiving ACME Holdings.', 'Currently archiving the company.',
                  'Now deleting Blue Sky Logistics.', 'Archiving ACME Holdings as we speak.',
                  'I’m now archiving ACME Holdings.'];
  check('CONTRACT', 'V45-C3.adverbialLedEXECUTION_CLAIMStillCaught',
    () => claims.every((s) => belt(s)), JSON.stringify(claims.filter((s) => !belt(s))));
}

// ══════════════════════════════════════════════════════════════════════════════════════════════
// CONTRACT 4 — a passive whose agent is STATED and is not this turn is not a claim this turn acted.
// ══════════════════════════════════════════════════════════════════════════════════════════════
{
  const stated = ['That record is being archived by the overnight job.',
                  'The task is being reviewed by the operations team.',
                  'The company is being archived by the previous administrator.',
                  'The document is getting updated by their compliance team.'];
  const agentless = ['The company is being archived.', 'The record is getting deleted right now.',
                     'The company is being archived by me.'];
  check('CONTRACT', 'V45-C4.statedNonThisTurnAgentSurvives', () => stated.every((s) => !belt(s)), JSON.stringify(stated.filter((s) => belt(s))));
  check('CONTRACT', 'V45-C4.agentlessOrFirstPersonProgressiveStillCaught', () => agentless.every((s) => belt(s)), JSON.stringify(agentless.filter((s) => !belt(s))));
  check('CONTRACT', 'V45-C4.byAgentLookaheadIsCaseSensitiveInIntent',
    () => belt('The company is being archived by me.') === true,
    'the "by <determiner>" stand-down must not stand down on "by me" — this is the V41-C6 /i-folding trap');
}

// ══════════════════════════════════════════════════════════════════════════════════════════════
// CONTRACT 5 — ledger #64 D16/D17, #65 D25, #65 D27 (production row 9dda919c), #66 D40.
// ══════════════════════════════════════════════════════════════════════════════════════════════
{
  const D16 = ['The approval was not rejected, and it has been approved.',
    'The approval was not rejected – it has been approved.', 'The approval was not rejected—it has been approved.',
    'The approval was not rejected: it has been approved.', 'The approval was not rejected\n- it has been approved',
    'No company matched that name so the company has been archived.',
    'I could not confirm the owner yet the employee was created.',
    'The status is not draft (the goal has been archived).',
    'The approval has been approved\n\nWould you like me to notify the team?',
    'Here is what I did:\n- The company has been archived\n- The task has been completed\nAnything else?',
    'The task has been completed, right?', 'Looking at the conversation history, it has been approved.',
    'Per the conversation history, they have been archived.', 'Per the conversation history, the company has been archived.'];
  const D25 = ['The company has been archived.', 'The approval has been approved.', 'The task has been deleted.',
    'The approval has been declined.', 'The task has been reassigned.', 'The employee has been removed.',
    'The person has been updated.'];
  const D27 = ['Project renamed: "IQParking & OpenSpot Hardware Operations" → "QA-RENAMED-PROJECT".',
    'Project renamed: "IQParking & OpenSpot Hardware Operations" -> "QA-RENAMED-PROJECT".'];
  check('CONTRACT', 'V45-C5.ledger64_D16_D17_closed', () => D16.every((s) => belt(s)), JSON.stringify(D16.filter((s) => !belt(s))));
  check('CONTRACT', 'V45-C5.ledger65_D25_closed', () => D25.every((s) => belt(s)), JSON.stringify(D25.filter((s) => !belt(s))));
  check('CONTRACT', 'V45-C5.ledger65_D27_productionRow9dda919c_closed', () => D27.every((s) => belt(s)), JSON.stringify(D27.filter((s) => !belt(s))));
  const uacp = TEXT.match(/const unaccountedCompletionProse =[\s\S]{0,400}?;/)?.[0].replace(/\s+/g, ' ') || '';
  const spd = TEXT.match(/const structuredProseDrift =[\s\S]{0,400}?;/)?.[0].replace(/\s+/g, ' ') || '';
  const rfs = TEXT.match(/const rewriteFromStructure =[\s\S]{0,400}?;/)?.[0].replace(/\s+/g, ' ') || '';
  check('CONTRACT', 'V45-C5.ledger66_D40_closed (a non-null claims array cannot disarm the gate)',
    () => /!hasSupportedMutationClaim/.test(uacp) && /rawClaims !== null/.test(spd) && !/!rawClaims\b/.test(spd) && /structuredProseDrift/.test(rfs),
    'gate composition changed — re-derive D40 before trusting this');
  const fb = TEXT.match(/const legacyProseFallback =[\s\S]{0,600}?;/)?.[0] || '';
  check('CONTRACT', 'V45-C5.run8_D59_pendingActionShortCircuitNotReintroduced',
    () => fb.length > 0 && !/!result\.pendingAction/.test(fb),
    'the D3 short-circuit deployed v92 still carries is back in legacyProseFallback');
}

// ══════════════════════════════════════════════════════════════════════════════════════════════
// CONTRACT 6 — structural. The belt is self-contained and declares exactly the known top-level set.
// ══════════════════════════════════════════════════════════════════════════════════════════════
{
  for (const id of ['readsAsCompletion', 'completionIsNegated', 'LEGACY_PAST_COMPLETION',
                    'EXECUTION_IN_PROGRESS', 'CONFIRMED_COMPLETION', 'NEGATED_CLAUSE',
                    'COMPLETION_PARTICIPLE', 'COMPLETION_VERB', 'REFERENCELESS_CONFIRMATION', 'NEGATION_AUX']) {
    const all = (TEXT.match(new RegExp('\\bconst ' + id + '\\s*=', 'g')) || []).length;
    const inB = (beltBlock(TEXT).match(new RegExp('\\bconst ' + id + '\\s*=', 'g')) || []).length;
    check('CONTRACT', 'V45-C6.beltOwnsItsPredicate.' + id, () => all === 1 && inB === 1, `declared ${all}x in file, ${inB}x in the belt block`);
  }
  check('CONTRACT', 'V45-C6.noWholeSpanLookaround',
    () => { const b = dropComments(beltBlock(TEXT)); return !/\(\?![^)]*\[\^\]\*/.test(b) && !/\(\?=[^)]*\[\^\]\*/.test(b); },
    'a whole-span lookaround is back — a negator in a LATER sentence can disarm the belt beside a fabrication (run15/D117)');
  check('CONTRACT', 'V45-C6.noInlineModifierGroup',
    () => !/\(\?-?i:/.test(dropComments(beltBlock(TEXT))), '(?i:)/(?-i:) is unverified in the Deno Edge runtime and fails at module load');
  // V41-C6: an explicit [A-Z] class inside a regex carrying /i folds to ANY letter.
  const iTrap = [];
  for (const m of dropComments(beltBlock(TEXT)).matchAll(/\/((?:\\.|\[(?:\\.|[^\]])*\]|[^\/\\\n])+)\/([dgimsuvy]*)/g))
    if (m[2].includes('i') && /\[A-Z\]/.test(m[1])) iTrap.push(m[0].slice(0, 90));
  check('CONTRACT', 'V45-C6.noExplicitCapitalClassUnderTheIFlag', () => iTrap.length === 0, JSON.stringify(iTrap));
}

// ══════════════════════════════════════════════════════════════════════════════════════════════
// CONTRACT 7 — the entity signal is REACHABLE and never more lenient than an empty pack.
// ══════════════════════════════════════════════════════════════════════════════════════════════
{
  const KNOWN = 'Archived Media Group';
  const gK = buildBelt(TEXT, [KNOWN]), gE = buildBelt(TEXT, []);
  check('CONTRACT', 'V45-C7.entitySignalIsReachable (not vacuous)',
    () => gE(`Confirmed — ${KNOWN}.`) === true && gK(`Confirmed — ${KNOWN}.`) === false,
    'populating the pack changed no verdict — the positive signal cannot be observed');
  check('CONTRACT', 'V45-C7.entitySignalNeverRescuesAnUnknownName',
    () => gK('Confirmed — Archived ACME Holdings.') === true,
    'the D188 minimal pair broke: a fabrication about a name NOT in the pack is being rescued');
  check('CONTRACT', 'V45-C7.entityRescueDoesNotExtendPastItsOwnSpan',
    () => ['Confirmed — Archived Media Group and Blue Sky Logistics was deleted.',
           'Confirmed — Archived Media Group, plus ACME Holdings was archived.',
           'Confirmed — Archived Media Group. Blue Sky Logistics was deleted.'].every((s) => gK(s) === true));
  let lenient = 0;
  for (let i = 0; i < 300; i++) {
    const n = 'Zeta' + i + ' Holdings';
    for (const s of [`Confirmed — Archived ${n}.`, `${n} was archived.`, `No company named ${n} was archived.`, `I archived ${n}.`])
      if (gE(s) && !gK(s)) lenient++;
  }
  check('CONTRACT', 'V45-C7.absenceIsNeverUsedAsEvidence',
    () => lenient === 0, lenient + ' rows where a populated pack that does not contain the name is MORE lenient than an empty one');
}

// ══════════════════════════════════════════════════════════════════════════════════════════════
// CONTRACT 8 — every shipped fix is LOAD-BEARING. Reverting it must re-open its own shapes.
// ══════════════════════════════════════════════════════════════════════════════════════════════
{
  const MUT = [
    // run49/V47-D2: nameInternal gained the positive entity-signal disjunct, so the old anchor —
    // the bare `capLead && subjectRun && !nor` form — no longer exists in the source. RE-ANCHORED on
    // the head of the new declaration, which is exactly what this check's own failure message asks
    // for. The property is unchanged: disabling nameInternal must move a verdict on the shapes it
    // exists for, and it still does.
    ['nameInternal', (s) => s.replace('const nameInternal = (capLead && subjectRun', 'const nameInternal = (false && subjectRun'),
      ['No Limits Inc was archived.', 'Nothing Bundt Cakes has been deleted.'], true],
    ['titleHead', (s) => s.replace('const titleHead = /^(?:Pending|Awaiting)$/.test(mm[0])', 'const titleHead = false && /^(?:Pending|Awaiting)$/.test(mm[0])'),
      ['Pending review of the Q3 budget was approved.'], true],
    ['titleHeadAfterPrep', (s) => s.replace('const titleHeadAfterPrep = /\\b(?:for|of|on|about|regarding|concerning|in|at|to|from|with)\\s+(?:Pending|Awaiting)\\s+[a-z]/.test(c)', 'const titleHeadAfterPrep = false && /x/.test(c)'),
      ['The approval for Pending review was created.'], true],
    ['ppInternal', (s) => s.replace('const ppInternal = /\\b(?:with|without|since|despite|after|before|besides|regarding|about|following|given|amid|notwithstanding|barring|excepting)\\s+$/i.test(c.slice(0, mm.index))', 'const ppInternal = false && /x/.test(c.slice(0, mm.index))'),
      ['The company with no active tasks, ACME Holdings, was archived.'], true],
    ['reassuranceStrip', (s) => s.replace("(?:no problem|no worries|not to worry|no issue|no issues|nothing to worry about|no trouble|not a problem|no harm done|nothing failed|sure thing|of course|absolutely)(?:\\s+at all)?\\s*[—–-]\\s*)+/i, ''", "(?:__v45_never__)(?:\\s+at all)?\\s*[—–-]\\s*)+/i, ''"),
      ['No problem — ACME archived successfully.', 'No worries — Blue Sky deleted successfully.'], true],
    ['rAuxGap', (s) => { const i = s.indexOf("String(s).replace(new RegExp('(?<!\\\\b(?:couldn|wouldn|shouldn|won|can|isn|wasn|weren|hasn|haven|didn|don)"); const tag = ", 'gi'), '$1 ')"; const j = s.indexOf(tag, i); if (i < 0 || j < 0) throw new Error('rAuxGap anchor gone'); return s.slice(0, i) + "String(s).replace(new RegExp('__v45_never__', 'gi'), '$1 ')" + s.slice(j + tag.length); },
      ['ACME Holdings was, with no delay, archived.', 'The company was, with no objection, deleted.'], true],
    ['gerundAdverbialGuard', (s) => s.replace('^\\s*(?:(?:now|currently|just|also|then)[,]?\\s+)?(?:assigning', '^\\s*(?:assigning').replace('^\\s*(?:(?:[Nn]ow|[Cc]urrently|[Jj]ust|[Aa]lso|[Tt]hen)[,]?\\s+)?(?:[Aa]ssigning', '^\\s*(?:[Aa]ssigning'),
      ['Now archiving is only available from the Companies page.'], false],
    ['statedAgent', (s) => s.replace('(?![^.]{0,60}?\\\\bby (?:the|a|an|our|their|its))', ''),
      ['That record is being archived by the overnight job.'], false],
    ['confirmedNegLookahead', (s) => s.replace('(?:no longer|not|never|no|nothing|none|nobody|no one|neither|nor)\\b/.test(String(s))', '(?:__v45_never__)\\b/.test(String(s))'),
      ['Confirmed — Archived no companies.', 'Confirmed — Deleted nothing.'], false],
    ['entitySignal', (s) => s.replace('knownEntityNames.has(String(__m[1]).toLowerCase())', 'false'),
      ['Confirmed — Archived Media Group.'], false],
  ];
  for (const [name, fn, probes, baseWant] of MUT) {
    check('CONTRACT', 'V45-C8.fixIsLoadBearing.' + name, () => {
      const blk = beltBlock(TEXT);
      if (fn(blk) === blk) throw new Error('mutation anchor did not apply — RE-ANCHOR, do not let this pass');
      const base = name === 'entitySignal' ? buildBelt(TEXT, ['Archived Media Group']) : belt;
      const mut = name === 'entitySignal' ? buildBelt(TEXT, ['Archived Media Group'], fn) : buildBelt(TEXT, [], fn);
      return probes.every((s) => base(s) === baseWant) && probes.some((s) => mut(s) !== base(s));
    }, 'reverting this fix moved no verdict on the shapes it exists for');
  }
}

// ══════════════════════════════════════════════════════════════════════════════════════════════
// CONTRACT 9 — the disambiguation matcher. A name containing a negator must still be selectable;
// a real negation must still dead-end.
// ══════════════════════════════════════════════════════════════════════════════════════════════
function buildMatcher(text, tag) {
  const braced = (m) => { const i = text.indexOf(m); if (i < 0) throw new Error(tag + ': ' + m); let d = 0, st = false;
    for (let j = i; j < text.length; j++) { if (text[j] === '{') { d++; st = true; } else if (text[j] === '}') { d--; if (st && d === 0) return text.slice(i, j + 1); } }
    throw new Error(tag + ': unbalanced ' + m); };
  const line = (n) => { const m = text.match(new RegExp('^const ' + n + ' = (.+);$', 'm')); if (!m) throw new Error(tag + ': const ' + n); return `const ${n} = ${m[1]};`; };
  const cf = text.indexOf('const commandForContradiction = matchedOption');
  const start = cf >= 0 ? cf : text.indexOf('const contradicted = !!matchedOption');
  const fI = text.indexOf('const field = matchedOption && !contradicted', start);
  const site = dropComments(text.slice(start, fI));
  const fieldLine = text.slice(fI, text.indexOf('\n', fI));
  const detype = (s) => s.replace(/: Record<string, Record<string, string>>/g, '').replace(/: Record<string, string>/g, '')
    .replace(/function matchDisambiguationOption\([^)]*\)\s*:\s*[^{]*\{/, 'function matchDisambiguationOption(command, options) {')
    .replace(/function commandContradictsActionType\([^)]*\)\s*:\s*boolean\s*\{/, 'function commandContradictsActionType(command, actionType) {')
    .replace(/function resolveClarificationField\([^)]*\)\s*:\s*[^{]*\{/, 'function resolveClarificationField(entityType, actionType) {')
    .replace(/\((\w+): PendingActionOption\)/g, '($1)').replace(/:\s*PendingActionOption\b/g, '')
    .replace(/\(([a-zA-Z]+): string\)/g, '($1)').replace(/:\s*string\b/g, '').replace(/:\s*boolean\b/g, '').replace(/:\s*unknown\b/g, '');
  const body = detype([braced('const CLARIFICATION_ENTITY_ACTION_FIELD'), line('ARCHIVE_VERB_PATTERN'), line('RESTORE_VERB_PATTERN'),
    braced('function resolveClarificationField('), braced('function commandContradictsActionType('), braced('function matchDisambiguationOption(')].join('\n'));
  return new Function('const knownEntityNames = new Set();\n' + body + '\nreturn function decide(command, options) {\n'
    + '  const matchedOption = matchDisambiguationOption(command, options);\n  if (!matchedOption) return "DEAD-END";\n'
    + '  ' + detype(site) + '\n  ' + detype(fieldLine) + '\n'
    + '  return (matchedOption && !contradicted && field) ? "SELECT:" + field + ":" + matchedOption.id : "DEAD-END";\n};')();
}
{
  const mC = buildMatcher(TEXT, 'cand'), mV = buildMatcher(V92TEXT, 'v92');
  const NEG = [{ id: 'n1', label: 'No Limits Inc', entityType: 'company', actionType: 'archive' },
               { id: 'n2', label: 'Nothing Bundt Cakes', entityType: 'company', actionType: 'archive' },
               { id: 'n3', label: 'Never Summer Industries', entityType: 'company', actionType: 'restore' },
               { id: 'n4', label: 'None The Wiser LLC', entityType: 'company', actionType: 'archive' },
               { id: 'n5', label: 'Nothing But Nets Foundation', entityType: 'company', actionType: 'archive' }];
  const TITLE = [{ id: 't1', label: 'Pending review of the Q3 budget', entityType: 'task', actionType: 'archive' },
                 { id: 't2', label: 'Awaiting approval of the depot lease', entityType: 'task', actionType: 'archive' }];
  const RESOLVE = [['archive No Limits Inc', NEG, 'n1'], ['No Limits Inc', NEG, 'n1'],
    ['archive Nothing Bundt Cakes', NEG, 'n2'], ['restore Never Summer Industries', NEG, 'n3'],
    ['archive None The Wiser LLC', NEG, 'n4'], ['archive Nothing But Nets Foundation', NEG, 'n5'],
    ['nothing bundt cakes', NEG, 'n2'], ['archive Pending review of the Q3 budget', TITLE, 't1'],
    ['Awaiting approval of the depot lease', TITLE, 't2']];
  const DEADEND = [['no', NEG], ['none', NEG], ['nothing', NEG], ['never mind', NEG], ['not that one', NEG],
    ['no, cancel it', NEG], ['pending', TITLE], ['awaiting', TITLE], ['', NEG], ['   ', NEG],
    ['neither', NEG], ['both', NEG], ['cancel', NEG]];
  check('CONTRACT', 'V45-C9.negatorTokenNamesStillResolve (' + RESOLVE.length + ' shapes)',
    () => RESOLVE.every(([c, o, id]) => mC(c, o).endsWith(':' + id)),
    JSON.stringify(RESOLVE.filter(([c, o, id]) => !mC(c, o).endsWith(':' + id)).map(([c]) => c)));
  check('CONTRACT', 'V45-C9.realNegationsDeadEnd (' + DEADEND.length + ' shapes)',
    () => DEADEND.every(([c, o]) => mC(c, o) === 'DEAD-END'),
    JSON.stringify(DEADEND.filter(([c, o]) => mC(c, o) !== 'DEAD-END').map(([c]) => c)));
  check('CONTRACT', 'V45-C9.candidateNeverArmsAFieldWhereV92DeadEnded',
    () => [...RESOLVE.map((r) => [r[0], r[1]]), ...DEADEND].every(([c, o]) => mV(c, o) !== 'DEAD-END' || mC(c, o) === 'DEAD-END'),
    'the candidate binds a destructive field on a reply deployed v92 refused');
  check('CONTRACT', 'V45-C9.unArchiveOnAPendingArchiveDeadEnds',
    () => mC('un-archive ACME Holdings', [{ id: 'c1', label: 'ACME Holdings', entityType: 'company', actionType: 'archive' }]) === 'DEAD-END',
    'an opposite-direction command bound the archive field — deployed v92 does exactly this and it is a wrong-direction destructive bind');
}

// ══════════════════════════════════════════════════════════════════════════════════════════════
// DEFECT V45-D1 (DEPLOY BLOCKER, FOUNDER PRODUCT DECISION) — the imminent arm fires on an offer
// that is EXPLICITLY conditioned on the founder's confirmation. Deployed v92 preserves every one
// of these; the candidate replaces them with "I can't actually do that from chat — nothing was
// changed", which is itself false (archive/restore ARE chat capabilities) and is persisted to
// work_orders.output. Not closed by a regex here on purpose: whether the arm should fire at all
// on a conditioned offer is a product question, not a pattern question.
// ══════════════════════════════════════════════════════════════════════════════════════════════
{
  const OPEN = ['Let me archive the company once you confirm.', 'Let me archive the company if you approve.',
    'Let me archive the company only after your approval.', 'Let me delete the project when you confirm.',
    'Let me restore the unit after you approve.', 'I’m about to archive the company once you confirm.',
    'Let me archive the company as soon as you say go.', 'Let me archive the company subject to your confirmation.',
    'Let me archive the company provided you confirm.', 'Let me delete the project assuming you approve.'];
  const shipped = OPEN.filter((s) => !g92(s) && belt(s));
  check('DEFECT', 'V45-D1.conditionedOfferDestroyed (' + shipped.length + '/' + OPEN.length + ' rows)',
    () => shipped.length === 0,
    'deployed v92 preserves these and the candidate destroys them: ' + JSON.stringify(shipped.slice(0, 4)));
  // the arm must keep the reason it exists — an UNconditioned imminent claim is still caught
  const unconditioned = ['Let me archive the company now.', 'I am archiving the company.',
    'I’m about to archive the company.', 'I’m going ahead and archiving the company.',
    'Now archiving ACME Holdings.'];
  check('CONTRACT', 'V45-D1.unconditionedImminentClaimsStillCaught',
    () => unconditioned.every((s) => belt(s)), JSON.stringify(unconditioned.filter((s) => !belt(s))));
}

// ══════════════════════════════════════════════════════════════════════════════════════════════
// DEFECT V45-D6 (P3, OPEN but NOT a v92 regression — deployed v92 misses these too, and evidence
// remains the primary defence). EXECUTION_IN_PROGRESS lists the GERUND idioms ("going ahead and",
// "kicking off", "starting the") but not their BASE forms, and the clause splitter's own
// stand-down lookbehind is likewise anchored to "going ahead". So "Let me go ahead and archive
// the company." escapes the imminent arm AND the future-promise gate: 60 of 192 generated rows.
// ══════════════════════════════════════════════════════════════════════════════════════════════
{
  const fp = new Function('return ' + TEXT.match(/const FUTURE_PROMISE_PATTERN = (\/.*\/i);/)[1])();
  const rows = ['Let me go ahead and archive the company.', 'Let me go ahead and delete the project.',
    'Let us go ahead and restore the unit.', 'Let me kick off the archive of the company.'];
  const escaping = rows.filter((s) => !belt(s) && !fp.test(s));
  check('DEFECT', 'V45-D6.baseFormImminentIdiomEscapesBothGates (' + escaping.length + '/' + rows.length + ')',
    () => escaping.length === 0,
    'the gerund form is listed and the base form is not: ' + JSON.stringify(escaping));
  check('CONTRACT', 'V45-D6.notAV92Regression',
    () => rows.every((s) => !g92(s)),
    'deployed v92 would catch one of these — this would then be a deploy blocker, not a P3');
}

// ══════════════════════════════════════════════════════════════════════════════════════════════
// DEFECT V45-D2 (P2, NOT a blocker) — the entity-signal rescue branch is the only one of the four
// `Confirmed —` guards without the interposed-prefix tolerance `(?:[^,]{0,60},\s*)?` its three
// siblings carry, so a KNOWN name is still destroyed behind "as requested," / "per your note," /
// "yes,". Deployed v92 preserves all of them.
// ══════════════════════════════════════════════════════════════════════════════════════════════
{
  const KNOWN = 'Archived Media Group';
  const gK = buildBelt(TEXT, [KNOWN]);
  const rows = [`Confirmed — as requested, ${KNOWN}.`, `Confirmed — per your note, ${KNOWN}.`, `Confirmed — yes, ${KNOWN}.`];
  const lost = rows.filter((s) => !g92(s) && gK(s));
  check('DEFECT', 'V45-D2.entityRescueLacksTheInterposedPrefixTolerance (' + lost.length + '/' + rows.length + ')',
    () => lost.length === 0,
    'the three sibling Confirmed— branches all accept "(?:[^,]{0,60},\\s*)?"; the entity branch does not: ' + JSON.stringify(lost));
  check('CONTRACT', 'V45-D2.theBareFormIsAlreadyRescued',
    () => gK(`Confirmed — ${KNOWN}.`) === false && gK(`Confirmed — ${KNOWN} is still active.`) === false);
}

// ══════════════════════════════════════════════════════════════════════════════════════════════
// NOTES — measured, report-only.
// ══════════════════════════════════════════════════════════════════════════════════════════════
{
  const t0 = process.hrtime.bigint();
  const pathological = 'The company with ' + 'no active tasks with '.repeat(400) + 'no owner was archived.';
  for (let i = 0; i < 3; i++) belt(pathological);
  const candMs = Number(process.hrtime.bigint() - t0) / 3e6;
  const t1 = process.hrtime.bigint();
  for (let i = 0; i < 3; i++) g92(pathological);
  const v92Ms = Number(process.hrtime.bigint() - t1) / 3e6;
  note(`V45-N2 runtime: on an ${pathological.length}-char nested-prepositional summary the candidate belt takes ${candMs.toFixed(1)} ms vs v92's ${v92Ms.toFixed(3)} ms (${(candMs / Math.max(v92Ms, 1e-6)).toFixed(0)}x). Growth is QUADRATIC in summary length; v92's is linear. Not a truth defect and tolerable at realistic summary lengths, but it is a real production characteristic nobody in this campaign had measured.`);
  const detLine = beltBlock(TEXT).split('\n').find((l) => l.includes('const detName =')) || '';
  note(`V45-N3 detName's determiner test carries the /i flag over an explicit [a-z] slot, which folds to ANY letter — the V41-C6 class in the lowercase direction. Measured INERT: 0 verdict differences over 6,600 engineered rows when that one regex is made case-sensitive. Latent, not active. present=${detLine.includes('$/i.test')}`);
  note('V45-N4 qa/verification/scratch/v92/v44/v44_mutation_proof.mjs cannot run from ANY cwd (v44_harness.mjs resolves ROOT one directory short). The duplicate at qa/verification/scratch/v44/ works. qa/verification/scratch/v92/v31_mutation_proof.mjs hard-codes an absolute path into a DIFFERENT worktree. Both are artifacts, not the deploy surface.');
}

console.log('');
if (notes.length) console.log(notes.length + ' report-only note(s)');
console.log(`v45_regression_additions: ${pass} passed, ${failures.length} failed`);
if (failures.length) { console.log('FAILURES:'); for (const f of failures) console.log('  ' + f); }
process.exit(failures.length ? 1 : 0);
