// verifier #11: what exactly changed byte-wise in index.ts across 4de63e4 (raw diff rewrites
// every line, -w diff is +110/-10). Read-only: git show + local file read.
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const P = 'supabase/functions/sem-ai-command/index.ts';
const blob = (rev) => spawnSync('git', ['show', rev + ':' + P], { maxBuffer: 64 * 1024 * 1024 }).stdout;
const stats = (buf, name) => {
  let cr = 0, lf = 0, tab = 0, trailingWs = 0, bom = buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf, nul = 0;
  for (let i = 0; i < buf.length; i++) { const b = buf[i]; if (b === 13) cr++; else if (b === 10) lf++; else if (b === 9) tab++; else if (b === 0) nul++; }
  const text = buf.toString('utf8');
  for (const line of text.split('\n')) if (/[ \t\r]$/.test(line)) trailingWs++;
  console.log(`${name.padEnd(12)} bytes=${buf.length} sha256=${createHash('sha256').update(buf).digest('hex').slice(0, 16)}… CR=${cr} LF=${lf} TAB=${tab} NUL=${nul} BOM=${bom} linesWithTrailingWs=${trailingWs}`);
  return text;
};
const a = stats(blob('4de63e4~1'), '4de63e4~1');
const b = stats(blob('4de63e4'), '4de63e4');
const h = stats(blob('HEAD'), 'HEAD');
const w = stats(readFileSync(P), 'worktree');
// normalize: strip CR + trailing ws, then compare line arrays
const norm = (t) => t.replace(/\r/g, '').split('\n').map((l) => l.replace(/[ \t]+$/, ''));
const na = norm(a), nb = norm(b);
let same = 0, diff = 0;
const max = Math.max(na.length, nb.length);
// crude LCS-free count: lines in b not in a set / lines in a not in b set
const setA = new Set(na), setB = new Set(nb);
const onlyB = nb.filter((l) => !setA.has(l)).length, onlyA = na.filter((l) => !setB.has(l)).length;
console.log(`normalized: linesA=${na.length} linesB=${nb.length} linesOnlyInA=${onlyA} linesOnlyInB=${onlyB}`);
// Characterize a sample of changed lines with raw bytes at EOL
const rawA = a.split('\n'), rawB = b.split('\n');
let shown = 0;
for (let i = 0; i < Math.min(rawA.length, rawB.length) && shown < 3; i++) {
  if (rawA[i] !== rawB[i]) { shown++; console.log(`line ${i + 1} A tail bytes: ${JSON.stringify(rawA[i].slice(-6))} | B tail bytes: ${JSON.stringify(rawB[i].slice(-6))}`); }
}
console.log('HEAD blob === worktree bytes: ' + (Buffer.compare(blob('HEAD'), readFileSync(P)) === 0));
