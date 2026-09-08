// V46-D7 — the ordinal path binds a destructive option on a reply that names TWO options.
//
// THE DEFECT, exactly. `ordMatch` takes the ordinal from the FIRST matching notation, but `rest`
// then strips EVERY ordinal notation before its "is this reply ordinal-only?" test. So a second
// reference is invisible to the decision: the reply looks ordinal-only, and the first notation wins.
//
//   "option 1, option 2"      v92: dead-end        candidate: BINDS option 1, arms archiveCompanyIds
//   "option 1 #2"             v92: dead-end        candidate: BINDS 1
//   "the first one number 2"  v92: dead-end        candidate: BINDS 2
//   "#2 the first one"        v92: dead-end        candidate: BINDS 2
//
// Note the incoherence in the last two: which one wins depends only on which regex alternative
// happens to match first, not on anything the founder wrote.
//
// WHY THIS BLOCKS A DEPLOY even though the verifier labelled it P2. Production FAILS CLOSED here and
// does nothing; the candidate picks one and arms a destructive action against a real company. The
// matcher's own stated rule is "FAIL CLOSED, and NEVER INTERPRET" (run15/D116). A candidate that is
// less safe than production on a destructive path is a regression by the rule this campaign set.
//
// THE FIX, and it follows from the defect rather than patching its symptoms: anything `rest` strips
// as an ordinal notation IS an ordinal reference and must be counted. Collect every distinct value
// the reply refers to, and bind only when there is exactly ONE. Two references is ambiguity, which
// is precisely the case the dead-end exists for.
import { readFileSync, writeFileSync } from 'node:fs';

const ROOT = new URL('../../../../', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const SRC = process.env.V48_IN || ROOT + 'supabase/functions/sem-ai-command/index.ts';
const OUT = process.env.V48_OUT || ROOT + 'qa/verification/scratch/v92/fix48.ts';

let text = readFileSync(SRC, 'utf8');
const before = text;

const OLD = "  const ordMatch = normalizedCommand.match(/\\b(?:option|number)\\s*#?(\\d+)\\b/) || normalizedCommand.match(/^\\s*#\\s*(\\d+)\\b/) || normalizedCommand.match(/^\\s*(\\d+)\\s*$/);\r\n  const ordN = ordMatch ? parseInt(ordMatch[1], 10) : (ORDINAL_WORDS.findIndex((w) => new RegExp('\\\\b' + w + '\\\\b').test(normalizedCommand)) + 1);";
if (!text.includes(OLD)) { console.log('STALE: the ordinal computation was not found verbatim'); process.exit(2); }

// CRLF: index.ts is stored CRLF-only and the campaign pins 0 bare LF.
const NL = String.fromCharCode(13, 10);
const NEW = [
  '  // run48/V46-D7 (P1): the ordinal was taken from the FIRST matching notation while `rest` below',
  '  // strips EVERY notation, so a second reference was invisible to the "ordinal-only" test and',
  '  // "option 1, option 2" bound option 1 and armed a destructive field where deployed v92',
  '  // dead-ends. Which one won depended only on which alternative matched first: "option 1 #2"',
  '  // bound 1 while "#2 the first one" bound 2. The matcher\'s own rule is FAIL CLOSED, NEVER',
  '  // INTERPRET (run15/D116), and two references is exactly the ambiguity the dead-end exists for.',
  '  // So: every value `rest` strips as an ordinal notation is COUNTED, and the path binds only when',
  '  // the reply refers to exactly ONE distinct option. The four notations collected here are the',
  '  // same four `rest` removes - if one is ever added there it must be added here, or a stripped',
  '  // reference goes unseen again, which is the whole defect.',
  '  const ordValues = new Set();',
  '  for (const m of normalizedCommand.matchAll(/\\b(?:option|number)\\s*#?(\\d+)\\b/g)) ordValues.add(parseInt(m[1], 10));',
  '  for (const m of normalizedCommand.matchAll(/#\\s*(\\d+)/g)) ordValues.add(parseInt(m[1], 10));',
  '  for (const m of normalizedCommand.matchAll(/\\b(\\d+)\\b/g)) ordValues.add(parseInt(m[1], 10));',
  '  ORDINAL_WORDS.forEach((w, i) => { if (new RegExp(\'\\\\b\' + w + \'\\\\b\').test(normalizedCommand)) ordValues.add(i + 1); });',
  // Number() rather than a `Set<number>` generic or a `: number` annotation. The extractors that
  // rebuild this function strip TypeScript ANNOTATIONS but not GENERIC parameters, so
  // `new Set<number>()` would survive into the JS they evaluate and break every matcher gate.
  // Without it `ordN` is `unknown` and the type check goes 23 -> 28.
  '  const ordN = ordValues.size === 1 ? Number([...ordValues][0]) : 0;',
].join(NL);

text = text.replace(OLD, () => NEW);
if (text === before) { console.log('NO-OP: nothing changed'); process.exit(2); }
writeFileSync(OUT, text);
console.log('wrote ' + OUT);
console.log('bytes ' + before.length + ' -> ' + text.length);
