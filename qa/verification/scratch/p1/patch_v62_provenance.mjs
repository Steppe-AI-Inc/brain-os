// VERIFIER #62 FINDINGS V62-D1 and V62-D1b (both P1). The trim removed the very rows the executor's
// id-provenance gates are built from.
//
// Every non-lifecycle mutation checks the model's ids against `new Set((contextPack?.X || []).map(r => r.id))`
// — that is what stops the model inventing an id. Those arrays are trimmable to zero, so a deep trim
// silently dropped the founder's own target for rename, every create family's company binding, person
// assignments, employment changes and every delete family. Reachable in production by a pasted command of
// ~12,000 characters. Worse, V62-D1b: a DURABLE multi_action_plan was validated against the same trimmable
// arrays and then answered "one or more of its stored targets no longer resolves to a real record" — a
// falsehood about canonical state, which is the exact class of BUG-010.
//
// The fix keeps the PROVENANCE without keeping the ROWS. When the trim drops rows it now records their ids
// on that collection's envelope as `droppedIds`. A company row costs ~150 characters; its id costs 39, so a
// collection trimmed to zero still proves which ids were real for a fraction of the bytes — and "truncation
// never becomes non-existence" (OTM §4.4) becomes true for the SERVER as well as for the model, which is
// where V61-D2's namedTargets stopped short: it protected the model's view and no server-side gate read it.
import { readFileSync, writeFileSync } from 'node:fs';
const p = process.argv[2] || 'supabase/functions/sem-ai-command/index.ts';
let s = readFileSync(p, 'utf8').replace(/\r\n/g, '\n');
let n = 0;
function must(a, b, label) { const c = s.split(a).length - 1; if (c !== 1) throw new Error(label + ': found ' + c); s = s.replace(a, () => b); n++; }

// ---- 1. the trim records the ids it drops, on the envelope, capped.
const RECORD_DROPPED = `      const dropped = keepNewest ? arr.slice(0, arr.length - KEEP) : arr.slice(KEEP);
      const droppedIdList = dropped
        .map((r) => (r && typeof r === 'object' ? (r as Record<string, unknown>).id : null))
        .filter((id): id is string => typeof id === 'string' && id.length > 0);
`;
const MERGE_DROPPED = `      if (ENV && droppedIdList.length > 0) {
        const prior = Array.isArray((ENV as Record<string, unknown>).droppedIds) ? (ENV as Record<string, unknown>).droppedIds as string[] : [];
        const merged = [...new Set([...prior, ...droppedIdList])];
        // Bounded: 250 ids is far more than any window holds, and it keeps a pathological pack from
        // trading row bytes for id bytes one-for-one.
        (ENV as Record<string, unknown>).droppedIds = merged.slice(0, 250);
      }
`;

must(`    packRecord[key] = keepNewest ? arr.slice(arr.length - keep) : arr.slice(0, keep);
    const env = collectionsRecord[key];
    if (env) { env.shown = keep; env.truncated = env.total === null ? null : env.total > keep; }
    contextTrimmed.push(\`\${key} \${arr.length}->\${keep}\`);`,
`${RECORD_DROPPED.replace(/KEEP/g, 'keep')}    packRecord[key] = keepNewest ? arr.slice(arr.length - keep) : arr.slice(0, keep);
    const env = collectionsRecord[key];
    // A collection whose count was never exact (total: null) still must not read as "there are none":
    // what we know for certain is that at least this many rows existed before the trim (V62-D4).
    if (env) {
      env.shown = keep;
      if (env.total === null) env.total = arr.length;
      env.truncated = env.total === null ? null : env.total > keep;
    }
${MERGE_DROPPED.replace(/ENV/g, 'env')}    contextTrimmed.push(\`\${key} \${arr.length}->\${keep}\`);`, 'first pass dropped ids');

must(`      packRecord[key] = keepNewest ? arr.slice(arr.length - thisFloor) : arr.slice(0, thisFloor);
      const envHard = collectionsRecord[key];
      if (envHard) { envHard.shown = thisFloor; envHard.truncated = envHard.total === null ? null : envHard.total > thisFloor; }
      contextTrimmed.push(\`\${key} \${arr.length}->\${thisFloor}\`);`,
`${RECORD_DROPPED.replace(/KEEP/g, 'thisFloor').replace(/^ {6}/gm, '      ')}      packRecord[key] = keepNewest ? arr.slice(arr.length - thisFloor) : arr.slice(0, thisFloor);
      const envHard = collectionsRecord[key];
      if (envHard) {
        envHard.shown = thisFloor;
        if (envHard.total === null) envHard.total = arr.length;
        envHard.truncated = envHard.total === null ? null : envHard.total > thisFloor;
      }
${MERGE_DROPPED.replace(/ENV/g, 'envHard').replace(/^ {6}/gm, '      ')}      contextTrimmed.push(\`\${key} \${arr.length}->\${thisFloor}\`);`, 'hard pass dropped ids');

// ---- 2. one helper the executor uses everywhere, instead of reading the trimmed array directly.
must(`        const contextTaskIds = new Set((contextPack?.tasks || []).map((t: any) => t.id));`,
`        // ID PROVENANCE AFTER A TRIM (verifier #62, V62-D1). The rows may be gone; the ids are not. Every
        // gate below is built from the surviving rows PLUS the ids the budget dropped PLUS the rows the
        // targeted lookups resolved from this turn's command, so trimming can never turn the founder's own
        // target into an id the executor refuses to act on.
        const packIdSet = (...names: string[]): Set<string> => {
          const out = new Set<string>();
          for (const name of names) {
            for (const row of ((contextPack as any)?.[name] || [])) {
              if (row && typeof row.id === 'string') out.add(row.id);
            }
            const env = (contextPack as any)?.collections?.[name];
            if (env && Array.isArray(env.droppedIds)) for (const id of env.droppedIds) if (typeof id === 'string') out.add(id);
            for (const row of (((contextPack as any)?.namedTargets || {})[name] || [])) {
              if (row && typeof row.id === 'string') out.add(row.id);
            }
          }
          return out;
        };
        const contextTaskIds = packIdSet('tasks');`, 'packIdSet helper');

const SIMPLE = [
  ['contextArchivedTaskIds', 'archivedTasks'], ['contextChannelIds', 'channels'], ['contextApprovalIds', 'approvals'],
  ['contextPersonIds', 'people'], ['contextGoalIds', 'goals'], ['contextDepartmentIds', 'departments'],
  ['contextLeadIds', 'leads'], ['contextProductIds', 'products'], ['contextProductSpecIds', 'productSpecs'],
  ['contextDrawingIds', 'engineeringDrawings'], ['contextAiProviderIds', 'aiProviders'],
  ['contextMcpConnectorIds', 'mcpConnectors'], ['contextProposalIds', 'proposals'],
];
for (const [varName, coll] of SIMPLE) {
  const re = new RegExp('const ' + varName + ' = new Set\\(\\(contextPack\\?\\.' + coll + ' \\|\\| \\[\\]\\)\\.map\\(\\([a-z]: any\\) => [a-z]\\.id\\)\\);');
  const before = s;
  s = s.replace(re, `const ${varName} = packIdSet('${coll}');`);
  if (s === before) throw new Error('id gate not rewritten: ' + varName);
  n++;
}

must(`        const contextCompanyIds = new Set([...(contextPack?.companies || []), ...(contextPack?.archivedCompanies || [])].map((c: any) => c.id));`,
     `        const contextCompanyIds = packIdSet('companies', 'archivedCompanies');`, 'company ids');

// ---- 3. the durable plan replay uses the same provenance, and never claims a stored target is unreal
//      on the strength of a display window.
must(`          const planCompanyIds = new Set((contextPack?.companies || []).map((c: any) => c.id));
          const planPersonIds = new Set((contextPack?.people || []).map((p: any) => p.id));
          const planTaskIds = new Set((contextPack?.tasks || []).map((t: any) => t.id));
          const planGoalIds = new Set((contextPack?.goals || []).map((g: any) => g.id));`,
`          // A DURABLE plan was stored with canonical ids. Validating it against a display window that the
          // context budget may have emptied, and then telling the founder its targets "no longer resolve to
          // a real record", is a false statement about canonical state (verifier #62, V62-D1b). The ids the
          // trim dropped and the rows resolved from this turn count as present, exactly as they do for every
          // other gate.
          const planIdSet = (...names: string[]): Set<string> => {
            const out = new Set<string>();
            for (const name of names) {
              for (const row of ((contextPack as any)?.[name] || [])) if (row && typeof row.id === 'string') out.add(row.id);
              const env = (contextPack as any)?.collections?.[name];
              if (env && Array.isArray(env.droppedIds)) for (const id of env.droppedIds) if (typeof id === 'string') out.add(id);
              for (const row of (((contextPack as any)?.namedTargets || {})[name] || [])) if (row && typeof row.id === 'string') out.add(row.id);
            }
            return out;
          };
          const planCompanyIds = planIdSet('companies', 'archivedCompanies');
          const planPersonIds = planIdSet('people');
          const planTaskIds = planIdSet('tasks', 'archivedTasks');
          const planGoalIds = planIdSet('goals');`, 'plan id sets');

const out = s.replace(/\n/g, '\r\n');
if ((out.match(/(^|[^\r])\n/g) || []).length) throw new Error('bare LF');
writeFileSync(p, out); console.log('applied', n);
