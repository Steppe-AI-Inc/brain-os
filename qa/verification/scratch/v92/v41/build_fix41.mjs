// VERIFIER #41 — build the PREPARED FIX into a SCRATCH copy. index.ts in the working tree
// is NEVER touched (sha256 must stay 30d3a640…).
//
// V41-F1  gerund arm, PROPER-NAME object (1,100/1,320 truthful destroyed, v92 preserves all)
//   #40's guard B is `^<Gerund>\s+(?:an?\b|(?:[a-z]+\s+){0,2}[a-z]+s\b)` — it can only fire
//   when the OBJECT is lowercase, so a proper-name object defeats it, and guard A's closed
//   finite-verb list then has to carry the whole load. Replace the anchored, object-shaped
//   test with an object-AGNOSTIC one: a DESCRIPTIVE sentence has a FINITE VERB somewhere
//   after the gerund phrase; a progress announcement is a verbless fragment. A finite verb
//   is approximated structurally as a lowercase token ending in -s/-es/-ed (or one of the
//   closed irregulars) that is NOT immediately preceded by a determiner / preposition /
//   conjunction / possessive — i.e. it follows a noun phrase rather than opening one.
//   No verb whitelist; the object's casing is irrelevant.
//
// V41-F2  CONFIRMED arm, determiner-negator object (4 truthful destroyed, v92 preserves all)
//   The X-guard suppresses "Confirmed — <Participle> <lowercase>" EXCEPT for a stoplist that
//   INCLUDES no/nothing/none — inverted polarity: listing them in the (?!…) means they are
//   exactly the ones NOT suppressed. And the negation check runs on the text up to the END of
//   the matched participle, so an object negator ("Archived NO records") is outside the span
//   by construction. Extend X's second disjunct — which already carries `no longer|not|never`
//   for this reason — with the remaining lowercase determiner negators. The regex is
//   case-SENSITIVE (no /i), so "Confirmed — Archived No Limits Inc." (capital N, a real name)
//   is still caught. Same discriminator the shipped first-person arm already uses.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '../../../..');
const SRC = path.join(REPO, 'supabase/functions/sem-ai-command/index.ts');
let text = readFileSync(SRC, 'utf8');
const before = text;

// ---- V41-F1 -------------------------------------------------------------------------
const F1_FIND = "&& !/^\\s*(?:[Aa]ssigning|[Rr]eassigning|[Uu]pdating|[Cc]reating|[Mm]oving|[Aa]rchiving|[Rr]estoring|[Dd]eleting|[Rr]emoving|[Ee]nding|[Rr]enaming|[Cc]losing|[Cc]learing|[Gg]ranting|[Dd]eclining|[Aa]pproving|[Rr]ejecting|[Cc]ompleting|[Aa]ctivating|[Dd]eactivating|[Aa]dding|[Ss]ending)\\s+(?:an?\\b|(?:[a-z]+\\s+){0,2}[a-z]+s\\b)/.test(c)";
const F1_REPL = "&& !/^\\s*(?:[Aa]ssigning|[Rr]eassigning|[Uu]pdating|[Cc]reating|[Mm]oving|[Aa]rchiving|[Rr]estoring|[Dd]eleting|[Rr]emoving|[Ee]nding|[Rr]enaming|[Cc]losing|[Cc]learing|[Gg]ranting|[Dd]eclining|[Aa]pproving|[Rr]ejecting|[Cc]ompleting|[Aa]ctivating|[Dd]eactivating|[Aa]dding|[Ss]ending)\\s+(?:an?\\b|(?:[a-z]+\\s+){0,2}[a-z]+s\\b|(?:\\S+\\s+){1,8}?(?<!\\b(?:the|a|an|its|their|our|my|your|his|her|this|that|these|those|of|in|on|at|to|for|from|with|by|and|or|but|no|some|any|all|each|every|two|three|several|many|few)\\s)(?:(?!(?:as|its|his|this|us|thus|plus|less|yes|hers|ours|yours|theirs|always|perhaps|sometimes|unless|whereas|besides|various|previous|obvious|serious|numerous|instead|indeed|ahead|else|ok)\\b)[a-z]{3,}(?:s|es|ed)\\b|(?:is|are|was|were|has|have|had|can|cannot|will|would|should|must|may|might|does|do|did)\\b))/.test(c)";
if (!text.includes(F1_FIND)) throw new Error('V41-F1 anchor missing');
text = text.split(F1_FIND).join(F1_REPL);

// ---- V41-F2 -------------------------------------------------------------------------
const F2_FIND = "\\s+(?:no longer|not|never)\\b/.test(String(s))";
const F2_REPL = "\\s+(?:no longer|not|never|no|nothing|none|nobody|no one|neither|nor)\\b/.test(String(s))";
if (!text.includes(F2_FIND)) throw new Error('V41-F2 anchor missing');
text = text.split(F2_FIND).join(F2_REPL);

if (text === before) throw new Error('no edit applied');
mkdirSync(path.join(HERE, 'fix41'), { recursive: true });
const out = path.join(HERE, 'fix41/index.ts');
writeFileSync(out, text);
console.log('wrote ' + path.relative(REPO, out).replace(/\\/g, '/') + '  (' + text.length + ' bytes)');
console.log('working-tree index.ts UNCHANGED (this script never writes to it)');
