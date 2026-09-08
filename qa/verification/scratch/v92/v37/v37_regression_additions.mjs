#!/usr/bin/env node
// VERIFIER #37 — campaign #97 regression additions (candidate 395c438 vs DEPLOYED v92 c9dfab5bd433).
// Self-contained: own extractor, no import from any prior harness. index.ts via SEM_INDEX_SRC or found by
// walking up from this file (correct from ANY cwd). Deployed v92's gate from `git show c9dfab5bd433:…`
// (falls back to qa/verification/scratch/v92/index.v92.ts). ANY failure exits nonzero.
//
// CONTRACT = a guard that must hold on every build.  DEFECT = a class found open on 395c438; red on purpose there,
// green on the prepared fix (qa/verification/scratch/v37/fix43/index.ts, rebuilt by build_fix43.mjs).
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';


// Verifier #42's ruling: every extractor injects the entity-name set as an EMPTY Set by default,
// so a name being ABSENT proves nothing and the belt's positive-only signal is inert here. This is
// what makes "an empty set produces byte-identical verdicts" the structural default of the whole
// battery rather than a control someone has to remember to run. `new Function` bodies execute in
// global scope, so this one assignment reaches every belt-build site in this file.
globalThis.knownEntityNames = globalThis.knownEntityNames || new Set();

function resolveRun14() {
  let d = process.cwd();
  for (let i = 0; i < 8; i++) {
    const p = d + '/qa/scenarios-runner/run14_defect_closure_contract.mjs';
    try { readFileSync(p); return p; } catch { d = d + '/..'; }
  }
  return 'qa/scenarios-runner/run14_defect_closure_contract.mjs';
}

const HERE = dirname(fileURLToPath(import.meta.url));
const up = (rel) => { let d = HERE; for (let i = 0; i < 12; i++) { const p = join(d, rel); if (existsSync(p)) return p; const u = dirname(d); if (u === d) break; d = u; } return null; };
const SRC = process.env.SEM_INDEX_SRC ? resolve(process.env.SEM_INDEX_SRC) : up('supabase/functions/sem-ai-command/index.ts');
if (!SRC || !existsSync(SRC)) { console.log('FAIL cannot locate index.ts (set SEM_INDEX_SRC)'); process.exit(2); }
const REPO = up('supabase/functions/sem-ai-command/index.ts') ? dirname(dirname(dirname(up('supabase/functions/sem-ai-command/index.ts')))) : dirname(dirname(dirname(SRC)));
const lf = (t) => t.replace(/\r\n/g, '\n');
const sha256 = (b) => createHash('sha256').update(b).digest('hex');
const TEXT = lf(readFileSync(SRC, 'utf8'));
let V92TEXT = null;
try { const b = execFileSync('git', ['show', 'c9dfab5bd433:supabase/functions/sem-ai-command/index.ts'], { cwd: REPO, maxBuffer: 1 << 26 }); if (sha256(b) === '795c20c82301aba1f1731c6b408cc9345e0f86b43a50b0cf5dba6ca78d1f88fc') V92TEXT = b.toString('utf8'); } catch { /* fallback below */ }
if (!V92TEXT) { const p = up('qa/verification/scratch/v92/index.v92.ts'); if (p) V92TEXT = lf(readFileSync(p, 'utf8')); }

const detype = (s) => s.replace(/\(c: string\): boolean =>/g, '(c) =>').replace(/\((\w+): string\)\s*=>/g, '($1) =>').replace(/:\s*Array<\{[^}]*\}>/g, '')
  .replace(/\((\w+): string\)/g, '($1)').replace(/\((\w+): PendingActionOption\)/g, '($1)').replace(/: Record<string, string>/g, '')
  .replace(/\(command: string, options: PendingActionOption\[\]\): PendingActionOption \| null/, '(command, options)');
function beltSlice(text) { const a = text.indexOf('const LEGACY_PAST_COMPLETION'); const b = text.indexOf('const legacyProseFallback'); if (a < 0 || b <= a) throw new Error('belt not found'); return text.slice(a, b); }
function buildBelt(text) {
  const body = detype(beltSlice(text)).replace(/const hasSupportedMutationClaim =[\s\S]*?\);\n/, '');
  return new Function('const knownEntityNames = new Set();\n' + body + '\nreturn { readsAsCompletion, LEGACY_PAST_COMPLETION };')();
}
function buildDecision(text) {
  const a = text.indexOf('const LEGACY_PAST_COMPLETION'); const b = text.indexOf('\n        if (rewriteFromStructure) {', a);
  const f = new Function('verifiedClaims', 'model', 'groundedOutcomeThisTurn', 'claimsFutureActionWithNoPlan', 'result', 'rawClaims', 'deterministicPrefix', 'claimExecutionEvidence', 'hasRejectedClaims', detype(text.slice(a, b)) + '\nreturn claimsPastCompletionWithNoGrounding;');
  return (summary, rawClaims = null) => f([], 'gpt-4o', false, false, { summary, pendingAction: null, claims: rawClaims }, rawClaims, '', [], false) === true;
}
function extractFn(text, name) { const i = text.indexOf('\nfunction ' + name + '('); const j = text.indexOf('\n}\n', i); return text.slice(i + 1, j + 2); }
const belt = buildBelt(TEXT); const decide = buildDecision(TEXT);
const fires = (s) => belt.readsAsCompletion(String(s)) === true;
const destroyed = (s) => decide(s, null);            // the founder sees the canned correction instead of the answer
const ships = (s) => !decide(s, null) && !decide(s, []);
let v92fires = null, v92match = null;
if (V92TEXT) {
  const m = V92TEXT.match(/const PAST_COMPLETION_CLAIM_PATTERN = (\/[^\n]*\/i);/);
  if (m) { const re = new Function('return ' + m[1])(); v92fires = (s) => re.test(String(s)); }
  try { v92match = new Function(detype(extractFn(V92TEXT, 'matchDisambiguationOption')) + '\nreturn matchDisambiguationOption;')(); } catch { /* reported */ }
}

let pass = 0, fail = 0; const notes = [];
const check = (kind, label, ok, detail = '') => { if (ok) { pass++; console.log('OK   [' + kind + '] ' + label); } else { fail++; console.log('FAIL [' + kind + '] ' + label + (detail ? ' :: ' + detail : '')); } };
const note = (label) => { notes.push(label); console.log('NOTE ' + label); };

console.log('=== v37 regression additions — source ' + SRC + ' sha256 ' + sha256(readFileSync(SRC)));
check('CONTRACT', 'deployed v92 gate available (git c9dfab5bd433 or scratch copy)', !!v92fires);
if (!v92fires) { console.log('\n' + pass + ' passed, ' + fail + ' failed'); process.exit(1); }
{
  const cand = (TEXT.match(/const PAST_COMPLETION_CLAIM_PATTERN = (\/[^\n]*\/i);/) || [])[1];
  const v92 = (V92TEXT.match(/const PAST_COMPLETION_CLAIM_PATTERN = (\/[^\n]*\/i);/) || [])[1];
  check('CONTRACT', 'v92 gate PAST_COMPLETION_CLAIM_PATTERN preserved byte-identical', cand === v92);
}

// ── DEFECT V37-F1: a comma-isolated interposed phrase between a NEGATED SUBJECT and a v92-PRESERVED predicate
// (progressive / evidential+progressive) severs the negator from the completion; the candidate-only progressive arm
// fires on the predicate clause and a truthful negative deployed v92 shows the founder is destroyed.
{
  const ADV = ['however', 'though', 'therefore', 'as far as I can see', 'according to the log', 'at this point', 'for now', 'it seems', 'apparently', 'to be clear', 'as of now', 'to my knowledge', 'in fact', 'as requested'];
  const SUBJ = ['No company', 'Nothing', 'No task', 'None of them', 'No record', 'Nobody', 'No entry', 'No unit at Erdenet — Copper Works', 'Neither CLIX GPS nor FuelMetrix'];
  const PRED = ['is being archived', 'are being removed', 'is getting deleted', 'shows CLIX GPS is being archived', 'indicates FuelMetrix is being deleted'];
  let total = 0, bad = [];
  for (const s0 of SUBJ) for (const a of ADV) for (const p of PRED) { const s = `${s0}, ${a}, ${p}.`; total++; if (!v92fires(s) && destroyed(s)) bad.push(s); }
  check('DEFECT', `V37-F1 truthful negative with a comma-isolated interposed phrase survives (${total} v92-preserved shapes)`, bad.length === 0, bad.length + ' destroyed, e.g. ' + bad.slice(0, 2).map((s) => JSON.stringify(s)).join(' | '));
  // both directions: the same interposition on a FABRICATION stays caught wherever v92 catches it — incl. negator-led NAMES
  const AFF = ['CLIX GPS', 'ACME Holdings', 'The task', 'No Limits Inc', 'Nothing Bundt Cakes', 'Never Summer Industries'];
  let ft = 0, fbad = [];
  for (const s0 of AFF) for (const a of ADV) for (const p of ['was archived', 'has been deleted', 'were removed']) { const s = `${s0}, ${a}, ${p}.`; ft++; if (v92fires(s) && ships(s)) fbad.push(s); }
  for (const lead of ['No errors occurred', 'Nothing failed', 'No issues were found']) for (const a of ADV) for (const p of ['ACME was archived', 'the task was deleted']) { const s = `${lead}, ${a}, ${p}.`; ft++; if (v92fires(s) && ships(s)) fbad.push(s); }
  check('CONTRACT', `V37-F1 control: the same interposition on a fabrication stays caught wherever v92 catches it (${ft} shapes, incl. negator-led names)`, fbad.length === 0, fbad.length + ' shipped, e.g. ' + fbad.slice(0, 2).map((s) => JSON.stringify(s)).join(' | '));
  // a negator INSIDE the interposed phrase is not removed
  check('CONTRACT', 'V37-F1 control: an interposed phrase that itself carries the negator keeps disarming ("ACME, not FuelMetrix, is being archived" stays split)', fires('ACME, not FuelMetrix, is being archived.'));
}

// ── DEFECT V37-F2: a belt transformation (adverbial collapse across a token-internal period; parenthetical blanked to ONE
// space) manufactures a LEGACY completion deployed v92 never sees; the LEGACY-gated scope excuses (ppInternal C1, the
// D181 strip C2) then excuse a genuine negator and the truthful negative is destroyed.
{
  const PP = ['Since', 'With', 'Despite', 'After', 'Given', 'Amid'];
  const NEG = ['nothing', 'no company', 'no task'];
  const IP = ['per Trade-book.ai', 'per v2.1 policy', 'per the Q3.2 review'];
  const PAREN = ['(after the long review that found no issues at all)', '(per the March review that found nothing wrong at all)'];
  let t = 0, bad = [];
  for (const pp of PP) for (const n of NEG) { for (const ip of IP) { const s = `${pp} ${n} was, ${ip}, archived, CLIX GPS is still active.`; t++; if (!v92fires(s) && destroyed(s)) bad.push(s); } for (const pr of PAREN) { const s = `${pp} ${n} was ${pr} archived, CLIX GPS is still active.`; t++; if (!v92fires(s) && destroyed(s)) bad.push(s); } }
  for (const idiom of ['No problem', 'No issue', 'No worries']) for (const rest of ['the team flagged', 'the customer raised']) { for (const ip of IP) { const s = `${idiom} ${rest} was, ${ip}, archived.`; t++; if (!v92fires(s) && destroyed(s)) bad.push(s); } for (const pr of PAREN) { const s = `${idiom} ${rest} was ${pr} archived.`; t++; if (!v92fires(s) && destroyed(s)) bad.push(s); } }
  check('DEFECT', `V37-F2 a transformation never manufactures a completion v92 cannot see inside a scope-excused clause (${t} v92-preserved truths)`, bad.length === 0, bad.length + ' destroyed, e.g. ' + bad.slice(0, 2).map((s) => JSON.stringify(s)).join(' | '));
  const ctl = ['ACME was, as requested, archived.', 'ACME was, of course, archived.', 'ACME was (finally) archived.', 'ACME was (as requested) archived.', 'The approval was, as requested, confirmed.', 'CLIX GPS was, per your request, archived.'];
  const miss = ctl.filter((s) => v92fires(s) && ships(s));
  check('CONTRACT', 'V37-F2 control: interposed-adverbial / short-parenthetical fabrications inside v92\'s window stay caught', miss.length === 0, miss.join(' | '));
}

// ── DEFECT V37-F3: the run30 dash-form R-IDIOM strip was removed as "dead" on a 17-row family that had no first-person
// or progressive tail. It carried both candidate-only arms: these fabrications were caught at f64b280 and ship on
// 395c438. (Deployed v92 catches none of them — a candidate-only regression, not a v92-gate item.)
{
  const rows = ['No problem — I archived ACME.', 'No worries at all — I’m now archiving ACME.', 'Sure thing — I deleted the company.', 'Not to worry — We removed Bob Smith.', 'Of course — I’m currently deleting the task.', 'No harm done—I archived CLIX GPS.'];
  const shipped = rows.filter((s) => ships(s));
  check('DEFECT', 'V37-F3 an idiom prefix before a first-person / progressive fabrication does not disarm it', shipped.length === 0, shipped.join(' | '));
  const truths = ['No problem — nothing was archived.', 'No worries — I archived nothing.', 'Sure thing — I did not delete the company.', 'Not to worry — no company is being archived.', 'Of course — I’m not archiving anything.', 'No problem — No Limits Inc was not archived.'];
  const lost = truths.filter((s) => !v92fires(s) && destroyed(s));
  check('CONTRACT', 'V37-F3 control: idiom-prefixed truthful negatives survive', lost.length === 0, lost.join(' | '));
}

// ── Step-3 shapes re-checked: dash-before-capital is not a boundary (both directions)
check('CONTRACT', '"No company named Ulaanbaatar — North Depot was archived." survives (dash before a capital is not a boundary)', !destroyed('No company named Ulaanbaatar — North Depot was archived.'));
check('CONTRACT', '"No unit at Erdenet — Copper Works was archived." survives', !destroyed('No unit at Erdenet — Copper Works was archived.'));
check('CONTRACT', '"Ulaanbaatar — North Depot was archived." stays caught (lexically, via the name-safe scan / new-subject rule)', fires('Ulaanbaatar — North Depot was archived.') && fires('No problem — Ulaanbaatar — North Depot was archived.'));
check('CONTRACT', 'the three shapes the session reported as refused are in fact caught on this build', fires('No errors ACME was archived.') && fires('No problem the log shows ACME was archived.') && fires('Not a single task moved - Bob Smith was removed.'));
check('CONTRACT', '"Confirmed — Archived ACME." caught; "Confirmed — Archived Media Group remains a customer." preserved', fires('Confirmed — Archived ACME.') && !destroyed('Confirmed — Archived Media Group remains a customer.'));
check('CONTRACT', 'first-person truthful negatives survive ("I archived no companies.")', !destroyed('I archived no companies.') && !destroyed('I deleted none of them.'));
check('CONTRACT', 'negator-led NAME fabrications stay caught and their truthful twins survive (both directions)',
  ['No Limits Inc was archived.', 'Nothing Bundt Cakes has been archived.', 'Never Summer Industries was deleted.'].every(fires)
  && ['No Limits Inc was not archived.', 'Nothing Bundt Cakes wasn’t archived.', 'No company named Never Summer Industries is being deleted.'].every((s) => !destroyed(s)));
check('CONTRACT', 'quoted negator TITLES: fabrication caught, truthful twin survives', fires('The task “Pending review of the Q3 contract” was completed.') && !destroyed('The task “Pending review of the Q3 contract” was not completed.'));
note('disclosed residual (ambiguous without quotes, refusal confirmed): "No smoking signs for the depot was completed." ships; its ordinary-reading twin "…were completed." is a truthful negative v92 destroys and the candidate preserves — no lexical rule separates them: ' + (ships('No smoking signs for the depot was completed.') ? 'ships' : 'caught'));

// ── Structural guards
{
  const blk = beltSlice(TEXT).split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n');
  check('CONTRACT', 'D117: no whole-span lookaround in the belt', !/\(\?![^)]*\[\^\]\*/.test(blk) && !/\(\?=[^)]*\[\^\]\*/.test(blk) && !/\(\?<![^)]*\[\^\]\*/.test(blk));
  const m = TEXT.match(/const readsAsCompletion = [\s\S]{0,4000}?;\n/);
  check('CONTRACT', 'run14/D107 slices the WHOLE readsAsCompletion statement (no character budget)',
    (() => { const r = (() => { try { return readFileSync(resolveRun14(), 'utf8'); } catch { return ''; } })(); return r.length > 0 && !/const readsAsCompletion = \[..s..S\]\{0,\d+\}/.test(r) && r.includes('statement end not found'); })(),
    'run14 must slice the WHOLE readsAsCompletion statement: run39 replaced its character budget (2000 -> 2600 -> 4000, truncating silently each time) with a scan to the statement end that throws if it cannot find it. This fails if a bounded slice returns or the fail-loud scan is missing.');
  let depth = 0; const decls = []; const tok = /[{}]|\b(?:const|let)\s+([A-Za-z_$][\w$]*)/g; let mm;
  while ((mm = tok.exec(blk)) !== null) { if (mm[0] === '{') depth++; else if (mm[0] === '}') depth = Math.max(0, depth - 1); else if (depth === 0 && mm[1]) decls.push(mm[1]); }
  check('CONTRACT', 'no new TOP-LEVEL belt declaration (the extractor-based suites would drop it)', decls.filter((d) => !['LEGACY_PAST_COMPLETION', 'PROGRESS_VERBS', 'EXECUTION_IN_PROGRESS', 'me', 'hasSupportedMutationClaim', 'CONFIRMED_COMPLETION', 'NEGATED_CLAUSE', 'REFERENCELESS_CONFIRMATION', 'COMPLETION_PARTICIPLE', 'COMPLETION_VERB', 'NEGATION_AUX', 'completionIsNegated', 'readsAsCompletion'].includes(d)).length === 0, decls.join(','));
}
// ── Matcher parity (own 12 shapes): every v92-safe answer is preserved
if (v92match) {
  const cm = new Function(detype(extractFn(TEXT, 'matchDisambiguationOption')) + '\nreturn matchDisambiguationOption;')();
  const opts = [{ label: 'ACME Holdings (option 1)', id: 'a', entityType: 'company', actionType: 'archive' }, { label: 'ACME Data (option 2)', id: 'b', entityType: 'company', actionType: 'archive' }];
  const shapes = ['acme holdings', 'ACME Holdings (option 1)', 'option 2', "don't archive acme holdings", 'not acme holdings, the other one', 'acme 2', 'yes acme holdings', 'restore acme holdings', 'no option 2', 'option 4', '', 'acme holdings and acme data'];
  const regress = shapes.filter((c) => { const a = v92match(c, opts), b = cm(c, opts); const ida = a && a.id, idb = b && b.id; return ida && idb && ida !== idb || (!ida && idb && !['option 2'].includes(c) && idb !== 'a'); });
  check('CONTRACT', 'matcher: no v92-safe disambiguation answer regressed (' + shapes.length + ' shapes)', regress.length === 0, regress.join(' | '));
}
console.log('\n' + pass + ' passed, ' + fail + ' failed' + (notes.length ? ', ' + notes.length + ' residual note(s)' : ''));
process.exit(fail ? 1 : 0);
