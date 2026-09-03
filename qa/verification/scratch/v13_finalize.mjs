import { readFileSync, writeFileSync, statSync } from 'node:fs';
const p = 'qa/verification/CURRENT_CAMPAIGN.json';
const j = JSON.parse(readFileSync(p, 'utf8'));
j.last_checkpoint_at = new Date().toISOString();

j.defects_found = [
 { id: 'D98', severity: 'P2', regression_vs: 'fdb4564',
   title: 'run12/D92 is NARROWED, not closed: 7 of 27 legitimate clarifications are still dropped wholesale, each leaving an armed pendingAction with a null question',
   evidence: 'v13_ab_output.json + v13_attack_output.txt sections B/B2. All 7 carry a first-person completion in a SUBORDINATE clause ("the company I archived last week", "the report we created yesterday"). paQ() returns null for all 7 while action.archiveCompanyIds stays populated — the run10/D84 shape. f4763ef 21/27, fdb4564 1/27, ace9b6a 7/27. The closure claims 12/22 -> 0/22.',
   status: 'FLAGGED — fix prepared and validated (FIX-3b), not applied' },
 { id: 'D99', severity: 'P2', regression_vs: 'f4763ef',
   title: 'The D92 replacement belt gives up 18 of 20 assertion shapes and matches only the two shapes its own committed cases pin; the source comment’s exhaustiveness claim is measurably false',
   evidence: 'v13_ab_output.json: leaks 18/20 on ace9b6a vs 0/20 on f4763ef. Third person, named subject, bare participle, adverbial passive and collective subject all leak — and so do first-person shapes with any adverb other than just/already ("I successfully archived ACME ok?", "I have archived ACME ok?", "We finally deleted the project ok?"). index.ts:4771-4775 asserts the belt was load-bearing for exactly ONE shape and that that shape and only that shape is what it now matches.',
   status: 'FLAGGED — fix prepared and validated (FIX-3b), not applied' },
 { id: 'D100', severity: 'P2', regression_vs: null,
   title: 'run12/D91 is the THIRD narrowing of the label-assertion class: 9 assertions led by closed|completed|restored still render verbatim and replay as "Confirmed — <assertion>."',
   evidence: 'v13_labelprobe.mjs: 9/9 accepted verbatim ("Restored Bob Smith", "Restored Three Companies", "Closed Five Deals", "Completed Final Migration", ...). The second-word test covers determiners/pronouns/ALL-CAPS but not spelled-out cardinals, ordinary adjectives or proper nouns. corrected("Confirmed — Restored Bob Smith.") === false, executed. Labels reach founder prose at index.ts:5241 and replay at 2549. The 13 REAL names outside the allowlist are all refused and all stay selectable via the quoted derived-canonical fallback, so the refusal direction is acceptable — the acceptance direction is not.',
   status: 'FLAGGED, not fixed (direction recorded in v13_fixes.patch.md, deliberately NOT presented as validated — as written it turns 3 committed suites red)' },
 { id: 'D101', severity: 'P2', regression_vs: null,
   title: 'VACUOUS GUARD, TENTH RECURRENCE — advanced|integrated in ADJECTIVAL_COMPLETION are unreachable dead alternatives, added by the same commit that closed the ninth recurrence',
   evidence: 'Neither word is in COMPLETION_WORD; the enclosing block only runs when COMPLETION_WORD matched, and the allowlist is only consulted when completionIdx===0 (i.e. words[0] is itself a completion word). PROVEN by mutation, not argued: removing both alternatives leaves the whole battery green at 561/561 — a SURVIVING mutant.',
   status: 'FLAGGED, not fixed' },
 { id: 'D102', severity: 'P2', regression_vs: 'f4763ef and fdb4564',
   title: 'Seam between the two run12 fixes: D93 matches on the STRIPPED label while D95 detects collisions on the RAW label, so two options identical after stripping are neither numbered nor selectable',
   evidence: 'v13_attack_output.txt sections D.1/D.2/D.5b. Rendered ["Closed Loop Systems","“Closed Loop Systems”"] -> numbered=false, match("closed loop systems")=null. Same for genuinely distinct names differing only by an apostrophe (Founders Fund / Founders’ Fund). Both prior SHAs selected the plain-named option. run9/D72 dead-ended-disambiguation class, new route, third time.',
   status: 'FLAGGED — fix prepared and validated (FIX-1+2), not applied' },
 { id: 'D103', severity: 'P2', regression_vs: null,
   title: 'run12/D95 numbering guarantees neither uniqueness nor identity, and applies exactly to options whose ids provably cannot execute',
   evidence: '(a) three options ["the company","the company","the company (option 1)"] render (option 1)/(option 2)/(option 1) — the fix mints a collision. (b) the number is the array index, carrying no identifying information: the founder choosing between "the company (option 1)" and "(option 2)" has nothing to choose on. (c) the typed fallback fires iff the id is absent from contextPack.companies (canonicalById 4550-4552, companyNameById 2996), and archive/restore filter on contextCompanyIds built from the SAME array (2896, 2993-2995) — so a numbered fallback option cannot execute, yet selecting it yields "Confirmed — the company (option 1)." (2549) which the gate ships uncorrected (executed). Scoped honestly: the false-confirmation path pre-exists for any out-of-context option with a distinct label; D95 did not create it, but it is the change that made it reachable in the one case where the founder cannot tell the options apart.',
   status: 'FLAGGED — (a) closed by prepared FIX-1+2; (b)/(c) direction only' },
 { id: 'D104', severity: 'P3', regression_vs: null,
   title: 'The D97 closure re-committed the class it closed: a mangled duplicate "## #72" heading carrying four lines of #12’s promotion note now sits in the canonical ledger, while the commit message asserts the entry was appended preamble-stripped',
   evidence: 'qa/KNOWN_FAILURE_MODES.md:6931-6937 + git diff f4763ef ace9b6a. The #71 preamble deletion at 6707 is genuine; the #72 append is not. Second consecutive campaign in which the ledger promotion corrupted the canonical ledger.',
   status: 'FLAGGED, not fixed (write authority is qa/verification/** this campaign). Structural remedy adopted here: the v13 promotion note lives in a SEPARATE file so there is nothing to mis-cut.' },
 { id: 'D105', severity: 'P3', regression_vs: null,
   title: 'SESSION_CHECKPOINT.md’s stale master SHA is fixed and its migration-location claim is live-verified true, but the rest of the file is three campaigns stale',
   evidence: 'Line 2 "Updated: 2026-09-02 (after verifier #10 verdict)"; 18-19 pin #10 at 65ade7c; 35-38 describe CURRENT_CAMPAIGN.json as "Verifier #10 campaign record" (it was #12’s and is now #13’s); 59-61 still dispatch verifier #11 against index.ts sha 66fa821d. #12 flagged the staleness; only the migration lines were corrected.',
   status: 'FLAGGED, not fixed' },
];

j.prepared_fixes = [
 { defect: 'D98 + D99', file: 'supabase/functions/sem-ai-command/index.ts:4776-4777',
   change: 'Replace the FIRST_PERSON_COMPLETION belt with an INTERROGATIVE_LEAD test: drop a completion-carrying fragment unless it opens with a wh-word or an auxiliary.',
   validation: 'Applied to the REAL source; full battery 23 suites TOTAL OK=561 FAIL=0, all exit 0; A/B leaks 18/20 -> 0/20 AND dropped 7/27 -> 0/27 simultaneously — strictly better than ace9b6a, f4763ef AND fdb4564 on both axes. Closes 32 of the 47 proposed run13 defect rows with 0 CONTRACT failures. File restored and sha256-verified byte-identical (021c8989…). Patch: qa/verification/proposed/v13_fixes.patch.md FIX-3b.',
   applied: false, reason_not_applied: 'This run’s standing rule limits working-tree writes to qa/verification/**; product edits are the implementing session’s to land.' },
 { defect: 'D102 + D103a', file: 'supabase/functions/sem-ai-command/index.ts:5009-5020',
   change: 'Key the collision map on the SAME normalized form matchDisambiguationOption compares, strip any pre-existing "(option N)" suffix, and number by the option’s own index instead of a running counter.',
   validation: 'Applied to the REAL source; battery 561/561, all exit 0. The quoted-twin pair now renders distinguishably; the three-option replay case renders (option 1)/(option 2)/(option 3) instead of (option 1)/(option 2)/(option 1). File restored and sha256-verified byte-identical. Patch: v13_fixes.patch.md FIX-1+2.',
   applied: false, reason_not_applied: 'Same standing rule.' },
];

j.pending_db_pushes = [];
j.live_verified_fixes = [];
j.mutation_summary = {
  mutants_attempted: 16, applied: 15, killed: 14, survived: 1, anchor_not_found_then_retried_successfully: 1,
  survivor: 'M14 — the iCtx >= 0 && iPending >= 0 conjunct in current_turn_and_continuity_contract.mjs, the ONE mutant the implementing session disclosed. CONFIRMED EQUIVALENT, with #12’s corrected rationale independently reproduced (M15: with the buildContext anchor renamed, the continuity suite exits 1 WITH the guard and exits 0 fail-OPEN without it, while run11_defect_closure_contract catches it either way).',
  extra_survivor_used_as_proof: 'Removing advanced|integrated from ADJECTIVAL_COMPLETION also survives (battery 561/561). That survival IS defect D101, not a passing guard.',
  all_restores_byte_identical: true,
};

j.verdict = 'DO NOT DEPLOY — ace9b6a / index.ts sha256 021c8989de675035709f48e438d590b2e417677a9625f80a9708cd2dd8a4b786';
j.verdict_basis = 'The battery (23 suites, 561 checks) and 16 independent source mutations were executed on this exact SHA. All five run12 guards are real and load-bearing; D90 is genuinely closed and genuinely non-redundant; D96 is closed and live-verified on disk; the D94 disclosure is accurate. The gate is nevertheless CLOSED for three reasons. (1) The P1 that closed the previous gate is not closed — D92 goes from 21/27 to 7/27 legitimate clarifications destroyed, each still nulling the visible prompt while the destructive action stays armed. (2) The same rule change gave up 18 of 20 assertion shapes f4763ef caught, so the belt now matches exactly the two shapes its own tests pin, and the source comment states the opposite as fact. On the shapes measured, ace9b6a is NOT strictly better than fdb4564 (leaks 18 vs 20, drops 7 vs 1, truncations 4 vs 0) — the exact standard #11 and #12 both applied. (3) The closure again introduced a regression of its own (D102) and again added a vacuous guard (D101, tenth recurrence) in the very commit that closed the ninth. Two validated single-hunk fixes exist, both leaving the battery at 561/561 and neither needing a DB push; with FIX-3b applied this SHA becomes strictly better than every predecessor on both measured axes, so shipping ace9b6a as-is is worse than an available, tested alternative.';

j.coverage_gaps_explicit = [
 'BLOCKED: no browser/UI tooling was available in this session type (no ToolSearch and no mcp__claude-in-chrome__* tools were present). Live UI truth is NOT verified — a real coverage gap, stated rather than silently skipped.',
 'BLOCKED: no live AI chat turn was executed against the deployed function. Every AI-behaviour finding comes from the REAL gate slice and the REAL matchDisambiguationOption executed out of index.ts, not from a model round-trip.',
 'BLOCKED: no database access was exercised (campaign scope: production read-only, zero writes). The qa/scenarios-runner/*.sql suites were NOT run; RLS, lifecycle and relationship truth are outside this campaign.',
 'Production remains v92, older than fdb4564, f4763ef and ace9b6a. Every A/B here is source-level between branch SHAs, not against deployed v92.',
 '6 of the 23 .mjs suites contribute no assertions: 5 are self-declared SUPERSEDED prose-era stubs that print one line and exit 0, and issue5_confirmation_action_type_binding passes 10/10 in a non-OK-prefixed format. The 561 checks come from the other 17.',
];
j.cleanup = 'No QA-VERIFY-* synthetic data was created: this campaign performed zero database and zero UI mutations, so there is nothing to clean up and nothing left in an archived/restored state. All source mutation was in-place-and-restored with sha256 proof (index.ts 021c8989…, _gate_extract.mjs 595f70ca…, current_turn_and_continuity_contract.mjs c76eecb1…). The only working-tree changes are under qa/verification/**.';

writeFileSync(p, JSON.stringify(j, null, 1));
console.log('written, bytes=' + statSync(p).size + ', defects=' + j.defects_found.length);
