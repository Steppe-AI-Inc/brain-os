// VERIFIER #41 — STEP 3d: "check every guard in the belt for a flag that defeats its own
// case test." Verifier #40 recorded that its own first draft carried /i over an [A-Z] test,
// which case-folds the class and makes the guard silently inert (it then matches ANY letter).
// This sweep is the permanent form of that check: every regex literal AND every
// new RegExp(..., flags) inside the belt block is examined for an EXPLICIT uppercase class
// under a case-insensitive flag.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '../../../..');
const CAND = process.env.SEM_INDEX_SRC || path.join(REPO, 'supabase/functions/sem-ai-command/index.ts');
const raw = readFileSync(CAND, 'utf8').replace(/\r\n/g, '\n');
const start = raw.indexOf('const LEGACY_PAST_COMPLETION');
const end = raw.indexOf('const legacyProseFallback');
if (start < 0 || end < 0 || end <= start) throw new Error('belt block not found — refusing to report on a slice that is not the product');
// Drop full-line comments so a construct merely DESCRIBED in prose is not counted.
const blk = raw.slice(start, end).split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n');

const findings = [];

// (1) regex LITERALS: /.../flags — scanned with a tiny state machine so a `/` in a class
//     or inside a string never opens a phantom literal.
{
  let i = 0, inStr = '';
  while (i < blk.length) {
    const c = blk[i];
    if (inStr) { if (c === '\\') { i += 2; continue; } if (c === inStr) inStr = ''; i++; continue; }
    if (c === '"' || c === "'" || c === '`') { inStr = c; i++; continue; }
    if (c === '/' && blk[i + 1] !== '/' && blk[i + 1] !== '*') {
      let p = i - 1; while (p >= 0 && /\s/.test(blk[p])) p--;
      const prev = p >= 0 ? blk[p] : '';
      if (prev === '' || '=(,[!&|?:;{}+*%~^<>'.includes(prev) || /\b(?:return|typeof|test)$/.test(blk.slice(Math.max(0, p - 6), p + 1))) {
        let j = i + 1, cls = false, ok = false;
        while (j < blk.length) {
          if (blk[j] === '\\') { j += 2; continue; }
          if (blk[j] === '[') cls = true;
          else if (blk[j] === ']') cls = false;
          else if (blk[j] === '/' && !cls) { ok = true; break; }
          else if (blk[j] === '\n') break;
          j++;
        }
        if (ok) {
          const body = blk.slice(i + 1, j);
          let k = j + 1; while (k < blk.length && /[gimsuyvd]/.test(blk[k])) k++;
          const flags = blk.slice(j + 1, k);
          if (flags.includes('i') && /\[A-Z\]|\[A-Z[^\]]*\]/.test(body)) {
            findings.push(['literal', flags, body.slice(0, 120), blk.slice(0, i).split('\n').length]);
          }
          i = k; continue;
        }
      }
    }
    i++;
  }
}

// (2) new RegExp('...', 'flags') — the constructed arms (EXECUTION_IN_PROGRESS, subjectRun,
//     objectName, the R-AUXGAP collapse, the linker test).
{
  const re = /new RegExp\(/g; let m;
  while ((m = re.exec(blk)) !== null) {
    // balanced scan to the matching ')'
    let d = 1, j = m.index + m[0].length, inStr = '';
    while (j < blk.length && d > 0) {
      const c = blk[j];
      if (inStr) { if (c === '\\') { j += 2; continue; } if (c === inStr) inStr = ''; j++; continue; }
      if (c === '"' || c === "'" || c === '`') { inStr = c; j++; continue; }
      if (c === '(') d++;
      else if (c === ')') d--;
      j++;
    }
    const args = blk.slice(m.index + m[0].length, j - 1);
    const fm = args.match(/,\s*['"]([gimsuyvd]*)['"]\s*$/);
    const flags = fm ? fm[1] : '';
    const pat = fm ? args.slice(0, fm.index) : args;
    if (flags.includes('i') && /\[A-Z\]|\[A-Z[^\]]*\]/.test(pat)) {
      findings.push(['new RegExp', flags, pat.replace(/\s+/g, ' ').slice(0, 160), blk.slice(0, m.index).split('\n').length]);
    }
  }
}

console.log('BELT CASE-FLAG SWEEP — explicit uppercase class under a case-insensitive flag');
if (findings.length === 0) console.log('  none — no guard in the belt case-folds its own [A-Z] test');
for (const [kind, flags, body, line] of findings) {
  console.log(`  *** INERT-GUARD RISK *** ${kind} flags="${flags}" (belt line ~${line})`);
  console.log(`      ${body}`);
}
console.log(`\nfindings: ${findings.length}`);
process.exitCode = findings.length ? 1 : 0;
