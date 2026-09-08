// V65-D1 / V65-D2 STRUCTURAL FIX — one canonical request-frame definition carrying PER-TIER APPLICABILITY.
//
// Verifier #64 collapsed three hand-maintained request-frame lists into one flat string. Verifier #65
// showed why flat is the wrong shape, and answered the founder's own judgment question with a case:
//
//   "should we archive ACME"  must ARM THE RECEIPT   (or a fabricated "Done — archived." ships verbatim)
//   "should we archive ACME"  must NOT AUTHORISE THE EXECUTOR (or a deliberative question archives a company)
//
// One flat list can express one answer, not two. So the safe repair was inexpressible and 18/18
// fabrications shipped. This does NOT re-split the concept into copies: it keeps ONE definition and
// declares, per frame group, which tiers may consume it. Every consumer is DERIVED; none re-spells the
// vocabulary, and EXECUTOR ⊆ INTENT holds by construction rather than by test.
import { readFileSync, writeFileSync } from 'node:fs';

const p = process.argv[2] || 'supabase/functions/sem-ai-command/index.ts';
const before = readFileSync(p, 'utf8');
let s = before.replace(/\r\n/g, '\n');
const edits = [];
function sub(what, from, to) {
  if (!s.includes(from)) throw new Error(what + ': anchor not found — re-derive this patch against the current source');
  if (s.split(from).length - 1 !== 1) throw new Error(what + ': anchor is not unique');
  s = s.replace(from, to);
  edits.push(what);
}

// ---------------------------------------------------------------------------------------------
// 1. The one definition, in three declared groups.
// ---------------------------------------------------------------------------------------------
const OLD_HEAD = `// THE ONE DEFINITION OF A REQUEST FRAME. Two tiers consume it: the executor's command fallback
// (IMPERATIVE_HEAD_RE) and the request-intent derivation (REQUEST_FRAME_PREFIX). They were separate lists of
// the same concept and drifted apart in three consecutive rounds — most recently the v59 hardening, which
// landed in the executor tier and was withheld from the intent tier the receipt rule depends on
// (verifier #64, V64-D1b). A frame added here is added to both, by construction.
const REQUEST_FRAME_ALTERNATION = "ok|okay|please|pls|plz|kindly|just|now|also|then|and|so|right|well|next|first|finally|again|yes|sure|hey brain|brain|quick one"`;

const NEW_HEAD = `// THE ONE DEFINITION OF A REQUEST FRAME — with the per-tier applicability the concept actually has.
//
// Verifier #64 collapsed three hand-maintained copies of this vocabulary into one flat string. Verifier #65
// showed that FLAT is the wrong shape, with a case the founder asked for directly:
//
//   "should we archive ACME"  must ARM THE RECEIPT      — else a fabricated "Done — archived." ships verbatim
//   "should we archive ACME"  must NOT REACH THE EXECUTOR — else a deliberative question archives a company
//
// One flat list can express one of those answers, never both, so the safe repair was inexpressible and
// 18/18 fabrications shipped (V65-D1, V65-D2). The concept is therefore still defined ONCE, here, but in
// declared groups, and each consumer derives the view it is entitled to. Nothing below re-spells the
// vocabulary, so the drift that cost a P1 in four consecutive rounds cannot recur.
//
//   ADDRESSED    — "you, do this", second person, plus bare politeness. All three tiers. These are the
//                  only frames for which a trailing "?" does not make the sentence a question:
//                  "could you archive ACME?" is an instruction wearing a question mark, whereas
//                  "can we archive ACME?" is a question about what we should do.
//   DIRECTIVE    — ADDRESSED plus the impersonal/inclusive instructions ("let's", "shall we", "go ahead
//                  and"). This is REQUEST_FRAME_ALTERNATION, the executor tier, unchanged in membership.
//   DELIBERATIVE — first-person modals and desideratives ("should we", "can I", "I want to").
//                  INTENT TIER ONLY. The founder is weighing an action, not ordering one.
//
// EXECUTOR ⊆ INTENT and QUESTION ⊆ INTENT are true BY CONSTRUCTION here — the founder's section-3 rule
// (a request the executor detects is never invisible to the receipt) made structural, not merely tested.
//
// REGISTERED DELIBERATE DIFFERENCE (founder directive 2026-09-08 §6): "can we"/"could we"/"shall we" stay
// DIRECTIVE while "can I"/"could I"/"should I" are DELIBERATIVE. The inclusive forms are what v92 ships and
// every green corpus measures; narrowing them is a behaviour change that deserves its own round and its own
// evidence rather than riding along inside a defect fix. They do leave the QUESTION tier here, which is the
// fail-closed direction: "shall we archive ACME?" now reads as the question it plainly is.
const REQUEST_FRAME_ADDRESSED = "would you be able to|would you(?: please| mind)?|any chance you could"
  + "|could you(?: please)?|can you(?: please)?|will you|please";
const REQUEST_FRAME_ALTERNATION = REQUEST_FRAME_ADDRESSED
  + "|ok|okay|pls|plz|kindly|just|now|also|then|and|so|right|well|next|first|finally|again|yes|sure|hey brain|brain|quick one"`;

sub('canonical head + ADDRESSED group', OLD_HEAD, NEW_HEAD);

// The addressed frames now live in the group above; remove them from their old inline positions so the
// vocabulary appears exactly once. "may i ask you to|mind|will you|shall i" stay DIRECTIVE.
sub('addressed frames removed from the inline run',
  `  // Longest-first within a family: regex alternation takes the FIRST match, so "would you" placed ahead
  // of "would you be able to" matched two words and stranded "be able to" (verifier #64, V64-D1).
  + "|would you be able to|would you(?: please| mind)?|any chance you could|could you(?: please)?|can you(?: please)?"
  + "|may i ask you to|mind|will you|can we|could we|shall we|shall i"`,
  `  // Longest-first within a family: regex alternation takes the FIRST match, so "would you" placed ahead
  // of "would you be able to" matched two words and stranded "be able to" (verifier #64, V64-D1). The
  // second-person frames that used to sit here are now the ADDRESSED group at the head of this same string.
  + "|may i ask you to|mind|can we|could we|shall we|shall i"`);

// "we need you to X" is second-person addressed and therefore DIRECTIVE; it was missing only because the
// list carried "i need you to" and a bare "need you to" that cannot match at position 0 of "we need …".
sub('we need you to → DIRECTIVE',
  `  + "|let['’]?s|let us|(?:i think )?(?:we|you) should|we need to|i need you to|i want you to"
  + "|i(?:['’]d| would) like you to|you need to|need you to|need to|you can";`,
  `  + "|let['’]?s|let us|(?:i think )?(?:we|you) should|we need to|we need you to|i need you to|i want you to"
  + "|i(?:['’]d| would) like you to|you need to|need you to|need to|you can";
// DELIBERATIVE frames — the INTENT tier only, never the executor. Each of these is the founder weighing an
// action rather than instructing one, so the receipt must see the request (a mutation-intent turn with no
// verified execution owes a deterministic no-change receipt) while the raw-command lifecycle fallback must
// not act. Longest-first within each family, same rule as above.
const REQUEST_FRAME_DELIBERATIVE = "should we|should i|(?:i think )?i should|could i|can i|may we|may i"
  + "|i want to|we want to|i need to|i(?:['’]d| would) like to|we(?:['’]d| would) like to"
  + "|we have to|i have to|we ought to|i ought to|we must|i must";
// The INTENT tier is the UNION, formed here and nowhere else. A frame added to either group above is
// visible to the receipt automatically; there is no second list that can be forgotten.
const REQUEST_FRAME_ALTERNATION_INTENT = REQUEST_FRAME_ALTERNATION + "|" + REQUEST_FRAME_DELIBERATIVE;`);

// ---------------------------------------------------------------------------------------------
// 2. The intent tier consumes the union (V65-D1: 18/18 fabrications shipped because it did not).
// ---------------------------------------------------------------------------------------------
sub('REQUEST_FRAME_PREFIX consumes the intent union',
  `const REQUEST_FRAME_PREFIX = new RegExp('^\\\\s*(?:(?:' + REQUEST_FRAME_ALTERNATION + ')[\\\\s,:—–-]+)+', 'i');`,
  `const REQUEST_FRAME_PREFIX = new RegExp('^\\\\s*(?:(?:' + REQUEST_FRAME_ALTERNATION_INTENT + ')[\\\\s,:—–-]+)+', 'i');`);

// ---------------------------------------------------------------------------------------------
// 3. V65-D3c — the question gate stops carrying a fourth private copy of the frame vocabulary.
//    Same frames, same read-verb lookahead, same behaviour: the list is now DERIVED, not maintained.
// ---------------------------------------------------------------------------------------------
sub('commandIsQuestion derives from the ADDRESSED group',
  `          && !/^\\s*(?:would you mind|would you (?:please )?(?!tell|explain|summari|describe|list|show|remind)|could you (?:please )?(?!tell|explain|summari|describe|list|show|remind)|can you (?:please )?(?!tell|explain|summari|describe|list|show|remind)|will you|can we|could we|shall we|please)\\b/.test(commandLower);`,
  `          && !QUESTION_SUPPRESSING_FRAME.test(commandLower);`);

sub('QUESTION_SUPPRESSING_FRAME declared from the one definition',
  `const CONFIRMATION_ALTERNATION = "yes|yep|yeah|yup|y|ok|okay|sure|confirm(?:ed)?|correct|affirmative"`,
  `// A trailing "?" does not make a sentence a question when it is framed as a REQUEST — but "could you tell
// me which companies are archived?" really is a read, so a frame followed by a read verb does not suppress
// the gate. This used to be a fourth hand-maintained spelling of the request-frame vocabulary, which had
// already drifted (verifier #65, V65-D3c); it now derives from the ADDRESSED group of the one definition.
const REQUEST_FRAME_READ_VERB = "tell|explain|summari|describe|list|show|remind";
const QUESTION_SUPPRESSING_FRAME = new RegExp(
  '^\\\\s*(?:' + REQUEST_FRAME_ADDRESSED + ')\\\\s*(?!(?:' + REQUEST_FRAME_READ_VERB + '))\\\\b', 'i');
const CONFIRMATION_ALTERNATION = "yes|yep|yeah|yup|y|ok|okay|sure|confirm(?:ed)?|correct|affirmative"`);

// ---------------------------------------------------------------------------------------------
// 4. V65-D3d — no phrase may be a REQUEST FRAME in one tier and a READ LEAD in another.
//    "shall i/shall we/could we/can we" are request frames; the read-lead list also claimed them.
//    "should i/should we" stay: they are DELIBERATIVE, and a read lead is exactly what the executor
//    should treat them as — that is the asymmetry, stated in one place instead of contradicted in two.
// ---------------------------------------------------------------------------------------------
sub('read-lead list no longer contradicts the directive frames',
  `|if|when|before|after|should i|shall i|should we|shall we|could we|can we|would it|`,
  `|if|when|before|after|should i|should we|would it|`);

// ---------------------------------------------------------------------------------------------
// 5. V65-D3a / V65-D3b — the byte-identical twins and the one-word drift.
//
// ONE DEFINITION, and the second NAME becomes a reference to it rather than a second body. Deleting the
// name outright was tried first and is the wrong trade: twelve suites and the shared belt extractor slice
// their windows using `const LEGACY_PAST_COMPLETION =` as a MARKER, so removing it does not merely rename
// a thing — it silently changes which lines each of those windows measures, on the exact bytes a
// deployment decision rests on. An alias cannot drift (there is only one body to maintain), which is the
// whole content of V65-D3a, and it leaves every window boundary exactly where the evidence was taken.
//
// REGISTERED NEXT-WORK DEBT: the surviving alias names should eventually go, together with the harness
// markers that depend on them. That is a rename across thirteen files with its own regression risk, and it
// belongs in a round of its own — not inside the fix for a shipping fabrication.
//
// Each survivor is the EARLIER declaration in the same function scope, so no reference moves above its
// declaration and no TDZ hazard is introduced. That is asserted, not assumed.
// ---------------------------------------------------------------------------------------------
for (const [drop, keep, why] of [
  ['LEGACY_PAST_COMPLETION', 'PAST_COMPLETION_CLAIM_PATTERN',
    'the same past-completion claim pattern, byte-identical; "legacy" named a tier, not a concept'],
  ['FUTURE_PROMISE_IN_QUESTION', 'FUTURE_PROMISE_PATTERN',
    'the same promise pattern, byte-identical; one pattern applied to a question and to a statement'],
  ['COMPLETION_PARTICIPLE', 'COMPLETION_WORD',
    'the same completion vocabulary, drifted by exactly one word ("done" — the commonest fabricated completion of all, and it was missing from the participle copy)'],
]) {
  const line = s.split('\n').find((l) => l.trim().startsWith('const ' + drop + ' ='));
  if (!line) throw new Error(drop + ': declaration not found');
  const dropAt = s.indexOf(line);
  const keepLine = s.split('\n').find((l) => l.trim().startsWith('const ' + keep + ' ='));
  if (!keepLine) throw new Error(keep + ': declaration not found');
  if (s.indexOf(keepLine) > dropAt) throw new Error(keep + ' is declared AFTER ' + drop + ' — aliasing would create a TDZ');
  const indent = line.slice(0, line.length - line.trimStart().length);
  s = s.split(line + '\n').join(
    indent + '// ' + why + '.\n'
    + indent + '// ONE definition, referenced under the name this tier and its harness markers use — never a\n'
    + indent + '// second body (verifier #65 V65-D3; founder directive 2026-09-08 §6).\n'
    + indent + 'const ' + drop + ' = ' + keep + ';\n');
  edits.push('aliased ' + drop + ' -> ' + keep);
}

// ---------------------------------------------------------------------------------------------
// Postconditions.
// ---------------------------------------------------------------------------------------------
for (const [alias, target] of [['LEGACY_PAST_COMPLETION', 'PAST_COMPLETION_CLAIM_PATTERN'],
  ['FUTURE_PROMISE_IN_QUESTION', 'FUTURE_PROMISE_PATTERN'], ['COMPLETION_PARTICIPLE', 'COMPLETION_WORD']]) {
  if (!s.includes('const ' + alias + ' = ' + target + ';')) throw new Error(alias + ' was not aliased onto ' + target);
  if (new RegExp('const ' + alias + ' = /').test(s)) throw new Error(alias + ' still carries its own body');
}
for (const needed of ['REQUEST_FRAME_ADDRESSED', 'REQUEST_FRAME_DELIBERATIVE', 'REQUEST_FRAME_ALTERNATION_INTENT',
  'QUESTION_SUPPRESSING_FRAME']) {
  if (!s.includes('const ' + needed)) throw new Error(needed + ' was not declared');
}
// The harness guard in the verifier's own suite reads this declaration and requires the literal.
const canonicalDecl = s.slice(s.indexOf('const REQUEST_FRAME_ALTERNATION = '), s.indexOf('// DELIBERATIVE frames'));
if (!canonicalDecl.includes('shall we')) throw new Error('the canonical declaration no longer carries its literal frames');

const out = s.replace(/\n/g, '\r\n');
if ((out.match(/(^|[^\r])\n/g) || []).length) throw new Error('bare LF introduced');
writeFileSync(p, out);
console.log('applied ' + edits.length + ' edits:');
for (const e of edits) console.log('  - ' + e);
