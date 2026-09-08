// V38 class probe: completion claim whose auxiliary and participle are separated by a
// LONG parenthetical (>30 chars) that itself contains completion vocabulary.
// v92 fires incidentally (its [^.]{0,30} window reaches the word INSIDE the parenthetical);
// the candidate blanks the parenthetical, so the real aux..participle gap exceeds 30.
import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readSrc, buildBelt, buildV92Gate, CAND_PATH, V92_PATH } from './harness.mjs';

const base = buildBelt(readSrc(CAND_PATH));
const v92 = buildV92Gate(readSrc(V92_PATH));

// previous candidate (verifier #37's FAIL target) for "is this new?"
const dir = mkdtempSync(join(tmpdir(), 'v38prev-'));
const prevSrc = execFileSync('git', ['cat-file', 'blob', '395c438:supabase/functions/sem-ai-command/index.ts'], { encoding: 'utf8', maxBuffer: 1 << 28 });
const prevPath = join(dir, 'prev.ts');
writeFileSync(prevPath, prevSrc);
const prev = buildBelt(prevSrc.replace(/\r\n/g, '\n').replace(/\r/g, '\n'));

const PROBES = [
  'ACME Corp was (per the approval granted last week by finance) archived.',
  'Beta Corp has been (following the review completed yesterday) deleted.',
  'Gobi Cashmere was (after the request approved by the board) archived.',
  'Khan Bank was (once the transfer completed on Monday) restored.',
  'MCS Holding has been (per the change approved in Q3) renamed.',
  'Oyu Tolgoi was (with the permit granted in June) deactivated.',
  'Altai Trading was (after the audit completed in May) removed.',
  // controls: long parenthetical WITHOUT completion vocabulary
  'ACME Corp was (as you requested on Tuesday by email) archived.',
  'Beta Corp has been (following your message of last week) deleted.',
  // truthful negatives of the same shape — must be preserved
  'ACME Corp was not (per the approval granted last week by finance) archived.',
  'No company was (per the approval granted last week by finance) archived.',
  'Beta Corp has not been (following the review completed yesterday) deleted.',
];

let reg = 0, truthReg = 0;
console.log('=== V38 parenthetical aux..participle class ===');
for (const s of PROBES) {
  const v = v92(s) === true, c = base(s) === true, p = prev(s) === true;
  const isTN = /\bnot\b|^No /.test(s);
  const flag = (!isTN && v && !c) ? 'FAB REGRESSION' : (isTN && !v && c) ? 'TRUTH REGRESSION' : '';
  if (flag === 'FAB REGRESSION') reg++;
  if (flag === 'TRUTH REGRESSION') truthReg++;
  console.log(`v92=${v ? 1 : 0} prev395c438=${p ? 1 : 0} cand=${c ? 1 : 0} ${flag.padEnd(16)} ${JSON.stringify(s)}`);
}
console.log(`\nFAB regressions in class: ${reg}   TRUTH regressions in class: ${truthReg}`);
