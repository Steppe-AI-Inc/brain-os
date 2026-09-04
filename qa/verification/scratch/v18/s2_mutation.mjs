// VERIFIER #18 / SCENARIO 2 — INDEPENDENT MUTATION TEST. My own harness; the
// v15/v16/v17 mutation proofs are the implementing session's and are not used.
//
// For each mutant: write it, ASSERT the sha changed, run the ENTIRE committed .mjs
// battery from the filesystem, restore byte-identically, ASSERT the sha is back.
// A mutant that no committed suite fails on is a SURVIVOR = a coverage gap.
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

const SRC = resolve('supabase/functions/sem-ai-command/index.ts');
const EXPECT = 'cf4b6f4defe9b5ed72cee29b08c4e2731651fac0d080f3ba30e1ed601e056deb';
const original = readFileSync(SRC); // Buffer — CRLF preserved byte for byte
const sha = (b) => createHash('sha256').update(b).digest('hex');
if (sha(original) !== EXPECT) { console.error('SHA MISMATCH BEFORE ANY EDIT: ' + sha(original)); process.exit(2); }
const text = original.toString('utf8');

const DIR = resolve('qa/scenarios-runner');
const SUITES = readdirSync(DIR).filter((f) => f.endsWith('.mjs') && f !== '_gate_extract.mjs').sort();

// One suite run -> a small, comparable signature. NO heuristic string sniffing: an earlier
// version of this harness matched /FAILED/i anywhere in the output and was fooled by a
// CONTRACT description containing the word "failed" ("a failed head-count query"), which
// made three suites appear to kill every single mutant. That is the vacuous-mutation-proof
// class; the rule below is baseline-differential instead.
function runSuite(f) {
  let out = '', code = 0;
  try { out = execFileSync(process.execPath, [resolve(DIR, f)], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 180000 }); }
  catch (e) { code = typeof e.status === 'number' ? e.status : 99; out = String(e.stdout || '') + String(e.stderr || ''); }
  const failLines = (out.match(/^FAIL\b/gm) || []).length;
  const m = out.match(/(\d+)\s+pass(?:ed)?,\s*(\d+)\s+fail(?:ed)?/i);
  return {
    code,
    textFail: Math.max(failLines, m ? Number(m[2]) : 0),
    allPassed: /ALL REGRESSIONS PASSED/.test(out),
    threw: /\b(Error|TypeError|SyntaxError|ReferenceError):/.test(out) && code !== 0,
  };
}
let BASE = null;
function runBattery() {
  const failing = [];
  for (const f of SUITES) {
    const s = runSuite(f);
    const b = BASE ? BASE[f] : null;
    const bad = s.code !== 0 || s.textFail > 0 || (b && b.allPassed && !s.allPassed);
    if (bad) failing.push(`${f}(exit=${s.code},textFail=${s.textFail}${b && b.allPassed && !s.allPassed ? ',lostALL-PASSED' : ''})`);
  }
  return failing;
}

// ------------------------------------------------------------------ the mutants ------
const MUT = [];
const m = (id, what, from, to) => MUT.push({ id, what, from, to });

m('M1.invertOrder', 'invert the ORDER rule: a negator disarms only when it FOLLOWS the verb',
  'c.search(NEGATED_CLAUSE) < c.search(COMPLETION_VOCAB)',
  'c.search(NEGATED_CLAUSE) > c.search(COMPLETION_VOCAB)');
m('M2.dropComma', 'drop the comma from the clause splitter',
  'String(s).split(/[.!?,\\x3b\\n]+/)', 'String(s).split(/[.!?\\x3b\\n]+/)');
m('M3.dropNewline', 'drop the newline from the clause splitter (added by this candidate)',
  'String(s).split(/[.!?,\\x3b\\n]+/)', 'String(s).split(/[.!?,\\x3b]+/)');
m('M4.addOr', 'add " or " to the clause splitter',
  'String(s).split(/[.!?,\\x3b\\n]+/)', 'String(s).split(/[.!?,\\x3b\\n]+|\\s+or\\s+/)');
m('M5.confirmedBackInVocab', 'put "confirmed" back into COMPLETION_VOCAB',
  "new RegExp('\\\\b(?:archived|deleted|", "new RegExp('\\\\b(?:confirmed|archived|deleted|");
m('M6.orderRuleRemoved', 'remove the ORDER test entirely (revert to 52e830f: any negator in the clause disarms)',
  '!(NEGATED_CLAUSE.test(c) && (c.search(COMPLETION_VOCAB) < 0 || c.search(NEGATED_CLAUSE) < c.search(COMPLETION_VOCAB)))',
  '!NEGATED_CLAUSE.test(c)');
m('M7.vocabAlwaysMisses', 'make COMPLETION_VOCAB never match (equivalent to deleting it)',
  "|executing|processing)\\\\b', 'i');", "|executing|processing)\\\\b(?!)', 'i');");
m('M8.entityNounsWidened', 'widen ENTITY_NOUNS: every entity type admits every noun',
  "...(ENTITY_NOUNS[typeof winner.entityType === 'string' ? winner.entityType : ''] || '').split(' ').filter((w) => w.length > 0)]);",
  "...Object.values(ENTITY_NOUNS).join(' ').split(' ').filter((w) => w.length > 0)]);");
m('M9.actionFamilyEmptied', 'empty ACTION_FAMILY_VERBS (no lifecycle verb is filler any more)',
  "    archive: 'archive archiving archived delete deleting remove removing end ending close closing deactivate deactivating',\r\n    restore: 'restore restoring restored reactivate reactivating activate activating reopen unarchive undelete',",
  "    archive: '',\r\n    restore: '',");
m('M10.actionFamilyUnioned', 'union ACTION_FAMILY_VERBS (revert D127: every lifecycle verb is filler for every family)',
  "...(ACTION_FAMILY_VERBS[typeof winner.actionType === 'string' ? winner.actionType : 'archive'] || ACTION_FAMILY_VERBS.archive).split(' '),",
  "...Object.values(ACTION_FAMILY_VERBS).join(' ').split(' '),");
m('M11.anyOptionNumberIsFiller', 'make ANY option number filler, not just the winner\'s own',
  "residual = residual.replace(new RegExp('(?:\\\\boption\\\\s*#?|#)' + ownNumber + '\\\\b', 'g'), ' ');",
  "residual = residual.replace(new RegExp('(?:\\\\boption\\\\s*#?|#)\\\\d+\\\\b', 'g'), ' ');");
m('M12.bareDigitIsFiller', 'make a bare digit filler',
  "residual = residual.replace(new RegExp('(?:\\\\boption\\\\s*#?|#)' + ownNumber + '\\\\b', 'g'), ' ');",
  "residual = residual.replace(new RegExp('(?:\\\\boption\\\\s*#?|#)?' + ownNumber + '\\\\b', 'g'), ' ');");
m('M13.plainActivateRemoved', 'revert the RESTORE_VERB_PATTERN half of D127: plain "activate" is not a restore verb again',
  '(?:re)?activat(e|ed|ing)', 'reactivat(e|ed|ing)');
m('M14.referencelessOff', 'make REFERENCELESS_CONFIRMATION never match (control — a mutant the battery MUST catch)',
  'const REFERENCELESS_CONFIRMATION = /^\\s*confirmed', 'const REFERENCELESS_CONFIRMATION = /^(?!)\\s*confirmed');

// ------------------------------------------------------------------------- run -------
console.log('=== SCENARIO 2 : INDEPENDENT MUTATION TEST (my own harness) ===');
console.log(`battery: ${SUITES.length} committed .mjs suites, run in full for every mutant\n`);
BASE = Object.fromEntries(SUITES.map((f) => [f, runSuite(f)]));
const baseBad = SUITES.filter((f) => BASE[f].code !== 0 || BASE[f].textFail > 0);
console.log('BASELINE (unmutated): suites failing = ' + (baseBad.join(', ') || 'none') + '\n');
const results = [];
try {
  for (const mu of MUT) {
    if (!text.includes(mu.from)) { results.push({ ...mu, status: 'ANCHOR-MISSING' }); console.log(`!! ${mu.id}: ANCHOR NOT FOUND — mutation not applied (${JSON.stringify(mu.from.slice(0, 50))})`); continue; }
    const mutated = text.split(mu.from).join(mu.to);
    const buf = Buffer.from(mutated, 'utf8');
    if (sha(buf) === EXPECT) throw new Error('mutation produced an identical file: ' + mu.id);
    writeFileSync(SRC, buf);
    if (sha(readFileSync(SRC)) === EXPECT) throw new Error('write did not take: ' + mu.id);
    const failing = runBattery();
    writeFileSync(SRC, original);
    const back = sha(readFileSync(SRC));
    if (back !== EXPECT) { console.error('RESTORE FAILED after ' + mu.id + ': ' + back); process.exit(2); }
    const status = failing.length > 0 ? 'KILLED' : 'SURVIVED';
    results.push({ ...mu, status, failing });
    console.log(`${status === 'KILLED' ? 'KILLED  ' : 'SURVIVED'} ${mu.id.padEnd(28)} ${mu.what}`);
    if (failing.length) console.log('           killed by: ' + failing.join(', '));
  }
} finally {
  writeFileSync(SRC, original);
}
const finalSha = sha(readFileSync(SRC));
console.log('\nSURVIVORS (coverage gaps): ' + (results.filter((r) => r.status === 'SURVIVED').map((r) => r.id).join(', ') || 'none'));
console.log('ANCHOR-MISSING: ' + (results.filter((r) => r.status === 'ANCHOR-MISSING').map((r) => r.id).join(', ') || 'none'));
console.log('index.ts sha256 after the whole run: ' + finalSha + (finalSha === EXPECT ? '  (MATCHES — restored byte-identically)' : '  *** MISMATCH ***'));
