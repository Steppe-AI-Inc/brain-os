// V61-D7, second half. The object test closed 21 of 29; the remaining 8 came in through the OTHER
// head-position tier — the "verb anywhere" group gated to imperative position by the V60 closure, which
// checked position but never the object. "Archive policy needs a review", "Restore point for the database
// was created yesterday", "Delete key on my keyboard is broken", "Split shifts start on Monday" all put a
// lifecycle verb at the head of a NOUN PHRASE. Both tiers now share one object test, so neither can admit
// what the other rejects.
//
// IMPERATIVE_OBJECT is HOISTED above both tiers. It was declared after the always-tier, and a const read
// before its declaration is a TDZ crash at runtime, not a fallback — the exact class this project pins with
// tdz_forward_reference_contract.mjs. Declaration order here is load-bearing, not cosmetic.
//
// A single remaining token IS a referring object ("archive alpha", "restore ACME"), even lowercase: a real
// command that names one thing stops there, while all 29 noun phrases continue past their head noun.
import { readFileSync, writeFileSync } from 'node:fs';
const p = process.argv[2] || 'supabase/functions/sem-ai-command/index.ts';
let s = readFileSync(p, 'utf8').replace(/\r\n/g, '\n');
let n = 0;
function must(a, b, label) { const c = s.split(a).length - 1; if (c !== 1) throw new Error(label + ': found ' + c); s = s.replace(a, () => b); n++; }

const OBJECT_RE = `/^(?:the|a|an|this|that|these|those|my|our|your|its|their|his|her|all|every|each|both|new|another)\\s+\\S|^(?:it|them|this|that|these|those)\\b|^["'“”'']|^\\d|^\\S*[-_]?\\d|^[A-Z][A-Za-z0-9_-]*|^(?:compan(?:y|ies)|business|organi[sz]ation|person|people|employee|staff|manager|owner|task|goal|project|department|lead|document|proposal|product|spec|drawing|approval|channel|team|role|employment|assignment|contract|ticket|invoice|report|order|memory|note|agent|connector|provider|user|account|workspace|record|entry|row|item|file)\\b|^\\S+\\s*$/`;

// ---- remove the late declaration (it is re-declared above both tiers).
must(`        const IMPERATIVE_OBJECT = /^(?:the|a|an|this|that|these|those|my|our|your|its|their|his|her|all|every|each|both|new|another)\\s+\\S|^(?:it|them|this|that|these|those)\\b|^["'“”'']|^\\d|^\\S*[-_]?\\d|^[A-Z][A-Za-z0-9_-]*|^(?:compan(?:y|ies)|business|organi[sz]ation|person|people|employee|staff|manager|owner|task|goal|project|department|lead|document|proposal|product|spec|drawing|approval|channel|team|role|employment|assignment|contract|ticket|invoice|report|order|memory|note|agent|connector|provider|user|account|workspace|record|entry|row|item|file)\\b/;
`, ``, 'remove late declaration');

// ---- declare it above BOTH tiers.
must(`        const alwaysMatch = commandText.match(MUTATION_VERB_ALWAYS);`,
`        // An imperative needs an OBJECT THAT REFERS TO SOMETHING. Without this the head word only has to be
        // spelled like a verb, and a noun phrase headed by one ("Archive policy needs a review", "Share
        // price fell after the announcement") reads as a command (verifier #61, V61-D7). Declared here, above
        // both tiers that use it: a const read before its declaration is a TDZ crash, not a fallback.
        const IMPERATIVE_OBJECT = ${OBJECT_RE};
        const alwaysMatch = commandText.match(MUTATION_VERB_ALWAYS);`, 'hoist object regex');

// ---- the verb-anywhere tier clears the same bar as the imperative tier.
must(`        const alwaysInImperativePosition = !!alwaysHeadRe
          && (alwaysHeadRe.test(commandForHead)
            || (commandClausesForRead.length > 1 && alwaysHeadRe.test(lastClauseForHead)));`,
`        // Position alone is not enough — the object test decides, the same one the imperative tier uses,
        // so neither tier can admit what the other rejects (verifier #61, V61-D7).
        function headHasObject(clause: string): boolean {
          if (!alwaysHeadRe) return false;
          const m = alwaysHeadRe.exec(clause);
          if (!m) return false;
          return IMPERATIVE_OBJECT.test(clause.slice(m[0].length).trim());
        }
        const alwaysInImperativePosition = !!alwaysHeadRe
          && (headHasObject(commandForHead)
            || (commandClausesForRead.length > 1 && headHasObject(lastClauseForHead)));`, 'always object');

const out = s.replace(/\n/g, '\r\n');
if ((out.match(/(^|[^\r])\n/g) || []).length) throw new Error('bare LF');
if (out.indexOf('const IMPERATIVE_OBJECT') > out.indexOf('function headHasObject')) throw new Error('IMPERATIVE_OBJECT still declared after use');
if ((out.match(/const IMPERATIVE_OBJECT/g) || []).length !== 1) throw new Error('IMPERATIVE_OBJECT declared more than once');
writeFileSync(p, out); console.log('applied', n);
