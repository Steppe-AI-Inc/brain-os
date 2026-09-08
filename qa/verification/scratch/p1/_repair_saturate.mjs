import { readFileSync, writeFileSync } from 'node:fs';
const p = 'qa/verification/scratch/p1/patch_witness_saturate.mjs';
const lines = readFileSync(p, 'utf8').split(/\r?\n/);
// lines[5..7] are the mangled read; lines carrying the mangled write are found by marker.
const readLine = String.raw`let s = readFileSync(p, 'utf8').replace(/\r\n/g, '\n');`;
const writeLine = String.raw`writeFileSync(p, s.replace(/\n/g, '\r\n')); console.log('saturated fixture applied');`;
const out = [];
for (let i = 0; i < lines.length; i++) {
  if (lines[i].startsWith("let s = readFileSync(p, 'utf8').replace(/") && lines[i].endsWith('/')) { out.push(readLine); i += 2; continue; }
  if (lines[i].startsWith('writeFileSync(p, s.replace(/') && !lines[i].includes("'\n'")) { out.push(writeLine); i += 2; continue; }
  if (lines[i].startsWith('writeFileSync(p, s);')) { out.push(writeLine); continue; }
  out.push(lines[i]);
}
const txt = out.join('\n');
if (!txt.includes(readLine) || !txt.includes(writeLine)) throw new Error('repair failed');
writeFileSync(p, txt); console.log('repaired');
