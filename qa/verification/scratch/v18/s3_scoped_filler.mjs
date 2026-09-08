// VERIFIER #18 / SCENARIO 3 + 4 — attack the SCOPED filler (D127) and the D95 numbering
// seam (D129), driving the REAL matchDisambiguationOption.
import { matcherFor } from './v18_matcher.mjs';
const M = matcherFor('CANDIDATE');
const P = matcherFor('9535f0b');

const opt = (id, label, entityType = 'company', actionType = 'archive') => ({ id, label, entityType, actionType });
const show = (r) => `${r.bound === null ? 'DEAD-END' : 'BIND=' + r.bound}${r.contradicted ? ' CONTRADICTED' : ''}${r.armed ? ' ARMED=' + r.armed : ''}`;

function probe(title, options, replies, matcher = M) {
  console.log('\n--- ' + title + ' ---');
  for (const r of replies) {
    let out;
    try { out = show(matcher.decide(r, options)); } catch (e) { out = 'THREW ' + e.constructor.name + ': ' + e.message; }
    console.log('  ' + JSON.stringify(r).padEnd(40) + ' -> ' + out);
  }
}

const ARCH = [opt('c1', 'Acme', 'company', 'archive'), opt('c2', 'Beta Corp', 'company', 'archive')];
const REST = [opt('c1', 'Acme', 'company', 'restore'), opt('c2', 'Beta Corp', 'company', 'restore')];
const TWO = [opt('c1', 'Acme'), opt('c2', 'Beta Corp')];
const PEOPLE = [opt('p1', 'Bob Smith', 'person', 'archive'), opt('p2', 'Jane Doe', 'person', 'archive')];

console.log('=== SCENARIO 3 : the scoped filler ===');

probe('3a. restore-family options, an ARCHIVE verb in the reply (must dead-end AND contradict)', REST,
  ['archive acme', 'delete acme', 'remove acme', 'end acme', 'close acme', 'deactivate acme',
   'restore acme', 'reactivate acme', 'activate acme', 'unarchive acme', 'acme']);

probe('3b. archive-family options, a RESTORE verb in the reply', ARCH,
  ['restore acme', 'activate acme', 'reactivate acme', 'unarchive acme', 'reopen acme', 'undelete acme',
   'bring acme back', 'archive acme', 'acme']);

probe('3c. entityType OUTSIDE ENTITY_NOUNS — which nouns are admitted?',
  [opt('w1', 'Acme', 'work_order', 'archive'), opt('w2', 'Beta Corp', 'work_order', 'archive')],
  ['acme', 'the acme work order', 'archive acme', 'archive the acme record', 'the acme company']);

probe('3c2. entityType "record" (a SELECTION_FILLER word, but NOT an ENTITY_NOUNS key)',
  [opt('r1', 'Acme', 'record', 'archive'), opt('r2', 'Beta Corp', 'record', 'archive')],
  ['the acme record', 'the acme company', 'acme']);

probe('3c3. entityType alias "employee"', [opt('p1', 'Bob Smith', 'employee', 'archive'), opt('p2', 'Jane Doe', 'employee', 'archive')],
  ['bob smith', 'the bob smith employee', 'archive bob smith person', 'end bob smith employment']);

probe('3d. MIXED nouns — a reply naming a DIFFERENT entity type than the option', ARCH,
  ['the acme company', 'the acme company task', 'archive acme tasks', 'archive acme employees',
   'the acme goal', 'acme department']);

probe('3e. exclusions expressed purely in filler', ARCH,
  ['reject acme', 'no acme', 'not acme', 'skip acme', 'cancel acme', 'exclude acme']);

probe('3f. PROTOTYPE keys as actionType / entityType (ACTION_FAMILY_VERBS and ENTITY_NOUNS are bare object literals)',
  [opt('x1', 'Acme', 'company', 'constructor')], ['acme', 'archive acme']);
probe('3f2. prototype key as entityType', [opt('x1', 'Acme', 'constructor', 'archive')], ['acme']);
probe('3f3. __proto__ as actionType', [opt('x1', 'Acme', 'company', '__proto__')], ['acme']);
probe('3f4. toString as entityType', [opt('x1', 'Acme', 'toString', 'archive')], ['acme']);
probe('3f5. hasOwnProperty as actionType', [opt('x1', 'Acme', 'company', 'hasOwnProperty')], ['acme']);
probe('3f6. unknown but harmless actionType (falls back to the archive family)',
  [opt('x1', 'Acme', 'company', 'reassign')], ['acme', 'archive acme', 'restore acme']);

console.log('\n=== SCENARIO 4 : the D95 numbering seam ===');
probe('4a. reply naming the option by ITS OWN number', TWO,
  ['the company (option 1)', 'option 1', '1', '#1', 'the first one', 'acme (option 1)', 'acme option 1',
   'acme #1', 'option 1, acme', 'the company option 1', 'number 1', 'no. 1']);
probe('4b. the OTHER option\'s number must not bind the winner', TWO,
  ['acme (option 2)', 'acme #2', 'acme 2', 'acme option 2', 'option 2, acme']);
probe('4c. two options whose LABELS differ only by a number', [opt('a1', 'Depot 1'), opt('a2', 'Depot 2')],
  ['depot 1', 'depot 2', 'option 1', 'depot 1 (option 1)', 'depot 2 (option 1)', 'depot 1 (option 2)']);
probe('4d. a label that itself CONTAINS "(option 2)"', [opt('b1', 'Acme (option 2)'), opt('b2', 'Beta Corp')],
  ['acme (option 2)', 'acme', 'option 1', 'acme (option 2) (option 1)']);
probe('4e. what a founder actually types after the product renders "the company (option 1)"',
  [opt('f1', 'the company (option 1)'), opt('f2', 'the company (option 2)')],
  ['the company (option 1)', 'option 1', '1', '#1', 'the first one', 'the first']);

console.log('\n--- 9535f0b (prior candidate) on the same D129 replies, for comparison ---');
probe('4a-prior', TWO, ['acme (option 1)', 'option 1', '1', '#1', 'the first one', 'acme #1'], P);
