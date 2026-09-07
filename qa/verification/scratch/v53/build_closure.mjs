// VERIFIER #53 — PREPARED closure for V53-D1 (NOT applied; no write authority on the implementation branch).
// The belt's first-person active arm (readsAsCompletion, the D3 anchor) captures the object as a CAPITAL RUN
// `([A-Z][\w&.’'-]*(?:\s+[A-Z][\w&.’'-]*)*)` and requires the capture to be in knownEntityNames. An in-pack name with an
// interior lowercase word ("Trade and Development Bank", "State Bank of Mongolia") captures only its first word, misses the
// pack, and the arm does not fire. On a plain turn that is v92 parity (v92 has no first-person arm); after a conditioned
// offer — where the founder ruling stands v92's FUTURE arm down — the whole message ships while v92 corrects it.
// Closure: when the capital-run capture misses the pack, ALSO try every word-prefix of the text from the capture start
// (any casing, <= 8 tokens, trailing punctuation and possessive stripped). Positive-only. No new declaration (an IIFE).
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
const SRC = 'supabase/functions/sem-ai-command/index.ts';
const orig = readFileSync(SRC); const text = orig.toString('utf8');
mkdirSync('qa/verification/scratch/v53/mut', { recursive: true });
const anchor = "((__f) => __f !== null && (__f[1] === undefined || knownEntityNames.has(String(__f[1]).replace(/['’]s$/, '').trim().toLowerCase())))(c.match(";
if (text.split(anchor).length - 1 !== 1) throw new Error('anchor count != 1: ' + (text.split(anchor).length - 1));
// ONE EXPRESSION, NO LITERAL SEMICOLON, NO DECLARATION: readsAsCompletion is sliced to its first literal ";" by the
// source-extracting suites (V48-D7 / V50-C10), so the semicolon inside the regex class is written \x3b and the token
// loop is a split/map/some chain. Word prefixes: split at each non-space→space boundary, take the first 8 prefixes.
const repl = "((__f) => __f !== null && (__f[1] === undefined || knownEntityNames.has(String(__f[1]).replace(/['’]s$/, '').trim().toLowerCase()) || ((__t) => __t.split(/(?<=\\S)(?=\\s)/).map((__w, __i, __ws) => __ws.slice(0, __i + 1).join('')).slice(0, 8).some((__p) => knownEntityNames.has(__p.replace(/[.,\\x3b:!?]+$/, '').replace(/['’]s$/, '').trim().toLowerCase())))(c.slice((__f.index ?? 0) + __f[0].length - String(__f[1]).length))))(c.match(";
if (/;/.test(repl.slice(repl.indexOf('((__t) =>'), repl.indexOf('(c.slice(')))) throw new Error('closure contains a literal semicolon — would break the extractor suites');
const t = text.replace(anchor, repl);
if (t === text) throw new Error('NO-OP');
writeFileSync('qa/verification/scratch/v53/mut/closure_V53D1.ts', t);
console.log('built qa/verification/scratch/v53/mut/closure_V53D1.ts');
console.log('working tree unchanged:', Buffer.compare(orig, readFileSync(SRC)) === 0, createHash('sha256').update(readFileSync(SRC)).digest('hex'));
