// VERIFIER #60 FINDING V60-D3 (P1). The request lexicon was vetoed by `modelIntentKind === 'read'` and
// `'other'` — fields the MODEL emits. The component the truth gate polices could switch the gate off, and
// 37/37 imperative mutation requests shipped a fabricated completion verbatim. requestIntent is prompt
// text, not a schema-enforced field, so this is not even an adversarial case: an ordinary misclassification
// is enough.
//
// governance/OPERATING_TRUTH_MODEL.md §3 and the founder's correction of 2026-09-07 are explicit: request
// intent is derived from the FOUNDER'S REQUEST. The model's classification may ADD intent it recognises;
// it may never REMOVE intent the request itself carries. Only request-side evidence — the command being
// read-shaped — can veto the lexicon, and that is unchanged.
import { readFileSync, writeFileSync } from 'node:fs';
const p = process.argv[2] || 'supabase/functions/sem-ai-command/index.ts';
let s = readFileSync(p, 'utf8').replace(/\r\n/g, '\n');
let n = 0;
function must(a, b, label) { const c = s.split(a).length - 1; if (c !== 1) throw new Error(label + ': found ' + c); s = s.replace(a, () => b); n++; }

must(`        const lexiconReadVetoed = lexiconVerb !== null && (readShaped || modelIntentKind === 'read' || modelIntentKind === 'other');`,
`        // ONLY the request may veto the request lexicon. modelIntentKind is emitted by the model, and
        // letting it clear a lexicon hit let the component being policed switch off its own truth gate
        // (verifier #60, V60-D3: 37/37 fabricated completions shipped on a declared kind:"read").
        // The model's classification can still ADD intent below; it can never remove it.
        const lexiconReadVetoed = lexiconVerb !== null && readShaped;`, 'lexicon veto');

must(`            : (confirmationShaped && modelIntentKind !== 'read')`,
`            : confirmationShaped`, 'confirmation veto');

// The prompt must stop implying that requestIntent decides whether the receipt applies.
must(`REQUEST INTENT ("requestIntent") — ALWAYS classify the founder's request BEFORE you answer, in any`,
`REQUEST INTENT ("requestIntent") — ALWAYS classify the founder's request BEFORE you answer, in any
language. This classification can only ADD to what the server already derives from the request itself:
declaring a mutation request "read" does not exempt your answer from execution evidence, and never has.`, 'prompt note');

const out = s.replace(/\n/g, '\r\n');
if ((out.match(/(^|[^\r])\n/g) || []).length) throw new Error('bare LF');
writeFileSync(p, out); console.log('applied', n);
