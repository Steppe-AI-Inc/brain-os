// P1 package — Edge implementation of the Operating Truth Model (governance/OPERATING_TRUTH_MODEL.md)
// and the Canonical Work Contract on supabase/functions/sem-ai-command/index.ts.
// Byte discipline: read CRLF, patch on LF, write CRLF; every anchor must match exactly once.
import { readFileSync, writeFileSync } from 'node:fs';
const path = process.argv[2] || 'supabase/functions/sem-ai-command/index.ts';
const raw = readFileSync(path, 'utf8');
if (!raw.includes('\r\n')) throw new Error('expected CRLF source');
let s = raw.replace(/\r\n/g, '\n');
let applied = 0;
function rep(from, to, label) {
  const n = s.split(from).length - 1;
  if (n !== 1) throw new Error(`anchor ${label}: expected exactly 1 match, found ${n}`);
  s = s.replace(from, () => to); applied++;
}
function repRe(re, to, label) {
  const m = s.match(re);
  if (!m) throw new Error(`regex anchor ${label}: no match`);
  s = s.replace(re, to); applied++;
}

// ---- R1: prompt — absence from the window is never non-existence -----------------------
rep(`  in any real field at all. Given this guarantee, if a company the founder names is
  STILL absent from context.companies, that is real signal it does not currently exist
  under that name (permanently deleted, or never existed, or misspelled) — say so plainly
  ("I don't see a company by that name right now") and ask if they mean something else.
  NEVER invent a plausible-sounding status (archived/active/anything) for a company that`,
`  in any real field at all. If a company the founder names is STILL absent from
  context.companies and context.archivedCompanies, say exactly that ("I don't see a
  company by that name in my current view") — absence from a context window is NEVER
  proof that it does not exist and NEVER proof that it was deleted; the backend resolves
  explicit archive/restore targets by name across every status (see restoreCompanyNames
  below), so never refuse a lifecycle request merely because the name is not in context.
  NEVER invent a plausible-sounding status (archived/active/anything) for a company that`, 'R1');

// ---- R2: prompt — restore by name goes to the backend resolver, never to history --------
rep(`  the same way via restoreCompanyIds, and can target a company that is only resolvable from
  context.memories or conversation history (an archived company is not necessarily still
  in context.companies, since that list is the active-company view) — resolve it by name
  from whatever context you have rather than refusing. Never invent or guess an id for
  either field.`,
`  the same way via restoreCompanyIds (ids from context.archivedCompanies). When the
  company the founder names is not in context at all, put the EXACT NAME the founder used
  into restoreCompanyNames (or archiveCompanyNames) instead — the backend resolves it
  against every company you are allowed to see, active or archived, and reports the real
  outcome; never resolve an id from memories or conversation history, and never refuse
  merely because the name is outside your context window. Never invent or guess an id for
  either field.`, 'R2');

// ---- R3: schema fields ------------------------------------------------------------------
rep(`  "restoreCompanyIds": [string],
  "permanentDeleteFixtureCompanyIds": [string],`,
`  "restoreCompanyIds": [string],
  "archiveCompanyNames": [string],
  "restoreCompanyNames": [string],
  "permanentDeleteFixtureCompanyIds": [string],`, 'R3');

// ---- R4: prompt — grounding precedence stated as a binding rule --------------------------
rep(`- If context.conversationHistory is present, this command continues an existing topic —`,
`- GROUNDING PRECEDENCE (binding; governance/OPERATING_TRUTH_MODEL.md §2): (1) this turn's
  own execution results reported back to you, (2) the fresh context arrays and
  context.collections in THIS pack, (3) context.pendingAction / context.continuity,
  (4) context.conversationHistory, (5) your own inference. A higher tier always wins. A
  history entry whose summary reads "[UNVERIFIED — …]" establishes nothing about state.
  When history and fresh context disagree, say so explicitly ("an earlier message in this
  channel said X; the current data shows Y") and answer from the fresh context. For any
  count, use context.collections.<name>.total and say "N of M shown" when truncated.
- If context.conversationHistory is present, this command continues an existing topic —`, 'R4');

// ---- R5: pack queries — active/archived company envelopes, exact counts on every collection
rep(`  const [companies, namedCompanyLookup, projects, tasks,`,
    `  const [companies, namedCompanyLookup, archivedCompanies, projects, tasks,`, 'R5a');
rep(`    supabase.from('companies').select('id,name,status,organization_type,strategic_priority,risk_score').limit(12),
    namedCompanyLookupQuery,`,
`    // CollectionEnvelope (governance/OPERATING_TRUTH_MODEL.md §4.3): active and archived
    // companies are two deterministic, newest-first windows, each with an exact count.
    // Every collection query below carries { count: 'exact' } so context.collections can
    // report shown/total/truncated from the query's own count, never from array length.
    supabase.from('companies').select('id,name,status,organization_type,strategic_priority,risk_score', { count: 'exact' }).neq('status', 'archived').order('updated_at', { ascending: false }).limit(12),
    namedCompanyLookupQuery,
    supabase.from('companies').select('id,name,status,organization_type,updated_at', { count: 'exact' }).eq('status', 'archived').order('updated_at', { ascending: false }).limit(12),`, 'R5b');
const countable = [
  [`supabase.from('projects').select('id,company_id,title,status,deadline,blockers,risk_score').limit(20)`, `supabase.from('projects').select('id,company_id,title,status,deadline,blockers,risk_score', { count: 'exact' }).limit(20)`],
  [`supabase.from('tasks').select('id,company_id,project_id,title,status,priority,risk_level,approval_required,deadline,owner_type,owner_person_id,owner_agent_id').in('status',TASK_STATUSES).limit(15)`, `supabase.from('tasks').select('id,company_id,project_id,title,status,priority,risk_level,approval_required,deadline,owner_type,owner_person_id,owner_agent_id', { count: 'exact' }).in('status',TASK_STATUSES).limit(15)`],
  [`supabase.from('agents').select('id,name,role,skills,cost_limit_usd').eq('active', true).limit(20)`, `supabase.from('agents').select('id,name,role,skills,cost_limit_usd', { count: 'exact' }).eq('active', true).limit(20)`],
  [`supabase.from('product_lines').select('id,company_id,name,currency,unit_price,service_fee_monthly,active').eq('active', true).limit(20)`, `supabase.from('product_lines').select('id,company_id,name,currency,unit_price,service_fee_monthly,active', { count: 'exact' }).eq('active', true).limit(20)`],
  [`supabase.from('inventory_items').select('id,company_id,product_line_id,sku,quantity_on_hand,reserved_quantity,reorder_point,location').limit(20)`, `supabase.from('inventory_items').select('id,company_id,product_line_id,sku,quantity_on_hand,reserved_quantity,reorder_point,location', { count: 'exact' }).limit(20)`],
  [`supabase.from('approvals').select('id,company_id,title,status,risk_level,reason').eq('status','pending').limit(20)`, `supabase.from('approvals').select('id,company_id,title,status,risk_level,reason', { count: 'exact' }).eq('status','pending').limit(20)`],
  [`supabase.from('people').select('id,full_name,email,role_title,company_id,active').limit(30)`, `supabase.from('people').select('id,full_name,email,role_title,company_id,active', { count: 'exact' }).limit(30)`],
  [`supabase.from('goals').select('id,company_id,title,status,kind').limit(20)`, `supabase.from('goals').select('id,company_id,title,status,kind', { count: 'exact' }).limit(20)`],
  [`supabase.from('company_relationships').select('id,company_id,related_company_id,owner_profile_id,relationship_type,ownership_pct,state').limit(20)`, `supabase.from('company_relationships').select('id,company_id,related_company_id,owner_profile_id,relationship_type,ownership_pct,state', { count: 'exact' }).limit(20)`],
  [`supabase.from('person_assignments').select('id,person_id,legal_employer_company_id,operating_company_id,manager_person_id,job_title,state').limit(30)`, `supabase.from('person_assignments').select('id,person_id,legal_employer_company_id,operating_company_id,manager_person_id,job_title,state', { count: 'exact' }).limit(30)`],
  [`supabase.from('financial_reports').select('id,company_id,period,revenue,expenses,net_income,cash_position,health_status,summary').order('created_at', { ascending: false }).limit(20)`, `supabase.from('financial_reports').select('id,company_id,period,revenue,expenses,net_income,cash_position,health_status,summary', { count: 'exact' }).order('created_at', { ascending: false }).limit(20)`],
  [`supabase.from('chat_channels').select('id,name,company_id').eq('archived', false).limit(15)`, `supabase.from('chat_channels').select('id,name,company_id', { count: 'exact' }).eq('archived', false).limit(15)`],
  [`supabase.from('departments').select('id,name,company_id').limit(30)`, `supabase.from('departments').select('id,name,company_id', { count: 'exact' }).limit(30)`],
  [`supabase.from('sales_leads').select('id,client_name,company_id,stage,value_estimate').limit(30)`, `supabase.from('sales_leads').select('id,client_name,company_id,stage,value_estimate', { count: 'exact' }).limit(30)`],
  [`supabase.from('documents').select('id,title,company_id,category').limit(30)`, `supabase.from('documents').select('id,title,company_id,category', { count: 'exact' }).limit(30)`],
  [`supabase.from('proposals').select('id,title,company_id,status').limit(20)`, `supabase.from('proposals').select('id,title,company_id,status', { count: 'exact' }).limit(20)`],
  [`supabase.from('product_specs').select('id,title,company_id,status').limit(20)`, `supabase.from('product_specs').select('id,title,company_id,status', { count: 'exact' }).limit(20)`],
  [`supabase.from('engineering_drawings').select('id,title,company_id').limit(20)`, `supabase.from('engineering_drawings').select('id,title,company_id', { count: 'exact' }).limit(20)`],
  [`supabase.from('ai_providers').select('id,provider,model,label,is_active').limit(10)`, `supabase.from('ai_providers').select('id,provider,model,label,is_active', { count: 'exact' }).limit(10)`],
  [`supabase.from('mcp_connectors').select('id,name,endpoint_url').limit(10)`, `supabase.from('mcp_connectors').select('id,name,endpoint_url', { count: 'exact' }).limit(10)`],
  [`supabase.from('tasks').select('id,company_id,title').eq('status','archived').order('updated_at',{ascending:false}).limit(15)`, `supabase.from('tasks').select('id,company_id,title', { count: 'exact' }).eq('status','archived').order('updated_at',{ascending:false}).limit(15)`],
];
for (const [a, b] of countable) rep(a, b, 'R5-count:' + a.slice(15, 45));

// ---- R6: history narrative carries the persisted verdict ---------------------------------
rep(`  const conversationHistory = (conversationRowsChronological || []).map((r:any, idx:number) => ({ turn: historyWindowStart + idx, command: r.command, summary: r.output?.summary || null }));`,
`  // Narrative tier (governance/OPERATING_TRUTH_MODEL.md §2 tier 4, §3 rule 6): each prior
  // turn carries its persisted verdict. A turn that carried mutation intent (or rejected
  // claims) and executed nothing is carried as UNVERIFIED unless its persisted summary is
  // already the deterministic receipt — the raw prose of such a turn never re-enters the
  // prompt as a record of what happened; the command still says what was ASKED.
  const conversationHistory = (conversationRowsChronological || []).map((r:any, idx:number) => {
    const verdict = r.output?.turnVerdict && typeof r.output.turnVerdict === 'object' ? r.output.turnVerdict : null;
    const evidence = Array.isArray(r.output?.verifiedResponse?.executionEvidence) ? r.output.verifiedResponse.executionEvidence : null;
    const executedOperationCount: number | null = typeof verdict?.executedOperationCount === 'number' ? verdict.executedOperationCount
      : evidence ? evidence.filter((e: any) => e && e.postconditionPassed).length : null;
    const rejectedClaimCount: number | null = typeof verdict?.rejectedClaimCount === 'number' ? verdict.rejectedClaimCount
      : Array.isArray(r.output?.verifiedResponse?.rejectedClaims) ? r.output.verifiedResponse.rejectedClaims.length : null;
    const unverified = (verdict?.mutationIntent != null && executedOperationCount === 0)
      || (rejectedClaimCount !== null && rejectedClaimCount > 0 && executedOperationCount === 0);
    const summary = unverified && !verdict?.receiptRendered
      ? '[UNVERIFIED — no database change was executed on that turn]'
      : (r.output?.summary || null);
    return { turn: historyWindowStart + idx, command: r.command, summary, verified: executedOperationCount === null ? null : !unverified, executedOperationCount, rejectedClaimCount };
  });`, 'R6');

// ---- R7: durable channel state outranks the previous turn's stored output ---------------
rep(`  const pendingAction: PendingAction | null = lastTurnOutput?.pendingAction
    ?? (legacyPendingConfirmation && typeof legacyPendingConfirmation === 'object'
      ? { kind: 'bulk_confirmation', summary: legacyPendingConfirmation.summary, action: legacyPendingConfirmation.action }
      : (durablePendingActionValid ? durableChannelState!.pending_action as PendingAction : null));`,
`  // Precedence (governance/OPERATING_TRUTH_MODEL.md §2, tier 3 over tier 4): the durable,
  // TTL-guarded, fully-typed channel-state row outranks the previous turn's stored output
  // text; the stored output is the fallback, the legacy shape the last resort.
  const pendingAction: PendingAction | null = (durablePendingActionValid ? durableChannelState!.pending_action as PendingAction : null)
    ?? lastTurnOutput?.pendingAction
    ?? (legacyPendingConfirmation && typeof legacyPendingConfirmation === 'object'
      ? { kind: 'bulk_confirmation', summary: legacyPendingConfirmation.summary, action: legacyPendingConfirmation.action }
      : null);`, 'R7');

// ---- R8: collections envelope + pack keys ------------------------------------------------
rep(`  const pack = { continuity, companies:packCompanies, projects:projects.data||[], tasks:mergedTasksData, memories:packMemories,`,
`  // CollectionEnvelope per pack collection (governance/OPERATING_TRUTH_MODEL.md §4.3):
  // shown = what this pack carries, total = the query's own exact count, truncated =
  // total > shown. null total means the source has no authoritative count (semantic
  // top-K, nested factory summary) and is labelled as such — never presented as complete.
  const envelope = (res: any, shownOverride?: number, scope?: string) => {
    const shown = typeof shownOverride === 'number' ? shownOverride : (res?.data || []).length;
    const total = typeof res?.count === 'number' ? res.count : null;
    return { shown, total, truncated: total === null ? null : total > shown, ...(scope ? { scope } : {}) };
  };
  const collections = {
    companies: envelope(companies, packCompanies.length, 'active (non-archived), newest first, plus any company named in this command'),
    archivedCompanies: envelope(archivedCompanies, undefined, 'archived, newest first'),
    projects: envelope(projects), tasks: envelope(tasks, mergedTasksData.length, 'in-flight statuses, plus any task named in this command'),
    memories: { shown: packMemories.length, total: null, truncated: null, scope: 'top-8 semantic retrieval' },
    agents: envelope(agents, undefined, 'active'), products: envelope(products, undefined, 'active'), inventory: envelope(inventory), approvals: envelope(approvals, undefined, 'pending'),
    people: envelope(people, packPeople.length, 'plus any person named in this command'), goals: envelope(goals, mergedGoalsData.length, 'plus any goal named in this command'),
    companyRelationships: envelope(companyRelationships), personAssignments: envelope(personAssignments), financialReports: envelope(financialReports, undefined, 'newest first'),
    conversationHistory: { shown: (conversationRowsChronological || []).length, total: totalPriorTurns, truncated: totalPriorTurns > (conversationRowsChronological || []).length, scope: 'newest turns in this channel' },
    factoryWorkOrders: { shown: factoryWorkOrders.length, total: null, truncated: null, scope: 'newest 10' },
    channels: envelope(channels, undefined, 'not archived'), departments: envelope(departments), leads: envelope(leads), documents: envelope(documents), proposals: envelope(proposals),
    productSpecs: envelope(productSpecs), engineeringDrawings: envelope(engineeringDrawings), aiProviders: envelope(aiProviders), mcpConnectors: envelope(mcpConnectors),
    archivedTasks: envelope(archivedTasks, undefined, 'archived, newest first'),
  };
  const pack = { continuity, companies:packCompanies, archivedCompanies:archivedCompanies.data||[], projects:projects.data||[], tasks:mergedTasksData, memories:packMemories,`, 'R8a');
rep(`recentlyResolvedEntities, recentlyDeletedEntities, counts, currentTurn: { turn: totalPriorTurns + 1, command } };`,
    `recentlyResolvedEntities, recentlyDeletedEntities, counts, collections, currentTurn: { turn: totalPriorTurns + 1, command } };`, 'R8b');
rep(`errors:[companies.error,namedCompanyLookup.error,projects.error,`, `errors:[companies.error,namedCompanyLookup.error,archivedCompanies.error,projects.error,`, 'R8c');
rep(`    archivedTasks: envelope(archivedTasks, undefined, 'archived, newest first'),
  };
  const pack = `, `    archivedTasks: envelope(archivedTasks, undefined, 'archived, newest first'),
  };
  // Backstop: every array in the pack literal below must have an envelope here
  // (qa/scenarios-runner/architecture_collection_envelope_contract.mjs pins this statically).
  const pack = `, 'R8d');

// ---- R9: context ids include the archived window ----------------------------------------
rep(`        const contextCompanyIds = new Set((contextPack?.companies || []).map((c: any) => c.id));`,
    `        const contextCompanyIds = new Set([...(contextPack?.companies || []), ...(contextPack?.archivedCompanies || [])].map((c: any) => c.id));`, 'R9a');
rep(`        const archivedCompanyIds = new Set((contextPack?.companies || []).filter((c: any) => c.status === 'archived').map((c: any) => c.id));`,
    `        const archivedCompanyIds = new Set([...(contextPack?.companies || []), ...(contextPack?.archivedCompanies || [])].filter((c: any) => c.status === 'archived').map((c: any) => c.id));`, 'R9b');
rep(`for (const [bucket, type] of [['companies', 'company'], ['people', 'person'],`,
    `for (const [bucket, type] of [['companies', 'company'], ['archivedCompanies', 'company'], ['people', 'person'],`, 'R9c');

// ---- R10: ExecutionResultEnvelope -------------------------------------------------------
rep(`        const claimExecutionEvidence: Array<{ resourceType: string; action: string; id: string; postconditionPassed: boolean }> = [];
        const recordExecution = (resourceType: string, action: string, id: unknown, postconditionPassed: boolean) => {
          if (typeof id === 'string' && id.length > 0) claimExecutionEvidence.push({ resourceType, action, id, postconditionPassed });
        };`,
`        // ExecutionResultEnvelope (governance/OPERATING_TRUTH_MODEL.md §4.1; mirrored in
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
        const recordExecution = (resourceType: string, action: string, id: unknown, postconditionPassed: boolean, detail?: ExecutionDetail) => {
          if (typeof id === 'string' && id.length > 0) claimExecutionEvidence.push({
            resourceType, action, id, postconditionPassed,
            request_id: null, channel_id: channelId, turn: executionTurn, action_type: action, entity_type: resourceType, canonical_entity_ids: [id],
            requested_values: detail?.requestedValues ?? null, executed: detail?.executed ?? true, rows_affected: detail?.rowsAffected ?? (postconditionPassed ? 1 : null),
            backend_result: detail?.backendResult ?? null, precondition: detail?.precondition ?? null, postcondition: detail?.postcondition ?? null,
            postcondition_verified: postconditionPassed, error: detail?.error ?? null, timestamp: new Date().toISOString(),
          });
        };`, 'R10');

// ---- R11: company lifecycle — server-side target resolution ------------------------------
rep(`        const requestedArchiveIds = Array.isArray(result.archiveCompanyIds) ? result.archiveCompanyIds as unknown[] : [];
        const archiveCompanyIds = [...new Set(requestedArchiveIds.filter((id): id is string => typeof id === 'string' && contextCompanyIds.has(id)))];
        const requestedRestoreIds = Array.isArray(result.restoreCompanyIds) ? result.restoreCompanyIds as unknown[] : [];
        const restoreCompanyIds = [...new Set(requestedRestoreIds.filter((id): id is string => typeof id === 'string' && contextCompanyIds.has(id)))];
        const companyNameById = new Map((contextPack?.companies || []).map((c: any) => [c.id, c.name]));`,
`        // CompanyLifecycle target resolution (governance/CANONICAL_WORK_CONTRACT.md §1-§2).
        // Targets resolve SERVER-SIDE under the caller's own RLS across every status — never
        // by membership in the capped context window. BUG-014 (Work-PC, 2026-09-07): a known
        // archived company outside the 12-row window was silently dropped by the old
        // contextCompanyIds filter, zero RPC calls ran, and the model's own "restored."
        // shipped. Sources, in order: ids the model emitted (re-read, any status), names the
        // model emitted (restoreCompanyNames / archiveCompanyNames), and — when the command
        // itself carries the lifecycle verb but the model resolved nothing — the name in the
        // command. One hit executes; several hits ask; zero hits say so. Every branch leaves
        // a line, so a lifecycle-intent turn can never end silent.
        const COMPANY_UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        const companyNameById = new Map([...(contextPack?.companies || []), ...(contextPack?.archivedCompanies || [])].map((c: any) => [c.id, c.name]));
        const lifecycleUnresolvedLines: string[] = [];
        const lifecycleDisambiguation: Array<{ action: 'archive' | 'restore'; name: string; options: Array<{ id: string; name: string; status: string }> }> = [];
        const commandMentionsCompany = /\\b(compan(?:y|ies)|business unit|subsidiar(?:y|ies)|holding|entity|org(?:anization)?s?|brand|department)\\b/i.test(String(command || ''));
        const resolveCompanyLifecycleTargets = async (action: 'archive' | 'restore', rawIds: unknown, rawNames: unknown, commandName: string | null): Promise<string[]> => {
          const ids = [...new Set((Array.isArray(rawIds) ? rawIds : []).filter((x): x is string => typeof x === 'string' && COMPANY_UUID_RE.test(x)))];
          const names = [...new Set((Array.isArray(rawNames) ? rawNames : []).filter((x): x is string => typeof x === 'string' && x.trim().length > 0).map((x) => x.trim().slice(0, 120)))];
          const resolved = new Set<string>();
          if (ids.length > 0) {
            const { data } = await supabase.from('companies').select('id,name,status').in('id', ids);
            for (const c of (data || []) as Array<{ id: string; name: string }>) { resolved.add(String(c.id)); companyNameById.set(String(c.id), String(c.name)); }
            for (const id of ids) if (!resolved.has(id)) lifecycleUnresolvedLines.push(\`\${companyNameById.get(id) || 'That company'}: could not be found (searched the active and archived companies you can access) — nothing was \${action === 'restore' ? 'restored' : 'archived'}.\`);
          }
          const fromCommand = names.length === 0 && resolved.size === 0 && commandName ? [commandName] : [];
          for (const name of [...names, ...fromCommand]) {
            const wantStatus = action === 'restore' ? 'archived' : 'active';
            const { data: exact } = await supabase.from('companies').select('id,name,status').ilike('name', name.replace(/[%_,()]/g, ' ').trim()).limit(10);
            let rows = (exact || []) as Array<{ id: string; name: string; status: string }>;
            if (rows.length === 0) {
              const tokens = name.split(/\\s+/).filter((t) => t.length >= 2).slice(0, 6);
              if (tokens.length > 0) {
                let qb: any = supabase.from('companies').select('id,name,status');
                for (const t of tokens) qb = qb.ilike('name', \`%\${t.replace(/[%_,()]/g, ' ')}%\`);
                const { data: fuzzy } = await qb.limit(10);
                rows = (fuzzy || []) as typeof rows;
              }
            }
            const preferred = rows.filter((r) => r.status === wantStatus);
            const pick = preferred.length > 0 ? preferred : rows;
            const isCommandGuess = fromCommand.includes(name);
            if (pick.length === 1) { resolved.add(pick[0].id); companyNameById.set(pick[0].id, pick[0].name); }
            else if (pick.length === 0) { if (!isCommandGuess || commandMentionsCompany) lifecycleUnresolvedLines.push(\`\${name}: no company by that name (searched the active and archived companies you can access) — nothing was \${action === 'restore' ? 'restored' : 'archived'}.\`); }
            else { lifecycleDisambiguation.push({ action, name, options: pick.map((r) => ({ id: r.id, name: r.name, status: r.status })) }); for (const r of pick) companyNameById.set(r.id, r.name); }
          }
          return [...resolved];
        };
        const lifecycleCommandName = (pattern: RegExp): string | null => {
          const text = String(command || '');
          const m = text.match(pattern);
          if (!m) return null;
          const after = text.slice((m.index ?? 0) + m[0].length)
            .replace(/^\\s*(?:the|this|that|our|my)\\s+/i, '')
            .replace(/^\\s*(?:company|business unit|entity|organization|org)\\s+/i, '')
            .trim();
          const name = after.split(/[.,;!?\\n]|\\s+(?:and|then|please|now|again|from|to|so|because)\\s+/i)[0]
            .replace(/^["'“”‘’]+|["'“”‘’]+$/g, '')
            .replace(/\\s+(?:company|business unit|entity)$/i, '')
            .trim();
          return name.length >= 2 && name.length <= 80 && !/^(it|them|that|this|those|these|him|her)$/i.test(name) ? name : null;
        };
        const archiveCompanyIds = await resolveCompanyLifecycleTargets('archive', result.archiveCompanyIds, result.archiveCompanyNames,
          ARCHIVE_VERB_PATTERN.test(String(command || '')) && !RESTORE_VERB_PATTERN.test(String(command || '')) ? lifecycleCommandName(ARCHIVE_VERB_PATTERN) : null);
        const restoreCompanyIds = await resolveCompanyLifecycleTargets('restore', result.restoreCompanyIds, result.restoreCompanyNames,
          RESTORE_VERB_PATTERN.test(String(command || '')) ? lifecycleCommandName(RESTORE_VERB_PATTERN) : null);`, 'R11');

// ---- R12: archive/restore loops record failed / non-executed envelopes too --------------
rep(`          if (error || !data) { archiveRestoreLines.push(\`\${name}: archive failed (\${error?.message || 'no result'}).\`); continue; }
          const r = data as Record<string, unknown>;`,
`          if (error || !data) { recordExecution('company', 'archive', id, false, { executed: false, error: error?.message || 'no result', requestedValues: { status: 'archived' } }); archiveRestoreLines.push(\`\${name}: archive failed (\${error?.message || 'no result'}).\`); continue; }
          const r = data as Record<string, unknown>;`, 'R12a');
rep(`          if (r.changed === true && r.postconditionPassed !== true) {
            archiveRestoreLines.push(\`\${name}: archive attempted, but the persisted status did not confirm it afterward — treat as not archived.\`);
            continue;
          }`,
`          if (r.changed === true && r.postconditionPassed !== true) {
            recordExecution('company', 'archive', id, false, { executed: true, backendResult: r, error: 'postcondition_not_confirmed', requestedValues: { status: 'archived' } });
            archiveRestoreLines.push(\`\${name}: archive attempted, but the persisted status did not confirm it afterward — treat as not archived.\`);
            continue;
          }`, 'R12b');
rep(`          if (r.changed === true && r.postconditionPassed === true) recordExecution('company', 'archive', id, true);
          archiveRestoreLines.push(\`\${name}: \${reasonText[String(r.reason)] || String(r.reason)}.\`);`,
`          if (r.changed === true && r.postconditionPassed === true) recordExecution('company', 'archive', id, true, { backendResult: r, precondition: { status: r.previousStatus }, postcondition: { status: r.newStatus }, requestedValues: { status: 'archived' } });
          else recordExecution('company', 'archive', id, false, { executed: false, backendResult: r, error: String(r.reason), requestedValues: { status: 'archived' } });
          archiveRestoreLines.push(\`\${name}: \${reasonText[String(r.reason)] || String(r.reason)}.\`);`, 'R12c');
rep(`          if (error || !data) { archiveRestoreLines.push(\`\${name}: restore failed (\${error?.message || 'no result'}).\`); continue; }
          const r = data as Record<string, unknown>;`,
`          if (error || !data) { recordExecution('company', 'restore', id, false, { executed: false, error: error?.message || 'no result', requestedValues: { status: 'active' } }); archiveRestoreLines.push(\`\${name}: restore failed (\${error?.message || 'no result'}).\`); continue; }
          const r = data as Record<string, unknown>;`, 'R12d');
rep(`          if (r.changed === true && r.postconditionPassed !== true) {
            archiveRestoreLines.push(\`\${name}: restore attempted, but the persisted status did not confirm it afterward — treat as not restored.\`);
            continue;
          }`,
`          if (r.changed === true && r.postconditionPassed !== true) {
            recordExecution('company', 'restore', id, false, { executed: true, backendResult: r, error: 'postcondition_not_confirmed', requestedValues: { status: 'active' } });
            archiveRestoreLines.push(\`\${name}: restore attempted, but the persisted status did not confirm it afterward — treat as not restored.\`);
            continue;
          }`, 'R12e');
rep(`          if (r.changed === true && r.postconditionPassed === true) recordExecution('company', 'restore', id, true);
          archiveRestoreLines.push(\`\${name}: \${reasonText[String(r.reason)] || String(r.reason)}.\`);
        }`,
`          if (r.changed === true && r.postconditionPassed === true) recordExecution('company', 'restore', id, true, { backendResult: r, precondition: { status: r.previousStatus }, postcondition: { status: r.newStatus }, requestedValues: { status: 'active' } });
          else recordExecution('company', 'restore', id, false, { executed: false, backendResult: r, error: String(r.reason), requestedValues: { status: 'active' } });
          archiveRestoreLines.push(\`\${name}: \${reasonText[String(r.reason)] || String(r.reason)}.\`);
        }
        // Several companies matched a name: ask, never guess — and say so in the report.
        if (lifecycleDisambiguation.length > 0 && !result.pendingAction) {
          const d = lifecycleDisambiguation[0];
          result.pendingAction = {
            kind: 'disambiguation',
            question: \`Which company should I \${d.action}? \` + d.options.map((o, i) => \`\${i + 1}. \${o.name} (\${o.status})\`).join('  '),
            options: d.options.map((o) => ({ id: o.id, label: \`\${o.name} (\${o.status})\`, entityType: 'company', actionType: \`\${d.action}_company\` })),
          } as PendingAction;
          archiveRestoreLines.push(\`\${d.name}: more than one company matches — please pick one.\`);
        }
        for (const line of lifecycleUnresolvedLines) archiveRestoreLines.push(line);`, 'R12f');

// ---- R13: create family — fresh postcondition, never a literal -------------------------
rep(`        for (const t of createdTasks) recordExecution('task', 'create', (t || {}).id, true);
        for (const a of createdApprovals) recordExecution('approval', 'create', (a || {}).id, true);
        for (const c of createdCompanies) recordExecution('company', 'create', (c || {}).id, true);
        for (const pp of createdPeople) recordExecution('person', 'create', (pp || {}).id, true);
        for (const pr of createdProjects) recordExecution('project', 'create', (pr || {}).id, true);
        for (const g of createdGoals) recordExecution('goal', 'create', (g || {}).id, true);
        for (const id of deletedTaskIds) recordExecution('task', 'delete', id, true);
        for (const cr of createdCompanyRelationships) recordExecution('company_relationship', 'create', (cr || {}).id, true);
        for (const pa of createdPersonAssignments) recordExecution('person_assignment', 'create', (pa || {}).id, true);
        for (const m of createdMemories) recordExecution('memory', 'create', (m || {}).id, true);`,
`        // Fresh postcondition for the create family (governance/OPERATING_TRUTH_MODEL.md
        // §4.1): the ids the RPC returned are re-read under the caller's own RLS after the
        // transaction committed. An id the re-read cannot see is recorded as executed but
        // NOT verified — it can never support a success claim. A deleted task's postcondition
        // is the inverse: the row must no longer be readable.
        const verifyRowsExist = async (table: string, ids: unknown[]): Promise<Set<string>> => {
          const wanted = ids.filter((x): x is string => typeof x === 'string' && x.length > 0);
          if (wanted.length === 0) return new Set<string>();
          try {
            const { data } = await supabase.from(table).select('id').in('id', wanted);
            return new Set<string>(((data || []) as Array<{ id: unknown }>).map((r) => String(r.id)));
          } catch { return new Set<string>(); }
        };
        const idOf = (row: unknown): unknown => (row && typeof row === 'object' ? (row as { id?: unknown }).id : undefined);
        const [tasksSeen, approvalsSeen, companiesSeen, peopleSeen, projectsSeen, goalsSeen, relationshipsSeen, assignmentsSeen, memoriesSeen, deletedTasksStillPresent] = await Promise.all([
          verifyRowsExist('tasks', createdTasks.map(idOf)), verifyRowsExist('approvals', createdApprovals.map(idOf)),
          verifyRowsExist('companies', createdCompanies.map(idOf)), verifyRowsExist('people', createdPeople.map(idOf)),
          verifyRowsExist('projects', createdProjects.map(idOf)), verifyRowsExist('goals', createdGoals.map(idOf)),
          verifyRowsExist('company_relationships', createdCompanyRelationships.map(idOf)), verifyRowsExist('person_assignments', createdPersonAssignments.map(idOf)),
          verifyRowsExist('memories', createdMemories.map(idOf)), verifyRowsExist('tasks', deletedTaskIds),
        ]);
        const recordCreate = (resourceType: string, rows: unknown[], seen: Set<string>) => {
          for (const row of rows) { const id = idOf(row); const ok = typeof id === 'string' && seen.has(id); recordExecution(resourceType, 'create', id, ok, { postcondition: { exists: ok }, rowsAffected: ok ? 1 : 0 }); }
        };
        recordCreate('task', createdTasks, tasksSeen);
        recordCreate('approval', createdApprovals, approvalsSeen);
        recordCreate('company', createdCompanies, companiesSeen);
        recordCreate('person', createdPeople, peopleSeen);
        recordCreate('project', createdProjects, projectsSeen);
        recordCreate('goal', createdGoals, goalsSeen);
        for (const id of deletedTaskIds) { const gone = typeof id === 'string' && !deletedTasksStillPresent.has(id); recordExecution('task', 'delete', id, gone, { postcondition: { exists: !gone }, rowsAffected: gone ? 1 : 0 }); }
        recordCreate('company_relationship', createdCompanyRelationships, relationshipsSeen);
        recordCreate('person_assignment', createdPersonAssignments, assignmentsSeen);
        recordCreate('memory', createdMemories, memoriesSeen);`, 'R13');

// ---- R14: person assignment receipt — manager vs company from the diff ------------------
rep(`          ? reassignmentEntries.map((a) => {
              const personName = personNameById.get(a.personId as string) || a.personId;
              const legalName = a.legalEmployerCompanyId ? (companyNameById.get(a.legalEmployerCompanyId) || a.legalEmployerCompanyId) : null;
              const operatingName = a.operatingCompanyId ? (companyNameById.get(a.operatingCompanyId) || a.operatingCompanyId) : null;
              if (legalName && operatingName && legalName !== operatingName) {
                return \`**\${personName} reassigned.** Legal employer: \${legalName}. Operating company: \${operatingName}.\`;
              }
              if (legalName && operatingName) return \`**\${personName} reassigned to \${operatingName}** (legal employer and operating company).\`;
              return \`**\${personName} reassigned to \${operatingName || legalName || 'the specified company'}.**\`;
            }).join(' ')
          : null;`,
`          ? reassignmentEntries.map((a) => {
              // MutationReceipt (governance/OPERATING_TRUTH_MODEL.md §4.2): rendered from the
              // requested-vs-current DIFF, never from the request shape alone. BUG-012
              // (Work-PC, 2026-09-07): a manager change was receipted as a company move
              // because this renderer only ever looked at the company ids.
              const personName = personNameById.get(a.personId as string) || a.personId;
              const current = ((contextPack?.personAssignments || []) as Array<Record<string, unknown>>)
                .find((pa) => pa.person_id === a.personId && pa.state === 'current') || null;
              const legalName = a.legalEmployerCompanyId ? (companyNameById.get(a.legalEmployerCompanyId) || a.legalEmployerCompanyId) : null;
              const operatingName = a.operatingCompanyId ? (companyNameById.get(a.operatingCompanyId) || a.operatingCompanyId) : null;
              const newManagerId = typeof a.managerPersonId === 'string' && a.managerPersonId.length > 0 ? a.managerPersonId : null;
              const managerChanged = newManagerId !== null && (!current || current.manager_person_id !== newManagerId);
              const companyChanged = !current
                || (!!a.legalEmployerCompanyId && current.legal_employer_company_id !== a.legalEmployerCompanyId)
                || (!!a.operatingCompanyId && current.operating_company_id !== a.operatingCompanyId);
              const parts: string[] = [];
              if (managerChanged) {
                const newManager = personNameById.get(newManagerId as string) || newManagerId;
                const oldManager = current && typeof current.manager_person_id === 'string' ? (personNameById.get(current.manager_person_id) || 'a previous manager') : null;
                parts.push(\`**\${personName}'s manager set to \${newManager}**\${oldManager ? \` (was \${oldManager})\` : ''}.\`);
              }
              if (companyChanged) {
                if (legalName && operatingName && legalName !== operatingName) parts.push(\`**\${personName} reassigned.** Legal employer: \${legalName}. Operating company: \${operatingName}.\`);
                else if (legalName && operatingName) parts.push(\`**\${personName} reassigned to \${operatingName}** (legal employer and operating company).\`);
                else parts.push(\`**\${personName} reassigned to \${operatingName || legalName || 'the specified company'}.**\`);
              }
              if (parts.length === 0) parts.push(\`**\${personName}: assignment re-saved — company and manager unchanged.**\`);
              return parts.join(' ');
            }).join(' ')
          : null;`, 'R14');

// ---- R15: MutationIntent from the REQUEST -----------------------------------------------
rep(`        const rawClaims = Array.isArray(result.claims) ? result.claims : null;
        const verifiedClaims = [];
        const rejectedClaims = [];`,
`        const rawClaims = Array.isArray(result.claims) ? result.claims : null;
        const verifiedClaims = [];
        const rejectedClaims = [];
        // MutationIntent from the REQUEST (governance/OPERATING_TRUTH_MODEL.md §3 rule 3;
        // CANONICAL_WORK_CONTRACT.md §1 INTENT). Detected from the founder's command and from
        // the structured action fields the model emitted — never from the response text, its
        // tense, its shape or its punctuation. It drives the never-silent receipt below: a
        // mutation-intent turn cannot end with the model's own prose as the final answer.
        const MUTATION_INTENT_ALWAYS = /^\\s*(?:please\\s+|pls\\s+|can you\\s+|could you\\s+|would you\\s+|now\\s+|ok\\s+|okay\\s+)?(archive|un-?archive|restore|delete|remove|rename|retitle|reassign|unassign|approve|reject|decline|activate|deactivate|invite|revoke|enable|disable|promote|demote|transfer|move)\\b/i;
        const MUTATION_INTENT_WITH_ENTITY = /^\\s*(?:please\\s+|pls\\s+|can you\\s+|could you\\s+|would you\\s+|now\\s+|ok\\s+|okay\\s+)?(assign|set|make|create|add|end|update|change|hire|onboard)\\b/i;
        const MUTATION_ENTITY_NOUN = /\\b(compan(?:y|ies)|business unit|person|people|employee|manager|task|goal|project|department|lead|document|proposal|product|approval|channel|provider|connector|drawing|spec|assignment|employment|relationship|memory)\\b/i;
        const MUTATION_ARRAY_FIELDS = ['tasks','deleteTaskIds','archiveTaskIds','restoreTaskIds','deleteChannelIds','deleteApprovalIds','pendingDeleteTaskIds','pendingDeleteChannelIds','createCompanies','updateCompanies','archiveCompanyIds','restoreCompanyIds','archiveCompanyNames','restoreCompanyNames','permanentDeleteFixtureCompanyIds','createPeople','endEmploymentPersonIds','restoreEmploymentPersonIds','createProjects','createGoals','archiveGoalIds','restoreGoalIds','createFactoryWorkOrders','createDepartments','updateDepartments','createLeads','updateLeads','createDocuments','createProductLines','updateProductLines','deleteProductLineIds','createProductSpecs','updateProductSpecs','deleteProductSpecIds','createEngineeringDrawings','deleteEngineeringDrawingIds','createAiProviders','deleteAiProviderIds','deleteMcpConnectorIds','createProposals','updateProposals','deleteProposalIds','createCompanyRelationships','createPersonAssignments'];
        const commandText = String(command || '');
        const intentVerb: string | null = ((commandText.match(MUTATION_INTENT_ALWAYS) || [])[1]
          || (MUTATION_ENTITY_NOUN.test(commandText) ? (commandText.match(MUTATION_INTENT_WITH_ENTITY) || [])[1] : null) || null);
        const modelMutationField: string | null = MUTATION_ARRAY_FIELDS.find((f) => Array.isArray((result as Record<string, unknown>)[f]) && ((result as Record<string, unknown>)[f] as unknown[]).length > 0)
          || (typeof (result as Record<string, unknown>).activateAiProviderId === 'string' ? 'activateAiProviderId' : null);
        const requestedIntent: { verb: string | null; field: string | null } | null = (intentVerb || modelMutationField)
          ? { verb: intentVerb ? intentVerb.toLowerCase() : null, field: modelMutationField }
          : null;
        const executedVerifiedCount = claimExecutionEvidence.filter((e) => e.postconditionPassed).length;`, 'R15');

// ---- R16: belt consumers — the belt is defence-in-depth behind request intent ----------
rep(`          && !groundedOutcomeThisTurn && !claimsFutureActionWithNoPlan
          && !result.pendingAction && readsAsCompletion(String(result.summary || ''));`,
`          && !groundedOutcomeThisTurn && !claimsFutureActionWithNoPlan
          // Founder correction 2026-09-07 (governance/OPERATING_TRUTH_MODEL.md §3 rule 2):
          // the pendingAction skip does not survive on v92-parity grounds, and the belt
          // is never the sole reason a reply is rewritten — request intent comes first.
          && requestedIntent !== null && readsAsCompletion(String(result.summary || ''));`, 'R16a');
rep(`        const unaccountedCompletionProse = !hasSupportedMutationClaim
          && !result.pendingAction && readsAsCompletion(String(result.summary || ''));`,
`        const unaccountedCompletionProse = !hasSupportedMutationClaim
          && requestedIntent !== null && readsAsCompletion(String(result.summary || ''));`, 'R16b');

// ---- R17: never-silent receipt + turn verdict ------------------------------------------
rep(`        result.verifiedResponse = {
          verifiedClaims,
          rejectedClaims,`,
`        // NEVER-SILENT RECEIPT (governance/OPERATING_TRUTH_MODEL.md §3 rule 3, §4.2). A
        // mutation-intent turn with no verified execution and no lifecycle report ends with a
        // deterministic receipt rendered from the ledger and the request — never with the
        // model's own prose, whatever its tense, its shape, or its trailing question.
        // BUG-002 / BUG-010 (Work-PC, 2026-09-07): "Done. Project renamed to X. What next?"
        // with an unchanged row is exactly this branch.
        const receiptExempt = model === 'deterministic-confirmation' || model === 'deterministic-plan-execution'
          || model === 'deterministic-clarification' || model === 'deterministic-disambiguation' || !!organizationGraphCheck;
        let receiptRendered = false;
        if (requestedIntent !== null && executedVerifiedCount === 0 && lifecycleReports.length === 0 && !receiptExempt) {
          const pa = result.pendingAction && typeof result.pendingAction === 'object' ? result.pendingAction as Record<string, unknown> : null;
          const pendingQuestion = pa ? String(pa.question || pa.summary || '').trim() : '';
          const failed = claimExecutionEvidence.find((e) => e.error) || null;
          const attempted = claimExecutionEvidence.length > 0;
          const verb = requestedIntent.verb;
          const UNSUPPORTED_FROM_CHAT: Record<string, string> = {
            approve: 'deciding an approval from chat is not available yet — use the Approvals page',
            reject: 'deciding an approval from chat is not available yet — use the Approvals page',
            decline: 'deciding an approval from chat is not available yet — use the Approvals page',
            invite: 'inviting someone from chat is not available yet — use the People page',
          };
          const reason = pendingQuestion ? 'I need your answer first'
            : failed ? \`the operation did not succeed (\${failed.error})\`
            : attempted ? 'the operation did not confirm in the database'
            : (verb && UNSUPPORTED_FROM_CHAT[verb]) ? UNSUPPORTED_FROM_CHAT[verb]
            : (verb === 'restore' || verb === 'unarchive' || verb === 'un-archive' || verb === 'archive') ? 'I could not resolve which company you meant (searched the active and archived companies you can access)'
            : (verb === 'rename' || verb === 'retitle') ? 'I could not execute that rename from here — nothing was renamed'
            : 'that request did not resolve to an operation I can execute from chat';
          result.summary = [...factLines, \`No change was made — \${reason}.\`, pendingQuestion].filter(Boolean).join(' ');
          receiptRendered = true;
        }
        for (const e of claimExecutionEvidence) if (!e.request_id) e.request_id = workOrder.id;
        result.turnVerdict = {
          executedOperationCount: executedVerifiedCount,
          attemptedOperationCount: claimExecutionEvidence.length,
          rejectedClaimCount: rejectedClaims.length,
          mutationIntent: requestedIntent,
          receiptRendered,
        };
        result.verifiedResponse = {
          verifiedClaims,
          rejectedClaims,`, 'R17');

// ---- R18: persist every turn ------------------------------------------------------------
repRe(/        if \(groundedOutcomeThisTurn \|\| lifecycleMismatchCorrections\.length > 0 \|\| model === 'deterministic-confirmation' \|\| claimsFutureActionWithNoPlan \|\| claimsPastCompletionWithNoGrounding \|\| pendingActionGatingChanged\) \{\n          await supabase\.from\('work_orders'\)\.update\(\{ output: result \}\)\.eq\('id', workOrder\.id\);\n        \}\n/,
`        // Operating Truth Model §3 rule 6: the verified envelope, the execution ledger and
        // the turn verdict are persisted on EVERY turn (an empty ledger included), so the
        // next turn's narrative tier and any reload read the verified output, never the
        // RPC's pre-verification p_output snapshot. The old gate (persist only when a
        // correction fired) is what let uncorrected fabrications re-enter history as fact.
        void groundedOutcomeThisTurn; void lifecycleMismatchCorrections; void claimsFutureActionWithNoPlan; void claimsPastCompletionWithNoGrounding; void pendingActionGatingChanged;
        await supabase.from('work_orders').update({ output: result }).eq('id', workOrder.id);
`, 'R18');

// ---- write back --------------------------------------------------------------------------
const out = s.replace(/\n/g, '\r\n');
const bare = (out.match(/(^|[^\r])\n/g) || []).length;
if (bare !== 0) throw new Error('bare LF introduced: ' + bare);
writeFileSync(path, out);
console.log(`applied ${applied} replacements; ${out.split('\r\n').length} lines`);
