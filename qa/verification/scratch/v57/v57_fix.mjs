// VERIFIER #57 — PREPARED FIX (not applied to the candidate; no write authority on index.ts).
// Writes qa/verification/scratch/v57/index.fixed.ts from the candidate with three narrow changes:
//   F1 (V57-D1): the model's explicit non-mutation classification ('other') vetoes the request LEXICON exactly as
//                'read' does — the lexicon acts only when the model gave no classification. Text shape is never the
//                sole reason a truthful non-mutation reply is rewritten (OTM §3 rule 2).
//   F2 (V57-D2): the command-derived company fallback is withheld when the model classified the request's entity
//                as something other than a company (the comment at the gate already claims this; the code did not).
//   F3 (V57-D3): the imperative gate also refuses mid-sentence "not to <verb>", deliberative leads ("suppose",
//                "should we", "thinking about"), reported speech ("X said/wants/asked (us) to <verb>") and
//                past-tense declaratives ("We archived X", "Someone removed X", "I already restored X").
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
const ROOT = resolve(new URL('../../../..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const SRC = resolve(ROOT, 'supabase/functions/sem-ai-command/index.ts');
const OUT = resolve(ROOT, 'qa/verification/scratch/v57/index.fixed.ts');
const base = readFileSync(SRC, 'utf8');
if (createHash('sha256').update(base).digest('hex') !== 'ccde932fa5b1aeca77cb91d730df89ea16c100432d83dd80782b4217b85fe871') throw new Error('candidate sha mismatch');
function mustReplace(s, a, b, label) { const n = s.split(a).length - 1; if (n !== 1) throw new Error(`anchor not unique (${n}) for ${label}`); return s.replace(a, () => b); }
let s = base;
// F1
s = mustReplace(s, "const lexiconReadVetoed = lexiconVerb !== null && (readShaped || modelIntentKind === 'read');",
  "const lexiconReadVetoed = lexiconVerb !== null && (readShaped || modelIntentKind === 'read' || modelIntentKind === 'other');", 'F1');
// F2
s = mustReplace(s, " && (!modelRequestIntent || modelRequestIntent.kind === 'mutation');",
  " && (!modelRequestIntent || (modelRequestIntent.kind === 'mutation' && (modelRequestIntentEntity === null || modelRequestIntentEntity === 'company' || modelRequestIntentEntity === 'other')));", 'F2');
// F3
s = mustReplace(s,
  "const commandNegatedLead = /^\\s*(?:do not|don['’]t|never|please do not|please don['’]t|stop|without|instead of|rather than|not|no)\\b/.test(commandLower) || /\\b(?:do not|don['’]t|never|instead of|rather than|not going to|no need to|should not|shouldn['’]t|must not|mustn['’]t|won['’]t|will not|cannot|can['’]t)\\s+(?:\\w+\\s+){0,3}(?:archive|restore|delete|remove|unarchive|reactivate)/.test(commandLower);",
  "const commandNegatedLead = /^\\s*(?:do not|don['’]t|never|please do not|please don['’]t|stop|without|instead of|rather than|not|no)\\b/.test(commandLower) || /\\b(?:do not|don['’]t|never|not|no longer|instead of|rather than|not going to|no need to|should not|shouldn['’]t|must not|mustn['’]t|won['’]t|will not|cannot|can['’]t)\\s+(?:\\w+\\s+){0,3}(?:archive|restore|delete|remove|unarchive|reactivate)/.test(commandLower)\r\n          || /\\b(?:said|says|told|asked|wants?|wanted|suggested|suggests|proposed|recommends?|recommended)\\s+(?:us |me |you |them )?to\\s+(?:\\w+\\s+){0,2}(?:archive|restore|delete|remove|unarchive|reactivate)/.test(commandLower)\r\n          || /^\\s*(?:i|we|they|he|she|someone|somebody|(?!(?:archive|archiving|restore|restoring|delete|deleting|remove|removing|unarchive|reactivate|bring|end|ending|please|pls|kindly|just|now|ok|okay|also|then|and)\\b)[a-z]+)\\s+(?:have |has |had |already |just |recently |also |accidentally |mistakenly )*(?:archived|deleted|removed|restored|ended|reactivated|unarchived)\\b/.test(commandLower);", 'F3a');
s = mustReplace(s,
  "const commandReadLead = /^\\s*(?:what|who|whom|whose|when|where|which|how|why|is|are|was|were|does|do|did|can you tell|could you tell|tell me|show|list|give me|summari[sz]e|describe|explain|report on|remind me|any news|status of|update me|if|when|before|after|should i|shall i|could we|can we|would it|what if)\\b/.test(commandLower);",
  "const commandReadLead = /^\\s*(?:what|who|whom|whose|when|where|which|how|why|is|are|was|were|does|do|did|can you tell|could you tell|tell me|show|list|give me|summari[sz]e|describe|explain|report on|remind me|any news|status of|update me|if|when|before|after|should i|shall i|should we|shall we|could we|can we|would it|what if|suppose|supposing|imagine|thinking|wondering|considering|not sure|unsure|maybe|perhaps)\\b/.test(commandLower);", 'F3b');
writeFileSync(OUT, s);
console.log('fixed copy written:', OUT, 'sha256', createHash('sha256').update(s).digest('hex'));
