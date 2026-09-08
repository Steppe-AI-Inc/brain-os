// VERIFIER #61 FINDINGS V61-D6 and V61-D7 (both P1) — the two false-positive classes the imperative tier
// opened. Both are truth regressions against deployed v92, which answers all of these correctly, and both
// destroy a truthful answer and replace it with a receipt for an operation nobody requested.
//
// V61-D7, English (29/29 destroyed). MUTATION_IMPERATIVE_HEAD required only `^verb\b\s+\S`, so it never
//   distinguished a verb at the head of a command from a NOUN at the head of a noun phrase: "Archive policy
//   needs a review", "Delete key on my keyboard is broken", "Order confirmation arrived this morning",
//   "Share price fell after the announcement". The fix is to require an OBJECT that refers to something —
//   a determiner phrase, a proper noun, an identifier, a quoted string, a pronoun, a number, or an entity
//   noun. Every one of the 37 real imperatives in the v60 corpus has one; none of the 29 noun phrases does.
//   Capitalisation is deliberately NOT the discriminator: founders capitalise their commands too.
//
// V61-D6, Mongolian (22/22 destroyed). Group 4 matched `\S*`-suffixed stems ANYWHERE, so it also matched
//   derived nouns and participles — нэмэлт (additional), өөрчлөлт (change, noun), архивласан (archived,
//   attributive), Устгасан, Томилогдсон, Цуцлагдсан, Хасагдсан — and the exact stem хаа, which is also the
//   ordinary word in хаа сайгүй (everywhere). Meanwhile every veto path was ASCII-only, so nothing could
//   rescue them, and Mongolian questions commonly use уу/вэ/бэ with no question mark. Three fixes:
//     (a) нэрийг is removed from the stem list outright — it is the accusative of нэр (name), a noun, and
//         was never a verb;
//     (b) a Mongolian match must be in VERB-FINAL position, which is where the source comment already said
//         Mongolian puts its verbs — the whole reason group 4 was exempt from the English head rule;
//     (c) a match whose surface form is a participle, a verbal noun or an infinitive is not a command, and
//         Mongolian question particles and байна/байгаа/мэдэхгүй/санахгүй statements veto like READ_SHAPE.
//   The Mongolian positives in the promoted corpora keep working: the verb is last in all of them.
import { readFileSync, writeFileSync } from 'node:fs';
const p = process.argv[2] || 'supabase/functions/sem-ai-command/index.ts';
let s = readFileSync(p, 'utf8').replace(/\r\n/g, '\n');
let n = 0;
function must(a, b, label) { const c = s.split(a).length - 1; if (c !== 1) throw new Error(label + ': found ' + c); s = s.replace(a, () => b); n++; }

// ---- (a) нэрийг is a noun, not a verb stem.
must(`|нэрийг)(?!\\p{L})/iu;`, `)(?!\\p{L})/iu;`, 'drop нэрийг');

// ---- D7: the imperative tier requires a referring object.
must(`        const MUTATION_IMPERATIVE_HEAD = /^\\s*(?:`, `        const MUTATION_IMPERATIVE_VERB = /^\\s*(?:`, 'rename head regex');

must(`        const imperativeSource = MUTATION_IMPERATIVE_HEAD.test(commandForHead)
          ? commandForHead
          : (commandClausesForRead.length > 1 && MUTATION_IMPERATIVE_HEAD.test(lastClauseForHead) ? lastClauseForHead : null);`,
`        // An imperative needs an OBJECT THAT REFERS TO SOMETHING. Without this test the head word is only
        // required to be spelled like a verb, and "Archive policy needs a review" or "Share price fell
        // after the announcement" read as commands (verifier #61, V61-D7). A determiner phrase, a proper
        // noun, an identifier, a quoted string, a pronoun, a bare number or an entity noun all refer; a
        // bare common noun continuing a noun phrase does not.
        const IMPERATIVE_OBJECT = /^(?:the|a|an|this|that|these|those|my|our|your|its|their|his|her|all|every|each|both|new|another)\\s+\\S|^(?:it|them|this|that|these|those)\\b|^["'“”'']|^\\d|^\\S*[-_]?\\d|^[A-Z][A-Za-z0-9_-]*|^(?:compan(?:y|ies)|business|organi[sz]ation|person|people|employee|staff|manager|owner|task|goal|project|department|lead|document|proposal|product|spec|drawing|approval|channel|team|role|employment|assignment|contract|ticket|invoice|report|order|memory|note|agent|connector|provider|user|account|workspace|record|entry|row|item|file)\\b/;
        const imperativeObjectOf = (clause: string) => {
          const m = MUTATION_IMPERATIVE_VERB.exec(clause);
          if (!m) return null;
          const rest = clause.slice(m[0].length - 1).trim();
          return IMPERATIVE_OBJECT.test(rest) ? clause : null;
        };
        const imperativeSource = imperativeObjectOf(commandForHead)
          || (commandClausesForRead.length > 1 ? imperativeObjectOf(lastClauseForHead) : null);`, 'imperative object');

// ---- D6: Mongolian needs verb-final position, real verb morphology, and its own read veto.
must(`        const alwaysMatch = commandText.match(MUTATION_VERB_ALWAYS);
        const alwaysEnglishBase = alwaysMatch && typeof alwaysMatch[1] === 'string' && alwaysMatch[1].length > 0 ? alwaysMatch[1] : null;
        const alwaysOther = alwaysMatch ? (alwaysMatch.slice(2).find((g) => typeof g === 'string' && g.length > 0) || null) : null;`,
`        const alwaysMatch = commandText.match(MUTATION_VERB_ALWAYS);
        const alwaysEnglishBase = alwaysMatch && typeof alwaysMatch[1] === 'string' && alwaysMatch[1].length > 0 ? alwaysMatch[1] : null;
        // Group 4 is the Mongolian alternation and is handled on its own terms below; groups 2-3
        // ("bring it back", "get ACME archived") already carry their own position.
        const alwaysCyrillicRaw = alwaysMatch && typeof alwaysMatch[4] === 'string' && alwaysMatch[4].length > 0 ? alwaysMatch[4] : null;
        const alwaysOther = alwaysMatch ? ([alwaysMatch[2], alwaysMatch[3]].find((g) => typeof g === 'string' && g.length > 0) || null) : null;
        // A Mongolian READ or STATEMENT: a question word, a sentence-final question particle (Mongolian
        // questions routinely carry no '?'), or the copular/negative endings that make a clause a statement
        // about the world rather than a request (verifier #61, V61-D6).
        const MN_READ_SHAPE = /(?:^|\\P{L})(?:юу|юун|хэн|хэзээ|хаана|яагаад|ямар|хэд|хэдэн|аль|хэрхэн|яаж)(?!\\p{L})|(?:^|\\P{L})(?:уу|үү|вэ|бэ|вээ|бээ)\\s*[?!.]?\\s*$|(?:^|\\P{L})(?:байна|байгаа\\S*|мэдэхгүй|санахгүй|болно\\s*уу|хэлээч|харуулна)(?!\\p{L})/iu;
        // A participle, a verbal noun or an infinitive is not a command: архивласан (archived, attributive),
        // өөрчлөлт (a change), устгах (to delete). Only a finite/imperative form is.
        const MN_NOT_A_COMMAND = /(?:сан|сэн|сон|сөн|лт|лга|лгэ|даг|дэг|дог|дөг|маар|мээр|х)(?:ыг|ийг|ын|ий|ийн|ын|аас|ээс|оос|өөс|д|т|тай|тэй|той|нь)?$/u;
        // Mongolian is VERB-FINAL — the reason group 4 is exempt from the English head rule. A stem that
        // appears anywhere else in the clause is a noun, an attribute or a converb, not the command.
        const mnTokens = commandText.trim().replace(/[?!.,;:]+$/u, '').split(/\\s+/u).filter((w) => w.length > 0);
        const mnFinalWindow = mnTokens.slice(-2).join(' ');
        const alwaysCyrillic = alwaysCyrillicRaw
          && !MN_READ_SHAPE.test(commandText)
          && !MN_NOT_A_COMMAND.test(alwaysCyrillicRaw)
          && mnFinalWindow.includes(alwaysCyrillicRaw)
          ? alwaysCyrillicRaw : null;`, 'mongolian rules');

must(`        const lexiconAlways = (alwaysInImperativePosition ? alwaysEnglishBase : null) || alwaysOther || null;`,
     `        const lexiconAlways = (alwaysInImperativePosition ? alwaysEnglishBase : null) || alwaysOther || alwaysCyrillic || null;`, 'lexicon always');

const out = s.replace(/\n/g, '\r\n');
if ((out.match(/(^|[^\r])\n/g) || []).length) throw new Error('bare LF');
writeFileSync(p, out); console.log('applied', n);
