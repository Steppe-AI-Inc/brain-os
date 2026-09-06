// The EMPTY-SET default, installed once per harness process.
//
// Verifier #42's ruling is that every extractor injects `knownEntityNames` as an EMPTY Set by
// default. Some harnesses build the belt at one site and take a string argument; others build it at
// three or four sites with different argument shapes. Threading a stub through each call site would
// mean a different edit per site and a new one every time a harness grows another builder — the kind
// of per-file bookkeeping that goes stale silently.
//
// `new Function` bodies execute in the GLOBAL scope, so one assignment per harness process makes the
// identifier resolve at every build site in that file, present and future. The value is an EMPTY
// Set, so the belt's positive-only test is inert and verdicts are byte-identical to a build without
// the signal — which is precisely the control the design requires, now structural rather than
// remembered.
//
// The populated set belongs to exactly one dedicated suite, which assigns it deliberately.
import { readFileSync, writeFileSync } from 'node:fs';

const LINE = "\n// Verifier #42's ruling: every extractor injects the entity-name set as an EMPTY Set by default,\n"
  + "// so a name being ABSENT proves nothing and the belt's positive-only signal is inert here. This is\n"
  + "// what makes \"an empty set produces byte-identical verdicts\" the structural default of the whole\n"
  + "// battery rather than a control someone has to remember to run. `new Function` bodies execute in\n"
  + "// global scope, so this one assignment reaches every belt-build site in this file.\n"
  + "globalThis.knownEntityNames = globalThis.knownEntityNames || new Set();\n";

let changed = 0;
for (const f of process.argv.slice(2)) {
  const src = readFileSync(f, 'utf8');
  if (src.includes('globalThis.knownEntityNames')) { console.log('already   ' + f); continue; }
  // insert after the last top-level import statement, so the default is installed before any
  // module-scope code in this file runs a builder.
  const re = /^import .*?;\s*$/gm;
  let last = null, m;
  while ((m = re.exec(src)) !== null) last = m;
  if (!last) { console.log('NO IMPORT BLOCK  ' + f + '  — inject by hand'); continue; }
  const at = last.index + last[0].length;
  writeFileSync(f, src.slice(0, at) + '\n' + LINE + src.slice(at));
  console.log('defaulted ' + f);
  changed++;
}
console.log('\nchanged ' + changed);
