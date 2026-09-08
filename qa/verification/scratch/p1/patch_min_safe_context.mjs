// Founder product contract 2026-09-08 (sections 3 and 4):
//   TOKEN_BUDGET_EXHAUSTION_MUST_DEGRADE_CONTEXT_NOT_PRODUCT_AVAILABILITY
//   NOT INCLUDED IN THE PROMPT != DOES NOT EXIST
// The trim loop already works from an allow-list, but "protected by omission" is exactly the vacuous-guard
// shape this project keeps finding. The minimum safe context is now NAMED in source, asserted after every
// trim, and reported on the pack; a trim that touched it would throw rather than ship a degraded turn.
import { readFileSync, writeFileSync } from 'node:fs';
const p = process.argv[2] || 'supabase/functions/sem-ai-command/index.ts';
let s = readFileSync(p, 'utf8').replace(/\r\n/g, '\n');
let n = 0;
function must(a, b, label) { const c = s.split(a).length - 1; if (c !== 1) throw new Error(label + ': found ' + c); s = s.replace(a, () => b); n++; }

must(`  const contextTrimmed: string[] = [];
  const packRecord = pack as Record<string, unknown>;`,
`  // MINIMUM SAFE CONTEXT (founder contract 2026-09-08 §3): the current command, the caller's identity and
  // organization scope, the durable pending action, the canonical ids an operation needs, the execution
  // evidence and the truth/continuity state are NEVER trimmed to fit a budget. Optional, reconstructible
  // context is trimmed first; if the minimum itself does not fit, that is the one case where the request may
  // legitimately be refused — and it is refused with the minimum intact, never with a silently gutted pack.
  const MINIMUM_SAFE_CONTEXT = ['currentTurn', 'continuity', 'counts', 'collections', 'pendingAction',
    'recentlyResolvedEntities', 'recentlyDeletedEntities', 'activeChannelId'];
  const contextTrimmed: string[] = [];
  const packRecord = pack as Record<string, unknown>;
  const minimumSafeBefore = JSON.stringify(MINIMUM_SAFE_CONTEXT.map((k) => packRecord[k] ?? null));`, 'minimum set');

must(`  packRecord.contextBudget = { estimatedTokens: packTokens(), budget: packBudget, trimmed: contextTrimmed };`,
`  // The guarantee is asserted, not assumed: if any protected key changed, the trim loop is wrong and the
  // turn must fail loudly here rather than answer from a pack whose safe minimum was quietly cut.
  if (JSON.stringify(MINIMUM_SAFE_CONTEXT.map((k) => packRecord[k] ?? null)) !== minimumSafeBefore) {
    throw new Error('context budget trimmed the minimum safe context — refusing to build this turn');
  }
  packRecord.contextBudget = {
    estimatedTokens: packTokens(), budget: packBudget, trimmed: contextTrimmed,
    protected: MINIMUM_SAFE_CONTEXT,
    note: 'A trimmed collection is truncated, never absent: its envelope in context.collections keeps the real total and truncated=true, and any entity named in a command is still resolved server-side across every status.',
  };`, 'assertion');

// The trim order must never contain a protected key: pin it in source next to the list.
must(`  for (const [key, keep, keepNewest] of TRIM_ORDER) {`,
`  for (const [key] of TRIM_ORDER) {
    if (MINIMUM_SAFE_CONTEXT.includes(key)) throw new Error('TRIM_ORDER names a minimum-safe-context key: ' + key);
  }
  for (const [key, keep, keepNewest] of TRIM_ORDER) {`, 'trim order guard');

const out = s.replace(/\n/g, '\r\n');
if ((out.match(/(^|[^\r])\n/g) || []).length) throw new Error('bare LF');
writeFileSync(p, out); console.log('applied', n);
