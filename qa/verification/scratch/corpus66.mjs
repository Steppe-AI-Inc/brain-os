import { readFileSync } from 'node:fs';
import { run } from './attack66.mjs';
const rows = JSON.parse(readFileSync(new URL('./corpus_rows.json', import.meta.url), 'utf8'));
let v92fires = 0, branchEmptyClaimsFires = 0;
const escapes = [];
for (const r of rows) {
  const s = r.summary || '';
  const a = run({ claims: null, summary: s });           // == deployed v92 (proven identical condition)
  const b = run({ claims: [], summary: s });             // branch, model emitted an empty claims array
  if (a.corrected) v92fires++;
  if (b.corrected) branchEmptyClaimsFires++;
  if (a.corrected && !b.corrected) escapes.push(r);
}
console.log('corpus rows           :', rows.length);
console.log('v92 corrects          :', v92fires);
console.log('branch(claims:[]) corrects:', branchEmptyClaimsFires);
console.log('rows v92 catches that the branch lets through:', escapes.length);
console.log();
for (const e of escapes.slice(0, 40)) {
  console.log('--- ' + e.id);
  console.log('  cmd: ' + JSON.stringify((e.command || '').slice(0, 90)));
  console.log('  out: ' + JSON.stringify((e.summary || '').slice(0, 220)));
}
console.log('\n=== FULL LIST ===');
for (const e of escapes) console.log(e.id.slice(0,8) + ' | ' + JSON.stringify((e.summary||'').replace(/\s+/g,' ').slice(0,190)));
