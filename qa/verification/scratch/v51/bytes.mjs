// VERIFIER #51 — byte census of the candidate and the LF-normalised v92 -> candidate diff counts.
// Runs from repo root: node qa/verification/scratch/v51/bytes.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';

const CAND = 'supabase/functions/sem-ai-command/index.ts';
const b = readFileSync(CAND);
const s = b.toString('latin1');
let crlf = 0, bareLF = 0, bareCR = 0;
for (let i = 0; i < s.length; i++) {
  if (s[i] === '\n') { if (s[i - 1] === '\r') crlf++; else bareLF++; }
  else if (s[i] === '\r' && s[i + 1] !== '\n') bareCR++;
}
const lines = crlf + bareLF + (s.endsWith('\n') ? 0 : 1);
console.log('candidate bytes=' + b.length + ' sha256=' + createHash('sha256').update(b).digest('hex'));
console.log('candidate CRLF=' + crlf + ' bareLF=' + bareLF + ' bareCR=' + bareCR + ' lines=' + lines);

const v92 = execFileSync('git', ['show', 'c9dfab5bd433:' + CAND]);
console.log('v92 git bytes=' + v92.length + ' sha256=' + createHash('sha256').update(v92).digest('hex'));
writeFileSync('qa/verification/scratch/v51/index.v92.git.ts', v92);
const candLF = Buffer.from(b.toString('utf8').replace(/\r\n/g, '\n'));
writeFileSync('qa/verification/scratch/v51/index.cand.lf.ts', candLF);
console.log('candidate LF-normalised sha256=' + createHash('sha256').update(candLF).digest('hex') + ' bytes=' + candLF.length);
let diff = '';
try { diff = execFileSync('git', ['diff', '--no-index', '--no-color', 'qa/verification/scratch/v51/index.v92.git.ts', 'qa/verification/scratch/v51/index.cand.lf.ts'], { encoding: 'utf8', maxBuffer: 1 << 28 }); } catch (e) { diff = e.stdout; }
writeFileSync('qa/verification/scratch/v51/v92_to_cand.lf.diff', diff);
const ins = diff.split('\n').filter((l) => l.startsWith('+') && !l.startsWith('+++')).length;
const del = diff.split('\n').filter((l) => l.startsWith('-') && !l.startsWith('---')).length;
const hunks = diff.split('\n').filter((l) => l.startsWith('@@')).length;
console.log('LF-normalised diff v92->cand: +' + ins + ' / -' + del + ' in ' + hunks + ' hunks');
const stat = execFileSync('git', ['diff', '--stat', 'c9dfab5bd433', 'c2a57ac', '--', 'supabase/functions/'], { encoding: 'utf8' });
console.log('deploy surface stat (supabase/functions/):\n' + stat);
const names = execFileSync('git', ['diff', '--name-status', 'c9dfab5bd433', 'c2a57ac', '--', 'supabase/'], { encoding: 'utf8' });
console.log('supabase/ name-status v92->cand:\n' + names);
