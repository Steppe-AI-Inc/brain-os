// Correction to the V62-D1 closure, found by the existing suites within minutes of writing it.
//
// Recording the dropped ids on the pack's envelopes worked, but it put them in the PACK — which is the one
// thing the context budget is trying to shrink. The suites caught the consequence immediately: the core
// collections were driven to 2 rows on a fixture that used to keep 8, because the id bytes bought back none
// of the room the row bytes freed.
//
// The mistake was conceptual. buildContext and the executor run in the SAME process; the pack is what is
// sent to the MODEL. Provenance is needed by the SERVER, so it never had to travel in the pack at all. It
// now comes back from buildContext as a separate return value: full provenance, zero model tokens.
//
// V62-D4 is closed at the source instead of after the fact: memories and factoryWorkOrders were the two
// collections queried without { count: 'exact' }, which is why their totals were null and a trim could not
// express itself. They now carry exact counts like every other collection, so no total ever has to change.
import { readFileSync, writeFileSync } from 'node:fs';
const p = process.argv[2] || 'supabase/functions/sem-ai-command/index.ts';
let s = readFileSync(p, 'utf8').replace(/\r\n/g, '\n');
let n = 0;
function must(a, b, label) { const c = s.split(a).length - 1; if (c !== 1) throw new Error(label + ': found ' + c); s = s.replace(a, () => b); n++; }

// ---- 1. provenance is captured before the trim and returned beside the pack, not inside it.
must(`  const contextTrimmed: string[] = [];`,
`  // ID PROVENANCE, captured BEFORE any trimming and returned beside the pack rather than inside it
  // (verifier #62, V62-D1). The executor needs to know which ids were real this turn; the model does not,
  // and putting them in the pack spent the very budget the trim exists to protect.
  const provenanceIds: Record<string, string[]> = {};
  for (const [key, value] of Object.entries(pack as Record<string, unknown>)) {
    if (!Array.isArray(value)) continue;
    const ids = value
      .map((r) => (r && typeof r === 'object' ? (r as Record<string, unknown>).id : null))
      .filter((id) => typeof id === 'string' && id.length > 0) as string[];
    if (ids.length > 0) provenanceIds[key] = ids;
  }
  const contextTrimmed: string[] = [];`, 'provenance capture');

// ---- 2. the trim no longer writes ids into the envelopes; it only tells the truth about counts.
must(`      const dropped = keepNewest ? arr.slice(0, arr.length - keep) : arr.slice(keep);
      const droppedIdList = dropped
        .map((r) => (r && typeof r === 'object' ? (r as Record<string, unknown>).id : null))
        .filter((id) => typeof id === 'string' && id.length > 0) as string[];
    packRecord[key] = keepNewest ? arr.slice(arr.length - keep) : arr.slice(0, keep);`,
`    packRecord[key] = keepNewest ? arr.slice(arr.length - keep) : arr.slice(0, keep);`, 'drop pass1 ids');

must(`      if (env && droppedIdList.length > 0) {
        const prior = Array.isArray((env as Record<string, unknown>).droppedIds) ? (env as Record<string, unknown>).droppedIds as string[] : [];
        const merged = [...new Set([...prior, ...droppedIdList])];
        // Bounded: 250 ids is far more than any window holds, and it keeps a pathological pack from
        // trading row bytes for id bytes one-for-one.
        (env as Record<string, unknown>).droppedIds = merged.slice(0, 250);
      }
    contextTrimmed.push(\`\${key} \${arr.length}->\${keep}\`);`,
`    contextTrimmed.push(\`\${key} \${arr.length}->\${keep}\`);`, 'drop pass1 merge');

must(`      const dropped = keepNewest ? arr.slice(0, arr.length - thisFloor) : arr.slice(thisFloor);
      const droppedIdList = dropped
        .map((r) => (r && typeof r === 'object' ? (r as Record<string, unknown>).id : null))
        .filter((id) => typeof id === 'string' && id.length > 0) as string[];
      packRecord[key] = keepNewest ? arr.slice(arr.length - thisFloor) : arr.slice(0, thisFloor);`,
`      packRecord[key] = keepNewest ? arr.slice(arr.length - thisFloor) : arr.slice(0, thisFloor);`, 'drop pass2 ids');

must(`      if (envHard && droppedIdList.length > 0) {
        const prior = Array.isArray((envHard as Record<string, unknown>).droppedIds) ? (envHard as Record<string, unknown>).droppedIds as string[] : [];
        const merged = [...new Set([...prior, ...droppedIdList])];
        // Bounded: 250 ids is far more than any window holds, and it keeps a pathological pack from
        // trading row bytes for id bytes one-for-one.
        (envHard as Record<string, unknown>).droppedIds = merged.slice(0, 250);
      }
      contextTrimmed.push(\`\${key} \${arr.length}->\${thisFloor}\`);`,
`      contextTrimmed.push(\`\${key} \${arr.length}->\${thisFloor}\`);`, 'drop pass2 merge');

// The null-total repair stays: it is now unreachable for real collections (every query carries an exact
// count below), and remains correct for any future collection that arrives without one.
must(`  return { pack, errors:`, `  return { pack, provenanceIds, errors:`, 'return provenance');

// ---- 3. the executor reads provenance from the context, not from the pack.
must(`            const env = (contextPack as any)?.collections?.[name];
            if (env && Array.isArray(env.droppedIds)) for (const id of env.droppedIds) if (typeof id === 'string') out.add(id);
            for (const row of (((contextPack as any)?.namedTargets || {})[name] || [])) {
              if (row && typeof row.id === 'string') out.add(row.id);
            }`,
`            for (const id of (contextProvenance[name] || [])) out.add(id);
            for (const row of (((contextPack as any)?.namedTargets || {})[name] || [])) {
              if (row && typeof row.id === 'string') out.add(row.id);
            }`, 'packIdSet provenance');

must(`              for (const row of ((contextPack as any)?.[name] || [])) if (row && typeof row.id === 'string') out.add(row.id);
              const env = (contextPack as any)?.collections?.[name];
              if (env && Array.isArray(env.droppedIds)) for (const id of env.droppedIds) if (typeof id === 'string') out.add(id);
              for (const row of (((contextPack as any)?.namedTargets || {})[name] || [])) if (row && typeof row.id === 'string') out.add(row.id);`,
`              for (const row of ((contextPack as any)?.[name] || [])) if (row && typeof row.id === 'string') out.add(row.id);
              for (const id of (contextProvenance[name] || [])) out.add(id);
              for (const row of (((contextPack as any)?.namedTargets || {})[name] || [])) if (row && typeof row.id === 'string') out.add(row.id);`, 'planIdSet provenance');

must(`    const ctx = await buildContext(supabase, command, channelId, openaiKey);
    contextPack = ctx.pack;`,
`    const ctx = await buildContext(supabase, command, channelId, openaiKey);
    contextPack = ctx.pack;
    contextProvenance = ctx.provenanceIds || {};`, 'assign provenance');

// The note stops advertising droppedIds, which the model never had a use for and which no longer exists.
must(`and the ids the trim dropped are listed in that envelope as droppedIds. Companies, people, tasks and goals named in a command are additionally re-read server-side across every status and appear in context.namedTargets;`,
     `Companies, people, tasks, goals, projects and departments named in a command are additionally re-read server-side across every status and appear in context.namedTargets;`, 'note droppedIds');

// ---- 4. memories and factoryWorkOrders get exact counts, so no total is ever null.
must(`.select('id,company_id,entity_type,entity_id,fact,confidence,sensitivity')`,
     `.select('id,company_id,entity_type,entity_id,fact,confidence,sensitivity', { count: 'exact' })`, 'memories count');

const out = s.replace(/\n/g, '\r\n');
if ((out.match(/(^|[^\r])\n/g) || []).length) throw new Error('bare LF');
if (out.includes('droppedIds')) throw new Error('a droppedIds reference survived');
writeFileSync(p, out); console.log('applied', n);
