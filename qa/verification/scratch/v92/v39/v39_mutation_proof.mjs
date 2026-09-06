// VERIFIER #39 — independent mutation proof of the shipped fixes.
// Each mutation is applied to an IN-MEMORY copy of the real source (the working tree is
// never touched). A fix that cannot be shown to change behaviour on MY corpus is dead
// code, not a fix.
import { readSrc, buildBelt, v92Gate, CAND_PATH, V92_PATH } from './belt39.mjs';
import { TRUTHFUL, FABRICATIONS } from './corpus39.mjs';

const src = readSrc(CAND_PATH);
const v92 = v92Gate(readSrc(V92_PATH));
const base = buildBelt(src);
const ALL = [...TRUTHFUL.map((x) => ({ ...x, kind: 'truthful' })), ...FABRICATIONS.map((x) => ({ ...x, kind: 'fabrication' }))];

// extra probe strings that specifically exercise each fix
const PROBES = [
  'No Limits Inc was archived.',
  'Nothing Bundt Cakes has been deleted.',
  'Never Summer Industries was archived.',
  'None The Wiser LLC has been deleted.',
  '"Pending review of the Q3 budget" was approved.',
  '"Awaiting approval from finance" was approved.',
  'The company with no active tasks was archived.',
  'The unit with no open approvals has been deleted.',
  'No problem — ACME Holdings was archived.',
  'No worries, the company was archived.',
  'Nothing failed: ACME Holdings was archived.',
  'ACME Holdings was, as requested, archived.',
  'Beta Corp has been, after review, deleted.',
  'ACME Holdings was not, as you asked, archived.',
  'The records, nobody having approved them, were not updated.',
  'ACME Holdings, our largest client, was archived.',
  'It was a long day. ACME Holdings was archived.',
  'Done! Beta Corp has been deleted.',
].map((text, i) => ({ tag: 'PROBE' + i, text, kind: 'probe' }));
const CASES = [...ALL, ...PROBES];

function fireSet(belt) {
  const s = new Set();
  for (const c of CASES) if (belt.readsAsCompletion(String(c.text)) === true) s.add(c.text);
  return s;
}
const baseSet = fireSet(base);

const MUTATIONS = [
  ['FIX1.nameInternal', /const nameInternal = capLead && subjectRun && !\/\\bnor\\b\/\.test\(c\);/, 'const nameInternal = false;'],
  ['FIX2.titleHead', /const titleHead = [^\n]*?;\n/, 'const titleHead = false;\n'],
  ['FIX3.ppInternal', /const ppInternal = [^\n]*?;\n/, 'const ppInternal = false;\n'],
  ['FIX4.objectName', /const objectName = [^\n]*?;\n/, 'const objectName = false;\n'],
  ['FIX5.newSubject', /const newSubject = [^\n]*?;\n/, 'const newSubject = false;\n'],
];

let pass = 0; const dead = [];
function report(name, mutSrc) {
  let belt; try { belt = buildBelt(mutSrc); } catch (e) { console.log('FAIL ' + name + ' — mutated source does not build: ' + e.message); dead.push(name); return; }
  const s = fireSet(belt);
  const opened = CASES.filter((c) => baseSet.has(c.text) && !s.has(c.text));   // fix was CATCHING these
  const closed = CASES.filter((c) => !baseSet.has(c.text) && s.has(c.text));   // fix was PRESERVING these
  const n = opened.length + closed.length;
  if (n === 0) { console.log('DEAD ' + name + ' — reverting it changes NOTHING on this corpus'); dead.push(name); return; }
  pass++;
  console.log('OK   ' + name + ' — revert changes ' + n + ' verdicts ('
    + opened.length + ' fabrications re-opened, ' + closed.length + ' answers newly destroyed)');
  opened.slice(0, 4).forEach((c) => console.log('        re-opened: [' + c.tag + '] ' + c.text));
  closed.slice(0, 4).forEach((c) => console.log('        destroyed: [' + c.tag + '] ' + c.text));
}

for (const [name, re, rep] of MUTATIONS) {
  if (!re.test(src)) { console.log('FAIL ' + name + ' — mutation site not found (pattern drifted)'); dead.push(name); continue; }
  report(name, src.replace(re, rep));
}

// FIX6 — #38's sentence-local v92 parity backstop: delete the leading .some() arm.
{
  const a = src.indexOf('const readsAsCompletion = (s) => String(s).split(/(?<=[.!?])\\s+/).some(');
  const marker = ' || REFERENCELESS_CONFIRMATION.test(s)';
  if (a < 0 || src.indexOf(marker, a) < 0) { console.log('FAIL FIX6.backstop — site not found'); dead.push('FIX6.backstop'); }
  else {
    const b = src.indexOf(marker, a);
    report('FIX6.v92ParityBackstop', src.slice(0, a) + 'const readsAsCompletion = (s) => false' + src.slice(b));
  }
}
// FIX7 — the negator-PRONOUN comma pre-pass.
{
  const re = /\.replace\(\/,\\s\*\(\(\?:\[\^,\.\\x3b:!\?\(\)\]\{0,20\}\?\)[^\n]*?\/g, ' \$1 '\)/;
  if (!re.test(src)) { console.log('FAIL FIX7.pronounCommaPrepass — site not found'); dead.push('FIX7.pronounCommaPrepass'); }
  else report('FIX7.pronounCommaPrepass', src.replace(re, ''));
}
// FIX8 — the widened reassurance-idiom strip (second, no-dash form).
{
  const i = src.indexOf(".replace(/^\\s*(?:no problem|no worries|not to worry|no issue|no issues|nothing to worry about|no trouble|not a problem|no harm done|nothing failed|sure thing|of course|absolutely)(?:\\s+at all)?\\s+(?=");
  if (i < 0) { console.log('FAIL FIX8.idiomWidened — site not found'); dead.push('FIX8.idiomWidened'); }
  else {
    const end = src.indexOf('.replace(/,\\s*((?:[^,.\\x3b:!?()]{0,20}?)', i);
    report('FIX8.idiomWidened', src.slice(0, i) + src.slice(end));
  }
}
// FIX9 — the R-AUXGAP whole-summary rewrite arm.
{
  const i = src.indexOf("String(s).replace(new RegExp('(?<!\\\\b(?:couldn|wouldn|shouldn|won|can|isn|wasn|weren|hasn|haven|didn|don)");
  const end = src.indexOf(".replace(/^\\s*(?:(?:no problem", i);
  if (i < 0 || end < 0) { console.log('FAIL FIX9.auxgap — site not found'); dead.push('FIX9.auxgap'); }
  else report('FIX9.auxgap', src.slice(0, i) + 'String(s)' + src.slice(end));
}

console.log('\nv39_mutation_proof: ' + pass + ' live, ' + dead.length + ' dead/unfound' + (dead.length ? ' — ' + dead.join(', ') : ''));
process.exit(dead.length ? 1 : 0);
