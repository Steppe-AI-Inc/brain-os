// VERIFIER #53 — scratch mutants of the candidate, each REVERTING exactly one fix (never the working tree). Every
// anchor must be found exactly the expected number of times or the build aborts (no silent no-op mutants).
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
const SRC = 'supabase/functions/sem-ai-command/index.ts';
const orig = readFileSync(SRC); const text = orig.toString('utf8');
const DIR = 'qa/verification/scratch/v53/mut'; mkdirSync(DIR, { recursive: true });
const count = (t, s) => t.split(s).length - 1;
const build = (name, edits) => {
  let t = text;
  for (const [from, to, expected] of edits) { const n = count(t, from); if (n !== expected) throw new Error(`${name}: anchor found ${n}x, expected ${expected}: ${from.slice(0, 80)}`); t = t.split(from).join(to); }
  if (t === text) throw new Error(name + ': NO-OP mutant');
  writeFileSync(`${DIR}/${name}.ts`, t); console.log('built', `${DIR}/${name}.ts`);
};
// THIS ROUND — V52-D1 closure: (i) namePrefixHit forced to 0 (the exact fix disabled, everything else intact)
build('revert_V52D1_prefix_zero', [['const nameInternal = (namePrefixHit > 0 ||', 'const nameInternal = (false ||', 1]]);
// (ii) the previous candidate 416c14c itself, from git (the whole one-line change reverted)
const prev = spawnSync('git', ['show', '416c14c:supabase/functions/sem-ai-command/index.ts'], { encoding: 'buffer', maxBuffer: 1 << 26 }).stdout;
if (!prev.length || Buffer.compare(prev, orig) === 0) throw new Error('prev candidate not obtained or identical');
writeFileSync(`${DIR}/prev_416c14c.ts`, prev); console.log('built', `${DIR}/prev_416c14c.ts`);
// (iii) prefix cap 8 -> 3 (to show the 9+-token miss is the cap, and the cap is load-bearing for long names)
build('prefix_cap_3', [['for (let __k = 0; __k < 8; __k++)', 'for (let __k = 0; __k < 3; __k++)', 1]]);
// (iv) prefix cap 8 -> 16 (to size what a wider cap would buy on the NLONG section)
build('prefix_cap_16', [['for (let __k = 0; __k < 8; __k++)', 'for (let __k = 0; __k < 16; __k++)', 1]]);
// EARLIER FIXES (each must be load-bearing on my corpus or on witnesses)
build('revert_D1_question_guard', [['|\\?\\s*$|\\breply (?:yes|y|ok|okay|go)\\b|\\bplease confirm\\b', '', 2]]);
build('revert_D3_linkers', [['\\s(?:and|but|so|then|&|because|although|whereas|while|since|after),?\\s+)(?:and |but |so |then |[Mm]eanwhile,? |[Aa]lso,? )?', '\\s(?:and|but)\\s+)(?:and |but |so |then )?', 1]]);
build('revert_D2_arrow_past_cap', [['(String(s).length > 4000 && (LEGACY_PAST_COMPLETION.test(String(s).slice(4000 - 64)) || /\\brenamed:\\s*.+(→|->)/i.test(String(s))))', '(String(s).length > 4000 && LEGACY_PAST_COMPLETION.test(String(s).slice(4000 - 64)))', 1]]);
build('revert_D4_object_negator', [['&& !/^\\s*[Cc]onfirmed\\s*[—–-]\\s*(?:I|We|i|we)\\s+(?:just |already |also |now |recently |successfully |have |had )*(?:deleted|archived|unarchived|removed|restored|reassigned|renamed|deactivated|reactivated|updated|created|closed|added|moved|cleared|sent|approved|rejected|declined|granted|completed|ended)\\s+(?:nothing|none|no|nobody|no one|neither|not)\\b/i.test(String(s)) ', '', 1]]);
build('revert_nameInternal', [['const nameInternal = (namePrefixHit > 0 || (capLead && subjectRun)', 'const nameInternal = (false && (namePrefixHit > 0 || (capLead && subjectRun))', 1]]);
build('revert_titleHead', [['const titleHead = /^(?:Pending|Awaiting)$/.test(mm[0]) &&', 'const titleHead = false && /^(?:Pending|Awaiting)$/.test(mm[0]) &&', 1]]);
build('revert_ppInternal', [['const ppInternal = /\\b(?:with|without|since|despite', 'const ppInternal = false && /\\b(?:with|without|since|despite', 1]]);
build('revert_idiom_strip', [[".replace(/^\\s*(?:(?:no problem|no worries|not to worry|no issue|no issues|nothing to worry about|no trouble|not a problem|no harm done|nothing failed|sure thing|of course|absolutely)(?:\\s+at all)?\\s*[—–-]\\s*)+/i, '')", '', 1], [".replace(/^\\s*(?:no problem|no worries|not to worry|no issue|no issues|nothing to worry about|no trouble|not a problem|no harm done|nothing failed|sure thing|of course|absolutely)(?:\\s+at all)?\\s+(?=(?:the|a|an|our|their|my|its|his|her)\\s+\\w)/i, (i0, o0, t0) => (LEGACY_PAST_COMPLETION.test(t0.slice(o0 + i0.length)) ? '' : i0))", '', 1]]);
build('revert_auxgap_joiner', [["String(s).replace(new RegExp('(?<!\\\\b(?:couldn|wouldn|shouldn|won|can|isn|wasn|weren|hasn|haven|didn|don)[\\'’]?t\\\\s)(?<!\\\\b(?:couldn|wouldn|shouldn|won|can|isn|wasn|weren|hasn|haven|didn|don)[\\'’]?t\\\\s(?:have|has)\\\\s)(\\\\b(?:was|were|has been|have been)\\\\b)(?=[^.]{0,30}\\\\b' + COMPLETION_PARTICIPLE.source.slice(2) + ')\\\\s*[,—–]\\\\s*[^.]{0,30}?[,—–]\\\\s*(?=' + COMPLETION_PARTICIPLE.source.slice(2) + ')', 'gi'), '$1 ')", 'String(s)', 1]]);
build('revert_conditioned_offer_guard', [['\\b(?:once|if|after|unless|when|provided|assuming|as soon as|subject to|pending|before|until|only with|but first|first)\\b[^.]{0,40}?\\byou(?:r|rs)?\\b|', '', 2]]); // both consumers (FUTURE arm + belt imminent arm)
{ // entity signal disabled in the belt region only
  const start = text.indexOf('const NEGATION_AUX ='); const end = text.indexOf('const legacyProseFallback =');
  const region = text.slice(start, end); const n = count(region, 'knownEntityNames.has(');
  writeFileSync(`${DIR}/disable_entity_signal.ts`, text.slice(0, start) + region.split('knownEntityNames.has(').join('(() => false)(') + text.slice(end));
  console.log('built', `${DIR}/disable_entity_signal.ts (`, n, 'sites )');
}
const after = readFileSync(SRC);
console.log('working tree unchanged:', Buffer.compare(orig, after) === 0, createHash('sha256').update(after).digest('hex'));
