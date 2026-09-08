// Which mutation-proof anchors no longer match the source, and how badly. A proof whose FIRST anchor is
// stale throws and tells you nothing about the rest, so this reports all of them at once.
import { readFileSync } from 'node:fs';

const src = readFileSync('supabase/functions/sem-ai-command/index.ts', 'utf8');
for (const f of process.argv.slice(2)) {
  const path = 'qa/verification/scratch/p1/' + f + '_mutation_proof.mjs';
  const t = readFileSync(path, 'utf8');
  console.log('=== ' + f);
  // Each mutant is `['name', (s) => mustReplace(s, <anchor>, <replacement>, 'label')]`.
  const re = /mustReplace\(s,\s*(`(?:[^`\\]|\\.)*`|'(?:[^'\\]|\\.)*')/g;
  let m, i = 0, bad = 0;
  while ((m = re.exec(t))) {
    i++;
    const q = m[1];
    // Both quote forms escape a literal backslash as \\, and the anchors are full of \p{L} / \s / \b.
    // Missing that reports live anchors as stale, which is the same fail-open shape in the auditor itself.
    let a = q.slice(1, -1).replace(/\\'/g, "'").replace(/\\`/g, '`').replace(/\\n/g, '\n').replace(/\\\\/g, '\\');
    const n = src.split(a).length - 1;
    if (n !== 1) { bad++; console.log('  anchor#' + i + ' occurrences=' + n + '  :: ' + a.slice(0, 100).replace(/\n/g, '\\n')); }
  }
  console.log('  ' + i + ' anchors, ' + bad + ' stale');
}
