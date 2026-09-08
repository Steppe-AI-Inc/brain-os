// VERIFIER #52 — PREPARED closure for V52-D1 (NOT applied to the candidate; no write authority on the implementation
// branch). Built on a scratch copy only. The positive entity signal in nameInternal matches the negator token plus a
// CAPITALISED run (or a lowercase run up to an auxiliary) against knownEntityNames; a known name with an interior
// lowercase word ("Not for Profit Alliance") or a lowercase tail ("Not Invented Here retrospective") is never
// recognised, so the negator reads as a genuine negation and the fabrication ships. Closure: also try every
// WORD-PREFIX of `after` (any casing, up to 8 tokens) against the pack — positive-only, so a name ABSENT from the
// pack proves nothing and no determiner reading is lost.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
const SRC = 'supabase/functions/sem-ai-command/index.ts';
const orig = readFileSync(SRC); const text = orig.toString('utf8');
mkdirSync('qa/verification/scratch/v52/mut', { recursive: true });
const anchor = "const nameInternal = ((capLead && subjectRun)";
if (text.split(anchor).length - 1 !== 1) throw new Error('anchor count != 1');
// 1) a per-iteration local computing the longest known-name word-prefix length (0 when none)
const local = "const namePrefixHit = ((__a) => { let __best = 0; let __acc = ''; const __re = /\\s+[^\\s]+/g; for (let __k = 0; __k < 8; __k++) { const __m = __re.exec(__a); if (__m === null || __m.index !== __acc.length) break; __acc += __m[0]; if (knownEntityNames.has((mm[0] + __acc).replace(/[.,;:!?]+$/, '').replace(/['’]s$/, '').toLowerCase())) __best = __acc.length; } return __best; })(after); ";
// 2) nameInternal also true on a prefix hit; the lastIndex jump uses the longest hit
let t = text.replace(anchor, local + "const nameInternal = (namePrefixHit > 0 || (capLead && subjectRun)");
const hitAnchor = "? __r[0].length : 0).sort((__a, __b) => __b - __a)[0]; if (__hit) {";
if (t.split(hitAnchor).length - 1 !== 1) throw new Error('hit anchor count != 1');
t = t.replace(hitAnchor, "? __r[0].length : 0).concat([namePrefixHit]).sort((__a, __b) => __b - __a)[0]; if (__hit) {");
if (t === text) throw new Error('NO-OP');
writeFileSync('qa/verification/scratch/v52/mut/closure_V52D1.ts', t);
console.log('built qa/verification/scratch/v52/mut/closure_V52D1.ts');
console.log('working tree unchanged:', Buffer.compare(orig, readFileSync(SRC)) === 0, createHash('sha256').update(readFileSync(SRC)).digest('hex'));
