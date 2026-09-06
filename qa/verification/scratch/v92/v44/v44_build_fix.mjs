// V44 — PREPARED FIXES, built as a scratch candidate. index.ts in the worktree is NEVER touched.
// Output: qa/verification/scratch/v44/fix44.ts
import { readFileSync, writeFileSync } from 'node:fs';

const P = 'supabase/functions/sem-ai-command/index.ts';
let s = readFileSync(P, 'utf8');
const before = s;
const apply = (name, from, to) => {
  if (!s.includes(from)) { console.log('MISS  ' + name); return false; }
  const n = s.split(from).length - 1;
  s = s.split(from).join(to);
  console.log('ok    ' + name + '  (' + n + ' site' + (n === 1 ? '' : 's') + ')');
  return true;
};

// ---- V44-D1: every EXECUTION_IN_PROGRESS product-help guard is ^<gerund>-anchored, so a leading
// adverbial ("Now archiving …", "Currently removing …") defeats all of them. Let the guards see
// through the adverbial. Nothing else about the guards changes.
apply('V44-F1a guard1 tolerates a leading adverbial',
  "!/^\\s*(?:assigning|reassigning|updating|creating|moving|archiving|restoring|deleting|removing|ending|renaming|closing|clearing|granting|declining|approving|rejecting|completing|activating|deactivating|adding|sending|processing|executing|working|starting|kicking)\\b",
  "!/^\\s*(?:(?:now|currently|just|also|then)[,]?\\s+)?(?:assigning|reassigning|updating|creating|moving|archiving|restoring|deleting|removing|ending|renaming|closing|clearing|granting|declining|approving|rejecting|completing|activating|deactivating|adding|sending|processing|executing|working|starting|kicking)\\b");
apply('V44-F1b guard2 tolerates a leading adverbial',
  "!/^\\s*(?:[Aa]ssigning|[Rr]eassigning|[Uu]pdating|[Cc]reating|[Mm]oving|[Aa]rchiving|[Rr]estoring|[Dd]eleting|[Rr]emoving|[Ee]nding|[Rr]enaming|[Cc]losing|[Cc]learing|[Gg]ranting|[Dd]eclining|[Aa]pproving|[Rr]ejecting|[Cc]ompleting|[Aa]ctivating|[Dd]eactivating|[Aa]dding|[Ss]ending)\\s+",
  "!/^\\s*(?:(?:[Nn]ow|[Cc]urrently|[Jj]ust|[Aa]lso|[Tt]hen)[,]?\\s+)?(?:[Aa]ssigning|[Rr]eassigning|[Uu]pdating|[Cc]reating|[Mm]oving|[Aa]rchiving|[Rr]estoring|[Dd]eleting|[Rr]emoving|[Ee]nding|[Rr]enaming|[Cc]losing|[Cc]learing|[Gg]ranting|[Dd]eclining|[Aa]pproving|[Rr]ejecting|[Cc]ompleting|[Aa]ctivating|[Dd]eactivating|[Aa]dding|[Ss]ending)\\s+");

// ---- V44-D2: "working on <gerund>" fires with ANY subject, so ordinary sentences about other
// people's work are read as this turn's execution. Bind the arm to a first-person subject or the
// clause head, which is the only reading that claims anything.
apply('V44-F2 "working on" arm bound to first person / clause head',
  "'|working on (?:' + PROGRESS_VERBS + ')'",
  "'|(?:^|\\\\b(?:i(?:\\x27|\\u2019)?m |i am |we(?:\\x27|\\u2019)?re |we are )(?:now |currently |just )?)working on (?:' + PROGRESS_VERBS + ')'");

// ---- V44-D4: "(is|are) (being|getting) <participle>" inside a relative clause is a description of
// a state, not a claim about this turn ("a company that is being archived still shows its history").
apply('V44-F3 passive-progressive not after a relativizer',
  "'|(?:is|are) (?:being|getting) (?:archived|deleted|updated|created|restored|activated|deactivated|assigned|reassigned|approved|rejected|removed|completed|renamed|ended|closed|cleared|sent|moved|granted|declined)'",
  "'|(?<!\\\\b(?:that|which|who)\\\\s)(?:is|are) (?:being|getting) (?:archived|deleted|updated|created|restored|activated|deactivated|assigned|reassigned|approved|rejected|removed|completed|renamed|ended|closed|cleared|sent|moved|granted|declined)'");

// ---- V44-D5: nameInternal's subjectRun requires a CONTIGUOUS capitalised run before the auxiliary,
// so a coordinated subject ("No Limits Inc and Beta Corp were archived.") breaks it and the
// fabrication deployed v92 corrects is shipped. Let the run contain a coordinator/particle.
apply('V44-F4 subjectRun tolerates a coordinated proper-name subject',
  'const subjectRun = new RegExp("^\\\\s+(?:[A-Z][\\\\w&.’\'-]*\\\\s+){0,5}?[A-Z][\\\\w&.’\'-]*\\\\s+',
  'const subjectRun = new RegExp("^\\\\s+(?:(?:[A-Z][\\\\w&.’\'-]*|and|&|of|the|for|de|von|van)\\\\s+){0,5}?[A-Z][\\\\w&.’\'-]*\\\\s+');

// ---- V44-D6: detName only sees a determiner IMMEDIATELY before the capitalised negator, so
// "The task No Limits Inc audit was archived." keeps the name-initial negator as a real one.
// Allow up to two lowercase nouns between the determiner and the name.
apply('V44-F5 detName sees a determiner + noun head',
  "const detName = /^[A-Z]/.test(mm[0]) && (/\\b(?:the|a|an|our|your|their|its|my|his|her)\\s+$/i.test(c.slice(0, mm.index))",
  "const detName = /^[A-Z]/.test(mm[0]) && (/\\b(?:the|a|an|our|your|their|its|my|his|her)\\s+(?:[a-z][\\w-]*\\s+){0,2}$/i.test(c.slice(0, mm.index))");

if (s === before) { console.log('\nNOTHING APPLIED'); process.exit(1); }
writeFileSync('qa/verification/scratch/v44/fix44.ts', s);
console.log('\nwrote qa/verification/scratch/v44/fix44.ts  (' + s.length + ' bytes; baseline ' + before.length + ')');
