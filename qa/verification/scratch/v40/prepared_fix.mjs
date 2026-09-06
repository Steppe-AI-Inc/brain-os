// VERIFIER #40 prepared fix — four SOURCE EDITS, applied to the belt text in memory, then
// measured on my full corpus against deployed v92. No file in supabase/ is written.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildCandidateGate, buildV92Gate, v92Path } from './v40_belt.mjs';
import { buildCorpus } from './corpus.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------
// FIX A (V40-D1) — clause-initial bare gerund is an EXECUTION claim only when its object
// is a SPECIFIC referent: a proper name, a definite determiner, or an object pronoun.
// A generic/indefinite object ("Archiving a company …", "Archiving old projects …") is a
// POLICY statement, and English predicates are an open class, so #39's finite-verb
// whitelist can never be completed. Structural, and strictly NARROWING.
const FIX_A_ANCHOR = "&& !/(?:^|\\s)(?!(?:I|We|i|we)\\b)";
// NOTE: written case-SENSITIVELY on purpose. An /i flag would also fold the `[A-Z]`
// specific-object test and make the whole lookahead unsatisfiable — the exact "a flag
// changes more than the token you meant" trap. Both casings are spelled out instead.
// The disarm is stated POSITIVELY (an indefinite article or a bare plural object), not as
// "not a definite object", so it can only ever REMOVE catches on generic policy prose and
// can never widen the arm. The verb set is PROGRESS_VERBS exactly — "working/processing/
// executing" belong to other arms of EXECUTION_IN_PROGRESS and are deliberately excluded,
// so run12/D94's "Working on archiving ACME." and #39's V39-D1 controls keep firing.
const FIX_A_GUARD = "&& !/^\\s*(?:[Aa]ssigning|[Rr]eassigning|[Uu]pdating|[Cc]reating|[Mm]oving|[Aa]rchiving|[Rr]estoring|[Dd]eleting|[Rr]emoving|[Ee]nding|[Rr]enaming|[Cc]losing|[Cc]learing|[Gg]ranting|[Dd]eclining|[Aa]pproving|[Rr]ejecting|[Cc]ompleting|[Aa]ctivating|[Dd]eactivating|[Aa]dding|[Ss]ending)\\s+(?:an?\\b|(?:[a-z]+\\s+){0,2}[a-z]+s\\b)/.test(c) ";

// FIX B (V40-D2) — the CONFIRMED arm's morphological disarm treats a participle followed by
// a function word as a real claim. "no longer"/"not"/"never" after the participle is an
// ADVERBIAL, never a determiner+object, so the sentence is a definition, not a completion.
const FIX_B_FROM = "|all|any|each|every|some|no|nothing|none)\\b)[a-z]/.test(String(s))";
const FIX_B_TO = "|all|any|each|every|some|no|nothing|none)\\b)[a-z]|^\\s*[Cc]onfirmed\\s*[—–-]\\s*(?:[^,]{0,60},\\s*)?(?:Archived|Deleted|Updated|Created|Restored|Activated|Deactivated|Assigned|Reassigned|Approved|Rejected|Declined|Removed|Completed|Renamed|Ended|Closed|Cleared|Sent|Moved|Granted|Added)\\s+(?:no longer|not|never)\\b/.test(String(s))";

// FIX C (V40-D3) — the first-person arm's entity-noun branch fires on a noun MODIFIER
// ("the company FILTER"). The entity noun must be the object HEAD: end of clause,
// punctuation, or a CLOSED-CLASS function word / temporal adverb after it.
const FIX_C_HEAD_FROM = "(?:[A-Z]|company|companies|employee|person|people|task|tasks|goal|goals";
const FIX_C_HEAD_TO = "(?:[A-Z]|(?:company|companies|employee|person|people|task|tasks|goal|goals";
const FIX_C_FROM = "|binding|bindings|channel|channels)/.test(c)";
const FIX_C_TO = "|binding|bindings|channel|channels)\\b(?![ \\t]+(?!(?:from|to|for|in|on|at|by|with|and|or|but|so|because|as|per|via|after|before|since|yesterday|today|now|just|already|successfully|earlier|then|too|also|instead)\\b)[a-z]))/.test(c)";

// FIX D (V40-D4, the FABRICATION REGRESSION) — newSubject's endsLinked alternative
// `[a-z]+(?:ing|ed|en)` swallows an ordinary FINITE past-tense verb ("No errors OCCURRED
// the department was removed."), so the filler negator is treated as scoping over a
// completion in a following, independent clause. -ing stays (a real postmodifier), and the
// -ed/-en forms are narrowed to the closed set of genuine noun-postmodifying participles.
// STRUCTURAL, not an allowlist: a reduced relative ("No company NAMED X was archived")
// needs a SINGULAR head noun in front of the participle. "No errors OCCURRED …",
// "Nothing HAPPENED …" have a bare plural head or no head at all, so the -ed word is the
// negator clause's own FINITE verb and the clause ENDS there. Evidentials keep linking
// (they take a that-clause), which is what preserves "No records showed X was archived."
const FIX_D_FROM = "const endsLinked = new RegExp(";
const FIX_D_TO = "const endsFiniteVerb = /^\\s*(?:[a-z]+(?<![sui])s\\s+)?[a-z]+(?:ed|en)\\s*$/.test(span) && !/\\b(?:showed|proved|indicated|confirmed|stated|recorded|suggested|reported|mentioned|noted|revealed|implied|found|said|established|named|called|titled|listed|marked|dated|assigned|labell?ed|entitled|known|shown|seen|held|described|referenced)\\s*$/.test(span); const endsLinked = !endsFiniteVerb && new RegExp(";

function applyFix(src, from, to, label) {
  const n = src.split(from).length - 1;
  if (n < 1) throw new Error('FIX anchor not found: ' + label);
  return src.split(from).join(to);
}

export const FIXES = {
  A: (src) => applyFix(src, FIX_A_ANCHOR, FIX_A_GUARD + FIX_A_ANCHOR, 'A'),
  B: (src) => applyFix(src, FIX_B_FROM, FIX_B_TO, 'B'),
  C: (src) => applyFix(applyFix(src, FIX_C_HEAD_FROM, FIX_C_HEAD_TO, 'C-head'), FIX_C_FROM, FIX_C_TO, 'C-tail'),
  D: (src) => applyFix(src, FIX_D_FROM, FIX_D_TO, 'D'),
};
export const ALL = (src) => FIXES.D(FIXES.C(FIXES.B(FIXES.A(src))));

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  const v92 = buildV92Gate(v92Path());
  const rows = buildCorpus();
  const measure = (gate, name) => {
    let tr = 0; let fr = 0;
    const trList = []; const frList = [];
    for (const r of rows) {
      const c = gate.readsAsCompletion(r.text);
      const v = v92.readsAsCompletion(r.text);
      if (r.label === 'truth' && c && !v) { tr++; trList.push(r.text); }
      if (r.label === 'fabrication' && !c && v) { fr++; frList.push(r.text); }
    }
    console.log(name.padEnd(34) + 'truthRegression=' + String(tr).padStart(3) + '  fabricationRegression=' + String(fr).padStart(3));
    return { tr, fr, trList, frList };
  };
  const before = measure(buildCandidateGate(), 'candidate as shipped');
  for (const k of Object.keys(FIXES)) measure(buildCandidateGate(undefined, FIXES[k]), 'candidate + FIX ' + k + ' only');
  const after = measure(buildCandidateGate(undefined, ALL), 'candidate + ALL FOUR FIXES');

  // Nothing the shipped candidate catches may be lost except by design; report the delta.
  const base = buildCandidateGate();
  const fixed = buildCandidateGate(undefined, ALL);
  const lost = rows.filter((r) => base.readsAsCompletion(r.text) && !fixed.readsAsCompletion(r.text));
  const gained = rows.filter((r) => !base.readsAsCompletion(r.text) && fixed.readsAsCompletion(r.text));
  console.log('\nrows the fix stops correcting (' + lost.length + '):');
  for (const r of lost) console.log('   [' + r.label + '] v92=' + v92.readsAsCompletion(r.text) + '  ' + JSON.stringify(r.text));
  console.log('rows the fix starts correcting (' + gained.length + '):');
  for (const r of gained) console.log('   [' + r.label + '] v92=' + v92.readsAsCompletion(r.text) + '  ' + JSON.stringify(r.text));

  fs.writeFileSync(path.join(HERE, 'prepared_fix_belt.txt'), fixed.source);
  console.log('\nBEFORE: truthRegression=' + before.tr + ' fabricationRegression=' + before.fr);
  console.log('AFTER : truthRegression=' + after.tr + ' fabricationRegression=' + after.fr);
}
