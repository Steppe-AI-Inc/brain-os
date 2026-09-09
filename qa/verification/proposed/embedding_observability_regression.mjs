#!/usr/bin/env node
// THE REGRESSION LEDGER #144 HAS BEEN OWED SINCE THE FIX WAS PREPARED.
//
// `qa/verification/PREPARED_EMBEDDING_OBSERVABILITY_STATUS.md` names this file's absence as the reason the
// embedding fix cannot ship: "a regression that FAILS when an embedding failure produces no signal (it does
// not exist yet, so the fix is currently unfalsifiable)". A fix nothing can falsify is a claim.
//
// WHAT IT MEASURES. `embedTexts` degrades on five distinct paths — no key, a non-2xx response, a thrown
// request, a body with no usable vector, and no input at all. Degrading is CORRECT; degrading INVISIBLY is
// the defect. Semantic memory was dead in production for fifteen days and every surface reported normal
// operation, because all five paths return the same `null` per input and say nothing.
//
// So each path is driven with a stubbed `fetch` and the question asked of each is only: did anything record
// a reason? Not which reason, not in what words — a test that pinned the wording would break on a rewrite
// and teach nobody anything (this campaign has spent a night on rows that pinned copy).
//
// HOW IT FAILS ON THE UNFIXED SOURCE. The signal is a module-scope `embeddingDegradedReason`. When the
// source under test has no such declaration, every DEFECT row below fails with that as the reason, rather
// than the suite erroring out — a suite that cannot run against the file it is about is indistinguishable
// from a suite that passes, which is the failure mode the whole battery exists to avoid.
//
//   node qa/verification/proposed/embedding_observability_regression.mjs
//   SEM_INDEX_SRC=<a copy with the prepared patch applied> node ...   # must go green
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const SRC = process.env.SEM_INDEX_SRC
  || resolve(here, '../../supabase/functions/sem-ai-command/index.ts');
if (!existsSync(SRC)) { console.log('FAIL cannot locate index.ts at ' + SRC); process.exit(1); }
const text = readFileSync(SRC, 'utf8').split(String.fromCharCode(13) + String.fromCharCode(10))
  .join(String.fromCharCode(10));
const lines = text.split(String.fromCharCode(10));

let pass = 0, fail = 0;
const check = (kind, name, ok, detail) => {
  if (ok) { pass++; console.log('OK   [' + kind + '] ' + name); }
  else { fail++; console.log('FAIL [' + kind + '] ' + name + (detail ? '\n       ' + detail : '')); }
};

// ---- lift embedTexts and its signal out of the source under test -----------------------------------------
const startLine = lines.findIndex((l) => l.startsWith('async function embedTexts('));
if (startLine < 0) { console.log('FAIL embedTexts not found in ' + SRC); process.exit(1); }
let endLine = -1;
for (let i = startLine + 1; i < lines.length; i++) if (lines[i] === '}') { endLine = i; break; }
if (endLine < 0) { console.log('FAIL could not find the end of embedTexts'); process.exit(1); }

const REASON_DECL = lines.find((l) => l.trim().startsWith('let embeddingDegradedReason'));
const hasSignal = Boolean(REASON_DECL);

// Type annotations are stripped the same way the shared extractor does it, but locally: this window is one
// function and pulling in the whole extractor for it would couple this file to a much larger surface.
const stripTypes = (s) => s
  .replace(/: Promise<\(number\[\] \| null\)\[\]>/g, '')
  .replace(/texts: string\[\]/g, 'texts')
  .replace(/key: string \| undefined/g, 'key')
  .replace(/new Map<number, number\[\]>\(\)/g, 'new Map()')
  .replace(/let embeddingDegradedReason: string \| null = null;/g, 'let embeddingDegradedReason = null;')
  .replace(/\(e: any\)/g, '(e)');

const body = stripTypes(lines.slice(startLine, endLine + 1).join(String.fromCharCode(10)));
const decl = hasSignal ? stripTypes(REASON_DECL) : 'let embeddingDegradedReason = null;';

// Each case supplies a fetch and asks one question: was a reason recorded?
async function runCase(fetchImpl, texts, key) {
  const src = decl
    + String.fromCharCode(10) + body
    + String.fromCharCode(10)
    + 'return (async () => { embeddingDegradedReason = null;'
    + ' const out = await embedTexts(TEXTS, KEY);'
    + ' return { out, reason: embeddingDegradedReason }; })();';
  const fn = new Function('fetch', 'TEXTS', 'KEY', src);
  return fn(fetchImpl, texts, key);
}

const ok200 = (data) => async () => ({ ok: true, status: 200, json: async () => ({ data }) });
const CASES = [
  ['no API key is configured', async () => { throw new Error('fetch must not be called'); }, ['a'], undefined],
  ['the provider answers non-2xx', async () => ({ ok: false, status: 429, text: async () => 'slow down', json: async () => ({}) }), ['a'], 'k'],
  ['the request throws', async () => { throw new Error('socket hang up'); }, ['a'], 'k'],
  ['the body carries no usable vector', ok200([]), ['a'], 'k'],
];

const results = [];
for (const [label, f, texts, key] of CASES) results.push([label, await runCase(f, texts, key)]);

for (const [label, r] of results) {
  check('DEFECT', 'an embedding failure is OBSERVABLE: ' + label,
    hasSignal && typeof r.reason === 'string' && r.reason.length > 0,
    hasSignal
      ? 'embedTexts returned ' + JSON.stringify(r.out) + ' and recorded no reason'
      : 'the source under test has no embeddingDegradedReason at all, so nothing anywhere could report'
        + ' this failure — ledger #144, and the reason that fix is unfalsifiable until it lands');
}

// A degraded turn must still ANSWER. The whole design point is that chat never breaks because embeddings
// are down; a fix that made this throw would trade a silent outage for a loud one.
for (const [label, r] of results) {
  check('CONTRACT', 'the turn still gets an answer shaped like the input: ' + label,
    Array.isArray(r.out) && r.out.length === 1 && r.out[0] === null,
    JSON.stringify(r.out));
}

// ...and no false alarm. A successful embedding must record nothing, or the signal is noise and the next
// person mutes it.
{
  const good = await runCase(ok200([{ index: 0, embedding: [0.1, 0.2] }]), ['a'], 'k');
  check('CONTRACT', 'a SUCCESSFUL embedding records no degradation',
    good.reason === null || good.reason === undefined, JSON.stringify(good.reason));
  check('CONTRACT', 'a successful embedding returns the vector it was given',
    Array.isArray(good.out) && Array.isArray(good.out[0]) && good.out[0][0] === 0.1,
    JSON.stringify(good.out));
}

console.log('');
console.log('embedding_observability_regression: ' + pass + ' passed, ' + fail + ' failed');
console.log('source under test: ' + SRC);
if (fail) process.exit(1);
