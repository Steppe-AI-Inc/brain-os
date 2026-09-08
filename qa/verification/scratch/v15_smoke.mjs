import { readSource, buildMatcher, buildLabelGate, buildDriftBelts, buildQuestionBelt } from './v15_extract.mjs';

const { text, sha } = readSource();
console.log('sha', sha);
const m = buildMatcher(text);
console.log('matcher built OK; sanity:',
  m('acme', [{ label: 'Acme', id: 'a', entityType: 'company' }])?.id);
const gate = buildLabelGate(text);
const g = gate({ canonicalById: new Map([['company|a', { name: 'ACME Holdings' }]]) });
console.log('labelGate built OK; sanity displayName:', g.displayName('company', 'a'));
console.log('sanity gateOneOption:',
  g.gateOneOption({ id: 'a', entityType: 'company', label: 'Terminated Bob Smith' }, 0));
const belts = buildDriftBelts(text);
console.log('drift belts built OK; CONFIRMED_COMPLETION on "Confirmed — ACME archived":',
  belts.CONFIRMED_COMPLETION.test('Confirmed — ACME archived'));
const qb = buildQuestionBelt(text);
console.log('question belt built OK; sanity:', JSON.stringify(qb('Which company did you mean?')));
