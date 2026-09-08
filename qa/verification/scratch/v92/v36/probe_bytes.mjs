import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '..', '..', '..', '..');
const b = fs.readFileSync(path.join(repo, 'supabase/functions/sem-ai-command/index.ts'));
let nul = 0, hi = 0, loneLF = 0, loneCR = 0;
for (let i = 0; i < b.length; i++) {
  const x = b[i];
  if (x === 0) nul++;
  if (x > 127) hi++;
  if (x === 10 && (i === 0 || b[i - 1] !== 13)) loneLF++;
  if (x === 13 && b[i + 1] !== 10) loneCR++;
}
console.log({ NUL: nul, nonAscii: hi, loneLF, loneCR, first8000HasNUL: b.subarray(0, 8000).includes(0), bytes: b.length });
console.log('updated_at', new Date(1788239725518).toISOString(), 'created_at', new Date(1787496757975).toISOString());
const s = b.toString('utf8');
const tl = (s.match(/`[^`]*\r\n[^`]*`/g) || []).length;
console.log('multiline template literals (approx, CRLF inside backticks)', tl);
// longest line
const lines = s.split('\r\n');
let max = 0, maxIdx = -1;
lines.forEach((l, i) => { if (l.length > max) { max = l.length; maxIdx = i + 1; } });
console.log('longest line', max, 'at', maxIdx);
