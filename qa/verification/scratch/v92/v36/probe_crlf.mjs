// v36: where is the lone CR, and does any code consume a multiline template literal by splitting on '\n'?
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, '..', '..', '..', '..');
const b = readFileSync(join(repo, 'supabase/functions/sem-ai-command/index.ts'));
for (let i = 0; i < b.length; i++) {
  if (b[i] === 13 && b[i + 1] !== 10) {
    const line = b.subarray(0, i).toString('utf8').split('\n').length;
    console.log('lone CR at byte', i, 'line', line);
    console.log(JSON.stringify(b.subarray(Math.max(0, i - 160), Math.min(b.length, i + 160)).toString('utf8')));
  }
}
const s = b.toString('utf8');
const lines = s.split('\n');
const hits = [];
lines.forEach((l, i) => { if (/split\((['"`])\\n\1\)|split\(\/\\n|split\(\/\\r|\.split\(\/\[\\r\\n\]|\/\\n\/|\\r\\n/.test(l)) hits.push((i + 1) + ': ' + l.trim().slice(0, 160)); });
console.log('newline-splitting / CR-aware lines:', hits.length);
for (const h of hits) console.log('  ' + h);
// Multiline template literals: are any of them later split on '\n'? list the variables they're assigned to
const tpl = [...s.matchAll(/(?:const|let)\s+(\w+)\s*=\s*`[^`]*\r\n[^`]*`/g)].map((m) => m[1]);
console.log('multiline template literal variables:', tpl.length, tpl.slice(0, 60).join(', '));
