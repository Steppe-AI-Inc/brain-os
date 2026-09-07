// INDEPENDENT MUTATION PROOF. Revert each shipped fix in the belt source and confirm it
// re-opens shapes on MY OWN corpus. A no-op mutant means the fix is dead code.
import * as L from './lab.mjs';
import { CORPUS } from './corpus.mjs';

const SLICE = L.extractBelt(L.SRC_LF);
function beltFrom(slice) {
  const f = new Function('__n', '__c', `const knownEntityNames = __n; const verifiedClaims = __c;
    ${slice}
    return readsAsCompletion;`);
  return f(new Set(), []);
}
const stock = beltFrom(SLICE);

const MUTANTS = [
  ['M1 nameInternal (run31/D170 name-safe negator scan)',
    (s) => s.replace('const nameInternal = capLead && subjectRun', 'const nameInternal = false && capLead && subjectRun')],
  ['M2 objectName (run31 participle-then-name object)',
    (s) => s.replace('const objectName = capLead &&', 'const objectName = false && capLead &&')],
  ['M3 titleHead / titleHeadAfterPrep (Pending/Awaiting heads)',
    (s) => s.replace('const titleHeadAfterPrep = /', 'const titleHeadAfterPrep = false && /')
             .replace('const titleHead = /^(?:Pending|Awaiting)$/', 'const titleHead = false && /^(?:Pending|Awaiting)$/')],
  ['M4 ppInternal (negator inside a prepositional phrase)',
    (s) => s.replace('const ppInternal = /', 'const ppInternal = false && /')],
  ['M5 newSubject (evidential-after-linker guard)',
    (s) => s.replace('const newSubject = !/\\bnor\\b/.test(c) &&', 'const newSubject = false && !/\\bnor\\b/.test(c) &&')],
  ['M6 detName (determiner + Title-Case name)',
    (s) => s.replace('const detName = /^[A-Z]/.test(mm[0])', 'const detName = false && /^[A-Z]/.test(mm[0])')],
  ['M7 relInternal (relative-clause-internal negator)',
    (s) => s.replace('const relInternal = /', 'const relInternal = false && /')],
  ['M8 reassurance-idiom strip (the widened dash-form arm)',
    (s) => s.replace("(?:no problem|no worries|not to worry|no issue|no issues|nothing to worry about|no trouble|not a problem|no harm done|nothing failed|sure thing|of course|absolutely)(?:\\s+at all)?\\s*[—–-]\\s*)+/i, ''",
                     "(?:zzzznevermatch)(?:\\s+at all)?\\s*[—–-]\\s*)+/i, ''")],
  ['M9 R-AUXGAP whole-summary arm (aux–adverbial–participle rejoin)',
    (s) => s.replace("(\\\\b(?:was|were|has been|have been)\\\\b)(?=[^.]{0,30}\\\\b",
                     "(\\\\bzzzznevermatch\\\\b)(?=[^.]{0,30}\\\\b")],
  ['M10 CONFIRMED_COMPLETION arm (whole "Confirmed —" branch)',
    (s) => s.replace('&& CONFIRMED_COMPLETION.test(String(s))', '&& false && CONFIRMED_COMPLETION.test(String(s))')],
  ['M11 renamed-arrow whole-summary arm (#65/D27, production row 9dda919c)',
    (s) => s.replace("|| /\\brenamed:\\s*.+(→|->)/i.test(String(s))", '|| false')],
  ['M12 EXECUTION_IN_PROGRESS product-help guards (#39 catastrophe class)',
    (s) => s.replace('(EXECUTION_IN_PROGRESS.test(c) && !/^\\s*(?:(?:now|currently|just|also|then)',
                     '(EXECUTION_IN_PROGRESS.test(c) && true || false && !/^\\s*(?:(?:now|currently|just|also|then)')],
];

console.log('corpus', CORPUS.length, '| stock fires on', CORPUS.filter((r) => stock(r.s)).length);
let dead = 0;
for (const [name, mut] of MUTANTS) {
  const slice = mut(SLICE);
  if (slice === SLICE) { console.log('SKIP  ', name, '  <-- MUTATION DID NOT APPLY (my patch string is wrong)'); continue; }
  let belt;
  try { belt = beltFrom(slice); } catch (e) { console.log('ERR   ', name, e.message.slice(0, 120)); continue; }
  const now = CORPUS.filter((r) => stock(r.s) !== belt(r.s));
  const fabReopened = now.filter((r) => r.label === 'F' && stock(r.s) && !belt(r.s));
  const truthReopened = now.filter((r) => r.label === 'T' && !stock(r.s) && belt(r.s));
  const truthGained = now.filter((r) => r.label === 'T' && stock(r.s) && !belt(r.s));
  const load = now.length > 0;
  if (!load) dead++;
  console.log((load ? 'LOAD-BEARING' : 'NO-OP  <<<<').padEnd(13), name);
  console.log('              verdict changes', String(now.length).padStart(4),
    '| fabrications re-opened', String(fabReopened.length).padStart(3),
    '| truthful answers destroyed', String(truthReopened.length).padStart(3),
    '| truthful answers saved', String(truthGained.length).padStart(3));
  for (const r of now.slice(0, 4)) console.log('                e.g.', r.label, JSON.stringify(r.s).slice(0, 92));
}
console.log('\nno-op mutants (dead fixes on my corpus):', dead, 'of', MUTANTS.length);
