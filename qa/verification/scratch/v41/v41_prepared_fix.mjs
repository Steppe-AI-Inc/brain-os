#!/usr/bin/env node
// VERIFIER #41 (campaign #101) — PREPARED FIX for V41-D1 and V41-D2.
//
// This script NEVER writes to supabase/functions/sem-ai-command/index.ts. It emits a patched
// copy to qa/verification/scratch/v41/fix41/index.ts (or $V41_FIX_OUT) so the candidate stays
// byte-identical while the fix is measured. The implementing session applies it, not me.
//
// Both edits are ANCHORED on exact literals and the script THROWS if an anchor has moved —
// a silently-skipped edit is how a "fix" gets reported as applied when it was not.
//
// ── V41-D1 (P1) gerund arm, PROPER-NAME object ─────────────────────────────────────────
// Verifier #40 replaced the gerund arm's verb whitelist with a "structural" test. That test
// has three escapes and a proper-name object defeats two at once:
//   guard A  a CLOSED finite-verb list (is|are|was|requires?|needs?|takes?|works?|…)
//   guard B  ^<Gerund>\s+(?:an?\b|(?:[a-z]+\s+){0,2}[a-z]+s\b)  — can only fire when the
//            OBJECT is LOWERCASE; a capitalised NAME can never match it
//   guard C  <Name> is/are/was/were <gerund>  — a different shape entirely
// So a product-help / consequence sentence about a NAMED entity survives only if it happens
// to use one of ~50 whitelisted verbs. MEASURED on 884567a: 1,100 of 1,320 generated truthful
// sentences destroyed (83.3%); 0 of 660 with a generic lowercase object. Deployed v92 has no
// gerund arm at all and preserves all 1,320 — so this is a DEPLOY BLOCKER, and it is the
// fourth recurrence of the gerund arm (#39 found the generic-object half; #40 closed only
// that half).
//
// THE FIX is object-agnostic and uses no verb whitelist: a DESCRIPTIVE sentence has a FINITE
// VERB somewhere after the gerund phrase; a progress announcement is a verbless fragment. A
// finite verb is approximated STRUCTURALLY as a lowercase token of >=3 letters ending in
// -s/-es/-ed (or one of the closed irregulars is/are/was/…), which is NOT immediately
// preceded by a determiner/preposition/conjunction/possessive (a finite verb follows a noun
// phrase, it does not open one), and is not one of the s-ending FUNCTION words (as, its, his,
// this, thus, plus, …) — that stoplist is load-bearing: without it "Archiving ACME as we
// speak." reads "as" as a verb and three committed suites go red.
//
// ── V41-D2 (P1) CONFIRMED arm, determiner-negator object ───────────────────────────────
// "Confirmed — Archived no records." / "… Archived nothing." / "… Deleted none of them." /
// "… Removed no one." are TRUTHFUL negatives; deployed v92 preserves all four; the candidate
// destroys all four and substitutes "I can't actually do that from chat", which is false.
// Two causes compound:
//   (1) the X-guard suppresses "Confirmed — <Participle> <lowercase>" via a NEGATIVE
//       lookahead whose stoplist INCLUDES no/nothing/none — inverted polarity, so those are
//       precisely the words that do NOT get the protection;
//   (2) the arm's negation check runs on the text up to the END of the matched participle
//       (run19/D134), so an OBJECT negator is outside the checked span by construction.
// X's second disjunct already exists for exactly this reason and already carries
// `no longer|not|never`; the remaining lowercase determiner negators simply belong in it.
// The regex is case-SENSITIVE (no /i), so "Confirmed — Archived No Limits Inc." (capital N,
// a real company) is still caught — the same discriminator the shipped first-person arm uses.
//
// ── MEASURED (my own corpus + the whole battery) ───────────────────────────────────────
//   V41-D1 truthful destroyed        1,100/1,320  ->  0/1,320
//   V41-D2 truthful destroyed        4/4          ->  0/4
//   round-2 probe truth regressions  13/53        ->  0/53
//   truth regression vs deployed v92 0            ->  0     (unchanged)
//   fabrication regression vs v92    0            ->  0     (unchanged)
//   fab improvement over v92         75           ->  75    (unchanged)
//   qa/scenarios-runner battery      0 failures   ->  0 failures
//   every scratch/v92 deploy gate    unchanged (v30 25/1 and v39 20/1 stay exactly as they were)
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
function findRepoFile(rel) {
  let d = HERE;
  for (let i = 0; i < 8; i++) {
    const p = path.join(d, rel);
    try { readFileSync(p); return p; } catch { /* walk up */ }
    const up = path.dirname(d);
    if (up === d) break;
    d = up;
  }
  throw new Error('could not locate ' + rel + ' from ' + HERE);
}
const SRC = findRepoFile('supabase/functions/sem-ai-command/index.ts');
const REPO = path.resolve(path.dirname(SRC), '../../..');
let text = readFileSync(SRC, 'utf8');
const before = text;

const F1_FIND = "&& !/^\\s*(?:[Aa]ssigning|[Rr]eassigning|[Uu]pdating|[Cc]reating|[Mm]oving|[Aa]rchiving|[Rr]estoring|[Dd]eleting|[Rr]emoving|[Ee]nding|[Rr]enaming|[Cc]losing|[Cc]learing|[Gg]ranting|[Dd]eclining|[Aa]pproving|[Rr]ejecting|[Cc]ompleting|[Aa]ctivating|[Dd]eactivating|[Aa]dding|[Ss]ending)\\s+(?:an?\\b|(?:[a-z]+\\s+){0,2}[a-z]+s\\b)/.test(c)";
const F1_REPL = "&& !/^\\s*(?:[Aa]ssigning|[Rr]eassigning|[Uu]pdating|[Cc]reating|[Mm]oving|[Aa]rchiving|[Rr]estoring|[Dd]eleting|[Rr]emoving|[Ee]nding|[Rr]enaming|[Cc]losing|[Cc]learing|[Gg]ranting|[Dd]eclining|[Aa]pproving|[Rr]ejecting|[Cc]ompleting|[Aa]ctivating|[Dd]eactivating|[Aa]dding|[Ss]ending)\\s+(?:an?\\b|(?:[a-z]+\\s+){0,2}[a-z]+s\\b|(?:\\S+\\s+){1,8}?(?<!\\b(?:the|a|an|its|their|our|my|your|his|her|this|that|these|those|of|in|on|at|to|for|from|with|by|and|or|but|no|some|any|all|each|every|two|three|several|many|few)\\s)(?:(?!(?:as|its|his|this|us|thus|plus|less|yes|hers|ours|yours|theirs|always|perhaps|sometimes|unless|whereas|besides|various|previous|obvious|serious|numerous|instead|indeed|ahead|else|ok)\\b)[a-z]{3,}(?:s|es|ed)\\b|(?:is|are|was|were|has|have|had|can|cannot|will|would|should|must|may|might|does|do|did)\\b))/.test(c)";
if (!text.includes(F1_FIND)) throw new Error('V41-F1 anchor missing — the gerund guard moved; re-derive the fix, do not apply this blindly');
text = text.split(F1_FIND).join(F1_REPL);

const F2_FIND = "\\s+(?:no longer|not|never)\\b/.test(String(s))";
const F2_REPL = "\\s+(?:no longer|not|never|no|nothing|none|nobody|no one|neither|nor)\\b/.test(String(s))";
if (!text.includes(F2_FIND)) throw new Error('V41-F2 anchor missing — the CONFIRMED X-guard moved; re-derive the fix');
text = text.split(F2_FIND).join(F2_REPL);

if (text === before) throw new Error('no edit applied — refusing to report a fix that did nothing');
const out = process.env.V41_FIX_OUT
  ? path.resolve(process.env.V41_FIX_OUT)
  : path.join(REPO, 'qa/verification/scratch/v41/fix41/index.ts');
mkdirSync(path.dirname(out), { recursive: true });
writeFileSync(out, text);
console.log('wrote ' + path.relative(REPO, out).replace(/\\/g, '/'));
console.log('supabase/functions/sem-ai-command/index.ts was NOT modified.');
console.log('Verify with:  SEM_INDEX_SRC=<that path> node qa/verification/proposed/v41_regression_additions.mjs   (expect 22 passed, 0 failed)');
