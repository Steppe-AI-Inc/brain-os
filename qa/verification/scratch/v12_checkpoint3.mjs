import { readFileSync, writeFileSync } from 'node:fs';
const p = 'qa/verification/CURRENT_CAMPAIGN.json';
const j = JSON.parse(readFileSync(p, 'utf8'));

j.defects_found = [
  { id: 'D90', severity: 'P2', title: 'Vacuous guard, NINTH recurrence: the Title-Case name-shape gate is unobserved by the whole committed battery',
    evidence: 'v12_mutation_report2.json M11. Neutralising `if (!titleCasedName) return null;` (index.ts:4802) leaves all 22 suites exit 0, yet it changes real behaviour on 8/10 probed inputs. The D86 POSITION rule does NOT subsume it: an all-lowercase assertion label ("deleted acme", "removed all people") has completionIdx===0 and no ALL-CAPS token after it, so both position checks pass and only the Title-Case gate refuses it.',
    product_code_correct: true, regression_vs_prior_sha: false, status: 'REGRESSION TEST PREPARED (qa/verification/proposed/v12_regression_additions.mjs)' },
  { id: 'D91', severity: 'P2', title: 'D86 is only NARROWED, not closed: Title-Cased leading-participle assertion labels are still accepted verbatim',
    evidence: '18 probed labels; 17 clear assertions accepted VERBATIM and rendered to the founder under "Options: …" (index.ts:5178), replaying next turn as "Confirmed — <assertion>": "Deleted The Project", "Archived Everything", "Removed All People", "Completed The Migration", "Closed All Accounts", "Restored The Company", "Approved The Request", "Sent The Invoice", "Cleared All Data", "Moved The Team", "Ended The Contract", "Granted Full Access", "Added Three People", "Renamed The Unit", "Confirmed The Order", "Assigned The Tasks", "Deleted Everything". They satisfy the position rule because the participle is FIRST and the following object is Title-Case (not ALL-CAPS).',
    derived_canonical_fallback_verdict: 'DOES NOT RESCUE THESE — explicitly checked. The fallback only fires on REFUSAL; an accepted label is emitted verbatim and never reaches displayName(). So the commit message\'s "the derived-canonical fallback remains the real safety net" is true for refusals and IRRELEVANT to this escape.',
    regression_vs_prior_sha: false, status: 'PRE-EXISTING on fdb4564 too (A/B confirmed) — D86 closure claim is OVERSTATED, not falsified' },
  { id: 'D92', severity: 'P1', title: 'REGRESSION introduced by f4763ef: the D88 completion-in-question belt silently drops 60% of legitimate clarification questions',
    evidence: '`if (COMPLETION_WORD.test(q)) return null;` (index.ts:4762) drops any question that MENTIONS completion vocabulary, not one that ASSERTS a completion. Measured 12/20 on a realistic clarification corpus, including "Who should the task be assigned to?", "Which goal should this task be assigned to?", "Which archived company did you mean?", "Do you want the deleted document recovered?". A/B PROVEN NEW: identical inputs survive on fdb4564 and return [] on f4763ef. Applies on ORDINARY turns, not only correction turns (result.questions = envelopeQuestions runs unconditionally, index.ts:4986), and also nulls pendingAction.question (4962) while the action payload stays armed — the exact run10/D84 shape ("silently dropping the visible prompt while the destructive action payload stayed armed — worse than what it prevented"). On correction turns envelopeQuestions is spliced straight into founder-facing text (5193/5194), so the founder gets the correction preamble and NO question at all.',
    load_bearing_analysis: 'The blanket belt is load-bearing for exactly ONE committed case — D88.single-letter-shield ("I archived ACME B. ok?"), where the abbreviation shield blocks the terminator cut. Verified by neutralising the belt and running the suite: that is the only FAIL.',
    regression_vs_prior_sha: true, status: 'FIX PREPARED AND VALIDATED (not applied — write scope is qa/verification/** only)' },
  { id: 'D93', severity: 'P2', title: 'REGRESSION introduced by f4763ef: real company names carrying a non-leading completion word become UNSELECTABLE in disambiguation',
    evidence: 'A/B vs fdb4564: "Advanced Closed Systems", "Closed Loop AG", "Closed Loop BV", "Closed Loop LLC", "Closed Loop Systems UK", "Global Closed Loop", "First Closed Circuit", "Applied Closed Systems", "Blue Closed Systems", "Open Closed Design" rendered verbatim on fdb4564 and now render as the curly-quoted canonical form (“Advanced Closed Systems”). matchDisambiguationOption (index.ts:412-420) matches by `normalizedCommand.includes(label.toLowerCase())`, so a founder typing the plain name does NOT match the quoted label — EXECUTED against the real matcher: NOT SELECTABLE. web/ contains zero references to pendingAction, so there is no click path; typing is the only selection route. This is the run9/D72 dead-ended-disambiguation class reintroduced via a new route.',
    regression_vs_prior_sha: true, status: 'FLAGGED, not fixed' },
  { id: 'D94', severity: 'P3', title: 'D87 progressive vocabulary remains substantially incomplete, and the gap is not disclosed',
    evidence: 'Escaping uncorrected with claims=null and no evidence: "ACME is being archived.", "The company is being deleted right now.", "ACME is getting archived.", "I am about to archive ACME.", "I am in the process of archiving ACME.", "Kicking off the archive of ACME.", "Going ahead and archiving ACME.", "Proceeding to archive ACME.", "Starting the archive of ACME now.", "Let me archive ACME for you.", "Archiving ACME as we speak.", "Busy archiving ACME.", "Setting about archiving ACME.", plus non-English ("Пока архивирую ACME.", "ACME-г архивлаж байна."). Passive voice ("is being archived") is the notable structural gap — no arm handles it.',
    regression_vs_prior_sha: false, status: 'PRE-EXISTING (A/B identical on fdb4564); run11 strictly IMPROVED coverage. Recorded because the closure text does not disclose the residual.' },
  { id: 'D95', severity: 'P3', title: 'Two disambiguation options whose entities are absent from contextPack collapse to identical "the company"',
    evidence: 'Both labels refused -> displayName() has no canonical row and no runtime label -> TYPED_FALLBACK "the company" for both. matchDisambiguationOption then finds 2 matches and returns null (matches.length !== 1) — the option set is dead-ended. The committed D79 control only covers the in-contextPack case.',
    regression_vs_prior_sha: false, status: 'FLAGGED, not fixed' },
];

j.scenarios['3_attack_new_rules'] = {
  status: 'FAIL',
  evidence: 'Attacks executed against the REAL gate slice extracted from index.ts (qa/verification/scratch/v12_probe.mjs) and the REAL matchDisambiguationOption. A/B against the prior SHA fdb4564 (qa/verification/scratch/v12_index_fdb4564.ts, extracted via git show) separates regressions from pre-existing limits. D86: 17 assertion labels pass the position rule; 10 real names wrongly refused (fallback covers the refusals, does NOT cover the acceptances). D88: no assertion leaked on any of 10 alternate-join shapes (belt holds), but 12/20 legitimate clarifications are destroyed. D87: 15 progressive shapes escape, all pre-existing. Question-belt interaction: the two committed "ok?" survival cases pin ONLY the comma shape — changing the comma to " - ", " and ", " so ", "(", or nothing drops the whole fragment including the real question.',
  defects_found: ['D90', 'D91', 'D92', 'D93', 'D94', 'D95'],
  regressions_added: ['qa/verification/proposed/v12_regression_additions.mjs (pending promotion)'],
};
j.prepared_fixes = [
  { defect: 'D92', file: 'supabase/functions/sem-ai-command/index.ts:4762',
    change: 'Replace the blanket `if (COMPLETION_WORD.test(q)) return null;` with a SUBJECT+PARTICIPLE assertion test (a completion participle is only a claim when a subject precedes it, or when it leads the fragment).',
    validation: 'Applied temporarily, full battery re-run: all 22 suites exit 0 (including the 46-case run11 contract and its D88.single-letter-shield case). Attack corpus: legitimate questions dropped 12/22 -> 0/22; assertion leaks 0/10 -> 0/10. File restored and sha256-verified byte-identical (1db38579…). Patch text: qa/verification/proposed/v12_d92_fix.patch.md',
    applied: false, reason_not_applied: 'This run\'s standing rule limits working-tree writes to qa/verification/**; product edits are the implementing session\'s to land.' },
];
j.last_checkpoint_at = new Date().toISOString();
j.remaining_scenarios = ['4', '5'];
writeFileSync(p, JSON.stringify(j, null, 1));
console.log('checkpointed scenario 3');
