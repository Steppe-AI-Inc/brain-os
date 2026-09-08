// V61-D3, resolved by removing the duplicate rather than by keeping two copies in step.
//
// counts carried `<x>Shown` alongside collections.<x>.shown. After a trim the two disagreed, and the first
// attempt at this fix synced them — which then broke the verifier's own C3 contract, because counts is a
// protected key and syncing mutates it. The conflict is the signal: OPERATING_TRUTH_MODEL §4.3 wants ONE
// authoritative envelope per collection, and `<x>Shown` was a second one. It is removed. The totals stay in
// counts (they are query counts, unaffected by any trim), the shown/truncated values live only in
// context.collections, where the trim already maintains them, and the prompt is pointed at that single
// source. Nothing is lost: every number the model was told to use is still present, in one place.
import { readFileSync, writeFileSync } from 'node:fs';
const p = process.argv[2] || 'supabase/functions/sem-ai-command/index.ts';
let s = readFileSync(p, 'utf8').replace(/\r\n/g, '\n');
let n = 0;
function must(a, b, label) { const c = s.split(a).length - 1; if (c !== 1) throw new Error(label + ': found ' + c); s = s.replace(a, () => b); n++; }

// ---- undo the sync: counts must stay byte-stable across a trim, like every other protected key.
must(`  // counts.<x>Shown was written before the trim and protected from it, so a trimmed pack carried two
  // different "shown" numbers for the same collection (verifier #61, V61-D3). The totals were always
  // right; the shown values now follow the pack that is actually sent.
  if (contextTrimmed.length > 0) {
    const countsRecord = packRecord.counts as Record<string, unknown> | undefined;
    if (countsRecord) {
      for (const key of Object.keys(countsRecord)) {
        const m = /^(\\w+)Shown$/.exec(key);
        if (!m) continue;
        const arr = packRecord[m[1]];
        if (Array.isArray(arr)) countsRecord[key] = arr.length;
      }
    }
  }
  contextBudget.estimatedTokens = packTokens();`,
`  contextBudget.estimatedTokens = packTokens();`, 'undo sync');

// ---- counts keeps totals only. One envelope per collection, and it is context.collections.
must(`    tasksShown: (tasks.data||[]).length, tasksTotal: tasksCount.count ?? (tasks.data||[]).length,
    approvalsShown: (approvals.data||[]).length, approvalsTotal: approvalsCount.count ?? (approvals.data||[]).length,`,
`    // TOTALS ONLY. A '<x>Shown' here was a second envelope for the same collection, and a trim made the
    // two disagree (verifier #61, V61-D3). shown/truncated live in context.collections, which the trim
    // maintains; totals come from the query counts and no trim can change them.
    tasksTotal: tasksCount.count ?? (tasks.data||[]).length,
    approvalsTotal: approvalsCount.count ?? (approvals.data||[]).length,`, 'counts head');

for (const [k, q] of [['salesLeads', 'salesLeadsCount'], ['inventoryItems', 'inventoryCount'], ['channels', 'channelsCount'], ['departments', 'departmentsCount'], ['documents', 'documentsCount']]) {
  const re = new RegExp('\\n\\s*' + k + 'Shown: \\([^)]*\\)\\.length, (' + k + 'Total: [^\\n]*)', 'g');
  const before = s;
  s = s.replace(re, (_m, keep) => '\n    ' + keep);
  if (s !== before) n++;
}

// ---- the prompt names one source for shown/total.
must(`  inventoryItemsTotal, channelsTotal) plus tasksShown/approvalsShown/channelsShown (how`,
`  inventoryItemsTotal, channelsTotal). How many rows you were actually given is in
  context.collections.<name>.shown, with .total and .truncated beside it — that is the ONE
  place to read it from (how`, 'prompt counts 1');

must(`  arrays are truncated. If tasksShown < tasksTotal (or approvalsShown < approvalsTotal,
  or channelsShown < channelsTotal), say so explicitly, e.g.`,
`  arrays are truncated. If context.collections.<name>.truncated is true (equivalently
  .shown < .total), say so explicitly, e.g.`, 'prompt counts 2');

must(`  context.approvals are all capped (see context.counts.tasksShown/tasksTotal,
  approvalsShown/approvalsTotal etc. above) — if the founder says "delete all" and the`,
`  context.approvals are all capped (see context.collections.<name>.shown/total/truncated
  above) — if the founder says "delete all" and the`, 'prompt counts 3');

const out = s.replace(/\n/g, '\r\n');
if ((out.match(/(^|[^\r])\n/g) || []).length) throw new Error('bare LF');
if (/\w+Shown/.test(out.slice(out.indexOf('const counts = {'), out.indexOf('const pack = {')))) throw new Error('a Shown key survived in counts');
writeFileSync(p, out); console.log('applied', n);
