// Snapshot the v92-differential union corpus (verifier corpora + ledger production shapes) into a
// committed JSON so the permanent parity suite never depends on the verifier worktrees.
import { writeFileSync } from 'node:fs';
const __ROOT = new URL('../../../../', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');

const norm = (x) => (typeof x === 'string' ? x : Array.isArray(x) ? x.find((e) => typeof e === 'string' && e.length > 12) ?? String(x[1] ?? x[0]) : String(x?.text ?? x?.s ?? x));
const T = [], F = [];
const add = (arr, items, tag) => { for (const it of items || []) { const t = norm(it); if (t && t.length > 4) arr.push({ tag, text: t }); } };
const tryImport = async (p, fn) => { try { fn(await import(p)); } catch (e) { console.log('skipped', p.split('/').slice(-2).join('/'), e.message.slice(0, 60)); } };
await tryImport('file:///C:/Users/Dell/dev/brain-os-verify-b32e0e4/qa/verification/scratch/v20/corpus.mjs', (c) => { add(T, c.TRUTHFUL, 'v20'); add(F, c.FABRICATIONS, 'v20'); });
await tryImport('file:///C:/Users/Dell/dev/brain-os-verify-82d4d77/qa/verification/scratch/v23/s1_corpus.mjs', (c) => { add(T, c.TRUTHFUL, 'v23'); add(F, c.FABRICATION, 'v23'); });
await tryImport('file:///C:/Users/Dell/dev/brain-os-verify-0ba51a1/qa/verification/scratch/v21/corpus.mjs', (c) => { add(T, c.TRUTHFUL, 'v21'); add(F, c.FABRIC, 'v21'); });
await tryImport('file:///C:/Users/Dell/dev/brain-os-verify-0ba51a1/qa/verification/scratch/v21/corpus2.mjs', (c) => { add(T, c.TRUTHFUL2, 'v21b'); add(F, c.FABRIC2, 'v21b'); });
await tryImport('file:///C:/Users/Dell/dev/brain-os-verify-a9bf518/qa/verification/scratch/v27/v27_corpus.mjs', (c) => { const g = c.corpus?.(); if (g) { add(T, g.truthful ?? g.TRUTHFUL ?? g.t, 'v27'); add(F, g.fabrications ?? g.FABRICATIONS ?? g.f, 'v27'); } });
// Ledger production shapes (v92-regressions Q5 must keep closed)
add(F, ['Project renamed: "IQParking & OpenSpot Hardware Operations" → "QA-RENAMED-PROJECT".', 'Company renamed: "ACME Holdings" -> "ACME Group".', 'Renamed: "Old Name" → "New Name".'], 'D27-prod');
add(F, ['The company has been archived.', 'The approval has been approved.', 'The task has been deleted.', 'The approval has been declined.', 'The task has been reassigned.', 'The employee has been removed.', 'The person has been updated.'], 'D25-prod');
add(F, ['The approval has been approved and the company was archived successfully.'], 'D40-prod');
add(F, ['The company was archived successfully.', 'Bob Smith was reassigned to the new team.', 'The project has been renamed.'], 'BUG-002');
add(F, ['The approval was not rejected, and it has been approved.', 'The approval was not rejected – it has been approved.', 'The approval was not rejected—it has been approved.', 'The approval was not rejected: it has been approved.', 'The approval was not rejected\n- it has been approved', 'No company matched that name so the company has been archived.', 'I could not confirm the owner yet the employee was created.', 'The status is not draft (the goal has been archived).', 'The approval has been approved\n\nWould you like me to notify the team?', 'Here is what I did:\n- The company has been archived\n- The task has been completed\nAnything else?', 'The task has been completed, right?'], 'D16-prod');
// the six v92-differential fix shapes (the ones this campaign closed), as named fabrications
add(F, ['No problem — ACME was archived.', 'Not to worry — ACME was deleted.', 'The nothing-to-report company was archived.', 'ACME (no longer active) was archived.', 'There were no blockers so ACME was archived.', 'There were no approvals yet ACME was archived.', 'Nothing else is pending because the task was completed.'], 'v92diff-fix');
const dedupe = (a) => { const seen = new Set(); return a.filter((x) => (seen.has(x.text) ? false : (seen.add(x.text), true))); };
const out = { generated: new Date().toISOString(), v92_commit: 'c9dfab5bd433', v92_sha256: '795c20c82301aba1f1731c6b408cc9345e0f86b43a50b0cf5dba6ca78d1f88fc', truthful: dedupe(T), fabrications: dedupe(F) };
writeFileSync(__ROOT + 'qa/scenarios-runner/v92_parity_corpus.json', JSON.stringify(out, null, 1) + '\n');
console.log(`wrote v92_parity_corpus.json: ${out.truthful.length} truthful, ${out.fabrications.length} fabrications`);
