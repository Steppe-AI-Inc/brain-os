// Self-check for production_write_authority.regression.test.mjs, route 2.
//
// A test that asserts "no credential here" passes trivially on a machine where the DETECTOR is
// broken. Route 2 now reports through qa/lib/secret_evidence.mjs's four-state classifier, so this
// self-check proves two things: (1) the test file really does delegate to that classifier — not to a
// regex of its own that could drift — and (2) the classifier, fed the three artifacts that matter,
// gives PRESENT / PRESENT / REDACTED. The third is the actual state of this machine, and it is the
// one an over-eager detector gets wrong.
//
// Never a shell re-implementation: the last two attempts to check this through `node -e` strings had
// their regexes mangled by shell escaping and reported a working detector as blind.
import { readFileSync } from 'node:fs';
import { classifySecret, EVIDENCE } from '../lib/secret_evidence.mjs';

const testFile = new URL('./production_write_authority.regression.test.mjs', import.meta.url);
const src = readFileSync(testFile, 'utf8');

// (1) The shipped test must route through the classifier.
const delegates = src.includes("from '../lib/secret_evidence.mjs'") && src.includes('classifySecret(')
  && src.includes('EVIDENCE.PRESENT');
console.log('route-2 delegates to qa/lib/secret_evidence.mjs : ' + (delegates ? 'YES' : 'NO'));
if (!delegates) {
  console.log('SELF-CHECK STALE: route 2 no longer reports through the classifier. Re-derive this check.');
  process.exit(2);
}

// (2) The classifier sees what it must see. Fake values, correct SHAPES.
const FAKE_JWT = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.' + 'A'.repeat(40) + '.' + 'B'.repeat(43);
const FAKE_SB = 'sb_secret_' + 'C'.repeat(32);
const jwt = classifySecret('"' + FAKE_JWT + '"').state;
const sb = classifySecret(FAKE_SB).state;
const red = classifySecret('"[REDACTED]"').state;

console.log('planted JWT-shaped key                 : ' + jwt);
console.log('planted sb_secret_-shaped key          : ' + sb);
console.log('Vercel "[REDACTED]" placeholder        : ' + red);

const ok = jwt === EVIDENCE.PRESENT && sb === EVIDENCE.PRESENT && red === EVIDENCE.REDACTED;
console.log('');
console.log(ok
  ? 'SELF-CHECK PASS — the detector finds real key shapes and does not cry wolf on a redaction.'
  : 'SELF-CHECK FAIL — the detector is blind or over-eager; the route-2 assertion proves nothing.');
process.exit(ok ? 0 : 1);
