// PREPARED, NOT APPLIED — the first item of the next source window (ledger #144).
//
// WHY THIS IS NOT APPLIED YET. `index.ts` is a release candidate under independent verification
// (verifier #66, candidate 52d9582). The release-candidate rule is that any source change means a new SHA
// and fresh verification, so applying this now would throw away the round in flight. It is P1 and it is
// live in production today, but it has been live and silent for fifteen days — one more verification cycle
// is the right trade against invalidating the gate.
//
// WHAT IT FIXES. `embedTexts()` swallows every failure — missing key, non-2xx, thrown error — and returns
// null per input with no log, no contextError, no audit row and no user-visible signal. Production evidence:
// 63 of 66 memories created since 2026-08-24 16:27 carry a NULL embedding, the query side is getting nulls
// too, and nothing anywhere could have shown it. Degrading is correct; degrading INVISIBLY is the defect.
//
// WHAT IT DELIBERATELY DOES NOT DO. It does not retry, does not hard-fail the turn, and does not change
// what the user sees. Chat must still never break because embeddings are down. It only makes the
// degradation OBSERVABLE, which is the whole of the finding.
//
// Apply with:  node qa/verification/scratch/p1/PREPARED_embedding_observability.mjs
import { readFileSync, writeFileSync } from 'node:fs';

const p = process.argv[2] || 'supabase/functions/sem-ai-command/index.ts';
let s = readFileSync(p, 'utf8').replace(/\r\n/g, '\n');
const edits = [];
function sub(what, from, to) {
  if (s.split(from).length - 1 !== 1) throw new Error(what + ': anchor missing or not unique — re-derive against current source');
  s = s.replace(from, to);
  edits.push(what);
}

// 1. The function reports WHY it degraded, instead of returning nulls indistinguishable from "no input".
sub('embedTexts records its failure reason', `async function embedTexts(texts: string[], key: string | undefined): Promise<(number[] | null)[]> {
  if (!key || texts.length === 0) return texts.map(() => null);
  try {
    const r = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: { Authorization: \`Bearer \${key}\`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'text-embedding-3-small', input: texts }),
    });
    if (!r.ok) return texts.map(() => null);`,
`// A DEGRADATION THAT NOTHING RECORDS IS INDISTINGUISHABLE FROM NORMAL OPERATION. Embeddings degrade to
// null on purpose — chat must never hard-fail because the embedding provider is down — but for fifteen
// days every memory was written with a NULL embedding and semantic retrieval returned nothing, and no
// surface in the product could have shown it (ledger #144). The degradation stays; the silence goes.
// Written to module scope rather than returned, because every caller degrades the same way and none of
// them should have to remember to thread a reason through.
let embeddingDegradedReason: string | null = null;
async function embedTexts(texts: string[], key: string | undefined): Promise<(number[] | null)[]> {
  if (texts.length === 0) return [];
  if (!key) { embeddingDegradedReason = 'OPENAI_API_KEY is not configured'; return texts.map(() => null); }
  try {
    const r = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: { Authorization: \`Bearer \${key}\`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'text-embedding-3-small', input: texts }),
    });
    if (!r.ok) {
      // The provider's own words, capped — an error code is what makes this diagnosable at all, and it is
      // exactly what the 2026-08-24 incident destroyed by overwriting the stored errors with prose.
      const detail = await r.text().catch(() => '');
      embeddingDegradedReason = 'embeddings HTTP ' + r.status + (detail ? ': ' + detail.slice(0, 200) : '');
      return texts.map(() => null);
    }`);

sub('embedTexts catch records the thrown reason', `    return texts.map((_, i) => byIndex.get(i) ?? null);
  } catch {
    return texts.map(() => null);
  }
}`, `    const out = texts.map((_, i) => byIndex.get(i) ?? null);
    // A 200 that carried no usable vector is still a degradation, and it is the one shape a status-code
    // check cannot see.
    if (out.every((v) => v === null)) embeddingDegradedReason = 'embeddings returned no usable vector';
    return out;
  } catch (e: any) {
    embeddingDegradedReason = 'embeddings request failed: ' + String(e?.message || e).slice(0, 200);
    return texts.map(() => null);
  }
}`);

// 2. The reason reaches the turn's own diagnostics, which is what makes it queryable rather than merely
//    logged. contextErrors already rides into the ai_command_request_completed audit row.
sub('the degradation joins the turn diagnostics', `        await supabase.from('audit_logs').insert({ actor_profile_id:profile.id, actor_role:profile.role, event_type:'ai_command_request_completed'`,
`        // ledger #144: an embedding failure is a real capability loss for this turn and must be visible in
        // the same place every other context problem is, or nobody finds out for a fortnight.
        if (embeddingDegradedReason) contextErrors.push('memory retrieval degraded — ' + embeddingDegradedReason);
        await supabase.from('audit_logs').insert({ actor_profile_id:profile.id, actor_role:profile.role, event_type:'ai_command_request_completed'`);

const out = s.replace(/\n/g, '\r\n');
if ((out.match(/(^|[^\r])\n/g) || []).length) throw new Error('bare LF introduced');
if (!out.includes('embeddingDegradedReason')) throw new Error('the reason variable did not survive');
writeFileSync(p, out);
console.log('applied ' + edits.length + ' edits:');
for (const e of edits) console.log('  - ' + e);
console.log('\nNEXT: add a regression that FAILS when an embedding failure produces no signal, then re-run');
console.log('the battery, take a new SHA and dispatch a fresh verifier. Do not ship this unverified.');
