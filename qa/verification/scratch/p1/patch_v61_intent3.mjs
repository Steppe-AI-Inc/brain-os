// V61-D7, third and final part, plus the regression the second part caused.
//
// Tightening the object head alone rejected "revoke access for Bob" — a real command whose object is an
// abstract but perfectly ordinary product noun. Loosening it to admit that re-admitted "Share price fell
// after the announcement". Neither test is sufficient alone, because the two shapes differ in TWO ways at
// once: what the object head is, and whether the clause has a finite main verb.
//
// So both are required: the object head must REFER (determiner phrase, proper noun, identifier, quoted
// string, pronoun, number, product noun, or a lone token), AND the clause must not continue into a FINITE
// MAIN VERB, which is what makes it a sentence about the world rather than an instruction.
//
//   "revoke access for Bob"                        head=access ✓   finite verb: none ✓ → command
//   "Share price fell after the announcement"      head=price  ✓   finite verb: fell  ✗ → statement
//   "Archive policy needs a review before year end" head=policy ✗                      → statement
//   "Block 3 of the warehouse flooded overnight"    head=3      ✓   finite verb: flooded ✗ → statement
//
// The product-noun list is domain vocabulary, not per-example tuning: access, permission, deadline,
// priority, status, title, owner, manager, budget, price and the rest are things this product actually has
// operations on, and they belong beside company/task/goal, which were already there.
import { readFileSync, writeFileSync } from 'node:fs';
const p = process.argv[2] || 'supabase/functions/sem-ai-command/index.ts';
let s = readFileSync(p, 'utf8').replace(/\r\n/g, '\n');
let n = 0;
function must(a, b, label) { const c = s.split(a).length - 1; if (c !== 1) throw new Error(label + ': found ' + c); s = s.replace(a, () => b); n++; }

must(`|record|entry|row|item|file)\\b|^\\S+\\s*$/;`,
     `|record|entry|row|item|file|access|permissions?|invitations?|invites?|membership|subscriptions?|notifications?|reminders?|deadlines?|priority|status|titles?|names?|descriptions?|budgets?|prices?|stages?|values?|emails?|phones?|addresses?|labels?|tags?|categor(?:y|ies)|shifts?)\\b|^\\S+\\s*$/;`, 'product nouns');

must(`        const alwaysMatch = commandText.match(MUTATION_VERB_ALWAYS);`,
`        // A FINITE MAIN VERB after the object turns the clause into a statement about the world. An
        // instruction has no second finite verb: "revoke access for Bob" has none, "Share price fell after
        // the announcement" has "fell" (verifier #61, V61-D7).
        const STATEMENT_FINITE_VERB = /(?:^|\\s)(?:is|are|was|were|am|be|been|being|has|have|had|will|would|shall|should|can|could|may|might|must|does|did|isn['’]t|aren['’]t|wasn['’]t|weren['’]t|needs?|seems?|looks?|means?|includes?|requires?|remains?|appears?|shows?|starts?|ends?|applies|works?|happens?|belongs?|costs?|arrived|called|fell|flooded|blocked|created|agreed|started|ended|changed|moved|failed|passed|expired|dropped|rose|grew|went|came|said|told|broke|stopped|continued|returned|increased|decreased|remained|occurred|appeared)(?=\\s|$|[.,;!?])/i;
        const objectRefers = (rest: string) => IMPERATIVE_OBJECT.test(rest) && !STATEMENT_FINITE_VERB.test(rest);
        const alwaysMatch = commandText.match(MUTATION_VERB_ALWAYS);`, 'finite verb test');

must(`          return IMPERATIVE_OBJECT.test(clause.slice(m[0].length).trim());`,
     `          return objectRefers(clause.slice(m[0].length).trim());`, 'always uses objectRefers');

must(`          return IMPERATIVE_OBJECT.test(rest) ? clause : null;`,
     `          return objectRefers(rest) ? clause : null;`, 'imperative uses objectRefers');

const out = s.replace(/\n/g, '\r\n');
if ((out.match(/(^|[^\r])\n/g) || []).length) throw new Error('bare LF');
if (out.indexOf('const objectRefers') > out.indexOf('function headHasObject')) throw new Error('objectRefers declared after use');
writeFileSync(p, out); console.log('applied', n);
