// Incident 2026-09-08 structural fix: budget-aware context-pack assembly.
// The serve() preflight refuses any request whose estimated tokens exceed SEM_AI_MAX_TOKENS (12,000)
// — an ordinary question becomes a 413 with no answer. Rather than shave bytes and hope, the pack now
// measures itself with the SAME estimator and DEGRADES: optional display collections are trimmed in a
// fixed order until it fits, and every trim is written back into that collection's own envelope
// (shown / total / truncated), so a trimmed collection is still reported truthfully with its real total
// (governance/OPERATING_TRUTH_MODEL.md §4.3). Core collections are trimmed last and never below a floor.
import { readFileSync, writeFileSync } from 'node:fs';
const p = process.argv[2] || 'supabase/functions/sem-ai-command/index.ts';
let s = readFileSync(p, 'utf8').replace(/\r\n/g, '\n');
let n = 0;
function must(a, b, label) { const c = s.split(a).length - 1; if (c !== 1) throw new Error(label + ': found ' + c); s = s.replace(a, () => b); n++; }

// 1. Trim the two additions that are pure display context (lifecycle targets resolve server-side now).
must(`    supabase.from('companies').select('id,name,status,organization_type,updated_at', { count: 'exact' }).eq('status', 'archived').order('updated_at', { ascending: false }).limit(12),`,
     `    supabase.from('companies').select('id,name,status,organization_type,updated_at', { count: 'exact' }).eq('status', 'archived').order('updated_at', { ascending: false }).limit(6),`, 'archived cap');

// 2. Drop the prose `scope` strings from the envelope map (the contract needs shown/total/truncated only).
must(`  const envelope = (res: any, shownOverride: number | null = null, scope: string | null = null) => {
    const shown = typeof shownOverride === 'number' ? shownOverride : (res?.data || []).length;
    const total = typeof res?.count === 'number' ? res.count : null;
    return { shown, total, truncated: total === null ? null : total > shown, ...(scope ? { scope } : {}) };
  };`,
`  // The envelope carries shown / total / truncated only: the prose 'scope' strings cost ~130 tokens
  // across 24 collections and say nothing the model cannot see (incident 2026-09-08).
  const envelope = (res: any, shownOverride: number | null = null, scope: string | null = null) => {
    void scope;
    const shown = typeof shownOverride === 'number' ? shownOverride : (res?.data || []).length;
    const total = typeof res?.count === 'number' ? res.count : null;
    return { shown, total, truncated: total === null ? null : total > shown };
  };`, 'envelope scope');

// 3. Budget-aware assembly, immediately after the pack literal.
must(`  return { pack, errors:[companies.error,namedCompanyLookup.error,archivedCompanies.error,projects.error,`,
`  // ---- CONTEXT BUDGET (incident 2026-09-08, qa/verification/incidents/INCIDENT_2026-09-08_TOKEN_PREFLIGHT_413.md).
  // serve() refuses the whole request above SEM_AI_MAX_TOKENS using estimateTokens({command, contextPack}).
  // A pack that outgrows the cap must DEGRADE, never turn an ordinary question into a 413 with no answer.
  // Optional display collections are trimmed first, core ones last and never below a floor; each trim is
  // written back into that collection's envelope so the model still sees the real total and truncated=true.
  const packBudget = Math.max(2000, Number(Deno.env.get('SEM_AI_MAX_TOKENS') || 12000) - 600);
  const packTokens = () => Math.ceil(JSON.stringify({ command, pack }).length / 4);
  const TRIM_ORDER: Array<[string, number, boolean]> = [
    ['memories', 4, false], ['archivedTasks', 4, false], ['archivedCompanies', 4, false],
    ['financialReports', 4, false], ['inventory', 5, false], ['products', 5, false], ['proposals', 5, false],
    ['productSpecs', 5, false], ['engineeringDrawings', 5, false], ['mcpConnectors', 4, false],
    ['aiProviders', 4, false], ['documents', 8, false], ['leads', 8, false], ['departments', 8, false],
    ['companyRelationships', 8, false], ['personAssignments', 10, false], ['factoryWorkOrders', 4, false],
    ['channels', 6, false], ['agents', 5, false], ['conversationHistory', 4, true],
    ['projects', 8, false], ['goals', 8, false], ['tasks', 8, false], ['people', 10, false], ['companies', 8, false],
  ];
  const contextTrimmed: string[] = [];
  const packRecord = pack as Record<string, unknown>;
  const collectionsRecord = collections as Record<string, { shown: number; total: number | null; truncated: boolean | null }>;
  for (const [key, keep, keepNewest] of TRIM_ORDER) {
    if (packTokens() <= packBudget) break;
    const arr = packRecord[key];
    if (!Array.isArray(arr) || arr.length <= keep) continue;
    packRecord[key] = keepNewest ? arr.slice(arr.length - keep) : arr.slice(0, keep);
    const env = collectionsRecord[key];
    if (env) { env.shown = keep; env.truncated = env.total === null ? null : env.total > keep; }
    contextTrimmed.push(\`\${key} \${arr.length}->\${keep}\`);
  }
  packRecord.contextBudget = { estimatedTokens: packTokens(), budget: packBudget, trimmed: contextTrimmed };
  return { pack, errors:[companies.error,namedCompanyLookup.error,archivedCompanies.error,projects.error,`, 'budget block');

// 4. The prompt states what a trimmed pack means (truthfulness, not a silent cut).
must(`- GROUNDING PRECEDENCE (binding; governance/OPERATING_TRUTH_MODEL.md §2):`,
`- context.contextBudget lists any collection trimmed to fit this turn's token budget
  (e.g. "documents 30->8"). A trimmed collection's own entry in context.collections still carries the
  REAL total and truncated=true, so keep answering counts from context.collections.<name>.total and say
  "N of M shown" — a trim never means the rest do not exist.
- GROUNDING PRECEDENCE (binding; governance/OPERATING_TRUTH_MODEL.md §2):`, 'prompt budget');

const out = s.replace(/\n/g, '\r\n');
if ((out.match(/(^|[^\r])\n/g) || []).length) throw new Error('bare LF');
writeFileSync(p, out); console.log('applied', n);
