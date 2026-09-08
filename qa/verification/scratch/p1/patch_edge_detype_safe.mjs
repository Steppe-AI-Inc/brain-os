// Second pass: make the P1 insertions detyper-safe (qa/scenarios-runner/_gate_extract.mjs stripTS):
// no multi-line `type` blocks or object-typed annotations inside the executor window, no `?:`
// optional params, no `async (...)` annotated arrows, no `new Set<T>()` generics.
import { readFileSync, writeFileSync } from 'node:fs';
const path = process.argv[2] || 'supabase/functions/sem-ai-command/index.ts';
const raw = readFileSync(path, 'utf8');
let s = raw.replace(/\r\n/g, '\n');
let applied = 0;
function rep(from, to, label) { const n = s.split(from).length - 1; if (n !== 1) throw new Error(`anchor ${label}: found ${n}`); s = s.replace(from, () => to); applied++; }

// Types move to module level (after PendingActionOption).
rep(`type PendingActionOption = { label: string; id: string; entityType: string; actionType?: string };
`,
`type PendingActionOption = { label: string; id: string; entityType: string; actionType?: string };

// ExecutionResultEnvelope (governance/OPERATING_TRUTH_MODEL.md §4.1; mirrored in
// supabase/functions/_shared/execution.ts — the drift guard pins the two). One entry per
// executed (or attempted) operation. The legacy four fields stay for every consumer; the
// envelope fields carry request identity, the backend result verbatim, and the fresh
// postcondition. postconditionPassed === postcondition_verified, always.
type ExecutionResultEnvelope = {
  resourceType: string; action: string; id: string; postconditionPassed: boolean;
  request_id: string | null; channel_id: string | null; turn: number | null;
  action_type: string; entity_type: string; canonical_entity_ids: string[];
  requested_values: Record<string, unknown> | null; executed: boolean; rows_affected: number | null;
  backend_result: unknown; precondition: unknown; postcondition: unknown;
  postcondition_verified: boolean; error: string | null; timestamp: string;
};
type ExecutionDetail = { requestedValues?: Record<string, unknown> | null; rowsAffected?: number | null; backendResult?: unknown; precondition?: unknown; postcondition?: unknown; error?: string | null; executed?: boolean };
type CompanyLookupRow = { id: string; name: string; status: string };
type LifecycleDisambiguation = { action: 'archive' | 'restore'; name: string; options: CompanyLookupRow[] };
type MutationIntent = { verb: string | null; field: string | null };
`, 'types-top');

rep(`        // ExecutionResultEnvelope (governance/OPERATING_TRUTH_MODEL.md §4.1; mirrored in
        // supabase/functions/_shared/execution.ts — the drift guard pins the two). One entry
        // per executed (or attempted) operation. The legacy four fields stay for every
        // consumer below; the envelope fields carry request identity, the backend result
        // verbatim, and the fresh postcondition. postconditionPassed === postcondition_verified.
        type ExecutionResultEnvelope = {
          resourceType: string; action: string; id: string; postconditionPassed: boolean;
          request_id: string | null; channel_id: string | null; turn: number | null;
          action_type: string; entity_type: string; canonical_entity_ids: string[];
          requested_values: Record<string, unknown> | null; executed: boolean; rows_affected: number | null;
          backend_result: unknown; precondition: unknown; postcondition: unknown;
          postcondition_verified: boolean; error: string | null; timestamp: string;
        };
        type ExecutionDetail = { requestedValues?: Record<string, unknown> | null; rowsAffected?: number | null; backendResult?: unknown; precondition?: unknown; postcondition?: unknown; error?: string | null; executed?: boolean };
        const claimExecutionEvidence: ExecutionResultEnvelope[] = [];
        const executionTurn: number | null = typeof contextPack?.currentTurn?.turn === 'number' ? contextPack.currentTurn.turn : null;
        const recordExecution = (resourceType: string, action: string, id: unknown, postconditionPassed: boolean, detail?: ExecutionDetail) => {`,
`        // ExecutionResultEnvelope (type at module top; governance/OPERATING_TRUTH_MODEL.md
        // §4.1). One entry per executed (or attempted) operation, written at the real
        // execution sites; detail carries the backend result verbatim and the fresh
        // postcondition. postconditionPassed === postcondition_verified, always.
        const claimExecutionEvidence: ExecutionResultEnvelope[] = [];
        const executionTurn: number | null = typeof contextPack?.currentTurn?.turn === 'number' ? contextPack.currentTurn.turn : null;
        const recordExecution = (resourceType: string, action: string, id: unknown, postconditionPassed: boolean, detail: ExecutionDetail | null = null) => {`, 'record-sig');

rep(`        const lifecycleDisambiguation: Array<{ action: 'archive' | 'restore'; name: string; options: Array<{ id: string; name: string; status: string }> }> = [];`,
    `        const lifecycleDisambiguation: LifecycleDisambiguation[] = [];`, 'disamb-type');

rep(`        const resolveCompanyLifecycleTargets = async (action: 'archive' | 'restore', rawIds: unknown, rawNames: unknown, commandName: string | null): Promise<string[]> => {
          const ids = [...new Set((Array.isArray(rawIds) ? rawIds : []).filter((x): x is string => typeof x === 'string' && COMPANY_UUID_RE.test(x)))];
          const names = [...new Set((Array.isArray(rawNames) ? rawNames : []).filter((x): x is string => typeof x === 'string' && x.trim().length > 0).map((x) => x.trim().slice(0, 120)))];
          const resolved = new Set<string>();
          if (ids.length > 0) {
            const { data } = await supabase.from('companies').select('id,name,status').in('id', ids);
            for (const c of (data || []) as Array<{ id: string; name: string }>) { resolved.add(String(c.id)); companyNameById.set(String(c.id), String(c.name)); }`,
`        async function resolveCompanyLifecycleTargets(action: string, rawIds: unknown, rawNames: unknown, commandName: string | null): Promise<string[]> {
          const ids: string[] = [...new Set((Array.isArray(rawIds) ? rawIds : []).filter((x): x is string => typeof x === 'string' && COMPANY_UUID_RE.test(x)))];
          const names: string[] = [...new Set((Array.isArray(rawNames) ? rawNames : []).filter((x): x is string => typeof x === 'string' && x.trim().length > 0).map((x) => x.trim().slice(0, 120)))];
          const resolved: Set<string> = new Set();
          if (ids.length > 0) {
            const { data } = await supabase.from('companies').select('id,name,status').in('id', ids);
            for (const c of (data || []) as CompanyLookupRow[]) { resolved.add(String(c.id)); companyNameById.set(String(c.id), String(c.name)); }`, 'resolver-head');
rep(`            let rows = (exact || []) as Array<{ id: string; name: string; status: string }>;`,
    `            let rows = (exact || []) as CompanyLookupRow[];`, 'rows-type');
rep(`                rows = (fuzzy || []) as typeof rows;`, `                rows = (fuzzy || []) as CompanyLookupRow[];`, 'rows-type2');
rep(`          return [...resolved];
        };
        const lifecycleCommandName = (pattern: RegExp): string | null => {`,
`          return [...resolved];
        }
        const lifecycleCommandName = (pattern: RegExp): string | null => {`, 'resolver-tail');

rep(`        const verifyRowsExist = async (table: string, ids: unknown[]): Promise<Set<string>> => {
          const wanted = ids.filter((x): x is string => typeof x === 'string' && x.length > 0);
          if (wanted.length === 0) return new Set<string>();
          try {
            const { data } = await supabase.from(table).select('id').in('id', wanted);
            return new Set<string>(((data || []) as Array<{ id: unknown }>).map((r) => String(r.id)));
          } catch { return new Set<string>(); }
        };`,
`        async function verifyRowsExist(table: string, ids: unknown[]): Promise<Set<string>> {
          const wanted: string[] = ids.filter((x): x is string => typeof x === 'string' && x.length > 0);
          const seen: Set<string> = new Set();
          if (wanted.length === 0) return seen;
          try {
            const { data } = await supabase.from(table).select('id').in('id', wanted);
            for (const r of (data || []) as Array<Record<string, unknown>>) seen.add(String(r.id));
          } catch { /* unreadable after commit: unverified, never assumed */ }
          return seen;
        }`, 'verify-fn');

rep(`        const requestedIntent: { verb: string | null; field: string | null } | null = (intentVerb || modelMutationField)
          ? { verb: intentVerb ? intentVerb.toLowerCase() : null, field: modelMutationField }
          : null;`,
`        const requestedIntent: MutationIntent | null = (intentVerb || modelMutationField)
          ? { verb: intentVerb ? intentVerb.toLowerCase() : null, field: modelMutationField }
          : null;`, 'intent-type');

rep(`  const envelope = (res: any, shownOverride?: number, scope?: string) => {`,
    `  const envelope = (res: any, shownOverride: number | null = null, scope: string | null = null) => {`, 'envelope-sig');
rep(`recentlyResolvedEntities, recentlyDeletedEntities, counts, collections, currentTurn: { turn: totalPriorTurns + 1, command } };`,
    `recentlyResolvedEntities, recentlyDeletedEntities, collections, counts, currentTurn: { turn: totalPriorTurns + 1, command } };`, 'pack-order');

const out = s.replace(/\n/g, '\r\n');
if ((out.match(/(^|[^\r])\n/g) || []).length !== 0) throw new Error('bare LF');
writeFileSync(path, out);
console.log(`applied ${applied}; lines ${out.split('\r\n').length}`);
