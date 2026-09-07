// Mutation proof for the five edits that close V42-D1 and the question member of V42-D2.
// Each mutation REVERTS one edit and asserts the sentences it rescued are destroyed again.
// A revert that changes nothing is a no-op, and a no-op means the edit is not load-bearing.
import { readFileSync, writeFileSync } from 'node:fs';
import { buildGate } from '../../lib/belt_extract.mjs';

const __ROOT = new URL('../../../../', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');

const ROOT = __ROOT + '';
const FIXED = ROOT + 'qa/verification/scratch/v92/fix42_imminent.ts';
const TMP = ROOT + 'qa/verification/scratch/v92/mut42_tmp.ts';
const base = readFileSync(FIXED, 'utf8');
const PCCP = new Function('return ' + readFileSync(ROOT + 'qa/verification/scratch/v92/index.v92.ts', 'utf8').match(/const PAST_COMPLETION_CLAIM_PATTERN = (\/.*\/i);/)[1])();
const v92 = (s) => PCCP.test(s);

const OBJ = ['ACME Holdings', 'Erdenet Copper Works', 'Bob Smith', 'CLIX GPS', 'Blue Sky Logistics',
  'the company', 'the task', 'that department', 'this goal', 'the approval'];
const T = {
  aboutTo: (o) => `You are about to archive ${o} — this cannot be undone.`,
  conditional: (o) => `If you are about to delete ${o}, export its documents first.`,
  proceeding: (o) => `The founder is proceeding to archive ${o} in the app, not from chat.`,
  startingTo: (o) => `Your manager is starting to archive ${o} this week.`,
  inProcess: (o) => `The finance team is in the process of updating ${o}.`,
  goingAhead: (o) => `The founder is going ahead and archiving ${o} himself.`,
  kickingOff: (o) => `Operations is kicking off the archive of ${o} on Monday.`,
  startingThe: (o) => `Starting the archive of ${o} requires founder approval.`,
  startingThe2: (o) => `Starting the restore of ${o} is done from the Companies page.`,
  question: (o) => `Are you about to archive ${o}? I cannot do that from chat.`,
  // The row the CONFIRMED question stand-down actually exists for. A first version of this harness
  // scored that edit only against the `question` template above, which the first-person requirement
  // already rescues, so it printed NO-OP for a fix that is load-bearing on the shape it was written
  // for. The harness was wrong, not the edit - and a mutation harness that tests the wrong rows
  // reports a live fix as dead, which is the mirror of reporting a dead fix as live.
  // The participle has to appear AFTER the dash for the CONFIRMED arm to engage at all, which is
  // what makes this the shape the stand-down exists for: an interrogative that mentions a completion
  // word. "Confirmed - Archive ${o}?" alone never engages the arm, so scoring the edit against it
  // would have printed NO-OP for a second, different wrong reason.
  confirmQuestion: (o) => `Confirmed - Archive Archived ${o}?`,
};
// The fabrications these arms exist for. Every mutation must leave these caught, or the "rescue"
// was really just switching the arm off.
const FAB = ['I am about to archive ACME Holdings.', "I'm proceeding to delete Beta Corp.",
  "I'm in the process of archiving ACME Holdings.", "I'm going ahead and archiving ACME Holdings.",
  'Kicking off the archive of ACME Holdings.', 'Let me archive ACME Holdings for you.',
  'I am starting to archive ACME Holdings.', 'Proceeding to archive ACME.',
  'Starting the archive of ACME now.'];

function destroyedSet(src) {
  const g = buildGate(src);
  const fires = (s) => g.readsAsCompletion(s) === true;
  const out = {};
  for (const [k, t] of Object.entries(T)) out[k] = OBJ.filter((o) => !v92(t(o)) && fires(t(o))).length;
  out.fabCaught = FAB.filter(fires).length;
  return out;
}

const b = destroyedSet(FIXED);
const truthKeys = Object.keys(T);
const totalDestroyed = truthKeys.reduce((a, k) => a + b[k], 0);
console.log('=== the fixed build ===');
console.log('truthful guidance sentences destroyed: ' + totalDestroyed + '/' + (truthKeys.length * OBJ.length)
  + '   fabrications still caught: ' + b.fabCaught + '/' + FAB.length);
if (totalDestroyed !== 0 || b.fabCaught !== FAB.length) { console.log('FAIL: the applied build is not clean'); process.exit(1); }
console.log('');

let ok = 0, total = 0;
function mutate(label, from, to, keys) {
  total++;
  if (!base.includes(from)) { console.log('ANCHOR MISSING  ' + label); return; }
  writeFileSync(TMP, base.split(from).join(to));
  const m = destroyedSet(TMP);
  const moved = keys.some((k) => m[k] > b[k]);
  const detail = keys.map((k) => k + ' ' + m[k] + '/' + OBJ.length).join('  ');
  console.log((moved ? 'LOAD-BEARING' : '*** NO-OP ***') + '  ' + label);
  console.log('     reverted: ' + detail + '   fabrications caught ' + m.fabCaught + '/' + FAB.length);
  if (moved) ok++;
}

const FP = "(?:\\\\b(?:I|we)(?:[\\\\x27\\\\u2019]m| am| are| will| shall| have)?|\\\\blet me|\\\\blet us)\\\\s+(?:just |now |also |already |then |quickly |simply |going |)?";

mutate('first-person requirement on about to / going to / proceeding to / starting to',
  "'|(?:" + FP + "|^)(?:about to|going to|proceeding to|starting to)", "'|(?:about to|going to|proceeding to|starting to)",
  ['aboutTo', 'conditional', 'proceeding', 'startingTo']);

mutate('first-person requirement on "in the process of"',
  "'|" + FP + "in the process of", "'|in the process of", ['inProcess']);

mutate('first-person requirement on "going ahead and / kicking off"',
  "'|(?:" + FP + "|^)(?:going ahead and|kicking off)", "'|(?:going ahead and|kicking off)",
  ['goingAhead', 'kickingOff']);

mutate('the coordination lookbehind in the clause splitter',
  "|(?<!\\bgoing ahead)\\s(?:and|but)\\s+(?=", "|\\s(?:and|but)\\s+(?=", ['goingAhead']);

mutate('starting|kicking added to guard 1 finite-verb test',
  "|processing|executing|working|starting|kicking)", "|processing|executing|working)",
  ['startingThe', 'startingThe2']);

mutate('the CONFIRMED question stand-down',
  " || /^\\s*[Cc]onfirmed\\s*[—–-][^.!?]*\\?/.test(String(s))", "", ['confirmQuestion']);

console.log('');
console.log('MUTATIONS: ' + ok + '/' + total + ' load-bearing, ' + (total - ok) + ' no-op');
process.exit(ok === total ? 0 : 1);
