// VERIFIER #63 FINDINGS V63-D1, V63-D2, V63-D6.
//
// V63-D2 (P2) — an asymmetry running in the UNSAFE direction. `contextCompanyIds`, the gate that TRUSTS an
//   id, was made trim-proof in the last round; `archivedCompanyIds`, the gate that REFUSES new work under an
//   archived company, still read the raw trimmed arrays. After a floor pass the id was therefore trusted and
//   no longer known-archived, and a create landed under an archived parent — on turns that still answered.
//   When two gates read the same data and only one is hardened, the one that says "no" is the one that must
//   be hardened first.
//
// V63-D1 (P2) — V62-D4 was not actually closed. The exact count was added to the FALLBACK memories query and
//   to the factory-detail work-order query, but the PRIMARY paths are the `match_memories` RPC and the
//   non-factory `canonical_work_orders` query, neither of which can carry one — and both envelope literals
//   hardcoded `total: null, truncated: null` regardless. Their `scope` strings ("top-8 semantic retrieval",
//   "newest 10") also became false after a trim. Both now get a real total from a separate exact head count,
//   which is what every other collection already does, and the stale scope prose is dropped.
//
// V63-D6 (P2) — a MALFORMED SEM_AI_MAX_TOKENS (not an absent one) parses to NaN, and every comparison with
//   NaN is false, so the budget silently emptied the whole optional pack on every turn and reported
//   overBudget: false. The incident record itself invites the founder to edit that variable. All three caps
//   shared the defect.
import { readFileSync, writeFileSync } from 'node:fs';
const p = process.argv[2] || 'supabase/functions/sem-ai-command/index.ts';
let s = readFileSync(p, 'utf8').replace(/\r\n/g, '\n');
let n = 0;
function must(a, b, label) { const c = s.split(a).length - 1; if (c !== 1) throw new Error(label + ': found ' + c); s = s.replace(a, () => b); n++; }

// ---- D6: one parser for every numeric cap, NaN-safe.
must(`function estimateTokens(x: unknown){ return Math.ceil(JSON.stringify(x).length / 4); }`,
`function estimateTokens(x: unknown){ return Math.ceil(JSON.stringify(x).length / 4); }
// A malformed env var parses to NaN, and every comparison with NaN is false — so a typo in
// SEM_AI_MAX_TOKENS silently disabled the gate it configures and emptied the optional pack on every turn
// (verifier #63, V63-D6). A cap must be a positive finite number or it is not a cap.
function envPositiveInt(name: string, fallback: number): number {
  const raw = Deno.env.get(name);
  if (raw === undefined || raw === null || String(raw).trim() === '') return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}`, 'env parser');

for (const [from, to] of [
  [`const hardMax = Number(Deno.env.get('SEM_AI_MAX_TOKENS') || 12000);`, `const hardMax = envPositiveInt('SEM_AI_MAX_TOKENS', 12000);`],
  [`const modelContextMax = Number(Deno.env.get('SEM_AI_MODEL_CONTEXT_TOKENS') || 180000);`, `const modelContextMax = envPositiveInt('SEM_AI_MODEL_CONTEXT_TOKENS', 180000);`],
  [`const IMAGE_BYTES_MAX = Number(Deno.env.get('SEM_AI_IMAGE_BYTES_MAX') || 5 * 1024 * 1024);`, `const IMAGE_BYTES_MAX = envPositiveInt('SEM_AI_IMAGE_BYTES_MAX', 5 * 1024 * 1024);`],
  [`const packBudget = Math.max(2000, Number(Deno.env.get('SEM_AI_MAX_TOKENS') || 12000) - 600);`, `const packBudget = Math.max(2000, envPositiveInt('SEM_AI_MAX_TOKENS', 12000) - 600);`],
]) must(from, to, 'cap: ' + from.slice(6, 34));

// ---- D1: a real total for the two collections that had none, from an exact head count.
must(`  const conversationCountQuery = channelId`,
`  // The PRIMARY memories path is the match_memories RPC and the primary work-order path is the non-factory
  // query; neither can carry { count: 'exact' }, and both envelope literals hardcoded total: null, so these
  // two collections could not express their own trim (verifier #63, V63-D1). A separate exact head count is
  // what every other collection already uses.
  const memoriesCountQuery = supabase.from('memories').select('id', { count: 'exact', head: true });
  const factoryWorkOrdersCountQuery = supabase.from('canonical_work_orders').select('id', { count: 'exact', head: true });
  const conversationCountQuery = channelId`, 'count queries');

must(`    archivedTasks, conversationCount] = await Promise.all([`,
     `    archivedTasks, conversationCount, memoriesCount, factoryWorkOrdersCount] = await Promise.all([`, 'destructure counts');
must(`    conversationCountQuery,
  ]);`, `    conversationCountQuery,
    memoriesCountQuery,
    factoryWorkOrdersCountQuery,
  ]);`, 'promise.all counts');

must(`    memories: { shown: packMemories.length, total: null, truncated: null, scope: 'top-8 semantic retrieval' },`,
`    memories: { shown: packMemories.length, total: memoriesCount.count ?? null, truncated: typeof memoriesCount.count === 'number' ? memoriesCount.count > packMemories.length : null },`, 'memories envelope');
must(`    factoryWorkOrders: { shown: factoryWorkOrders.length, total: null, truncated: null, scope: 'newest 10' },`,
`    factoryWorkOrders: { shown: factoryWorkOrders.length, total: factoryWorkOrdersCount.count ?? null, truncated: typeof factoryWorkOrdersCount.count === 'number' ? factoryWorkOrdersCount.count > factoryWorkOrders.length : null },`, 'factory envelope');

// ---- D2: the gate that REFUSES is hardened the same way as the gate that TRUSTS.
must(`        const archivedCompanyIds = new Set([...(contextPack?.companies || []), ...(contextPack?.archivedCompanies || [])].filter((c: any) => c.status === 'archived').map((c: any) => c.id));`,
`        // Trim-proof, like contextCompanyIds. Every id in the archivedCompanies PROVENANCE is archived by
        // construction (that is what the collection is), so a trimmed row cannot make an archived parent
        // look active — which is what let a create land under one (verifier #63, V63-D2). The asymmetry
        // mattered because this gate REFUSES: hardening only the gate that trusts moves risk, it does not
        // reduce it.
        const archivedCompanyIds = new Set([
          ...[...(contextPack?.companies || []), ...(contextPack?.archivedCompanies || []),
            ...(((contextPack as any)?.namedTargets || {}).companies || [])]
            .filter((c: any) => c && c.status === 'archived').map((c: any) => c.id),
          ...(contextProvenance?.archivedCompanies || []),
        ]);`, 'archived ids');

const out = s.replace(/\n/g, '\r\n');
if ((out.match(/(^|[^\r])\n/g) || []).length) throw new Error('bare LF');
writeFileSync(p, out); console.log('applied', n);
