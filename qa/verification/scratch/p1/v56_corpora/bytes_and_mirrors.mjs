// v56: byte discipline + mirror drift + import surface, all from the filesystem.
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const ROOT = new URL('../../../../', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const p = (r) => ROOT + r;
const idx = readFileSync(p('supabase/functions/sem-ai-command/index.ts'));
const sha = createHash('sha256').update(idx).digest('hex');
const s = idx.toString('utf8');
const crlf = (s.match(/\r\n/g) || []).length;
const bareLf = (s.match(/(?<!\r)\n/g) || []).length;
const bareCr = (s.match(/\r(?!\n)/g) || []).length;
console.log('index.ts sha256', sha, 'bytes', idx.length, 'CRLF', crlf, 'bareLF', bareLf, 'bareCR', bareCr, 'lines', s.split('\n').length);
const imports = s.split('\n').filter((l) => /^\s*import\s/.test(l) || /\bfrom\s+['"]/.test(l) && /import/.test(l));
console.log('import lines:', imports.map((l) => l.trim()));
console.log('mentions _shared outside comments:', s.split('\n').filter((l) => /_shared/.test(l) && !/^\s*\/\//.test(l)).length);
const norm = (x) => readFileSync(p(x), 'utf8').replace(/\r\n/g, '\n');
for (const [a, b] of [
  ['web/lib/contracts/execution.ts', 'supabase/functions/_shared/execution.ts'],
  ['web/lib/contracts/collection.ts', 'supabase/functions/_shared/collection.ts'],
  ['web/lib/contracts/lifecycle.ts', 'supabase/functions/_shared/lifecycle.ts'],
  ['web/lib/policy/archived-parent.ts', 'supabase/functions/_shared/parent-policy.ts'],
]) {
  let A, B;
  try { A = norm(a); B = norm(b); } catch (e) { console.log('MISSING', a, b, e.message); continue; }
  if (A === B) console.log('IDENTICAL', a, '==', b);
  else {
    const la = A.split('\n'), lb = B.split('\n');
    let d = 0; const diffs = [];
    for (let i = 0; i < Math.max(la.length, lb.length); i++) if (la[i] !== lb[i]) { d++; if (diffs.length < 6) diffs.push({ line: i + 1, web: la[i], edge: lb[i] }); }
    console.log('DIFFER', a, 'vs', b, 'differing lines', d, JSON.stringify(diffs, null, 1));
  }
}
