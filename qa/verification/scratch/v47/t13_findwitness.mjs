// Generative search for a discriminating witness for the three mutants my corpus left as
// no-ops. A guard with NO witness anywhere is unobservable — the vacuity class.
import * as L from './lab.mjs';
const SLICE = L.extractBelt(L.SRC_LF);
const beltFrom = (slice) => new Function('__n', '__c',
  `const knownEntityNames = __n; const verifiedClaims = __c;\n${slice}\nreturn readsAsCompletion;`)(new Set(), []);
const stock = beltFrom(SLICE);
const MUT = {
  'M8 reassurance-idiom strip': (s) => s
    .replace("(?:no problem|no worries|not to worry|no issue|no issues|nothing to worry about|no trouble|not a problem|no harm done|nothing failed|sure thing|of course|absolutely)(?:\\s+at all)?\\s*[—–-]\\s*)+/i, ''",
             "(?:zzzz)(?:\\s+at all)?\\s*[—–-]\\s*)+/i, ''")
    .replace("/^\\s*(?:no problem|no worries|not to worry|no issue|no issues|nothing to worry about|no trouble|not a problem|no harm done|nothing failed|sure thing|of course|absolutely)(?:\\s+at all)?\\s+(?=(?:the|a|an|our|their|my|its|his|her)\\s+\\w)/i",
             "/^\\s*(?:zzzz)(?:\\s+at all)?\\s+(?=(?:the|a|an|our|their|my|its|his|her)\\s+\\w)/i"),
  'M9 R-AUXGAP whole-summary arm': (s) => s
    .replace("(\\\\b(?:was|were|has been|have been)\\\\b)(?=[^.]{0,30}\\\\b", "(\\\\bzzzz\\\\b)(?=[^.]{0,30}\\\\b"),
  'M11 renamed-arrow arm': (s) => s.replace("|| /\\brenamed:\\s*.+(→|->)/i.test(String(s))", '|| false'),
};
const IDIOMS = ['No problem', 'No worries', 'Not to worry', 'No issue', 'No trouble', 'Not a problem',
  'No harm done', 'Nothing failed', 'Sure thing', 'Of course', 'Absolutely', 'No issues at all'];
const SEPS = [' — ', ' – ', ' - ', ' ', ', '];
const TAILS = ['the company was archived.', 'the task was deleted.', 'our goal was restored.',
  'their record was removed.', 'ACME was archived.', 'the log shows ACME was archived.',
  'Bob Smith was removed.', 'a company was archived.', 'an approval was declined.'];
const AUXGAPS = [];
for (const subj of ['Erdenet Copper Works', 'ACME', 'Bob Smith', 'The task', 'The company'])
  for (const aux of ['was', 'were', 'has been', 'have been'])
    for (const adv of ['as you asked', 'per your request', 'finally', 'after review by finance', 'at 14:00 today'])
      for (const p of ['archived', 'deleted', 'restored', 'removed', 'renamed'])
        for (const d of [[',', ','], ['—', '—'], [',', '—']])
          AUXGAPS.push(`${subj} ${aux}${d[0]} ${adv}${d[1]} ${p}.`);
const RENAMED = [];
for (const pre of ['', 'Project ', 'Company ', 'The task '])
  for (const a of ['→', '->'])
    for (const q of ['"Old" ', 'Old ', '“Old” '])
      RENAMED.push(`${pre}renamed: ${q}${a} "New"`);
const SPACES = {
  'M8 reassurance-idiom strip': IDIOMS.flatMap((i) => SEPS.flatMap((s) => TAILS.map((t) => i + s + t))),
  'M9 R-AUXGAP whole-summary arm': AUXGAPS,
  'M11 renamed-arrow arm': RENAMED,
};
for (const [name, mut] of Object.entries(MUT)) {
  const slice = mut(SLICE);
  if (slice === SLICE) { console.log('SKIP (patch did not apply):', name); continue; }
  const belt = beltFrom(slice);
  const space = SPACES[name];
  const wit = space.filter((s) => stock(s) !== belt(s));
  console.log((wit.length ? 'LOAD-BEARING' : 'NO WITNESS  ').padEnd(13), name, '—', wit.length, 'of', space.length, 'discriminate');
  for (const w of wit.slice(0, 6)) console.log('     witness:', JSON.stringify(w), 'stock=' + (stock(w) ? 'FIRE' : 'keep'), 'mutant=' + (belt(w) ? 'FIRE' : 'keep'));
}
