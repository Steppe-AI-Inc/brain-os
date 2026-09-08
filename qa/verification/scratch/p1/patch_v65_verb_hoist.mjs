// The verb convergence introduced a TDZ: FIRST_CLAUSE_VERB is declared BEFORE MUTATION_IMPERATIVE_VERB, so
// aliasing one to the other crashed. That is the third time this round that declaration order has been the
// real constraint, and the pattern is now clear enough to act on rather than work around: a concept shared
// by several consumers belongs at MODULE level, above all of them, exactly like REQUEST_FRAME_ALTERNATION
// and CONFIRMATION_ALTERNATION. Ordering hazards then cannot exist, because there is nothing to order.
import { readFileSync, writeFileSync } from 'node:fs';
const p = process.argv[2] || 'supabase/functions/sem-ai-command/index.ts';
let s = readFileSync(p, 'utf8').replace(/\r\n/g, '\n');
let n = 0;
function must(a, b, label) { const c = s.split(a).length - 1; if (c !== 1) throw new Error(label + ': found ' + c); s = s.replace(a, () => b); n++; }

// Lift the verb alternation out of the regex literal and up to module level.
const line = s.split('\n').find((l) => l.includes('const MUTATION_IMPERATIVE_VERB = /^\\s*(?:'));
if (!line) throw new Error('MUTATION_IMPERATIVE_VERB not found');
const alternation = line.slice(line.indexOf('(?:') + 3, line.indexOf(')\\b\\s+\\S'));
if (alternation.length < 200) throw new Error('verb alternation looks wrong: ' + alternation.length + ' chars');

must(`const CONFIRMATION_ALTERNATION = `,
`// THE ONE DEFINITION OF A MUTATION VERB IN IMPERATIVE POSITION. Consumers: the imperative-position tier and
// the first-clause rule, which were two spellings of the same concept and had already drifted — the
// first-clause list was missing about seventy verbs the imperative list carried (founder directive
// 2026-09-08 §1). At module level, above every consumer, so declaration order cannot become the constraint:
// the same TDZ hazard has now bitten three times in one round.
const MUTATION_VERB_ALTERNATION = ${JSON.stringify(alternation)};
const CONFIRMATION_ALTERNATION = `, 'verb alternation');

must(line, `        const MUTATION_IMPERATIVE_VERB = new RegExp('^\\\\s*(?:' + MUTATION_VERB_ALTERNATION + ')\\\\b\\\\s+\\\\S', 'i');`, 'imperative verb');

// FIRST_CLAUSE_VERB is the same concept without the object requirement (the object is checked separately by
// objectRefers), so it is built from the same list rather than aliased to a regex declared later.
must(`        // The same concept as MUTATION_IMPERATIVE_VERB — "a mutation verb at the head of a clause" — in a
        // second spelling, and already drifted: this list was missing ~70 verbs the other carries. One
        // definition, two consumers (founder directive §1).
        const FIRST_CLAUSE_VERB = MUTATION_IMPERATIVE_VERB;`,
`        // The same concept as MUTATION_IMPERATIVE_VERB — "a mutation verb at the head of a clause" — in a
        // second spelling, and already drifted: this list was missing ~70 verbs the other carries. Both are
        // now built from MUTATION_VERB_ALTERNATION. This one omits the object requirement because the caller
        // checks the object itself, with a stricter bar than the imperative tier uses.
        const FIRST_CLAUSE_VERB = new RegExp('^\\\\s*(?:' + MUTATION_VERB_ALTERNATION + ')\\\\w*', 'i');`, 'first clause verb');

const out = s.replace(/\n/g, '\r\n');
if ((out.match(/(^|[^\r])\n/g) || []).length) throw new Error('bare LF');
for (const [def, use] of [['const MUTATION_VERB_ALTERNATION', 'const MUTATION_IMPERATIVE_VERB'],
  ['const MUTATION_VERB_ALTERNATION', 'const FIRST_CLAUSE_VERB'],
  ['const CONFIRMATION_ALTERNATION', 'const isShortAffirmative'],
  ['const REQUEST_FRAME_ALTERNATION', 'const IMPERATIVE_HEAD_RE']]) {
  if (out.indexOf(def) > out.indexOf(use)) throw new Error(def + ' is declared after ' + use);
}
writeFileSync(p, out); console.log('applied', n);
