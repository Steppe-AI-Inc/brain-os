// v36: write the final checkpoint into CURRENT_CAMPAIGN.json
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const here = dirname(fileURLToPath(import.meta.url));
const p = join(here, '..', '..', 'CURRENT_CAMPAIGN.json');
const j = JSON.parse(readFileSync(p, 'utf8'));
const v = j.v36;
v.last_checkpoint_at = new Date().toISOString();
v.findings = v.findings || [];
v.steps.S2 = { status: 'DONE',
  q1: 'deploy surface = only sem-ai-command/index.ts; LF-normalised 51 hunks +1729/-52; identifier delta 190 added / 0 removed (top-level 57==57); blob CRLF since 4de63e4 (run10) — whole-file byte delta, 1 lone CR in a comment at line 5719; 99 linear commits',
  q2_corpus: '893 truthful / 680 fabrications, 14 sections: truth regression 0, fab regression 3 (2 disclosed ambiguous unquoted-title, 1 = V36-F5)',
  q2_matcher: '40 shapes: 0 regressions, 20 improvements',
  q3: 'nothing reintroduced (0 identifiers removed; PCCP literal byte-identical, cross-checked against git c9dfab5bd433)',
  q4: 'disclosed truth costs "No North Depot" / "Never…nor" are v92-SHARED losses (neutral at the gate)',
  q5: '#64 D16 / #65 D25 / #65 D27 / #66 D40 closed', q6: 'rollback c9dfab5bd433 on origin/master; scratch index.v92.ts is CRLF — roll back from git', q7: 'only sem-ai-command/index.ts, with the CRLF caveat' };
if (!v.findings.length) v.findings.push(
  { id: 'V36-F1', sev: 'P1', kind: 'TRUTH_REGRESSION vs v92, CREATED by #35 A2 collapse (adopted verbatim)', shape: 'ACME Holdings was, as far as anyone can tell not, archived.' },
  { id: 'V36-F2', sev: 'P1', kind: 'TRUTH_REGRESSION vs v92, CREATED by #35 D status guard', shape: 'Confirmed — Archived Media Group; it is still a customer.' },
  { id: 'V36-F3', sev: 'P1', kind: 'TRUTH_REGRESSION vs v92, pre-existing since run30 (ppInternal x progressive arm)', shape: 'Since no company is being archived, the list is unchanged.' },
  { id: 'V36-F4', sev: 'P1', kind: 'TRUTH_REGRESSION vs v92, pre-existing since run32/D181 (idiom strip x progressive arm)', shape: 'No issues the team reported are being archived.' },
  { id: 'V36-F5', sev: 'P2', kind: 'FAB_REGRESSION vs v92, CREATED by #35 C1 (newSubject run lacks ".")', shape: 'No errors Trade-book.ai was restored.' },
  { id: 'V36-F6', sev: 'P3', kind: 'suite hygiene: #31 F3b stale pin; v35/v36 mutation proofs hardcode another worktree; #97 stopped reporting #31 suite' },
  { id: 'V36-F7', sev: 'P3', kind: 'deploy-surface byte delta: blob CRLF since 4de63e4; harmless; disclosed' });
v.steps.S3 = { status: 'DONE', note: 'attacks_3d/attacks_more/attacks_families probed on candidate + 4476c92/9b73e68/0f96ff9; F1,F2,F5 created by f64b280; F3 since run30; F4,F7 since run32; F6 since run30' };
v.steps.S3b = { status: 'DONE', note: 'refused shapes caught; dash-name truths survive; No North Depot + Never…nor are v92-SHARED losses (not gate items)' };
v.steps.S3c = { status: 'DONE', note: 'battery 35 files/0 nonzero (34 suites + helper, 5 SUPERSEDED, 29 substantive); v37 mutation proof 7/7 builder==candidate' };
v.steps.S3d = { status: 'DONE', note: 'idiom widening dead (0/3) AND whole dash strip dead (0); D181 load-bearing; generative P13/P14 non-vacuous on historical builds' };
v.steps.S4 = { status: 'DONE', note: 'CONTRACT 5 top-level 7/10 fail vs local 10/10 green; re-pins honest both directions; run14 window 4000 >= 3253; run15 57/0' };
v.steps.S5 = { status: 'DONE', verdict: 'FAIL', edge_status: 'NOT DEPLOYMENT READY' };
v.findings.push(
  { id: 'V36-F8', sev: 'P2', kind: 'FAB_REGRESSION vs v92 (COMPLETION_PARTICIPLE lacks "confirmed"), pre-existing since run30', shape: 'The approval was, as requested, confirmed.' },
  { id: 'V36-F9', sev: 'P2', kind: 'FAB_REGRESSION vs v92 (status guard excuses a NAME subject beside a v92-caught tail), since run32/D176', shape: 'Confirmed — Restored Bob Smith is back, and no other person was restored.' });
v.prepared_fixes = ['qa/verification/scratch/v36/build_fix40.mjs (A/B1/B2/C1/C2/D/E, mutation 7/7, all suites green, own corpus 0 truth / 2 disclosed fab regressions)'];
v.remaining = ['commit artifacts to verify-f64b280-campaign96'];
j.verdict = 'FAIL (verifier #36 on f64b280 / a01c8e1a): NOT DEPLOYMENT READY';
writeFileSync(p, JSON.stringify(j, null, 1) + '\n');
console.log('checkpoint written; verdict recorded');
