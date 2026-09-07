// VERIFIER #52 — build scratch mutants of the candidate, each REVERTING exactly one fix, so the differential can
// show that fix is load-bearing on MY corpus. Never touches the working-tree index.ts. Every anchor must be found
// exactly once or the build aborts (a silent no-op mutant is the failure mode this campaign has met nine times).
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
const SRC = 'supabase/functions/sem-ai-command/index.ts';
const orig = readFileSync(SRC);
const text = orig.toString('utf8');
mkdirSync('qa/verification/scratch/v52/mut', { recursive: true });
const count = (t, s) => t.split(s).length - 1;
const build = (name, edits) => {
  let t = text;
  for (const [from, to, expected] of edits) {
    const n = count(t, from); if (n !== expected) throw new Error(`${name}: anchor found ${n}x, expected ${expected}: ${from.slice(0, 80)}`);
    t = t.split(from).join(to);
  }
  if (t === text) throw new Error(name + ': NO-OP mutant');
  const p = `qa/verification/scratch/v52/mut/${name}.ts`; writeFileSync(p, t); console.log('built', p);
};
// V51-D1: the guard's trailing-question stand-down, at BOTH consumers (FUTURE arm + belt imminent arm)
build('revert_D1_question_guard', [['|\\?\\s*$|\\breply (?:yes|y|ok|okay|go)\\b|\\bplease confirm\\b', '', 2]]);
// V51-D3: the first-person anchor linker set + Meanwhile/Also leads
build('revert_D3_linkers', [['\\s(?:and|but|so|then|&|because|although|whereas|while|since|after),?\\s+)(?:and |but |so |then |[Mm]eanwhile,? |[Aa]lso,? )?', '\\s(?:and|but)\\s+)(?:and |but |so |then )?', 1]]);
// V51-D2: the whole-summary renamed-arrow arm past the cap
build('revert_D2_arrow_past_cap', [['(String(s).length > 4000 && (LEGACY_PAST_COMPLETION.test(String(s).slice(4000 - 64)) || /\\brenamed:\\s*.+(→|->)/i.test(String(s))))', '(String(s).length > 4000 && LEGACY_PAST_COMPLETION.test(String(s).slice(4000 - 64)))', 1]]);
// V51-D4: the CONFIRMED first-person object-negator exemption
build('revert_D4_object_negator', [['&& !/^\\s*[Cc]onfirmed\\s*[—–-]\\s*(?:I|We|i|we)\\s+(?:just |already |also |now |recently |successfully |have |had )*(?:deleted|archived|unarchived|removed|restored|reassigned|renamed|deactivated|reactivated|updated|created|closed|added|moved|cleared|sent|approved|rejected|declined|granted|completed|ended)\\s+(?:nothing|none|no|nobody|no one|neither|not)\\b/i.test(String(s)) ', '', 1]]);
// Older fix 1: nameInternal — make it never fire
build('revert_nameInternal', [['const nameInternal = ((capLead && subjectRun)', 'const nameInternal = (false && (capLead && subjectRun)', 1]]);
// Older fix 2: titleHead — never fire
build('revert_titleHead', [['const titleHead = /^(?:Pending|Awaiting)$/.test(mm[0]) &&', 'const titleHead = false && /^(?:Pending|Awaiting)$/.test(mm[0]) &&', 1]]);
// Older fix 3: ppInternal — never fire
build('revert_ppInternal', [['const ppInternal = /\\b(?:with|without|since|despite', 'const ppInternal = false && /\\b(?:with|without|since|despite', 1]]);
// Older fix 4: reassurance-idiom strip (dash form + determiner form) — remove both replaces
build('revert_idiom_strip', [[".replace(/^\\s*(?:(?:no problem|no worries|not to worry|no issue|no issues|nothing to worry about|no trouble|not a problem|no harm done|nothing failed|sure thing|of course|absolutely)(?:\\s+at all)?\\s*[—–-]\\s*)+/i, '')", '', 1], [".replace(/^\\s*(?:no problem|no worries|not to worry|no issue|no issues|nothing to worry about|no trouble|not a problem|no harm done|nothing failed|sure thing|of course|absolutely)(?:\\s+at all)?\\s+(?=(?:the|a|an|our|their|my|its|his|her)\\s+\\w)/i, (i0, o0, t0) => (LEGACY_PAST_COMPLETION.test(t0.slice(o0 + i0.length)) ? '' : i0))", '', 1]]);
// Older fix 5: R-AUXGAP joiner — remove the aux-gap collapse replace
build('revert_auxgap_joiner', [["String(s).replace(new RegExp('(?<!\\\\b(?:couldn|wouldn|shouldn|won|can|isn|wasn|weren|hasn|haven|didn|don)[\\'’]?t\\\\s)(?<!\\\\b(?:couldn|wouldn|shouldn|won|can|isn|wasn|weren|hasn|haven|didn|don)[\\'’]?t\\\\s(?:have|has)\\\\s)(\\\\b(?:was|were|has been|have been)\\\\b)(?=[^.]{0,30}\\\\b' + COMPLETION_PARTICIPLE.source.slice(2) + ')\\\\s*[,—–]\\\\s*[^.]{0,30}?[,—–]\\\\s*(?=' + COMPLETION_PARTICIPLE.source.slice(2) + ')', 'gi'), '$1 ')", 'String(s)', 1]]);
// V48-D3-style entity signal disabled: knownEntityNames.has(...) -> false everywhere in the belt region only
{
  const start = text.indexOf('const NEGATION_AUX ='); const end = text.indexOf('const legacyProseFallback =');
  const region = text.slice(start, end); const n = count(region, 'knownEntityNames.has(');
  const mutated = region.split('knownEntityNames.has(').join('(() => false)(');
  writeFileSync('qa/verification/scratch/v52/mut/disable_entity_signal.ts', text.slice(0, start) + mutated + text.slice(end));
  console.log('built qa/verification/scratch/v52/mut/disable_entity_signal.ts (', n, 'sites )');
}
const after = readFileSync(SRC);
console.log('working tree unchanged:', Buffer.compare(orig, after) === 0, createHash('sha256').update(after).digest('hex'));
