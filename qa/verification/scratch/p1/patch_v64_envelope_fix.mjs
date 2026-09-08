// Correction to the V64-D5 closure, caught by deno within a minute of writing it.
//
// Putting the namedTargets envelopes INSIDE the `collections` map produced two real errors and one design
// mistake: TS2448/TS2454 (the envelope map was declared AFTER the literal that read it — a TDZ crash, and
// the exact runtime-fatal class this repo gates on), and TS2352, because `collections` is a map of
// CollectionEnvelope and a map-of-maps is not one. The design mistake is the same thing in words:
// `collections.namedTargets` would not have BEEN an envelope, so it would have satisfied the letter of §4.3
// and not its meaning.
//
// namedTargets is a group of six capped windows, so it carries its own envelope map, beside its rows, where
// the shape is honest and the declaration order is trivially correct.
import { readFileSync, writeFileSync } from 'node:fs';
const p = process.argv[2] || 'supabase/functions/sem-ai-command/index.ts';
let s = readFileSync(p, 'utf8').replace(/\r\n/g, '\n');
let n = 0;
function must(a, b, label) { const c = s.split(a).length - 1; if (c !== 1) throw new Error(label + ': found ' + c); s = s.replace(a, () => b); n++; }

must(`    namedTargets: namedTargetsEnvelope,\n`, ``, 'remove from collections');

must(`  const namedTargetsEnvelope: Record<string, { shown: number; total: number | null; truncated: boolean }> = {};
  for (const [key, rows] of Object.entries(namedTargets)) {
    namedTargetsEnvelope[key] = {
      shown: (rows as unknown[]).length,
      total: (rows as unknown[]).length < NAMED_LOOKUP_ROW_CAP ? (rows as unknown[]).length : null,
      truncated: (rows as unknown[]).length >= NAMED_LOOKUP_ROW_CAP,
    };
  }`,
`  const namedTargetsEnvelope: Record<string, { shown: number; total: number | null; truncated: boolean }> = {};
  for (const [key, rows] of Object.entries(namedTargets)) {
    namedTargetsEnvelope[key] = {
      shown: (rows as unknown[]).length,
      total: (rows as unknown[]).length < NAMED_LOOKUP_ROW_CAP ? (rows as unknown[]).length : null,
      truncated: (rows as unknown[]).length >= NAMED_LOOKUP_ROW_CAP,
    };
  }
  // Beside the rows, not inside context.collections: that map is Record<string, CollectionEnvelope>, and a
  // map OF envelopes is not an envelope. Nesting it there type-errored and, worse, would have satisfied
  // §4.3 by name while telling the model nothing it could use.
  (namedTargets as Record<string, unknown>).collections = namedTargetsEnvelope;`, 'envelope beside rows');

const out = s.replace(/\n/g, '\r\n');
if ((out.match(/(^|[^\r])\n/g) || []).length) throw new Error('bare LF');
if (out.indexOf('const namedTargetsEnvelope') > out.indexOf('const pack = { continuity, namedTargets,')) throw new Error('the envelope is still declared after the pack literal');
writeFileSync(p, out); console.log('applied', n);
