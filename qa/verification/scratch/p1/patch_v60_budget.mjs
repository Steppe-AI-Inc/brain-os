// VERIFIER #60 FINDINGS V60-D1, V60-D2, V60-D5 — structural closure on the candidate bytes.
//
// D2: the targeted named-entity lookups (the mechanism added to stop the 2026-08-30 "test4"
//     fabrication) were merged at the array TAIL while the trim slices the HEAD, so the row the
//     founder named THIS TURN was the first thing the budget discarded. Merge at the head.
//
// D1: a floor is a ROW count, not a BYTE count. A workspace with few rows but long free text
//     (approval reasons, memory facts) sat over budget with nothing left to trim, and serve()
//     returned the incident's own 413 with no answer. `approvals` was not a trim key at all.
//     Fix: approvals joins TRIM_ORDER; two further passes with harder floors (2, then 0) run when
//     the first cannot reach the budget; each step is written back into the envelope, so a
//     collection emptied to fit still reports its real total with truncated: true.
//
// D5: the loop measured {command, pack} while the preflight measures {command, contextPack} — a
//     different object shape. Measure the same shape.
//
// D1 residual (this session): a command that is itself larger than the budget can never be trimmed
//     to fit. That is a legitimate refusal, but it must be a DETERMINISTIC REFUSAL the founder can
//     act on, not an opaque hard stop. serve() now says which it is and what to do.
import { readFileSync, writeFileSync } from 'node:fs';
const p = process.argv[2] || 'supabase/functions/sem-ai-command/index.ts';
let s = readFileSync(p, 'utf8').replace(/\r\n/g, '\n');
let n = 0;
function must(a, b, label) { const c = s.split(a).length - 1; if (c !== 1) throw new Error(label + ': found ' + c); s = s.replace(a, () => b); n++; }

// ---- F1 (D2): the row named this turn is merged at the HEAD, so a head-slicing trim keeps it.
for (const key of ['companies', 'people', 'goals', 'tasks']) {
  must(`    return [...(${key}.data || []), ...extra];`,
       `    // The rows the founder named THIS TURN go FIRST: the context budget trims by slicing the\n` +
       `    // head, so a tail merge made the named row the first casualty (verifier #60, V60-D2).\n` +
       `    return [...extra, ...(${key}.data || [])];`, 'merge head ' + key);
}

// ---- F3 (D5): measure the object shape serve() measures.
must(`  const packTokens = () => Math.ceil(JSON.stringify({ command, pack }).length / 4);`,
     `  // The SAME shape the serve() preflight measures — estimateTokens({ command, contextPack }) —\n` +
     `  // not merely the same arithmetic (verifier #60, V60-D5).\n` +
     `  const packTokens = () => Math.ceil(JSON.stringify({ command, contextPack: pack }).length / 4);`, 'estimator shape');

// ---- F2 (D1): approvals is trimmable.
must(`    ['projects', 8, false], ['goals', 8, false], ['tasks', 8, false], ['people', 10, false], ['companies', 8, false],`,
     `    ['approvals', 6, false],\n` +
     `    ['projects', 8, false], ['goals', 8, false], ['tasks', 8, false], ['people', 10, false], ['companies', 8, false],`, 'approvals trimmable');

// ---- F2 (D1): harder passes when the first cannot reach the budget.
must(`  // The guarantee is asserted, not assumed: if any protected key changed, the trim loop is wrong and the
  // turn must fail loudly here rather than answer from a pack whose safe minimum was quietly cut.`,
`  // A floor is a ROW count, not a BYTE count: a workspace with few rows but long free text can still
  // sit over budget with every array already at its floor, and serve() would then 413 the whole request
  // with no answer — the incident this block exists to prevent, in a different workspace shape
  // (verifier #60, V60-D1). Two further passes with harder floors run only if the first cannot reach the
  // budget. Emptying an optional collection is still truthful: its envelope keeps the real total and
  // truncated: true, and any entity named in a command is resolved server-side, not from the window.
  for (const floor of [2, 0]) {
    if (packTokens() <= packBudget) break;
    for (const [key, , keepNewest] of TRIM_ORDER) {
      if (packTokens() <= packBudget) break;
      const arr = packRecord[key];
      const thisFloor = key === 'conversationHistory' ? Math.max(1, floor) : floor;
      if (!Array.isArray(arr) || arr.length <= thisFloor) continue;
      packRecord[key] = keepNewest ? arr.slice(arr.length - thisFloor) : arr.slice(0, thisFloor);
      const envHard = collectionsRecord[key];
      if (envHard) { envHard.shown = thisFloor; envHard.truncated = envHard.total === null ? null : envHard.total > thisFloor; }
      contextTrimmed.push(\`\${key} \${arr.length}->\${thisFloor}\`);
    }
  }
  // The guarantee is asserted, not assumed: if any protected key changed, the trim loop is wrong and the
  // turn must fail loudly here rather than answer from a pack whose safe minimum was quietly cut.`, 'hard passes');

// ---- F2 (D1): the trim list is itself measured bytes; cap it and report honestly when the pack
//      could not be brought under budget, so nothing downstream has to infer it.
must(`  contextBudget.estimatedTokens = packTokens();`,
`  // The trim list is pack bytes too. Cap what is carried so a heavily trimmed turn cannot spend the
  // reserve on the report of its own trimming; the count is always exact.
  if (contextTrimmed.length > 12) {
    contextBudget.trimmedCount = contextTrimmed.length;
    contextTrimmed.splice(12, contextTrimmed.length - 12);
  }
  contextBudget.estimatedTokens = packTokens();
  // Stated, never inferred: if even the hardest trim could not reach the budget, the pack says so and
  // serve() turns it into a refusal the founder can act on rather than an opaque hard stop.
  contextBudget.overBudget = contextBudget.estimatedTokens > packBudget;`, 'trim list cap');

must(`    estimatedTokens: 0, budget: packBudget, trimmed: contextTrimmed,`,
     `    estimatedTokens: 0, budget: packBudget, overBudget: false, trimmedCount: 0, trimmed: contextTrimmed,`, 'budget shape');

const out = s.replace(/\n/g, '\r\n');
if ((out.match(/(^|[^\r])\n/g) || []).length) throw new Error('bare LF');
writeFileSync(p, out); console.log('applied', n);
