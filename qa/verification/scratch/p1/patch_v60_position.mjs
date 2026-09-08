// Reconciling verifier #57 with verifier #60 under the founder's ruling.
//
// #57 measured that a model-declared kind:"read"/"other" rescued 15 genuinely non-mutation commands from
// the lexicon: composition requests ("draft an email to Bob about the merge"), declaratives ("the fire
// drill is at 3pm", "the store will reopen Monday"), and noun phrases ("history of the ACME archive").
// #60 measured that the same veto let the model switch off its own truth gate on 37/37 real mutation
// requests. The founder's rule decides it: the model may ADD intent, never remove it. So the veto goes,
// and #57's legitimate cases are covered by REQUEST-SIDE evidence instead, which is what should have been
// carrying them all along.
//
// P1. The "mutation verb ANYWHERE" tier was the loose one: it fired on any English base verb wherever it
//     appeared, including inside a noun phrase or a statement about the world. It is now gated to
//     IMPERATIVE POSITION — the head of the command with request frames stripped, or the head of its last
//     clause. The Mongolian stems keep "anywhere" on purpose: Mongolian puts the verb at the END, so a
//     head-position rule would silently disable the whole language (v56 corpus).
//     The other constructions in that pattern ("get ACME archived", "bring it back") are already
//     position-bearing and keep firing wherever they appear.
// P2. Composition requests are read-shaped: asking for TEXT about a merge is not asking to merge.
// P3. A phrasal particle can turn a mutation verb into a read: "set out the plan", "add up the hours".
// P4. A compound command whose LAST clause is read-shaped is a read ("assign a number to each company and
//     list them") — the mirror of the existing lastClauseIsMutation rule.
import { readFileSync, writeFileSync } from 'node:fs';
const p = process.argv[2] || 'supabase/functions/sem-ai-command/index.ts';
let s = readFileSync(p, 'utf8').replace(/\r\n/g, '\n');
let n = 0;
function must(a, b, label) { const c = s.split(a).length - 1; if (c !== 1) throw new Error(label + ': found ' + c); s = s.replace(a, () => b); n++; }

// ---- P2 + P3: request-side read shapes that the model veto used to cover.
must(`        const commandForRead = commandText.replace(REQUEST_FRAME_PREFIX, '');`,
`        const commandForRead = commandText.replace(REQUEST_FRAME_PREFIX, '');
        // A request for TEXT about a thing is not a request to do the thing: "draft an email about the
        // merge" never merges anything (verifier #57 C4, carried on request-side evidence now that the
        // model's own classification can no longer veto the lexicon — verifier #60 V60-D3).
        const COMPOSITION_REQUEST = /^\\s*(?:draft|write|compose|brainstorm|translat(?:e|ing)|reword|rephrase|paraphrase|proofread|outline|sketch|suggest|recommend|propose|help me (?:word|write|draft|phrase|think)|word)\\b/i;
        // A particle can turn a mutation verb into a read: "set out the plan", "add up the hours".
        const PHRASAL_READ = /^\\s*(?:set out|sets out|add up|sum up|lay out|map out|figure out|point out|make up|round up|break down|walk through|go over|run through|think through|write up)\\b/i;`, 'composition + phrasal');

// ---- P4: a compound whose last clause is a read is a read.
must(`        const readShaped = isQuestion || (READ_SHAPE.test(commandForRead) && !lastClauseIsMutation);`,
`        const lastClauseIsRead = commandClausesForRead.length > 1
          && (READ_SHAPE.test(lastClauseForRead) || COMPOSITION_REQUEST.test(lastClauseForRead));
        const readShaped = isQuestion
          || COMPOSITION_REQUEST.test(commandForRead)
          || PHRASAL_READ.test(commandForRead)
          || lastClauseIsRead
          || (READ_SHAPE.test(commandForRead) && !lastClauseIsMutation);`, 'read shaped');

// ---- P1: the English "verb anywhere" tier is gated to imperative position.
must(`        const lexiconAlways = (commandText.match(MUTATION_VERB_ALWAYS) || []).slice(1).find((g) => typeof g === 'string' && g.length > 0) || null;`,
`        // Group 1 of MUTATION_VERB_ALWAYS is a bare English verb matched ANYWHERE, which fires inside a
        // noun phrase ("history of the ACME archive") and inside a statement about the world ("the store
        // will reopen Monday"). Those were previously rescued by the model's own classification, which the
        // model could equally use to switch the gate off (verifier #60 V60-D3). Position is request-side
        // evidence and cannot be switched off by the component being policed, so group 1 must sit in
        // IMPERATIVE POSITION. Groups 2-3 ("bring it back", "get ACME archived") already carry their own
        // position, and group 4 is Mongolian, which is verb-final — a head rule would disable it entirely.
        const alwaysMatch = commandText.match(MUTATION_VERB_ALWAYS);
        const alwaysEnglishBase = alwaysMatch && typeof alwaysMatch[1] === 'string' && alwaysMatch[1].length > 0 ? alwaysMatch[1] : null;
        const alwaysOther = alwaysMatch ? (alwaysMatch.slice(2).find((g) => typeof g === 'string' && g.length > 0) || null) : null;
        const alwaysHeadRe = alwaysEnglishBase
          ? new RegExp('^\\\\s*' + alwaysEnglishBase.replace(/[.*+?^\${}()|[\\]\\\\]/g, '\\\\$&') + '\\\\b', 'i')
          : null;
        const alwaysInImperativePosition = !!alwaysHeadRe
          && (alwaysHeadRe.test(commandForRead)
            || (commandClausesForRead.length > 1 && alwaysHeadRe.test(lastClauseForRead.replace(REQUEST_FRAME_PREFIX, ''))));
        const lexiconAlways = (alwaysInImperativePosition ? alwaysEnglishBase : null) || alwaysOther || null;`, 'always position gate');

const out = s.replace(/\n/g, '\r\n');
if ((out.match(/(^|[^\r])\n/g) || []).length) throw new Error('bare LF');
writeFileSync(p, out); console.log('applied', n);
