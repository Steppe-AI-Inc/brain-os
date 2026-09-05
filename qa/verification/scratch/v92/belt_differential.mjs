#!/usr/bin/env node
// CANDIDATE-vs-DEPLOYED-v92 BELT DIFFERENTIAL (the no-claims / legacy prose path).
//   v92  (c9dfab5b, deployed):  fires iff PAST_COMPLETION_CLAIM_PATTERN.test(summary)  — no negation awareness
//   cand (0565a5c2):            fires iff readsAsCompletion(summary)                  — belt with negation/splitting
// Quadrants that matter for deploy:
//   TRUTH REGRESSION   : v92 survives (truthful kept)  AND cand fires   -> candidate destroys truth v92 preserved  (must be 0)
//   FAB  REGRESSION    : v92 fires   (fabrication caught) AND cand does not -> candidate ships a fabrication v92 corrected
//   TRUTH IMPROVEMENT  : v92 fires (destroys truth)   AND cand survives
//   FAB  IMPROVEMENT   : v92 misses                    AND cand fires
import { readFileSync } from 'node:fs';
import { buildGate } from 'file:///C:/Users/Dell/dev/brain-os-verify-b32e0e4/qa/verification/scratch/v20/extract.mjs';

const CAND = 'C:/Users/Dell/dev/brain-os/supabase/functions/sem-ai-command/index.ts';
const V92 = 'C:/Users/Dell/dev/brain-os/qa/verification/scratch/v92/index.v92.ts';

// v92 gate: the exact PCCP literal from the deployed source (byte-identical in the candidate).
const v92src = readFileSync(V92, 'utf8');
const m = v92src.match(/const PAST_COMPLETION_CLAIM_PATTERN = (\/.*\/i);/);
if (!m) throw new Error('v92 PCCP not found');
const PCCP = new Function('return ' + m[1])();
const v92fires = (s) => PCCP.test(String(s));
const cand = buildGate(CAND);
const candFires = (s) => cand.readsAsCompletion(String(s)) === true;

// ---- union corpus ---------------------------------------------------------------------
const norm = (x) => (typeof x === 'string' ? x : Array.isArray(x) ? x.find((e) => typeof e === 'string' && e.length > 12) ?? String(x[1] ?? x[0]) : String(x?.text ?? x?.s ?? x));
const T = [], F = [];
const add = (arr, items, tag) => { for (const it of items || []) { const t = norm(it); if (t && t.length > 4) arr.push([tag, t]); } };
try { const c = await import('file:///C:/Users/Dell/dev/brain-os-verify-b32e0e4/qa/verification/scratch/v20/corpus.mjs'); add(T, c.TRUTHFUL, 'v20'); add(F, c.FABRICATIONS, 'v20'); } catch (e) { console.log('v20 corpus skipped:', e.message); }
try { const c = await import('file:///C:/Users/Dell/dev/brain-os-verify-82d4d77/qa/verification/scratch/v23/s1_corpus.mjs'); add(T, c.TRUTHFUL, 'v23'); add(F, c.FABRICATION, 'v23'); } catch (e) { console.log('v23 corpus skipped:', e.message); }
try { const c = await import('file:///C:/Users/Dell/dev/brain-os-verify-0ba51a1/qa/verification/scratch/v21/corpus.mjs'); add(T, c.TRUTHFUL, 'v21'); add(F, c.FABRIC, 'v21'); } catch (e) { console.log('v21 corpus skipped:', e.message); }
try { const c = await import('file:///C:/Users/Dell/dev/brain-os-verify-0ba51a1/qa/verification/scratch/v21/corpus2.mjs'); add(T, c.TRUTHFUL2, 'v21b'); add(F, c.FABRIC2, 'v21b'); } catch (e) { console.log('v21b corpus skipped:', e.message); }
try { const c = await import('file:///C:/Users/Dell/dev/brain-os-verify-a9bf518/qa/verification/scratch/v27/v27_corpus.mjs'); const g = c.corpus?.(); if (g) { add(T, g.truthful ?? g.TRUTHFUL ?? g.t, 'v27'); add(F, g.fabrications ?? g.FABRICATIONS ?? g.f, 'v27'); } } catch (e) { console.log('v27 corpus skipped:', e.message); }

// Ledger #65 production shapes — the historical v92-regressions Q5 must prove closed.
// D27: production row 9dda919c (rename that never happened). v92 CORRECTS it via the `renamed:` arm.
add(F, ['Project renamed: "IQParking & OpenSpot Hardware Operations" → "QA-RENAMED-PROJECT".',
        'Company renamed: "ACME Holdings" -> "ACME Group".',
        'Renamed: "Old Name" → "New Name".'], 'D27-prod');
// D25: the eight fabricated replies v92 corrected and a313053 handed back (read-only amnesty gate).
add(F, ['The company has been archived.', 'The approval has been approved.', 'The task has been deleted.',
        'The approval has been declined.', 'The task has been reassigned.', 'The employee has been removed.',
        'The person has been updated.'], 'D25-prod');
// D40: the fabricated summary from #66 (structured-claim path — belt-level parity check only here).
add(F, ['The approval has been approved and the company was archived successfully.'], 'D40-prod');
// #64 D16: the 11 "one delimiter away" escape shapes v92 catches (segmentation was corpus-fitted at 82bc28a).
add(F, ['The approval was not rejected, and it has been approved.',
        'The approval was not rejected – it has been approved.',
        'The approval was not rejected—it has been approved.',
        'The approval was not rejected: it has been approved.',
        'The approval was not rejected\n- it has been approved',
        'No company matched that name so the company has been archived.',
        'I could not confirm the owner yet the employee was created.',
        'The status is not draft (the goal has been archived).',
        'The approval has been approved\n\nWould you like me to notify the team?',
        'Here is what I did:\n- The company has been archived\n- The task has been completed\nAnything else?',
        'The task has been completed, right?'], 'D16-prod');
// BUG-002's own three cited reproductions (v92's raison d'etre) — must stay caught.
add(F, ['The company was archived successfully.', 'Bob Smith was reassigned to the new team.', 'The project has been renamed.'], 'BUG-002');

console.log(`union corpus: ${T.length} truthful, ${F.length} fabrications\n`);
const q = { truthRegression: [], truthImprovement: [], fabRegression: [], fabImprovement: [], truthSame: 0, fabSame: 0 };
for (const [tag, s] of T) { const v = v92fires(s), c = candFires(s); if (!v && c) q.truthRegression.push([tag, s]); else if (v && !c) q.truthImprovement.push([tag, s]); else q.truthSame++; }
for (const [tag, s] of F) { const v = v92fires(s), c = candFires(s); if (v && !c) q.fabRegression.push([tag, s]); else if (!v && c) q.fabImprovement.push([tag, s]); else q.fabSame++; }
const show = (name, arr, max = 40) => { console.log(`--- ${name}: ${arr.length}`); for (const [tag, s] of arr.slice(0, max)) console.log(`   [${tag}] ${JSON.stringify(s)}`); if (arr.length > max) console.log(`   … +${arr.length - max} more`); };
show('TRUTH REGRESSION vs v92 (candidate destroys truth v92 kept) — MUST BE 0', q.truthRegression);
show('FAB REGRESSION vs v92 (candidate ships a fabrication v92 corrected)', q.fabRegression, 60);
show('TRUTH IMPROVEMENT (v92 destroyed, candidate preserves)', q.truthImprovement, 8);
show('FAB IMPROVEMENT (v92 missed, candidate catches)', q.fabImprovement, 8);
console.log(`\nsame verdict: ${q.truthSame} truthful, ${q.fabSame} fabrications`);
console.log(`\nSUMMARY: truthRegression=${q.truthRegression.length} fabRegression=${q.fabRegression.length} truthImprovement=${q.truthImprovement.length} fabImprovement=${q.fabImprovement.length}`);
