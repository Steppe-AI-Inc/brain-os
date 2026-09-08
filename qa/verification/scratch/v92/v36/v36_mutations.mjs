// v36: independent mutation test of the run30/31 fixes on MY shapes (in-memory mutants of the candidate).
import { loadText, buildBelt } from './v36_harness.mjs';
const TEXT = loadText(process.env.SEM_INDEX_SRC);
const live = buildBelt(TEXT);
const fires = (b, s) => b.readsAsCompletion(String(s)) === true;
const M = [
  { id: 'run30.nameInternal', fabs: ['No Limits Inc was archived.', 'Nothing Bundt Cakes has been deleted.', 'Never Summer Industries was restored.'], truths: [],
    apply: (s) => s.replace(/const nameInternal = [^\r\n]*;/, 'const nameInternal = false;') },
  { id: 'run30.titleHead', fabs: ['Pending review of the contract was completed.', 'Awaiting approval for the Q3 budget was approved.'], truths: [],
    apply: (s) => s.replace(/const titleHead = [^\r\n]*;/, 'const titleHead = false;') },
  { id: 'run30.ppInternal', fabs: ['The company with no active tasks was archived.', 'With no blockers left ACME Holdings was archived.', 'Since no objections were raised ACME Holdings was archived.'], truths: [],
    apply: (s) => s.replace(/const ppInternal = [^\r\n]*;/, 'const ppInternal = false;') },
  { id: 'run30.idiomLexiconWidening (expected DEAD)', fabs: ['No worries at all — FuelMetrix was archived.', 'Sure thing — ACME Holdings was archived.', 'Of course — ACME Holdings was archived.'], truths: [],
    apply: (s) => s.replace("(?:(?:no problem|no worries|not to worry|no issue|no issues|nothing to worry about|no trouble|not a problem|no harm done|nothing failed|sure thing|of course|absolutely)(?:\\s+at all)?\\s*[—–-]\\s*)+", "(?:no problem|no worries|not to worry|no issue|no issues|nothing to worry about|no trouble|not a problem|no harm done|nothing failed)\\s*[—–]\\s*") },
  { id: 'run31.objectName', fabs: ['I archived No Limits Inc.', 'We deleted Nothing Bundt Cakes.'], truths: [],
    apply: (s) => s.replace(/const objectName = [^\r\n]*;/, 'const objectName = false;') },
  { id: 'run31.hedgeBlanking', fabs: ['ACME may have been archived and Beta Corp has been deleted.'], truths: ['It may have been archived.', 'The task might have been deleted.'],
    apply: (s) => s.replace(/\.replace\(\/\\b\(\?:may\|might\|could\|can\|would\|should\)[^\r\n]*?\/gi, ' '\)/, '') },
  { id: 'run32.newSubject', fabs: ['No errors ACME was archived.', 'Not a single task moved — Bob Smith was removed.', 'No errors the company was archived.'], truths: [],
    apply: (s) => s.replace('const newSubject = !/\\bnor\\b/.test(c) && ((sre)', 'const newSubject = false && ((sre)') },
  { id: 'run32.D181 determiner-led idiom strip', fabs: ['No problem the log shows ACME was archived.'], truths: [],
    apply: (s) => s.replace(".replace(/^\\s*(?:no problem|no worries|not to worry|no issue|no issues|nothing to worry about|no trouble|not a problem|no harm done|nothing failed|sure thing|of course|absolutely)(?:\\s+at all)?\\s+(?=(?:the|a|an|our|their|my|its|his|her)\\s+\\w)/i, '')", '') },
  { id: 'run35.E relInternal', fabs: ['The company that had no open tasks was archived.'], truths: [],
    apply: (s) => s.replace(/const relInternal = [^\r\n]*;/, 'const relInternal = false;') },
  { id: 'run35.A2 collapse', fabs: ['ACME Holdings was, as requested, archived.', 'The task "No smoking" was, as requested, archived.'], truths: [],
    apply: (s) => s.replace(/\|\| String\(s\)\.replace\(new RegExp\('\(\?<!\\\\b\(\?:couldn[^\r\n]*?'gi'\), '\$1 '\)/, '|| String(s)') },
];
let proven = 0, dead = 0;
for (const m of M) {
  const t = m.apply(TEXT);
  if (t === TEXT) { console.log('NO-OP      ' + m.id + ' (anchor not found)'); continue; }
  let b; try { b = buildBelt(t); } catch (e) { console.log('BUILD-FAIL ' + m.id + ': ' + e.message); continue; }
  const liveOk = m.fabs.every((s) => fires(live, s)) && m.truths.every((s) => !fires(live, s));
  const reopened = m.fabs.filter((s) => !fires(b, s)).length, lost = m.truths.filter((s) => fires(b, s)).length;
  const loadBearing = reopened + lost > 0;
  if (loadBearing) proven++; else dead++;
  console.log(`${loadBearing ? 'LOAD-BEARING' : 'DEAD        '} ${m.id}: live ${liveOk ? 'ok' : 'WRONG'}; revert re-opens ${reopened}/${m.fabs.length} fabs, destroys ${lost}/${m.truths.length} truths`);
}
console.log(`\n${proven} load-bearing, ${dead} dead of ${M.length}`);
