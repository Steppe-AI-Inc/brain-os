// V67 STRUCTURAL FIX — ONE definition of "does this refer to an entity?", and two boundary repairs.
//
// Verifier #67 chose the ENTITY axis — which KIND of thing is being changed, and how it is referred to —
// and found that all 75 suites refer to entities the same way: the referring token is always the FIRST
// token of the object (`ACME`, `QA-1`, `task QA-1`). That is exactly where the object test already works.
//
//   V67-D1 (P1). Every alternative of IMPERATIVE_OBJECT is ^-anchored, so only token 0 is inspected.
//     `archive work order WO-1` -> token 0 is "work" -> nothing matches -> requestedIntent = null ->
//     every final-answer gate is off and the model's fabrication IS the answer. 480 of 480 ship; the
//     identical matrix using the head noun alone ships 0 of 480. The only variable is the modifier.
//
//   V67-D2 (P1). READ_SHAPE's "idioms that only look like lifecycle verbs" clause ends in \b, which
//     matches at the FOLLOWING SPACE, so the idiom noun need not end the phrase:
//     `delete the chat channel C-1` — a real, deletable row — is read as "delete the chat" and vetoed.
//     This is the MIRROR of #146: there a \b was too tight after a closing quote, here it is too loose
//     mid-phrase. Same lesson: a boundary assertion that does not express the boundary the rule means.
//
//   V67-D3 (P2). The receipt names `company` for 12 of 18 entity types, because commandEntityNoun knows
//     six nouns: "archive approval A-1" answers "could not resolve which COMPANY you meant (searched the
//     active and archived COMPANIES)". A false statement about what was searched.
//
//   V67-D4 (P2). REQUEST_FRAME_DELIBERATIVE names 22 frames; the receipt's hypotheticalRequest names 3.
//     The other 19 get "I could not resolve which company you meant" for a company that resolves fine.
//     The placement of the modal interrogatives was RIGHT; its cost was mis-stated. It does not cost one
//     extra turn — it costs a FALSE RECEIPT.
//
// ROOT CAUSE, and it is the same sentence for the fourth round running: "does this refer to an entity?"
// is spelled THREE times — IMPERATIVE_OBJECT's noun list, STRONG_OBJECT's noun list, and
// commandEntityNoun's six-noun list — and they have drifted. Adding `work order` / `software spec` /
// `chat channel` to three lists is the local patch the founder's directive rules out by name.
import { readFileSync, writeFileSync } from 'node:fs';

const p = process.argv[2] || 'supabase/functions/sem-ai-command/index.ts';
let s = readFileSync(p, 'utf8').replace(/\r\n/g, '\n');
const edits = [];
function sub(what, from, to) {
  if (s.split(from).length - 1 !== 1) throw new Error(what + ': anchor missing or not unique');
  // A REPLACEMENT FUNCTION, never a replacement STRING. With a string, JS expands $&, $1, $` and $' —
  // and this fix's replacement text ends in `^\S+\s*$'`, where the `$` before the closing quote reads as
  // $' = "everything after the match", which silently spliced a second copy of the rest of the file in.
  // It surfaced as a bogus "declaration not unique" three edits later. Every patch script in this
  // campaign should use this form.
  s = s.replace(from, () => to);
  edits.push(what);
}

// ---------------------------------------------------------------------------------------------
// 1. THE ONE DEFINITION, at module level beside the other canonical alternations.
// ---------------------------------------------------------------------------------------------
sub('ENTITY_NOUN_ALTERNATION declared once, above every consumer',
  'const CONFIRMATION_ALTERNATION = "yes|yep|yeah|yup|y|ok|okay|sure|confirm(?:ed)?|correct|affirmative"',
  `// THE ONE DEFINITION OF AN ENTITY NOUN — the vocabulary of "a kind of thing this product stores".
// It was spelled three times (IMPERATIVE_OBJECT's list, STRONG_OBJECT's list, commandEntityNoun's six)
// and the three had already drifted, which is verifier #67's P1 and P2 in one sentence. Every consumer
// below derives from this; none re-spells it. Multi-word nouns come FIRST so the alternation prefers the
// longer reading ("work order" before "order"), the same longest-first rule the request frames use.
const ENTITY_NOUN_ALTERNATION = "work order|purchase order|business unit|chat channel|software spec|product line"
  + "|product spec|engineering drawing|technical drawing|onboarding plan|purchase approval|work item"
  + "|compan(?:y|ies)|business|organi[sz]ation|person|people|employee|staff|manager|owner|task|goal|project"
  + "|department|lead|document|proposal|product|spec|drawing|approval|channel|team|role|employment"
  + "|assignment|contract|ticket|invoice|report|order|memory|note|agent|connector|provider|user|account"
  + "|workspace|record|entry|row|item|file|access|permissions?|invitations?|invites?|membership"
  + "|subscriptions?|notifications?|reminders?|deadlines?|priority|status|titles?|names?|descriptions?"
  + "|budgets?|prices?|stages?|values?|emails?|phones?|addresses?|labels?|tags?|categor(?:y|ies)|shifts?";
const CONFIRMATION_ALTERNATION = "yes|yep|yeah|yup|y|ok|okay|sure|confirm(?:ed)?|correct|affirmative"`);

// ---------------------------------------------------------------------------------------------
// 2. V67-D1 — a referring token counts WHEREVER IT SITS, not only at position 0.
// ---------------------------------------------------------------------------------------------
sub('IMPERATIVE_OBJECT derives from the one definition and stops reading only token 0',
  `        const IMPERATIVE_OBJECT = /^(?:the|a|an|this|that|these|those|my|our|your|its|their|his|her|all|every|each|both|new|another)\\s+\\S|^(?:it|them|this|that|these|those)\\b|^["'“”'']|^\\d|^\\S*[-_]?\\d|^[A-Z][A-Za-z0-9_-]*|^(?:compan(?:y|ies)|business|organi[sz]ation|person|people|employee|staff|manager|owner|task|goal|project|department|lead|document|proposal|product|spec|drawing|approval|channel|team|role|employment|assignment|contract|ticket|invoice|report|order|memory|note|agent|connector|provider|user|account|workspace|record|entry|row|item|file|access|permissions?|invitations?|invites?|membership|subscriptions?|notifications?|reminders?|deadlines?|priority|status|titles?|names?|descriptions?|budgets?|prices?|stages?|values?|emails?|phones?|addresses?|labels?|tags?|categor(?:y|ies)|shifts?)\\b|^\\S+@\\S+\\.\\S+|^\\S+\\s*$/;`,
  `        // "Does this object refer to something?" Every alternative used to be ^-anchored, so only TOKEN 0
        // was ever inspected: "work order WO-1" saw "work", matched nothing, and the whole request became
        // invisible to the receipt tier (verifier #67, V67-D1 — 480 of 480 fabrications shipped, while the
        // same matrix using the head noun alone shipped 0). A compound noun phrase refers to a thing just
        // as much as its head does, so the entity noun and the identifier are now recognised WHEREVER THEY
        // SIT in the object. The leading-position alternatives are kept as they were: they are what makes a
        // bare "it"/"them"/a quoted name/a determiner phrase count, and none of them is weakened here.
        const IMPERATIVE_OBJECT = new RegExp(
          '^(?:the|a|an|this|that|these|those|my|our|your|its|their|his|her|all|every|each|both|new|another)\\\\s+\\\\S'
          + '|^(?:it|them|this|that|these|those)\\\\b|^["\\'“”\\'\\']|^\\\\d|^\\\\S*[-_]?\\\\d|^[A-Z][A-Za-z0-9_-]*'
          // ANYWHERE, not ^: an entity noun, or an identifier-shaped token, at any position in the object.
          + '|\\\\b(?:' + ENTITY_NOUN_ALTERNATION + ')\\\\b'
          + '|\\\\b\\\\S*[-_]\\\\d|\\\\b[A-Z][A-Za-z0-9_-]*\\\\b'
          + '|^\\\\S+@\\\\S+\\\\.\\\\S+|^\\\\S+\\\\s*$', 'u');`);

// ---------------------------------------------------------------------------------------------
// 3. V67-D3 — the receipt names the entity the founder actually asked about.
// ---------------------------------------------------------------------------------------------
// Replaced by LINE rather than by a literal containing regex escapes: every attempt to spell this anchor
// through a shell round-trip lost its backslashes, which is the same trap that has cost this session
// several cycles. The line is unique, so matching on its opening is exact enough and cannot silently
// half-match.
{
  const opening = '          const commandEntityNoun = ';
  const at = s.indexOf(opening);
  if (at < 0) throw new Error('commandEntityNoun: declaration not found');
  const line = s.slice(at, s.indexOf('\n', at));
  // Uniqueness is asserted by sub() on the WHOLE line, which is the thing actually being replaced;
  // asserting it on the opening alone was wrong, because the opening also occurs inside this script's
  // own replacement text once earlier edits have been applied to the buffer.
  if (s.split(line).length - 1 !== 1) {
    throw new Error('commandEntityNoun: declaration occurs ' + (s.split(line).length - 1)
      + ' times; edits so far = ' + JSON.stringify(edits) + '; line = ' + JSON.stringify(line.slice(0, 80)));
  }
  if (!line.includes('business unit)')) throw new Error('commandEntityNoun: not the six-noun list this fix expects');
  sub('commandEntityNoun derives from the one definition', line,
  `          // Six nouns, so the receipt said "company" for 12 of 18 entity types — "archive approval A-1"
          // answered "could not resolve which COMPANY you meant (searched the active and archived
          // COMPANIES)", a false statement about what was searched (verifier #67, V67-D3). It now reads the
          // one definition, so the receipt names the thing the founder actually named.
          const commandEntityNoun = ((commandText.match(
            new RegExp('\\\\b(' + ENTITY_NOUN_ALTERNATION + ')\\\\b', 'i')) || [])[1] || '').toLowerCase();`);
}

// ---------------------------------------------------------------------------------------------
// 4. V67-D2 — the idiom must END the phrase. A modifier is not an idiom.
// ---------------------------------------------------------------------------------------------
sub('the read idiom requires a terminal noun',
  `\\b(?:restore|archive|delete|remove|clear|reset) (?:my |your |our |the )?(?:memory|context|conversation|history|chat|doubt|question|suggestion)s?\\b`,
  `\\b(?:restore|archive|delete|remove|clear|reset) (?:my |your |our |the )?(?:memory|context|conversation|history|chat|doubt|question|suggestion)s?(?=\\s*(?:[.,!?;:]|$)|\\s+(?:please|now|thanks|already|for me)\\b)`);

// ---------------------------------------------------------------------------------------------
// 5. V67-D4 — the receipt's "weighing, not instructing" test derives from the one frame definition.
// ---------------------------------------------------------------------------------------------
sub('hypotheticalRequest derives from REQUEST_FRAME_DELIBERATIVE',
  `const hypotheticalRequest = /^\\s*(?:if|suppose|supposing|what if|imagine|say|assuming|in case)\\b/i.test(commandText) || /\\b(?:thinking about|wondering (?:if|whether)|considering|might|may want to|could we|should we|shall we)\\b/i.test(commandText);`,
  `// The receipt picks its REASON here, and this named three deliberative frames while
          // REQUEST_FRAME_DELIBERATIVE names 22 — so the other 19 ("can I", "shall I", "I want to", …) were
          // told "I could not resolve which company you meant" about a company that resolves perfectly well
          // (verifier #67, V67-D4). Two spellings of "weighing, not instructing", drifted 19/22. The frame
          // half now derives from the one definition; the conditional half stays its own idea.
          const hypotheticalRequest = /^\\s*(?:if|suppose|supposing|what if|imagine|say|assuming|in case)\\b/i.test(commandText)
            || /\\b(?:thinking about|wondering (?:if|whether)|considering|might|may want to)\\b/i.test(commandText)
            || new RegExp('^\\\\s*(?:' + REQUEST_FRAME_DELIBERATIVE + ')\\\\b', 'i').test(commandText);`);

const out = s.replace(/\n/g, '\r\n');
if ((out.match(/(^|[^\r])\n/g) || []).length) throw new Error('bare LF introduced');
if (!out.includes('const ENTITY_NOUN_ALTERNATION')) throw new Error('the one definition was not declared');
// Declared before every consumer, or this is a TDZ crash rather than a fix.
const decl = out.indexOf('const ENTITY_NOUN_ALTERNATION');
for (const reader of ['IMPERATIVE_OBJECT = new RegExp', 'commandEntityNoun = ((commandText.match(']) {
  if (out.indexOf(reader) < decl) throw new Error(reader + ' reads ENTITY_NOUN_ALTERNATION before it is declared');
}
writeFileSync(p, out);
console.log('applied ' + edits.length + ' edits:');
for (const e of edits) console.log('  - ' + e);
