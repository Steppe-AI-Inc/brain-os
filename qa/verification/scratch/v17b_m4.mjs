// VERIFIER #17 — is the surviving mutant M4 a THIRTEENTH VACUOUS GUARD?
// Differential fuzz: candidate vs the M4 mutant (second-option guard removed from
// cleanSelection) over a large generated corpus. Any input where they differ is a case the
// guard actually decides. Runs entirely in memory; index.ts is never written.
import { readSrc, buildMatcherAny, opt } from './v17b_lib.mjs';

const SRC = readSrc();
const GUARD = "if (matches.some((o) => o !== winner && residual.includes(forMatching(o.label)))) return false;";
if (SRC.split(GUARD).length - 1 !== 1) throw new Error('guard literal not unique — refusing to report');
const NOW = buildMatcherAny(SRC);
const M4 = buildMatcherAny(SRC.replace(GUARD, ''));

const LABELS = ['Acme', 'Acme Holdings', 'Beta Corp', "Bob's Co", 'Bobs Co', 'Co', 'Task',
  'The One', 'Company', 'One', 'Record', 'Go Ahead', 'Smith', "Smith's Bakery", 'ACME'];
const WORDS = ['yes', 'ok', 'the', 'one', 'that', 'archive', 'please', 'company', 'task',
  'record', 'no', 'not', 'other', 'and', 'acme', 'beta', 'holdings', 'co', 'bobs', "bob's",
  'smith', 'bakery', 'go', 'ahead', '1', 'option'];

let diffs = 0, total = 0;
const seen = [];
// exhaustive-ish: every option pair/triple x every 1..3-word reply drawn from WORDS + labels
const REPLY_ATOMS = [...WORDS, ...LABELS.map((l) => l.toLowerCase())];
for (let i = 0; i < LABELS.length; i++) {
  for (let j = 0; j < LABELS.length; j++) {
    for (let k = -1; k < LABELS.length; k++) {
      if (i === j || i === k || j === k) continue;
      const options = [opt('o1', LABELS[i]), opt('o2', LABELS[j])];
      if (k >= 0) options.push(opt('o3', LABELS[k]));
      for (const a of REPLY_ATOMS) {
        for (const b of REPLY_ATOMS) {
          const reply = a + ' ' + b;
          total++;
          const x = NOW(reply, options), y = M4(reply, options);
          const xi = x ? x.id : null, yi = y ? y.id : null;
          if (xi !== yi) { diffs++; if (seen.length < 25) seen.push({ reply, options: options.map((o) => o.label), now: xi, m4: yi }); }
        }
      }
    }
  }
}
console.log(`differential fuzz: ${total} (reply x option-set) combinations`);
console.log(`cases where the second-option guard CHANGES the outcome: ${diffs}`);
for (const s of seen) console.log('  ' + JSON.stringify(s));

// Path-by-path proof of vacuity on the two hot paths.
console.log('\nPATH ANALYSIS (from the product source):');
console.log('  single-match path : matches.length === 1, so matches.some(o => o !== winner ...) is');
console.log('                      ALWAYS false. The guard is unreachable-as-true by construction.');
const specLine = SRC.slice(SRC.indexOf('const rest = normalizedCommand.split(forMatching(longest[0].label))'), SRC.indexOf('const rest = normalizedCommand.split(forMatching(longest[0].label))') + 260);
console.log('  specificity path  : the VERY NEXT statement repeats the identical test:');
console.log('                      ' + specLine.split('\n').map((l) => l.trim()).join(' ').slice(0, 210));
console.log('  raw tie-break path: the tied set shares one NORMALIZED label, so removing the winner');
console.log('                      removes the others too; a third, shorter match can only survive');
console.log('                      in the residual if its whole label is SELECTION_FILLER.');
// the one constructible observable shape
const OPTS = [opt('a', "Bob's Task"), opt('b', 'Bobs Task'), opt('c', 'Task')];
for (const reply of ["bob's task task", "bob's task", "bob's task and task"]) {
  const x = NOW(reply, OPTS), y = M4(reply, OPTS);
  console.log(`  constructed: ${JSON.stringify(reply).padEnd(24)} candidate=${x ? x.id : null}  M4=${y ? y.id : null}`
    + (((x ? x.id : null) !== (y ? y.id : null)) ? '   <-- the guard fires here' : ''));
}
