// V68 STRUCTURAL FIX — the vocabulary and the position rule belong in BOTH tiers, not one each.
//
// Verifier #68 derived its axis by asking which consumer of "a kind of thing this product stores" does NOT
// derive from the canonical ENTITY_NOUN_ALTERNATION that #67 introduced. Exactly one: STRONG_OBJECT, with
// 25 hand-written nouns against the canonical ~80. Then it asked what request shape reaches STRONG_OBJECT.
// Exactly one: a command with MORE THAN ONE CLAUSE. #67's corpora are all single-clause, so the surviving
// spelling was never executed, and every multi-clause case in the battery uses `task`/`company`, so the
// drift never showed.
//
//   V68-D1 (P1). "archive the <noun> and list them" — 198 of 207 fabrications ship. The control with a
//     noun that IS on STRONG_OBJECT's list ships 0 of 72. The only variable is the noun.
//
//   V68-D2 (P1). AND THIS ONE WAS INTRODUCED BY THE #67 FIX. Its repair, "a referring token counts
//     wherever it sits", was implemented POSITION-FREE. An English noun-phrase headline whose head word is
//     one of the ~120 lexicon verbs almost always contains an entity noun somewhere, so it became "an
//     imperative with a referring object" and the receipt DELETED the truthful answer:
//
//       "Transfer pricing for the business unit"
//         -> "No change was made — that request did not resolve to an operation I can execute from chat."
//
//     Truthful reads acquiring mutation intent: 2/40 on the parent, 31/40 on this candidate. Truthful
//     answers destroyed: 1/8 -> 8/8. The #67 session found and reverted ONE member of this class (a
//     capitalised-word-anywhere reading) and kept the other, which has the same disease.
//
// THE TWO ARE ONE DEFECT WEARING TWO FACES, and the verifier's sentence is the fix:
//   the vocabulary was shared in the tier that needed a POSITION rule,
//   and the position rule was dropped in the tier that needed the VOCABULARY.
//
// So: STRONG_OBJECT gets the shared vocabulary, and IMPERATIVE_OBJECT gets a position rule. The rule is
// the HEAD REGION of the object phrase — the head noun plus at most one modifier. An entity noun there
// identifies the thing ("work order WO-1", "engineering task T-1"); an entity noun further in is inside a
// prepositional phrase and does not ("pricing for the business unit", "of quarter report for ...").
import { readFileSync, writeFileSync } from 'node:fs';

const p = process.argv[2] || 'supabase/functions/sem-ai-command/index.ts';
let s = readFileSync(p, 'utf8').replace(/\r\n/g, '\n');
const edits = [];
function sub(what, from, to) {
  if (s.split(from).length - 1 !== 1) throw new Error(what + ': anchor missing or not unique');
  s = s.replace(from, () => to);   // function form: a `$'` in `to` would splice the rest of the file in
  edits.push(what);
}
/** Replace the ONE line containing `needle`. Backslash-free needles only. */
function subLine(what, needle, make) {
  const lines = s.split('\n');
  const hits = lines.map((l, i) => [l, i]).filter(([l]) => l.includes(needle));
  if (hits.length !== 1) throw new Error(what + ': ' + hits.length + ' lines match ' + JSON.stringify(needle));
  const [line, at] = hits[0];
  const next = make(line);
  if (next === line) throw new Error(what + ': edit was a no-op');
  lines[at] = next;
  s = lines.join('\n');
  edits.push(what);
}

// ---------------------------------------------------------------------------------------------
// V68-D2 — the position rule the #67 repair should have had.
// ---------------------------------------------------------------------------------------------
subLine('IMPERATIVE_OBJECT reads the entity noun in the HEAD REGION, not anywhere',
  "+ '|" + '\\' + "\\b(?:' + ENTITY_NOUN_ALTERNATION + ')",
  () => "          + '|^(?:\\\\S+\\\\s+){0,1}(?:' + ENTITY_NOUN_ALTERNATION + ')\\\\b'");

sub('and the comment says which rule it is now',
  `          // ANYWHERE, not ^: an ENTITY NOUN at any position in the object. This one alternative is the
          // whole of the V67-D1 repair — "work order WO-1" refers because "work order" is a thing this
          // product stores, wherever it sits in the phrase.`,
  `          // THE HEAD REGION of the object phrase: an ENTITY NOUN as the head, or behind at most one
          // modifier — "work order WO-1", "engineering task T-1". That is what makes a compound reference
          // refer (verifier #67, V67-D1).
          //
          // POSITION-FREE WAS WRONG AND SHIPPED A P1 (verifier #68, V68-D2). An English noun-phrase
          // headline whose head word is a lexicon verb almost always contains an entity noun SOMEWHERE, so
          // "Transfer pricing for the business unit" became an imperative with a referring object and the
          // receipt deleted the truthful answer — 8 of 8 destroyed. An entity noun in the head region
          // IDENTIFIES the object; one further in belongs to a prepositional phrase and does not.`);

// ---------------------------------------------------------------------------------------------
// V68-D1 / V68-D3b — the tier that needed the vocabulary finally gets it.
// ---------------------------------------------------------------------------------------------
{
  const opening = '          const STRONG_OBJECT = ';
  const at = s.indexOf(opening);
  if (at < 0) throw new Error('STRONG_OBJECT: declaration not found');
  const line = s.slice(at, s.indexOf('\n', at));
  if (s.split(line).length - 1 !== 1) throw new Error('STRONG_OBJECT: declaration not unique');
  if (!line.includes('|assignment|employment)')) throw new Error('STRONG_OBJECT: not the hand-written list this fix expects');
  sub('STRONG_OBJECT derives from the one entity-noun definition', line,
    `          // The LAST re-spelling of the entity vocabulary: 25 hand-written nouns against the canonical
          // ~80. Only a MULTI-CLAUSE command reaches this line, and every multi-clause case in the battery
          // used "task" or "company", so the drift was invisible while 198 of 207 fabrications shipped
          // (verifier #68, V68-D1). Same stricter bar as before — the object must NAME its target — but the
          // vocabulary is now the one definition rather than a copy of part of it.
          const STRONG_OBJECT = new RegExp(
            '^(?:the|a|an|this|that|my|our|your|its|their|his|her)?\\\\s*'
            + '(?:[A-Z][A-Za-z0-9_-]*|\\\\S+[-_]?\\\\d|"[^"]+"|\\'[^\\']+\\'|[\\u201C][^\\u201D]+[\\u201D]'
            + '|\\\\S+@\\\\S+\\\\.\\\\S+|it|them|' + ENTITY_NOUN_ALTERNATION + ')(?![A-Za-z0-9_])', 'u');`);
}

// ---------------------------------------------------------------------------------------------
// V68-D4b — a purchase order is a purchase order.
// ---------------------------------------------------------------------------------------------
sub('a bare "order" means a work order; a named order keeps its name',
  `            // There is no bare "order" entity in this product; "archive order WO-1" is about a work order,
            // and the receipt should name the type that was actually searched.
            : /^(work order|purchase order|order)$/.test(commandEntityNoun) ? 'work order'`,
  `            // There is no bare "order" entity in this product, so "archive order WO-1" is about a work
            // order. A PURCHASE order is its own thing and must keep its own name — reporting it as a work
            // order is the same false statement about what was searched, one noun over (verifier #68).
            : commandEntityNoun === 'order' ? 'work order'`);

// ---------------------------------------------------------------------------------------------
// V68-D4a — "people", not "persons". A receipt the founder reads must be written in English.
// ---------------------------------------------------------------------------------------------
sub('the receipt pluralises irregular nouns correctly',
  "${entity === 'company' ? 'companies' : entity + 's'}",
  "${pluraliseEntity(entity)}");

sub('pluraliseEntity declared ABOVE the reason line that reads it',
  `          const reason = pendingQuestion `,
  `          // "searched the active and archived persons" is not English, and a founder-facing sentence that
          // reads as machine output is a real defect rather than a cosmetic one (verifier #68, V68-D4a).
          // Irregulars first, then the ordinary -y/-s/-x/-ch rules; anything unlisted just takes an "s".
          const pluraliseEntity = (e: string): string => {
            const irregular: Record<string, string> = {
              person: 'people', company: 'companies', memory: 'memories', category: 'category'.slice(0, 0) + 'categories',
              status: 'statuses', access: 'access', staff: 'staff', people: 'people',
            };
            if (irregular[e]) return irregular[e];
            if (/(?:s|x|z|ch|sh)$/.test(e)) return e + 'es';
            if (/[^aeiou]y$/.test(e)) return e.slice(0, -1) + 'ies';
            return e + 's';
          };
          const reason = pendingQuestion `);

const out = s.replace(/\n/g, '\r\n');
if ((out.match(/(^|[^\r])\n/g) || []).length) throw new Error('bare LF introduced');
if (out.includes("entity + 's'}")) throw new Error('the naive pluralisation survived');
// A const arrow read before its declaration is a TDZ CRASH, not a fallback — the class this repo pins with
// tdz_forward_reference_contract, and the first placement of this helper was exactly that.
if (out.indexOf('const pluraliseEntity') > out.indexOf('pluraliseEntity(entity)')) {
  throw new Error('pluraliseEntity is read before it is declared — TDZ');
}
writeFileSync(p, out);
console.log('applied ' + edits.length + ' edits:');
for (const e of edits) console.log('  - ' + e);
