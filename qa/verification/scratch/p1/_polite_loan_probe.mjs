import { readFileSync } from 'node:fs';
import { stripTS } from '../../../scenarios-runner/_gate_extract.mjs';
const base = readFileSync('supabase/functions/sem-ai-command/index.ts', 'utf8').replace(/\r\n/g, '\n');

function intentFor(src) {
  const iS = src.indexOf('const MUTATION_ARRAY_FIELDS = [');
  const iE = src.indexOf('void lexiconReadVetoed;');
  const fn = new Function('command', 'result', stripTS(src.slice(iS, iE + 'void lexiconReadVetoed;'.length)) + '\nreturn requestedIntentPrimary;');
  return (c) => fn(c, {});
}
function neuter(src, name) {
  const re = new RegExp('(const ' + name + ' = )\\/[\\s\\S]*?\\/[gimsuyv]*(;)');
  const m = re.exec(src);
  if (!m) throw new Error('not found: ' + name);
  return src.slice(0, m.index) + m[1] + '/(?!)/' + m[2] + src.slice(m.index + m[0].length);
}

const real = intentFor(base);
console.log('\nMongolian loan verb (real bytes):');
for (const c of ['ACME-г archive хийнэ үү', 'Тайланг export хийнэ үү', 'ACME-г archive хий',
  'Ямар компаниудыг archive хийсэн бэ?']) {
  console.log('  ' + (real(c) ? 'INTENT' : 'null  ') + '   ' + JSON.stringify(c));
}
