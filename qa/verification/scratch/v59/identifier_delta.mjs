#!/usr/bin/env node
// VERIFIER #59 — own identifier delta v92 (git c9dfab5bd433) -> candidate. Declared identifiers = every
// `const|let|var|function|async function|type|interface|class NAME` at any indentation, plus named function
// params are NOT counted (declarations only). Removed = present in v92, absent in candidate.
import { readFileSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../../../..');
const cand = readFileSync(join(ROOT, 'supabase/functions/sem-ai-command/index.ts'), 'utf8').replace(/\r\n/g, '\n');
const v92 = execSync('git show c9dfab5bd433:supabase/functions/sem-ai-command/index.ts', { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }).replace(/\r\n/g, '\n');
function decls(s) {
  const set = new Set();
  const re = /(?:^|[^\w$.])(?:const|let|var|function|type|interface|class)\s+([A-Za-z_$][\w$]*)/g;
  let m; while ((m = re.exec(s))) set.add(m[1]);
  const re2 = /async\s+function\s+([A-Za-z_$][\w$]*)/g; while ((m = re2.exec(s))) set.add(m[1]);
  return set;
}
const a = decls(v92), b = decls(cand);
const added = [...b].filter((x) => !a.has(x)), removed = [...a].filter((x) => !b.has(x));
const imports = (s) => s.split('\n').filter((l) => /^import /.test(l));
const res = { v92: { lines: v92.split('\n').length, bytes: Buffer.byteLength(v92), declared: a.size, imports: imports(v92) }, candidate: { lines: cand.split('\n').length, bytes: Buffer.byteLength(cand), declared: b.size, imports: imports(cand) }, added: added.length, removed, addedList: added };
console.log(JSON.stringify({ ...res, addedList: undefined }, null, 2));
console.log('hunks:', execSync('git diff --no-index --stat c9dfab5bd433:supabase/functions/sem-ai-command/index.ts supabase/functions/sem-ai-command/index.ts 2>/dev/null || true', { cwd: ROOT, encoding: 'utf8', shell: true }).trim().slice(-200));
writeFileSync(join(HERE, 'identifier_delta.json'), JSON.stringify(res, null, 2));
