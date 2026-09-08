// VERIFIER #54 (campaign #114) — my own harness. Built from the committed candidate bytes.
// I audited qa/verification/lib/belt_extract.mjs (comment/string/regex-literal aware scanner)
// and re-verify below that every lifted declaration is a BYTE SUBSTRING of the source, so the
// extractor cannot silently mis-slice without this failing.
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { buildGate, buildMatcher, extractConst, readSource } from '../../lib/belt_extract.mjs';

export const CAND = process.env.SEM_INDEX_SRC || 'supabase/functions/sem-ai-command/index.ts';
export const V92 = 'qa/verification/scratch/v54_v92.git.ts';

export function sha(p) {
  return createHash('sha256').update(readFileSync(p)).digest('hex');
}

// Assert the extractor's slices really are substrings of the file (non-vacuity of the lift).
export function auditExtraction(srcPath, names) {
  const src = readSource(srcPath);
  const out = {};
  for (const n of names) {
    const code = extractConst(src, n);
    if (!src.includes(code)) throw new Error('extraction is not a substring for ' + n);
    if (!code.startsWith('const ' + n)) throw new Error('extraction misaligned for ' + n);
    out[n] = code.length;
  }
  return out;
}

export function gate(names = [], mutate = (c) => c, srcPath = CAND) {
  return buildGate(srcPath, mutate, names);
}
export function matcher(srcPath = CAND) { return buildMatcher(srcPath); }
