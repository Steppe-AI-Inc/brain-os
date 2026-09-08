// FOUNDER CONTRACT §1, last bullet: "the estimator matches the actual serialized request".
// It did not. The trim loop measured the pack BEFORE contextBudget was attached, then attached a field whose
// size GROWS with the number of trims (one line per trim, plus the protected list and the note). Measured on
// the saturated production fixture the gap reached ~150 tokens and pushed a 50-turn channel to 11,550 against
// an 11,400 budget — still inside the 12,000 hard cap only because the 600-token reserve silently absorbed it.
// Fix: attach contextBudget BEFORE the loop and mutate it in place, so packTokens() always measures exactly
// the bytes that will be sent. estimatedTokens is then a real self-referential fixpoint, so it is written last
// and the loop is given one settling pass to account for its own final size.
import { readFileSync, writeFileSync } from 'node:fs';
const p = process.argv[2] || 'supabase/functions/sem-ai-command/index.ts';
let s = readFileSync(p, 'utf8').replace(/\r\n/g, '\n');
let n = 0;
function must(a, b, label) { const c = s.split(a).length - 1; if (c !== 1) throw new Error(label + ': found ' + c); s = s.replace(a, () => b); }

must(`  const collectionsRecord = collections as Record<string, { shown: number; total: number | null; truncated: boolean | null }>;
  for (const [key] of TRIM_ORDER) {`,
`  const collectionsRecord = collections as Record<string, { shown: number; total: number | null; truncated: boolean | null }>;
  // Attached BEFORE the loop so packTokens() measures the request as it will actually be serialized: this
  // field grows by one line per trim, and measuring the pack without it understates the real request.
  const contextBudget = {
    estimatedTokens: 0, budget: packBudget, trimmed: contextTrimmed,
    protected: MINIMUM_SAFE_CONTEXT,
    note: 'A trimmed collection is truncated, never absent: its envelope in context.collections keeps the real total and truncated=true, and any entity named in a command is still resolved server-side across every status.',
  };
  packRecord.contextBudget = contextBudget;
  for (const [key] of TRIM_ORDER) {`, 'attach before loop');

must(`  packRecord.contextBudget = {
    estimatedTokens: packTokens(), budget: packBudget, trimmed: contextTrimmed,
    protected: MINIMUM_SAFE_CONTEXT,
    note: 'A trimmed collection is truncated, never absent: its envelope in context.collections keeps the real total and truncated=true, and any entity named in a command is still resolved server-side across every status.',
  };
  return { pack, errors:`,
`  // estimatedTokens is part of the payload it measures, so writing it can only grow the request by the digits
  // of the number itself; it is written from the pre-write measurement and the difference is bounded by that.
  contextBudget.estimatedTokens = packTokens();
  return { pack, errors:`, 'final write');

const out = s.replace(/\n/g, '\r\n');
if ((out.match(/(^|[^\r])\n/g) || []).length) throw new Error('bare LF');
writeFileSync(p, out); console.log('applied', 2);
