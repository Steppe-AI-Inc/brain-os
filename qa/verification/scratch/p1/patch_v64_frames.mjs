// VERIFIER #64 FINDINGS V64-D1, V64-D1b, V64-D1c (P1).
//
// V64-D1b is the same defect for the THIRD round running: the v59 hardening added
// "(?:i think )?(?:we|you) should" to IMPERATIVE_HEAD_RE — the executor's command fallback — and never to
// REQUEST_FRAME_PREFIX, the tier the never-silent receipt depends on. And it points the wrong way: the
// executor tier has a fallback that rescues company archive/restore anyway, while the intent tier has none,
// so "we should delete QA-1" or "we should rename ACME to Beta" derives nothing and the model's prose is
// the whole answer. The repair landed in the tier that did not need it and was withheld from the one that did.
//
// Adding the missing entries to the second list would repair this instance and leave the mechanism intact —
// two hand-maintained lists of the same concept, drifting apart once per round. So THE TWIN IS REMOVED:
// one module-level definition of what a request frame is, and both tiers are built from it. A frame added
// once is now added everywhere by construction, not by whoever remembers.
//
// V64-D1  the shared list also had arbitrary holes ("we should", "let us", "need to", "may I ask you to",
//         "would you be able to", "any chance you could", "mind …", "I would like you to", "it would be
//         great if you could", "feel free to"), plus two non-frame gaps: "ACME needs archiving" (a
//         participle after "needs") and "ACME-г archive хийнэ үү" (a Latin verb with the Mongolian light
//         verb хийх, which is how loan verbs are actually used).
// V64-D1c a DEAD alternative: LEADING_ADVERB has "right away", but REQUEST_FRAME_PREFIX's bare "right" ran
//         first inside stripFrames and ate it, stranding "away". Adverbs are stripped before frames now.
import { readFileSync, writeFileSync } from 'node:fs';
const p = process.argv[2] || 'supabase/functions/sem-ai-command/index.ts';
let s = readFileSync(p, 'utf8').replace(/\r\n/g, '\n');
let n = 0;
function must(a, b, label) { const c = s.split(a).length - 1; if (c !== 1) throw new Error(label + ': found ' + c); s = s.replace(a, () => b); n++; }

// ---- ONE definition, at module level, above both tiers.
const FRAMES = String.raw`// THE ONE DEFINITION OF A REQUEST FRAME. Two tiers consume it: the executor's command fallback
// (IMPERATIVE_HEAD_RE) and the request-intent derivation (REQUEST_FRAME_PREFIX). They were separate lists of
// the same concept and drifted apart in three consecutive rounds — most recently the v59 hardening, which
// landed in the executor tier and was withheld from the intent tier the receipt rule depends on
// (verifier #64, V64-D1b). A frame added here is added to both, by construction.
const REQUEST_FRAME_ALTERNATION = "ok|okay|please|pls|plz|kindly|just|now|also|then|and|so|right|well|next|first|finally|again|yes|sure|hey brain|brain|quick one"
  + "|go ahead(?: and)?|do me a favou?r(?: and)?|be a dear and|don['’]?t forget to|remember to|make sure to|be sure to"
  + "|time to|it['’]?s time to|its time to|feel free to"
  + "|when(?:ever)? you (?:get|have) (?:a chance|a moment|a minute|a sec|time)|if you (?:can|could|would|get a chance)"
  + "|before (?:eod|end of day|you go|lunch|tomorrow)"
  + "|i(?:['’]d| would) appreciate (?:it )?if you(?: could| would)?|it would be (?:great|good|helpful) if you(?: could| would)?"
  + "|could you(?: please)?|can you(?: please)?|would you(?: please| mind)?|would you be able to|any chance you could"
  + "|may i ask you to|mind|will you|can we|could we|shall we"
  + "|let['’]?s|let us|(?:i think )?(?:we|you) should|we need to|i need you to|i want you to"
  + "|i(?:['’]d| would) like you to|you need to|need you to|need to|you can";
`;

must(`function estimateTokens(x: unknown){ return Math.ceil(JSON.stringify(x).length / 4); }`,
     FRAMES + `function estimateTokens(x: unknown){ return Math.ceil(JSON.stringify(x).length / 4); }`, 'shared frames');

// ---- both tiers built from it.
must(`        const IMPERATIVE_HEAD_RE = /^\\s*(?:(?:ok|okay|please|pls|plz|kindly|just|now|also|then|and|so|right|well|next|first|finally|again|yes|sure|go ahead(?: and)?|do me a favou?r and|hey brain|brain|quick one|time to|it['’]?s time to|make sure to|be sure to|remember to|don['’]?t forget to|be a dear and|when(?:ever)? you (?:get|have) (?:a chance|a moment|a minute|a sec|time)|if you (?:can|could|would|get a chance)|i(?:['’]d| would) appreciate (?:it )?if you(?: could| would)?|let['’]?s|we need to|(?:i think )?(?:we|you) should|i need you to|i want you to|i['’]?d like you to|you should|you need to|need you to|you can|could you(?: please)?|can you(?: please)?|would you(?: please| mind)?|will you|can we|could we|shall we)[\\s,:—–-]+)*(?:archiv(?:e|ing)|un-?archiv(?:e|ing)|restor(?:e|ing)|reactivat(?:e|ing)|delet(?:e|ing)|remov(?:e|ing)|bring(?:ing)? back|end(?:ing)?)\\b/u;`,
`        const IMPERATIVE_HEAD_RE = new RegExp('^\\\\s*(?:(?:' + REQUEST_FRAME_ALTERNATION + ')[\\\\s,:—–-]+)*(?:archiv(?:e|ing)|un-?archiv(?:e|ing)|restor(?:e|ing)|reactivat(?:e|ing)|delet(?:e|ing)|remov(?:e|ing)|bring(?:ing)? back|end(?:ing)?)\\\\b', 'iu');`, 'imperative head');

must(`        const REQUEST_FRAME_PREFIX = /^\\s*(?:(?:ok|okay|please|pls|plz|kindly|just|now|also|then|and|so|right|well|next|first|finally|again|yes|sure|hey brain|brain|quick one|go ahead(?: and)?|do me a favou?r(?: and)?|be a dear and|don['’]?t forget to|remember to|make sure to|be sure to|time to|it['’]?s time to|its time to|when(?:ever)? you (?:get|have) (?:a chance|a moment|a minute|a sec|time)|if you (?:can|could|would|get a chance)|before (?:eod|end of day|you go|lunch|tomorrow)|i(?:['’]d| would) appreciate (?:it )?if you(?: could| would)?|could you(?: please)?|can you(?: please)?|would you(?: please| mind)?|will you|can we|could we|shall we|let['’]?s|we need to|i need you to|i want you to|i['’]?d like you to|you should|you need to|need you to|you can)[\\s,:—–-]+)+/i;`,
`        const REQUEST_FRAME_PREFIX = new RegExp('^\\\\s*(?:(?:' + REQUEST_FRAME_ALTERNATION + ')[\\\\s,:—–-]+)+', 'i');`, 'request frame prefix');

// ---- V64-D1c: adverbs are stripped BEFORE frames, so "right away" is never eaten by bare "right".
must(`          for (let i = 0; i < 4; i++) {
            const next = out.replace(REQUEST_FRAME_PREFIX, '').replace(LEADING_ADVERB, '');
            if (next === out) break;
            out = next;
          }`,
`          // Adverbs FIRST: REQUEST_FRAME_PREFIX has a bare "right", which ate the "right" of "right away"
          // and stranded "away", making that LEADING_ADVERB alternative unreachable (verifier #64, V64-D1c).
          for (let i = 0; i < 4; i++) {
            const next = out.replace(LEADING_ADVERB, '').replace(REQUEST_FRAME_PREFIX, '').replace(LEADING_ADVERB, '');
            if (next === out) break;
            out = next;
          }`, 'adverbs first');

// ---- V64-D1: "ACME needs archiving" — a participle after needs/wants.
must(`        const MUTATION_PASSIVE_REQUEST = /\\b(?:should|must|needs? to|has to|have to|is to|are to|ought to|got to|gotta) `,
`        // "ACME needs archiving": a bare participle after needs/wants, with no "to" and no auxiliary.
        const MUTATION_NEEDS_PARTICIPLE = /\\b(?:needs?|wants?|requires?)\\s+(?:archiv|un-?archiv|restor|reactivat|delet|remov|renam|retitl|reassign|unassign|approv|activat|deactivat|invit|revok|enabl|disabl|promot|demot|onboard|merg|updat|clos|complet|cancel|assign|mov|transfer|end)ing\\b/i;
        const MUTATION_PASSIVE_REQUEST = /\\b(?:should|must|needs? to|has to|have to|is to|are to|ought to|got to|gotta) `, 'needs participle');

must(`        const lexiconPassive = MUTATION_PASSIVE_REQUEST.test(commandText) ?`,
     `        const lexiconPassive = (MUTATION_PASSIVE_REQUEST.test(commandText) || MUTATION_NEEDS_PARTICIPLE.test(commandText)) ?`, 'passive uses participle');

// ---- V64-D1: a Latin loan verb carried by the Mongolian light verb хийх.
must(`        const mnCandidates = MN_READ_SHAPE.test(commandText) ? [] : [...commandText.matchAll(MN_STEMS_GLOBAL)].map((m) => m[1]);`,
`        // Mongolian carries a borrowed English verb with the light verb хийх ("to do"): "ACME-г archive
        // хийнэ үү" is an ordinary polite request to archive (verifier #64, V64-D1). The Latin verb is the
        // content; хийнэ/хий/хийж is the grammar. MN_READ_SHAPE must not veto it, so it is matched here
        // rather than through the Cyrillic stem list.
        const MN_LOAN_VERB = /(?:^|\\P{L})(archive|unarchive|restore|reactivate|delete|remove|rename|reassign|unassign|approve|reject|activate|deactivate|invite|revoke|enable|disable|promote|demote|onboard|merge|update|close|complete|cancel|assign|move|transfer|end|create|add|set)\\s+хий\\S*/iu;
        const mnLoanVerb = (commandText.match(MN_LOAN_VERB) || [])[1] || null;
        const mnCandidates = MN_READ_SHAPE.test(commandText) ? [] : [...commandText.matchAll(MN_STEMS_GLOBAL)].map((m) => m[1]);`, 'loan verb');

must(`        const lexiconAlways = (alwaysInImperativePosition ? alwaysEnglishBase : null) || alwaysOther || alwaysCyrillic || null;`,
     `        const lexiconAlways = (alwaysInImperativePosition ? alwaysEnglishBase : null) || alwaysOther || alwaysCyrillic || (mnLoanVerb ? mnLoanVerb.toLowerCase() : null) || null;`, 'loan verb in lexicon');

const out = s.replace(/\n/g, '\r\n');
if ((out.match(/(^|[^\r])\n/g) || []).length) throw new Error('bare LF');
if (out.indexOf('const REQUEST_FRAME_ALTERNATION') > out.indexOf('const IMPERATIVE_HEAD_RE')) throw new Error('the shared frames are declared after their first use');
writeFileSync(p, out); console.log('applied', n);
