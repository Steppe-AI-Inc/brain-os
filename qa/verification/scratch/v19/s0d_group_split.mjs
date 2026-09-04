// Per-GROUP false positives, so the entry's numbers are exact rather than rounded.
import fs from 'node:fs';
import { loadBelt, loadFile } from './x.mjs';
const s = fs.readFileSync('qa/verification/scratch/v19/s0_d130_both_directions.mjs', 'utf8');
const grab = (n) => {
  const m = s.match(new RegExp('const ' + n + ' = \\[([\\s\\S]*?)\\n\\];'));
  const out = [];
  for (const line of m[1].split('\n')) {
    const t = line.trim().replace(/,$/, '');
    if (/^'.*'$/.test(t)) out.push(t.slice(1, -1).replace(/\\'/g, "'"));
    else if (/^".*"$/.test(t)) out.push(t.slice(1, -1).replace(/\\"/g, '"'));
  }
  return out;
};
const G = { A: grab('A'), B: grab('B'), C: grab('C'), D: grab('D'), E: grab('E') };
const FAB = ['F_trailing', 'F_mid', 'F_negator_other_verb', 'F_present_plus_past', 'F_plain'].map((n) => [n, grab(n)]);
console.log('group sizes: ' + Object.entries(G).map(([k, v]) => k + '=' + v.length).join(' ')
  + '  fabrications: ' + FAB.map(([k, v]) => k + '=' + v.length).join(' '));
for (const rev of ['candidate', 'fbafded', 'a559f8f', '9535f0b', '52e830f', 'd724d8c']) {
  const p = rev === 'candidate' ? 'supabase/functions/sem-ai-command/index.ts' : 'qa/verification/scratch/v19/index_' + rev + '.ts';
  const b = loadBelt(loadFile(p)).readsAsCompletion;
  const fp = Object.entries(G).map(([k, v]) => k + ' ' + v.filter((x) => b(x)).length + '/' + v.length);
  const abc = [...G.A, ...G.B, ...G.C];
  console.log(rev.padEnd(10) + 'FP by group: ' + fp.join('  ') + '   | real-name groups A+B+C: ' + abc.filter((x) => b(x)).length + '/' + abc.length);
}
