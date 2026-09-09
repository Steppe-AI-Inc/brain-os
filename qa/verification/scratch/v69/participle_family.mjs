// VERIFIER #69 — the #141 participle-vocabulary family, measured from real source bytes.
import fs from 'node:fs';
const SRC = process.env.SEM_INDEX_SRC || 'supabase/functions/sem-ai-command/index.ts';
const src = fs.readFileSync(SRC, 'utf8');
const lines = src.split(/\r?\n/);

function lineOf(pred) { const i = lines.findIndex(pred); return i < 0 ? null : lines[i]; }

// Pull the participle alternation groups out of each named pattern's own source line.
function grab(name) {
  const l = lineOf((x) => new RegExp('const\\s+' + name + '\\s*[:=]').test(x));
  if (l === null) { console.error('MISSING', name); process.exit(2); }
  return l;
}
// participle-looking words: past participles used as completion vocabulary
const PART = /\b(archived|unarchived|deleted|updated|created|restored|activated|deactivated|assigned|reassigned|unassigned|approved|rejected|declined|removed|completed|renamed|retitled|ended|closed|cleared|sent|moved|granted|added|confirmed|done|cancelled|canceled|finished|marked|changed|transferred|set|made|edited|fixed|modified|invited|revoked|enabled|disabled|promoted|demoted|hired|fired|terminated|dismissed|onboarded|merged|split|reopened|reactivated)\b/g;

const targets = {
  PAST_COMPLETION_CLAIM_PATTERN: grab('PAST_COMPLETION_CLAIM_PATTERN'),
  COMPLETION_WORD: grab('COMPLETION_WORD'),
  COMPLETION_VERB: grab('COMPLETION_VERB'),
  CONFIRMED_COMPLETION: grab('CONFIRMED_COMPLETION'),
  FIRST_PERSON_MAIN_CLAUSE_COMPLETION: grab('FIRST_PERSON_MAIN_CLAUSE_COMPLETION'),
};
// EXECUTION_IN_PROGRESS is a multi-line RegExp constructor: take its was/were and is/are-being arms
const eipStart = lines.findIndex((x) => /const EXECUTION_IN_PROGRESS/.test(x));
const eipEnd = lines.findIndex((x, i) => i > eipStart && /^\s*\)\)?\\b', 'i'\);|^\s*'\)\\\\b', 'i'\);/.test(x));
const eipBody = lines.slice(eipStart, eipStart + 30).join('\n');
targets['EXECUTION_IN_PROGRESS.was_were'] = (eipBody.match(/\(\?:was\|were\)[^\n]*/) || [''])[0];
targets['EXECUTION_IN_PROGRESS.is_are_being'] = (eipBody.match(/\(\?:is\|are\) \(\?:being\|getting\)[^\n]*/) || [''])[0];

const sets = {};
for (const [name, body] of Object.entries(targets)) {
  const s = new Set();
  let m; PART.lastIndex = 0;
  while ((m = PART.exec(body))) s.add(m[1].toLowerCase());
  sets[name] = s;
}

const universe = new Set();
for (const s of Object.values(sets)) for (const w of s) universe.add(w);
const names = Object.keys(sets);
const uni = [...universe].sort();

console.log('=== #141 PARTICIPLE VOCABULARY FAMILY — membership matrix ===');
console.log('word'.padEnd(15) + names.map((n) => n.slice(0, 12).padEnd(13)).join(''));
let disagree = 0;
const disagreements = [];
for (const w of uni) {
  const row = names.map((n) => (sets[n].has(w) ? 'Y' : '.').padEnd(13));
  const present = names.filter((n) => sets[n].has(w)).length;
  const flag = present === names.length ? '' : '   <-- DISAGREE (' + present + '/' + names.length + ')';
  if (flag) { disagree++; disagreements.push([w, names.filter((n) => !sets[n].has(w))]); }
  console.log(w.padEnd(15) + row.join('') + flag);
}
console.log('\nuniverse=' + uni.length + '  words all sets agree on=' + (uni.length - disagree) + '  DISAGREEMENTS=' + disagree);
console.log('\nper-set sizes:');
for (const n of names) console.log('  ' + n.padEnd(38) + sets[n].size);

console.log('\n=== WHO IS MISSING WHAT ===');
for (const [w, missing] of disagreements) console.log(w.padEnd(14) + ' missing from: ' + missing.join(', '));

fs.writeFileSync('qa/verification/scratch/v69/participle_family.json', JSON.stringify({ sets: Object.fromEntries(names.map((n) => [n, [...sets[n]].sort()])), disagreements }, null, 2));
