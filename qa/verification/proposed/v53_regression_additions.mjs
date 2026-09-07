// VERIFIER #53 (campaign #113) — regression additions. CONTRACT = a guard that must hold; DEFECT = an open defect that
// reproduces on the candidate (red BY DESIGN until closed); RESIDUAL = a disclosed, sized residual printed as a note.
// ANY failure exits non-zero. index.ts via SEM_INDEX_SRC or found upward from this file (correct from ANY cwd).
// v92 = MY live download (qa/verification/scratch/v53/dl/...), or V92_INDEX_SRC.
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
const HERE = dirname(fileURLToPath(import.meta.url));
const H = await import('file://' + join(HERE, '..', 'scratch', 'v53', 'harness.mjs').replace(/\\/g, '/'));
const ROOT = (() => { let d = HERE; for (let i = 0; i < 8; i++) { if (existsSync(join(d, 'supabase', 'functions', 'sem-ai-command', 'index.ts'))) return d; d = dirname(d); } return null; })();

let pass = 0, fail = 0; const failing = []; const notes = [];
const check = (kind, name, fn, detail = '') => { let ok = false, err = ''; try { ok = fn() === true; } catch (e) { err = ' THREW ' + e.message.slice(0, 120); } if (ok) { pass++; console.log(`OK    [${kind}] ${name}`); } else { fail++; failing.push(name); console.log(`FAIL  [${kind}] ${name}${detail ? ' — ' + detail : ''}${err}`); } };
const note = (name, text) => { notes.push(name); console.log(`NOTE  [RESIDUAL] ${name} — ${text}`); };

// ── C1: provenance — deployed v92 == git c9dfab5bd433 (the download in scratch/v53/dl hashes to the pinned sha) ─────
check('CONTRACT', 'V53-C1 my v92 download hashes to 795c20c8… and equals git c9dfab5bd433', () => {
  const dl = createHash('sha256').update(readFileSync(H.V92)).digest('hex');
  const g = ROOT ? spawnSync('git', ['show', 'c9dfab5bd433:supabase/functions/sem-ai-command/index.ts'], { cwd: ROOT, encoding: 'buffer', maxBuffer: 1 << 26 }).stdout : null;
  return dl === '795c20c82301aba1f1731c6b408cc9345e0f86b43a50b0cf5dba6ca78d1f88fc' && g !== null && createHash('sha256').update(g).digest('hex') === dl;
});
check('CONTRACT', 'V53-C2 candidate LIFECYCLE arm and PAST_COMPLETION_CLAIM_PATTERN are byte-identical to v92', () => H.lifecycleIdentical && H.pastPatternIdentical);

// ── V53-D1: conditioned offer + first-person completion about an in-pack name with an INTERIOR LOWERCASE word ─────
const LOWER = ['Trade and Development Bank', 'State Bank of Mongolia', 'Bank of Mongolia', 'Ministry of Finance', 'Erdenet Mining and Metallurgy', 'University of Ulaanbaatar', 'Institute for Policy Studies', 'Chamber of Commerce', 'Department of Roads and Transport', 'Munkh-Erdene van der Berg'];
const CAP = ['Khan Bank', 'Gobi Corporation', 'Capitron Bank', 'Ulaanbaatar Hotel', 'Tenger Insurance', 'Skytel LLC', 'Gerege Systems', 'Max Group', 'Nomin Trading', 'Tsolmon Baatar'];
const OPENERS = ['I will restore Khan Bank if you approve', 'Let me archive Khan Bank once you confirm', 'I’ll archive Khan Bank as soon as you say go', 'I am going to restore Khan Bank subject to your confirmation'];
const JOINS = [' so ', ' and ', ' but ', ' — ', '; ', '. Meanwhile ', '. ', ', then '];
const VERBS = ['I just archived', 'I already removed', 'I have restored', 'we deleted'];
const gen = (set) => { const out = []; for (const N of set) for (const o of OPENERS) for (const j of JOINS) for (const v of VERBS) out.push([`${o}${j}${v} ${N}.`, N]); return out; };
const shipped = (rows) => rows.filter(([s, N]) => H.candArm(s, { names: ['Khan Bank', N] }) === null && H.v92Arm(s) !== null);
const corrected = (rows) => rows.filter(([s]) => H.v92Arm(s) !== null);
{
  const rows = gen(LOWER); const c = corrected(rows); const s = shipped(rows);
  check('CONTRACT', 'V53-D1 corpus validity: v92 corrects at least 600 of the 1280 interior-lowercase rows (FUTURE arm)', () => c.length >= 600, `v92 corrects ${c.length}`);
  check('DEFECT', 'V53-D1 a conditioned offer + first-person completion about an in-pack INTERIOR-LOWERCASE name must not ship where v92 corrects it', () => s.length === 0, `${s.length}/${c.length} shipped, e.g. ${JSON.stringify(s[0]?.[0] ?? '')}`);
}
{
  const rows = gen(CAP); const s = shipped(rows);
  check('CONTRACT', 'V53-D1 control: the same shape with CAPITALISED in-pack names ships 0 (the V51-D3 closure holds)', () => s.length === 0, `${s.length} shipped`);
}
{
  // truthful twins: conditioned offer + a first-person NEGATED completion / a truthful negative about the same name
  let dest = 0, n = 0, ex = '';
  for (const N of [...LOWER, ...CAP]) for (const o of OPENERS) for (const j of JOINS.slice(0, 4)) for (const t of [`I have not archived ${N}`, `I did not touch ${N}`, `nothing was archived for ${N}`, `${N} was not archived`, `I never archived ${N}`]) {
    const s = `${o}${j}${t}.`; n++; if (H.candArm(s, { names: ['Khan Bank', N] }) !== null && H.v92Arm(s) === null) { dest++; ex = ex || s; }
  }
  check('CONTRACT', `V53-D1 truthful twins survive: 0 of ${n} conditioned-offer + negated first-person rows destroyed where v92 preserves`, () => dest === 0, `${dest} destroyed, e.g. ${JSON.stringify(ex)}`);
}
check('CONTRACT', 'V53-D1 positive-only: with an EMPTY pack the interior-lowercase shape is unchanged (parity with the no-signal verdict)', () => H.candArm('I will restore Khan Bank if you approve so I just archived Trade and Development Bank.', { names: [] }) === null);
check('CONTRACT', 'V53-D1 plain first-person about a capitalised in-pack name is still caught (arm not blinded)', () => CAP.every((N) => H.candArm(`I just archived ${N}.`, { names: [N] }) === 'BELT'));

// ── V52-D1 stays closed (the #52 sizing set, re-pinned here with my own harness) ──────────────────────────────────
{
  const LI = ['None the Wiser LLC', 'Nothing but Nets Foundation', 'No Fear of Flying Ltd', 'Not for Profit Alliance', 'Never at Rest Logistics', 'No Ordinary Days Co', 'None of the Above Records', 'Nobody in Particular Studio', 'Nowhere to Hide Security', 'Neither a Borrower Finance'];
  const LT = ['Not Invented Here retrospective', 'Never Again incident report', 'No Limits Inc quarterly review', 'Nothing Bundt Cakes inventory count', 'No Frills Grocery lease renewal', 'Never Summer Industries onboarding', 'None The Wiser LLC audit', 'Not Your Average Joe menu update', 'Nobody Studios payroll run', 'No Man Sky Studios launch checklist'];
  const FAB = (n) => [`${n} was archived.`, `${n} has been archived.`, `${n} was deleted.`, `${n} was completed.`, `${n} was restored.`, `${n} has been updated.`, `${n} was archived. Anything else?`, `Done — ${n} was archived.`];
  const TRU = (n) => [`${n} was not archived.`, `${n} is still active.`, `I didn’t archive ${n}.`, `No company named ${n} was archived.`, `${n} has never been archived.`, `Nothing was archived for ${n}.`, `Confirmed — ${n} stays active.`, `${n} may have been archived; I can’t confirm.`];
  let ship = 0, dest = 0;
  for (const n of [...LI, ...LT]) { for (const f of FAB(n)) if (H.candArm(f, { names: [n] }) === null && H.v92Arm(f) !== null) ship++; for (const t of TRU(n)) if (H.candArm(t, { names: [n] }) !== null && H.v92Arm(t) === null) dest++; }
  check('CONTRACT', 'V52-D1 stays closed: negator-initial names with an interior lowercase word / lowercase tail — 0/160 ship, 0/160 truths destroyed (pack populated)', () => ship === 0 && dest === 0, `ship=${ship} dest=${dest}`);
  check('CONTRACT', 'V52-D1 closure is positive-only: with an EMPTY pack the lowercase-tail fabrication verdict is the no-signal verdict (ships in both builds)', () => H.candArm('Not Invented Here retrospective was archived.', { names: [] }) === null);
  check('CONTRACT', 'V52-D1 closure never destroys the truthful twin with the pack', () => H.candArm('Not Invented Here retrospective was not archived.', { names: ['Not Invented Here retrospective'] }) === null);
}

// ── V53-O1: negation-phrase pack entries — the OPENER use must always survive; the SUBJECT use is a disclosed residual ─
{
  const PH = ['None of the above', 'No changes required', 'No further action', 'Nothing to report', 'Not applicable', 'No action needed'];
  let od = 0, on = 0, subj = 0, subjN = 0;
  for (const P of PH) {
    for (const t of ['Khan Bank was not archived', 'I archived nothing', 'nothing is being archived', 'I am not archiving Khan Bank', 'Khan Bank is not being archived']) for (const j of [' — ', '; ', '. ', ': ']) { const s = `${P}${j}${t}.`; on++; if (H.candArm(s, { names: [P, 'Khan Bank'] }) !== null && H.v92Arm(s) === null) od++; }
    for (const a of ['is being archived', 'are being archived', 'is getting archived']) { const s = `${P} ${a}.`; subjN++; if (H.candArm(s, { names: [P] }) !== null && H.v92Arm(s) === null) subj++; }
  }
  check('CONTRACT', `V53-O1 a negation-phrase pack entry used as an OPENER before a real negation never disarms the real negation: 0/${on} destroyed`, () => od === 0, `${od} destroyed`);
  note('V53-O1', `negation-phrase pack entry as SUBJECT of a belt-only arm: ${subj}/${subjN} destroyed where v92 preserves (0 with an empty pack) — same-string ambiguity with the entity reading (the "No North Depot" argument); PRE-EXISTING on 416c14c via the lowercase-run path, not introduced by the V52-D1 closure`);
}
// ── V53-R2 / R3 residuals, sized ──────────────────────────────────────────────────────────────────────────────────
{
  const LONG = ['No Fear of Flying Ltd safety drill for the Ulaanbaatar hangar crew', 'Not for Profit Alliance annual general meeting minutes and follow-up actions', 'Never at Rest Logistics cross-border customs paperwork for the Zamiin-Uud crossing', 'None of the Above Records back catalogue digitisation and archival plan', 'No Limits Inc quarterly review of the northern depot lease and gate contracts'];
  let ship = 0, n = 0, dest = 0, tn = 0;
  for (const N of LONG) { for (const f of [`${N} was archived.`, `${N} has been archived.`, `Done — ${N} was archived.`, `The task ${N} was completed.`]) { n++; if (H.candArm(f, { names: [N] }) === null && H.v92Arm(f) !== null) ship++; } for (const t of [`${N} was not archived.`, `I didn’t archive ${N}.`]) { tn++; if (H.candArm(t, { names: [N] }) !== null && H.v92Arm(t) === null) dest++; } }
  note('V53-R2', `negator-initial pack names with > 8 tokens after the negator (the prefix cap): ${ship}/${n} ship where v92 corrects, ${dest}/${tn} truths destroyed; a cap of 16 closed every instance on the 2,761-row corpus at 0 truth cost (scratch/v53/mut/prefix_cap_16.ts)`);
  const PAREN = 'Not Invented Here (retrospective)';
  const r3 = [`${PAREN}’s subtasks were archived.`, `Both ${PAREN} branches were archived.`].filter((s) => H.candArm(s, { names: [PAREN] }) === null && H.v92Arm(s) !== null).length;
  check('CONTRACT', 'V53-R3 control: the plain parenthetical-name fabrication is caught', () => H.candArm(`${PAREN} was archived.`, { names: [PAREN] }) !== null);
  note('V53-R3', `parenthetical inside a negator-initial pack name + possessive/plural head noun: ${r3}/2 ship (parentheses are blanked before the prefix search)`);
}

// ── Step-3 truth attacks and refused shapes (must hold) ───────────────────────────────────────────────────────────
for (const [s, names] of [['No log however shows Khan Bank was archived.', []], ['No entry however in our records shows Khan Bank was archived.', []], ['I archived no companies.', []], ['Confirmed - No Business Unit Archived.', []], ['Confirmed - Archived Media Group trades normally.', ['Archived Media Group']], ['No unit at Erdenet — Copper Works was archived.', ['Erdenet — Copper Works']], ['No North Depot is being archived.', []], ['Pending review, Khan Bank was not archived.', []], ['No problem — I did not archive Khan Bank.', []], ['Khan Bank was, after a second look, not archived.', []]]) {
  check('CONTRACT', 'truthful survives :: ' + s, () => H.candArm(s, { names }) === null || H.v92Arm(s) !== null);
}
for (const [s, names] of [['No errors ACME Holdings was archived.', ['ACME Holdings']], ['No problem the log shows ACME Holdings was archived.', ['ACME Holdings']], ['Not a single task moved - Bold Munkhbat was removed.', ['Bold Munkhbat']], ['Confirmed - Archived ACME Holdings.', ['ACME Holdings']], ['Ulaanbaatar — North Depot was archived.', ['Ulaanbaatar — North Depot']], ['No Limits Inc was archived.', ['No Limits Inc']], ['Not for Profit Alliance was archived.', ['Not for Profit Alliance']]]) {
  check('CONTRACT', 'fabrication caught :: ' + s, () => H.candArm(s, { names }) !== null);
}

// ── Harness hygiene: the readsAsCompletion statement carries exactly one literal ";" (V48-D7 / V50-C10), pinned HERE
// because CONTRACT 5's narrowing does not see a local inside readsAsCompletion — my first closure draft broke run15 ──
check('CONTRACT', 'V53-H1 readsAsCompletion carries exactly one literal ";" (its terminator) — the extractor suites slice to the first one', () => {
  const d = H.extractConst(H.TEXT, 'readsAsCompletion'); return (d.match(/;/g) || []).length === 1;
});
check('CONTRACT', 'V53-H2 belt TOP-LEVEL declaration list unchanged (13 names, CONTRACT 5 list)', () => {
  const s = H.TEXT.indexOf('const LEGACY_PAST_COMPLETION ='); const e = H.TEXT.indexOf('const legacyProseFallback ='); const blk = H.TEXT.slice(s, e).split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n');
  let depth = 0, out = [], m; const tok = /[{}]|\b(?:const|let)\s+([A-Za-z_$][\w$]*)/g;
  while ((m = tok.exec(blk)) !== null) { if (m[0] === '{') depth++; else if (m[0] === '}') depth = Math.max(0, depth - 1); else if (depth === 0 && m[1]) out.push(m[1]); }
  return out.join(',') === 'LEGACY_PAST_COMPLETION,PROGRESS_VERBS,EXECUTION_IN_PROGRESS,me,hasSupportedMutationClaim,CONFIRMED_COMPLETION,NEGATED_CLAUSE,REFERENCELESS_CONFIRMATION,COMPLETION_PARTICIPLE,COMPLETION_VERB,NEGATION_AUX,completionIsNegated,readsAsCompletion';
});

// ── matcher: no destructive wrong bind on my shapes ───────────────────────────────────────────────────────────────
{
  const cand = H.matcherFor(H.SRC);
  const O = [{ id: 'c1', label: 'Gobi Corporation', entityType: 'company', actionType: 'archive' }, { id: 'c2', label: 'Gobi Corporation Leasing', entityType: 'company', actionType: 'archive' }, { id: 'c3', label: 'Restored Assets LLC', entityType: 'company', actionType: 'archive' }];
  const P = [{ id: 'p1', label: 'Tsolmon Baatar', entityType: 'person', actionType: 'end_employment' }, { id: 'p2', label: 'Tsolmon Baatar (Darkhan)', entityType: 'person', actionType: 'end_employment' }];
  const mustDeadEnd = [['not the first one', O], ['neither', O], ['none of these', O], ['not Gobi Corporation', O], ['restore Gobi Corporation', O], ['Gobi Corporation and Gobi Corporation Leasing', O], ['yes', O], ['the company', O], ['tsolmon', P], ['first — actually the second', P], ['1 and 2', O], ['second one, the Darkhan Tsolmon Baatar', P]];
  const mustBind = [['Gobi Corporation', O, 'c1'], ['Gobi Corporation Leasing', O, 'c2'], ['option 2', O, 'c2'], ['#3', O, 'c3'], ['the third one', O, 'c3'], ['Restored Assets LLC', O, 'c3'], ['Tsolmon Baatar', P, 'p1'], ['option 2', P, 'p2']];
  check('CONTRACT', 'matcher: every ambiguous/negated/opposite-verb reply dead-ends (' + mustDeadEnd.length + ')', () => mustDeadEnd.every(([c, o]) => cand(c, o) === null));
  check('CONTRACT', 'matcher: every unambiguous selection binds to the intended option (' + mustBind.length + ')', () => mustBind.every(([c, o, id]) => cand(c, o)?.id === id));
}

console.log(`\nv53_regression_additions: ${pass} passed, ${fail} failed, ${notes.length} residual note(s)`);
if (fail) { console.log('FAILING: ' + failing.join(', ')); process.exit(1); }
