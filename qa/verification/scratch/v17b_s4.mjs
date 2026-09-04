// VERIFIER #17 / SCENARIO 4 — attack CANONICAL_TYPE_ALIAS + the D119 drop.
import { readSrc, buildGate, buildMatcherAny, buildMatcher, opt, canonMap, ID_A, ID_B, ID_C, statementFrom, balancedFrom, ts2js } from './v17b_lib.mjs';
import { readFileSync } from 'node:fs';

const src = readSrc();
const gate = buildGate(src);
const gate52 = buildGate(readFileSync('qa/verification/scratch/v17b_idx_52e830f.ts', 'utf8'), { requireAlias: false });
const match = buildMatcher(src);
const L = (r) => r.options.map((o) => o.label);

// alias table straight from source
const aliasSrc = balancedFrom(src, 'const CANONICAL_TYPE_ALIAS');
const ALIAS = {};
for (const m of aliasSrc.matchAll(/(\w+)\s*:\s*'(\w+)'/g)) ALIAS[m[1]] = m[2];
console.log('CANONICAL_TYPE_ALIAS (from source): ' + JSON.stringify(ALIAS));
// executable action map from source
const fieldSrc = statementFrom(src, 'const CLARIFICATION_ENTITY_ACTION_FIELD');
const EXEC = Object.keys(ALIAS).filter((k) => new RegExp('^\\s*' + k + ':\\s*\\{', 'm').test(fieldSrc));
console.log('alias keys that are ALSO executable in CLARIFICATION_ENTITY_ACTION_FIELD: ' + JSON.stringify(EXEC));
console.log('alias keys that resolve a NAME but can never execute: '
  + JSON.stringify(Object.keys(ALIAS).filter((k) => !EXEC.includes(k))) + '\n');

const say = (t, v) => console.log('  ' + t.padEnd(74) + JSON.stringify(v));

console.log('--- 4a. alias resolves a REAL name (D124 closure) ---');
say('employee + person| row', L(gate([opt(ID_A, 'Bob Smith', 'employee')],
  { canonical: new Map([['person|' + ID_A, { full_name: 'Bob Smith' }]]) })));
say('organization + company| row', L(gate([opt(ID_A, 'whatever', 'organization')],
  { canonical: canonMap([['company', ID_A, 'ACME Holdings']]) })));
say('okr + goal| row', L(gate([opt(ID_A, 'x', 'okr')], { canonical: canonMap([['goal', ID_A, 'Q3 Revenue']]) })));
say('ticket + task| row', L(gate([opt(ID_A, 'x', 'ticket')], { canonical: canonMap([['task', ID_A, 'Fix pump']]) })));
say('52e830f, same employee case (the D124 defect)', L(gate52([opt(ID_A, 'Bob Smith', 'employee')],
  { canonical: new Map([['person|' + ID_A, { full_name: 'Bob Smith' }]]) })));

console.log('\n--- 4b. id known under the ORIGINAL type but NOT the alias (must DROP) ---');
say("employee whose id is a company| row", L(gate([opt(ID_A, 'Bob Smith', 'employee')],
  { canonical: canonMap([['company', ID_A, 'ACME']]) })));
say("organization whose id is a person| row", L(gate([opt(ID_A, 'ACME', 'organization')],
  { canonical: new Map([['person|' + ID_A, { full_name: 'Bob' }]]) })));
say("employee whose id is keyed literally 'employee|'", L(gate([opt(ID_A, 'Bob', 'employee')],
  { canonical: new Map([['employee|' + ID_A, { full_name: 'Bob' }]]) })));
say("ticket whose id is keyed literally 'ticket|'", L(gate([opt(ID_A, 'T', 'ticket')],
  { canonical: new Map([['ticket|' + ID_A, { title: 'T' }]]) })));

console.log('\n--- 4c. unlisted / hostile entityTypes (must DROP unless the read knows them) ---');
for (const et of ['subsidiary', 'branch', 'unit', 'invoice', 'record', 'THE RECORD', '', 'proto',
  '__proto__', 'constructor', 'toString', 'hasOwnProperty', 'valueOf']) {
  say(`unlisted entityType ${JSON.stringify(et)} (nothing in the read)`, L(gate([opt(ID_A, 'Terminated Bob Smith', et)])));
}
say('entityType is not a string (number)', L(gate([{ id: ID_A, label: 'X', entityType: 7, actionType: 'archive' }])));
say('entityType absent', L(gate([{ id: ID_A, label: 'X', actionType: 'archive' }])));
say('id absent', L(gate([{ label: 'X', entityType: 'company', actionType: 'archive' }])));
say('id empty string', L(gate([opt('', 'X', 'company')])));

console.log('\n--- 4d. runtime labels (lastKnownLabel) for ALIASED types ---');
say("employee + runtimeLabels keyed 'person|' (write site type)", L(gate([opt(ID_A, 'anything', 'employee')],
  { runtime: new Map([['person|' + ID_A, 'Fresh Person']]) })));
say("employee + runtimeLabels keyed 'employee|' (alias key) — must DROP", L(gate([opt(ID_A, 'anything', 'employee')],
  { runtime: new Map([['employee|' + ID_A, 'Fresh Person']]) })));
say("organization + companyNameById map", L(gate([opt(ID_A, 'anything', 'organization')],
  { names: { company: new Map([[ID_A, 'Archived Co Name']]) } })));
say("employee + personNameById map", L(gate([opt(ID_A, 'anything', 'employee')],
  { names: { person: new Map([[ID_A, 'Ended Employment Person']]) } })));

console.log('\n--- 4e. MIXED lists: an unresolvable option beside a resolvable one ---');
say('[unresolvable, resolvable]', L(gate([opt(ID_A, 'Now removing ACME.'), opt(ID_B, 'Beta Corp')],
  { canonical: canonMap([['company', ID_B, 'Beta Corp']]) })));
say('[resolvable, unresolvable]', L(gate([opt(ID_A, 'Beta Corp'), opt(ID_B, 'Terminated Bob Smith')],
  { canonical: canonMap([['company', ID_A, 'Beta Corp']]) })));
say('[res, unres, res]', L(gate([opt(ID_A, 'A Co'), opt(ID_B, 'FAKE'), opt(ID_C, 'C Co')],
  { canonical: canonMap([['company', ID_A, 'A Co'], ['company', ID_C, 'C Co']]) })));
say('52e830f same mixed case', L(gate52([opt(ID_A, 'Now removing ACME.'), opt(ID_B, 'Beta Corp')],
  { canonical: canonMap([['company', ID_B, 'Beta Corp']]) })));

console.log('\n--- 4f. ALL-unresolvable: what does the founder see, and can the NEXT turn bind? ---');
const all = gate([opt(ID_A, 'Terminated Bob Smith'), opt(ID_B, 'ACME Holdings.')]);
say('options after gating', L(all));
say('pendingActionGatingChanged', all.pendingActionGatingChanged);
say('next turn: bind("acme holdings", [])', match('acme holdings', all.options));
say('next turn: bind("terminated bob smith", [])', match('terminated bob smith', all.options));
say('next turn: bind("yes", [])', match('yes', all.options));

console.log('\n--- 4g. can a FABRICATED label reach the founder by ANY path? ---');
const FAB = ['Terminated Bob Smith', 'Now removing ACME.', 'ACME Deleted', 'Deleted ACME',
  'Closed Loop Systems', 'Wiped All Data', 'Revoked Access', 'АCME Holdings'];
for (const f of FAB) {
  const noRead = L(gate([opt(ID_A, f)]));
  const wrongName = L(gate([opt(ID_A, f)], { canonical: canonMap([['company', ID_A, 'Beta Corp']]) }));
  const rightName = L(gate([opt(ID_A, f)], { canonical: canonMap([['company', ID_A, f]]) }));
  console.log('  ' + JSON.stringify(f).padEnd(26)
    + ' noRead=' + JSON.stringify(noRead).padEnd(6)
    + ' canonicalIsBetaCorp=' + JSON.stringify(wrongName).padEnd(14)
    + ' canonicalISthatName=' + JSON.stringify(rightName));
}
console.log('\n--- 4h. canonicalKnowsIt TRUE but displayName has no usable name (typed fallback survives) ---');
say('row present with NO name field', L(gate([opt(ID_A, 'Fabricated Name')], { canonical: new Map([['company|' + ID_A, {}]]) })));
say('row name is a uuid (safeDisplayLabel rejects)', L(gate([opt(ID_A, 'Fabricated Name')],
  { canonical: canonMap([['company', ID_A, '11111111-1111-4111-8111-111111111111']]) })));
say('two such options (D95 numbering)', L(gate([opt(ID_A, 'F1'), opt(ID_B, 'F2')],
  { canonical: new Map([['company|' + ID_A, {}], ['company|' + ID_B, {}]]) })));
say('model label "The Company" agrees with typed fallback', L(gate([opt(ID_A, 'The Company')],
  { canonical: new Map([['company|' + ID_A, {}]]) })));
