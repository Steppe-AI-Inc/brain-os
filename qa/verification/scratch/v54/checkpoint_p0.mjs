import { readFileSync, writeFileSync } from 'node:fs';
const p = 'qa/verification/CURRENT_CAMPAIGN.json';
const j = JSON.parse(readFileSync(p, 'utf8'));
j.VERIFIER_54_LIVE.VERDICT = 'FAIL';
j.VERIFIER_54_LIVE.V54_P0_TDZ = {
  id: 'V54-P0-TDZ',
  severity: 'P0 — DEPLOY BLOCKER (runtime crash; candidate-only regression vs deployed v92)',
  site: 'supabase/functions/sem-ai-command/index.ts:2779 (LF-normalised) — const readsAsAssertion = PAST_COMPLETION_CLAIM_PATTERN.test(replayLabel) || COMPLETION_WORD.test(replayLabel);',
  decls: 'PAST_COMPLETION_CLAIM_PATTERN declared at :4778, COMPLETION_WORD at :5054 — both in the SAME block (the try at :2620), both textually AFTER the use.',
  scope_proof: 'block chain @use = 2542 serve( > 2616 new ReadableStream({ > 2617 async start( > 2620 try { > 2709 else-if disambiguation > 2768 if(matchedOption && !contradicted && field). 2709/2768 are plain blocks — NO function boundary between use and declaration.',
  runtime_proof: 'ReferenceError: Cannot access PAST_COMPLETION_CLAIM_PATTERN before initialization — qa/verification/scratch/v54/tdz_runtime.mjs, built from the real bytes.',
  typecheck_proof: 'deno check candidate: TS2448 x2 + TS2454 x2, all at :2779. deployed v92: ZERO TS2448/TS2454 (v92 7 errors total vs candidate 23).',
  v92_comparison: 'v92 has no readsAsAssertion / isTypedFallbackOnly at all; it emits Confirmed - ${matchedOption.label}. directly. Construct entered in f1722f2 (2026-09-03, run13 D98-D103) and has been latent through every round since.',
  founder_impact: 'Every disambiguation reply that MATCHES an option throws. The catch at :6002 marks the work order failed and sends {type:error}. The founder selection NEVER executes. Deployed v92 performs this correctly.',
  why_missed: 'qa/verification/lib/belt_extract.mjs buildDecide() re-composes this exact branch with the two declarations placed FIRST (deps, then branch) — the harness hoists precisely the declarations whose order IS the bug. And the deno gate compares a COUNT (23) rather than the diagnoses, so 4 runtime-fatal TS2448/TS2454 were normalised as baseline.',
  fix: 'PREPARED, NOT APPLIED (no write authority on index.ts; byte-preservation required). Move both const declarations above the resolution block — module top level is correct, both are pure regex literals with no dependencies. The comment at :4776 states they were moved INTO the window to satisfy a QA harness; that relocation is the root cause.',
};
j.last_checkpoint_at = new Date().toISOString();
writeFileSync(p, JSON.stringify(j, null, 1));
console.log('P0 checkpointed');
