// V66 asymmetry ruling — "can we" / "could we" / "shall we" / "shall i" move to DELIBERATIVE.
//
// Verifier #66 ruled on the difference the #65 closure registered but did not justify:
//
//   "shall i DIRECTIVE while should i is DELIBERATIVE is not defensible on meaning. The cost of moving
//    them is one confirmation turn; the cost of not moving them is an unrequested archive."
//
// It is right, and the registered reason ("it is what v92 ships") was never a reason about MEANING — it
// was a reason about inertia. The line that IS defensible, and that this makes true:
//
//   FIRST-PERSON MODAL INTERROGATIVES ARE DELIBERATIVE, whatever their number.
//     can I / could I / should I / may I  ..and now..  can we / could we / shall we / shall i
//
//   HORTATIVE AND DECLARATIVE INSTRUCTIONS STAY DIRECTIVE.
//     let's / let us / we should / we need to / i need you to
//     "let's archive ACME" is an instruction with a friendly face; "shall we archive ACME" is a question
//     about whether to. That distinction is about grammar, not about which one v92 happened to execute.
//
// Both groups still ARM THE RECEIPT — this only decides whether the raw command may execute WITHOUT a
// confirmation turn. The founder's §2 list ("let us restore ACME", "we need to restore ACME") keeps
// deriving intent either way, which is what §2 actually requires.
import { readFileSync, writeFileSync } from 'node:fs';

const p = process.argv[2] || 'supabase/functions/sem-ai-command/index.ts';
let s = readFileSync(p, 'utf8').replace(/\r\n/g, '\n');
const edits = [];
function sub(what, from, to) {
  if (s.split(from).length - 1 !== 1) throw new Error(what + ': anchor missing or not unique');
  s = s.replace(from, to);
  edits.push(what);
}

sub('the modal interrogatives leave the DIRECTIVE group',
  `  + "|may i ask you to|mind|can we|could we|shall we|shall i"`,
  `  + "|may i ask you to|mind"`);

sub('and join the DELIBERATIVE group',
  `const REQUEST_FRAME_DELIBERATIVE = "should we|should i|(?:i think )?i should|could i|can i|may we|may i"`,
  `const REQUEST_FRAME_DELIBERATIVE = "should we|should i|(?:i think )?i should|could i|can i|may we|may i"
  + "|could we|can we|shall we|shall i"`);

// The registered difference is now resolved, so the note that recorded it has to go with it — a stale
// "we decided not to" comment is worse than no comment.
sub('the registered asymmetry note is replaced by the rule that replaced it',
  `// REGISTERED DELIBERATE DIFFERENCE (founder directive 2026-09-08 §6): "can we"/"could we"/"shall we" stay
// DIRECTIVE while "can I"/"could I"/"should I" are DELIBERATIVE. The inclusive forms are what v92 ships and
// every green corpus measures; narrowing them is a behaviour change that deserves its own round and its own
// evidence rather than riding along inside a defect fix. They do leave the QUESTION tier here, which is the
// fail-closed direction: "shall we archive ACME?" now reads as the question it plainly is.`,
  `// WHERE THE LINE FALLS, and why it is about grammar rather than inertia (verifier #66's ruling on the
// asymmetry #65 registered but never justified):
//   FIRST-PERSON MODAL INTERROGATIVES ARE DELIBERATIVE, whatever their number — "can I", "could I",
//     "should I", "may I", "can we", "could we", "shall we", "shall i". Each asks WHETHER to act.
//   HORTATIVE AND DECLARATIVE INSTRUCTIONS STAY DIRECTIVE — "let's", "let us", "we should", "we need to".
//     "let's archive ACME" is an instruction with a friendly face; "shall we archive ACME" is a question.
// Both groups arm the receipt; this decides only whether the RAW COMMAND may execute without a
// confirmation turn. The cost of the deliberative reading is one extra turn; the cost of the directive
// reading was an unrequested archive.`);

const out = s.replace(/\n/g, '\r\n');
if ((out.match(/(^|[^\r])\n/g) || []).length) throw new Error('bare LF introduced');
writeFileSync(p, out);
console.log('applied ' + edits.length + ' edits:');
for (const e of edits) console.log('  - ' + e);
