// Inject the EMPTY-SET default of `knownEntityNames` into every harness that rebuilds the belt.
//
// This is verifier #42's ruling, point 2: the belt reads one free identifier, and every extractor
// injects it as an EMPTY Set by default. That makes "an empty set must produce byte-identical
// verdicts" the STRUCTURAL DEFAULT of the whole battery instead of a control someone has to
// remember to run, and it is why absence can never quietly become evidence.
//
// The harnesses are found by RUNNING them, not by guessing: a missing injection throws
// `knownEntityNames is not defined`, which is the loud failure #42 wanted in place of a silent drop.
import { readFileSync, writeFileSync } from 'node:fs';

const STUB = 'const knownEntityNames = new Set();\\n';
const FILES = process.argv.slice(2);
if (!FILES.length) { console.log('usage: v43_inject_entity_stub.mjs <file> [...]'); process.exit(2); }

let changed = 0, skipped = 0;
for (const f of FILES) {
  const src = readFileSync(f, 'utf8');
  if (src.includes('knownEntityNames = new Set()')) { console.log('already   ' + f); skipped++; continue; }
  let out = src;

  // Pattern A — the body opens with another injected stub literal. Join it rather than adding a
  // second new Function argument, so the harness keeps exactly one place that seeds the scope.
  const A = "new Function('const verifiedClaims = [];\\n' + ";
  if (out.includes(A)) {
    out = out.split(A).join("new Function('" + STUB + "const verifiedClaims = [];\\n' + ");
  }

  // Pattern B — the body is a bare expression. Prepend the stub as a string.
  for (const v of ['body', 'fn', 'slice', 'parts.join(\'\\n\')']) {
    const B = 'new Function(' + v + ' + ';
    if (out.includes(B)) out = out.split(B).join("new Function('" + STUB + "' + " + v + ' + ');
  }

  if (out === src) { console.log('NO PATTERN MATCHED  ' + f + '  — inject by hand'); continue; }
  writeFileSync(f, out);
  console.log('injected  ' + f);
  changed++;
}
console.log('');
console.log('changed ' + changed + ', already-present ' + skipped);
