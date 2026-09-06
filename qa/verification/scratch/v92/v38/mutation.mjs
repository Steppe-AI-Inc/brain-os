// VERIFIER #38 — independent mutation proof, IMPACT-SCAN form.
// For each shipped fix I revert it on the source text and re-run my ENTIRE corpus plus a
// targeted probe set, reporting every case whose verdict CHANGES. This does not depend on
// me guessing the right probe for a fix, and it distinguishes three outcomes that look
// identical if you only run hand-picked probes:
//   NON-VACUOUS            — reverting changes real verdicts
//   VACUOUS                — transform applied, nothing changed anywhere
//   TRANSFORM DID NOT APPLY — my anchor is stale; no conclusion is drawn
import { readSrc, buildBelt, CAND_PATH } from './harness.mjs';
import { CORPUS } from './corpus.mjs';

const candSrc = readSrc(CAND_PATH);
const base = buildBelt(candSrc);

// Extra probes aimed at the arms verifier #37 said the idiom strip feeds.
const EXTRA = [
  'No problem — I archived ACME Corp.', 'No worries — I deleted Beta Corp.',
  'No problem — the company is being archived.', 'No worries — ACME Corp is being deleted.',
  'No problem — I archived nothing.', 'No worries — nothing is being deleted.',
  'No problem — ACME Corp was archived.', 'Nothing failed: ACME Corp was archived.',
  'Pending review ACME Corp was archived.', 'Awaiting approval ACME Corp was archived.',
  'Pending review… ACME Corp was archived.', '"Pending review" ACME Corp was archived.',
  'No company, as requested, was archived.', 'No unit, per your instruction, was archived.',
  'No company, as requested, is being archived.', 'ACME Corp, as requested, was archived.',
  'No company, none at all, is being archived.', 'ACME Corp was, as you asked, archived.',
].map((text, i) => ({ id: 'X' + i, section: 'extra_probe', kind: '?', text }));

const ALL = CORPUS.concat(EXTRA);

const lit = (slice, needle, repl, id) => {
  if (!slice.includes(needle)) throw new Error('ANCHOR MISSING for ' + id);
  return slice.split(needle).join(repl);
};

const IDIOM_DASH = ".replace(/^\\s*(?:(?:no problem|no worries|not to worry|no issue|no issues|nothing to worry about|no trouble|not a problem|no harm done|nothing failed|sure thing|of course|absolutely)(?:\\s+at all)?\\s*[—–-]\\s*)+/i, '')";
const F1_COLLAPSE_HEAD = ".replace(/,\\s*(?:(?:(?!\\b(?:not|never|no|nobody|nothing|none|neither|nor)\\b)[^,.\\x3b:!?()]){1,40}?),\\s*(?=(?:is|are|was|were|has|have|had|isn|aren|wasn|weren|hasn|haven|shows?|showed|indicates?|indicated|confirms?|confirmed|suggests?|suggested|reports?|reported)\\b)/gi, ' ')";

const MUTATIONS = [
  ['M1 nameInternal', (s) => lit(s, 'const nameInternal = capLead && subjectRun && !/\\bnor\\b/.test(c);', 'const nameInternal = false;', 'M1')],
  ['M2 objectName', (s) => s.replace(/const objectName = capLead && new RegExp\([\s\S]*?\.test\(c\.slice\(0, mm\.index\)\);/, 'const objectName = false;')],
  ['M3 titleHead', (s) => s.replace(/const titleHead = [\s\S]*?;\n/, 'const titleHead = false;\n')],
  ['M4 ppInternal', (s) => s.replace(/const ppInternal = [\s\S]*?LEGACY_PAST_COMPLETION\.test\(c\);/, 'const ppInternal = false;')],
  ['M5 idiom strip (F3, re-added)', (s) => lit(s, IDIOM_DASH, '', 'M5')],
  ['M6 R-AUXGAP', (s) => s.replace(/String\(s\)\.replace\(new RegExp\('\(\?<!\\\\b\(\?:couldn[\s\S]*?'gi'\), '\$1 '\)/, 'String(s)')],
  ['M7 F1 comma-isolated collapse', (s) => lit(s, F1_COLLAPSE_HEAD, '', 'M7')],
  ['M8 blanked-parenthetical keeps length (F2b)', (s) => lit(s, ".replace(/\\([^()]*\\)/g, (p0) => ' '.repeat(p0.length))", ".replace(/\\([^()]*\\)/g, ' ')", 'M8')],
];

let failures = 0;
const lines = [];
const say = (s) => { lines.push(s); console.log(s); };
say('=== VERIFIER #38 MUTATION IMPACT SCAN (corpus ' + ALL.length + ' cases) ===');
say('');
for (const [id, xf] of MUTATIONS) {
  let applied = false, mutated;
  const guarded = (s) => { let o; try { o = xf(s); } catch (e) { throw e; } applied = (o !== s); return o; };
  try { mutated = buildBelt(candSrc, guarded); }
  catch (e) { say(`*** BUILD/ANCHOR FAILED ***  ${id} — ${e.message}`); say(''); failures++; continue; }
  if (!applied) { say(`*** TRANSFORM DID NOT APPLY ***  ${id} — anchor stale, conclusion WITHHELD`); say(''); failures++; continue; }
  const changed = [];
  for (const c of ALL) {
    const b = base(c.text) === true, m = mutated(c.text) === true;
    if (b !== m) changed.push({ ...c, b, m });
  }
  if (!changed.length) { say(`*** VACUOUS ***  ${id} — transform applied, ZERO verdict changes across ${ALL.length} cases`); say(''); failures++; continue; }
  say(`NON-VACUOUS  ${id} — ${changed.length} verdict change(s) on revert`);
  for (const c of changed.slice(0, 14)) {
    const dir = c.b && !c.m ? 'fabrication RE-OPENS' : 'answer DESTROYED';
    say(`    [${c.kind}] ${dir}: ${JSON.stringify(c.text)}`);
  }
  if (changed.length > 14) say(`    … and ${changed.length - 14} more`);
  say('');
}
say(failures ? `RESULT: ${failures} mutation(s) vacuous or inconclusive` : 'RESULT: every shipped fix is NON-VACUOUS');
import('node:fs').then((fs) => fs.writeFileSync(new URL('./mutation_report.txt', import.meta.url), lines.join('\n') + '\n'));
process.exitCode = failures ? 1 : 0;
