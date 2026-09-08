// VERIFIER #19 — mutation driver with hard SHA discipline. The original bytes are held in a
// Buffer and written back verbatim (CRLF preserved) after every mutant; the sha256 is
// asserted before AND after each one. Any mismatch aborts the process rather than
// continuing on a corrupted source.
import fs from 'node:fs';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';

const SRC = 'supabase/functions/sem-ai-command/index.ts';
export const REQUIRED = 'd050db20004e3ed33c6aac59774256053a6b8b549f109f7435bc305b9b3fec30';
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');

export function assertPristine(where) {
  const got = sha(fs.readFileSync(SRC));
  if (got !== REQUIRED) { console.error('SHA MISMATCH ' + where + ': ' + got); process.exit(9); }
  return got;
}

// edits: [[find, replace], ...] applied to the UTF-8 text; every `find` must occur exactly once.
export function withMutant(name, edits, body) {
  assertPristine('before ' + name);
  const orig = fs.readFileSync(SRC);
  let text = orig.toString('utf8');
  for (const [find, repl] of edits) {
    const n = text.split(find).length - 1;
    if (n !== 1) { fs.writeFileSync(SRC, orig); throw new Error(`mutant ${name}: pattern occurs ${n}x, expected 1: ${find.slice(0, 80)}`); }
    text = text.replace(find, repl);
  }
  fs.writeFileSync(SRC, Buffer.from(text, 'utf8'));
  let out;
  try { out = body(); } finally { fs.writeFileSync(SRC, orig); assertPristine('after ' + name); }
  return out;
}

export function runBattery() {
  const out = execFileSync(process.execPath, ['qa/verification/scratch/v19/battery.mjs'], { encoding: 'utf8', timeout: 900000 });
  const m = out.match(/OK MARKS=(\d+)\s+FAILURES FROM OUTPUT TEXT=(\d+)\s+NONZERO EXITS=(\d+)/);
  const perSuite = [...out.matchAll(/^RUN\s+exit=\s*(-?\d+)\s+ok=\s*(\d+)\s+failTXT=\s*(\d+)\s+(\S+)$/gm)]
    .map(([, code, ok, fail, f]) => ({ f, code: +code, ok: +ok, fail: +fail }));
  return { ok: +m[1], fail: +m[2], exits: +m[3], perSuite, raw: out };
}
