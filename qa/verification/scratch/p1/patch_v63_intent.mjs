// VERIFIER #63 FINDING V63-D3 (P1) — eighteen ordinary mutation requests derived NO intent when the model
// emitted no classification, and all eighteen fabricated completions reached the founder verbatim with
// receiptRendered: false. Six distinct mechanisms, two of them introduced by the last two rounds' own repairs.
//
// (a) "archive ACME then tell me" — the imperative IS recognised, then thrown away because the last clause
//     is a read. `lastClauseIsMutation` existed; there was no `firstClauseIsMutation`. This is the V59-D2
//     repair applied to exactly one of the two tiers that need it: it was carried into the company command
//     fallback and never into the request-intent tier the receipt rule depends on.
// (b) "quickly archive ACME", "permanently delete the draft" — REQUEST_FRAME_PREFIX is a closed list of
//     politeness frames with no adverb slot, so an adverb hides the imperative from the head test.
// (c) "invite dorj@example.com as engineer" — IMPERATIVE_OBJECT had no email shape, so the whole invite
//     family was invisible.
// (d) "create a work order", "delete the cost model" — STATEMENT_FINITE_VERB contains works?/ends?/costs?,
//     which matched the OBJECT NOUN. The discriminator is grammatical: a finite verb does not directly
//     follow a determiner. "the cost model" is a noun phrase; "Share price fell" still has its finite verb.
// (e) "ok go" — the confirmation follower set had no bare "go".
// (f) "ACME-г архивлана уу" — introduced by the V61-D6 repair: MN_READ_SHAPE reads EVERY sentence-final
//     уу/үү as a question. The verifier supplied the discriminator and it is as general as the rule it
//     joins: a finite non-past -на/-нэ/-но/-нө before уу/үү is a POLITE IMPERATIVE; a participle or an
//     infinitive before it is a question.
import { readFileSync, writeFileSync } from 'node:fs';
const p = process.argv[2] || 'supabase/functions/sem-ai-command/index.ts';
let s = readFileSync(p, 'utf8').replace(/\r\n/g, '\n');
let n = 0;
function must(a, b, label) { const c = s.split(a).length - 1; if (c !== 1) throw new Error(label + ': found ' + c); s = s.replace(a, () => b); n++; }

// ---- (b) an adverb may sit between the request frame and the verb.
must(`        const commandForRead = commandText.replace(REQUEST_FRAME_PREFIX, '');`,
`        // An ADVERB is not a politeness frame, but it sits in the same slot and hid the imperative behind it
        // ("quickly archive ACME", "permanently delete the draft") — verifier #63, V63-D3(b).
        const LEADING_ADVERB = /^\\s*(?:(?:quickly|immediately|urgently|permanently|properly|finally|actually|really|simply|kindly|carefully|manually|temporarily|briefly|asap|right away|straight away|at once|for good|once and for all)[\\s,]+)+/i;
        const stripFrames = (t: string) => {
          let out = t;
          for (let i = 0; i < 4; i++) {
            const next = out.replace(REQUEST_FRAME_PREFIX, '').replace(LEADING_ADVERB, '');
            if (next === out) break;
            out = next;
          }
          return out;
        };
        const commandForRead = stripFrames(commandText);`, 'adverb slot');

// ---- (a) a first clause that is an imperative mutation is a request, whatever follows it.
must(`        const lastClauseIsRead = commandClausesForRead.length > 1
          && (READ_SHAPE.test(lastClauseForRead) || COMPOSITION_REQUEST.test(lastClauseForRead));`,
`        const lastClauseIsRead = commandClausesForRead.length > 1
          && (READ_SHAPE.test(lastClauseForRead) || COMPOSITION_REQUEST.test(lastClauseForRead));
        // "archive ACME then tell me" is a request with a report attached, not a read. The mirror rule for
        // the FIRST clause existed in the company command fallback and had never been carried here — the one
        // tier the never-silent receipt actually depends on (verifier #63, V63-D3(a)).
        const firstClauseForRead = stripFrames(commandClausesForRead[0] || commandText);
        const firstClauseIsMutation = commandClausesForRead.length > 1
          && !/\\?/.test(firstClauseForRead)
          && /^\\s*(?:archiv|un-?archiv|restor|reactivat|delet|remov|renam|retitl|reassign|unassign|approv|reject|declin|activat|deactivat|invit|revok|enabl|disabl|promot|demot|hir|fir|terminat|dismiss|onboard|merg|split|reopen|bring|creat|add|assign|set|updat|chang|edit|clos|complet|finish|cancel|mark|mov|transfer|end|send|schedul|publish|shar|upload|grant|notify|email|pay|import|export)/i.test(firstClauseForRead);`, 'first clause');

must(`          || lastClauseIsRead
          || (READ_SHAPE.test(commandForRead) && !lastClauseIsMutation);`,
`          || (lastClauseIsRead && !firstClauseIsMutation)
          || (READ_SHAPE.test(commandForRead) && !lastClauseIsMutation && !firstClauseIsMutation);`, 'read shaped');

// ---- (c) an email address is a referring object.
must(`|^\\S+\\s*$/;`, `|^\\S+@\\S+\\.\\S+|^\\S+\\s*$/;`, 'email object');

// ---- (d) a finite verb never directly follows a determiner: "a work order" is a noun phrase.
must(`        const STATEMENT_FINITE_VERB = /(?:^|\\s)(?:is|are|was|were|am|be|been|being|has|have|had|will|would|shall|should|can|could|may|might|must|does|did|isn['’]t|aren['’]t|wasn['’]t|weren['’]t|needs?|seems?|looks?|means?|includes?|requires?|remains?|appears?|shows?|starts?|ends?|applies|works?|happens?|belongs?|costs?|arrived|called|fell|flooded|blocked|created|agreed|started|ended|changed|moved|failed|passed|expired|dropped|rose|grew|went|came|said|told|broke|stopped|continued|returned|increased|decreased|remained|occurred|appeared)(?=\\s|$|[.,;!?])/i;`,
`        // A finite verb never DIRECTLY FOLLOWS A DETERMINER: "create a work order" and "delete the cost
        // model" are noun phrases whose head noun happens to be spelled like a verb, while "Share price
        // fell" still has its finite verb (verifier #63, V63-D3(d)).
        const STATEMENT_FINITE_VERB = /(?:^|\\s)(?<!\\b(?:a|an|the|my|our|your|its|their|his|her|this|that|these|those|new|another|each|every)\\s)(?:is|are|was|were|am|be|been|being|has|have|had|will|would|shall|should|can|could|may|might|must|does|did|isn['’]t|aren['’]t|wasn['’]t|weren['’]t|needs?|seems?|looks?|means?|includes?|requires?|remains?|appears?|shows?|starts?|ends?|applies|works?|happens?|belongs?|costs?|arrived|called|fell|flooded|blocked|created|agreed|started|ended|changed|moved|failed|passed|expired|dropped|rose|grew|went|came|said|told|broke|stopped|continued|returned|increased|decreased|remained|occurred|appeared)(?=\\s|$|[.,;!?])/i;`, 'determiner guard');

// ---- (e) a bare "go" is a confirmation.
must(`(?:(?:go ahead|do it|proceed|please|now|thanks|then)[\\s,.!—–-]*)*$`,
     `(?:(?:go ahead|go|do it|proceed|please|now|thanks|then)[\\s,.!—–-]*)*$`, 'go follower');

// ---- (f) a Mongolian polite imperative is not a question.
must(`|(?:^|\\P{L})(?:уу|үү|вэ|бэ|вээ|бээ)\\s*[?!.]?\\s*$`,
`|(?<!(?:на|нэ|но|нө|на |нэ |но |нө ))(?:^|\\P{L})(?:уу|үү|вэ|бэ|вээ|бээ)\\s*[?!.]?\\s*$`, 'polite imperative placeholder');

const out = s.replace(/\n/g, '\r\n');
if ((out.match(/(^|[^\r])\n/g) || []).length) throw new Error('bare LF');
writeFileSync(p, out); console.log('applied', n);
