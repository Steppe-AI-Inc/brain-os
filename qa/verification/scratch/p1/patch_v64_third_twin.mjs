// The third twin, removed rather than left in place untested.
//
// POLITE_REQUEST was a third hand-maintained list of request frames, used in exactly one place: to stop a
// question mark from vetoing a politely-phrased instruction. Now that a command beginning with a request
// frame is a request whatever ends it, POLITE_REQUEST is dead — measured, not assumed: neutralising it
// changes NO case in the corpora, and the vacuity sweep reports it as an untested guard.
//
// A rule nothing tests is exactly the class these rounds keep finding, so it goes. Its one unique entry,
// "shall i", moves into the shared frame definition where it belongs — it was the reason "shall i archive
// ACME?" derived nothing even WITH POLITE_REQUEST in place, because the frame list and the polite list had
// each what the other needed. That is the twin defect in miniature.
//
// The loan-verb list also gains import/export, so the Mongolian tier and the English imperative tier treat
// the same verbs as requests: an unsupported verb should reach a truthful "no change was made" receipt in
// either language, not silence in one of them.
import { readFileSync, writeFileSync } from 'node:fs';
const p = process.argv[2] || 'supabase/functions/sem-ai-command/index.ts';
let s = readFileSync(p, 'utf8').replace(/\r\n/g, '\n');
let n = 0;
function must(a, b, label) { const c = s.split(a).length - 1; if (c !== 1) throw new Error(label + ': found ' + c); s = s.replace(a, () => b); n++; }

// ---- "shall i" and "shall we" join the ONE frame definition.
must(`  + "|may i ask you to|mind|will you|can we|could we|shall we"`,
     `  + "|may i ask you to|mind|will you|can we|could we|shall we|shall i"`, 'shall i');

// ---- POLITE_REQUEST is removed; the frame check subsumes it.
must(`        const POLITE_REQUEST = /^\\s*(?:would you mind|would you (?:please )?(?!tell|explain|summari|describe|list|show|remind)|could you (?:please )?(?!tell|explain|summari|describe|list|show|remind)|can you (?:please )?(?!tell|explain|summari|describe|list|show|remind)|will you|can we|could we|shall we|shall i|may i ask you to|please)\\b/i;\n`, ``, 'remove polite list');

must(`        // A command that BEGINS WITH A REQUEST FRAME is a request whatever punctuation ends it. Without this
        // the question mark was decisive and POLITE_REQUEST — a third hand-maintained list of the same
        // concept — was the only escape, so "would you mind archiving ACME?" worked while "would you be able
        // to archive ACME?" did not (verifier #64, V64-D1). Read-shaped commands are unaffected: the frame is
        // stripped and READ_SHAPE still sees "tell me", "what", "list".
        const startsWithRequestFrame = REQUEST_FRAME_PREFIX.test(commandText);
        const isQuestion = /\\?/.test(commandText) && !/\\b(?:ok|okay|right|alright|please|yes)\\s*\\?\\s*$/i.test(commandText)
          && !POLITE_REQUEST.test(commandText) && !startsWithRequestFrame;`,
`        // A command that BEGINS WITH A REQUEST FRAME is a request whatever punctuation ends it. This
        // replaced POLITE_REQUEST, which was a THIRD hand-maintained list of request frames and is now
        // deleted: measured against the corpora, neutralising it changed no case, and the vacuity sweep
        // reported it as a guard nothing tests. Its one unique entry ("shall i") moved into the shared
        // definition — the frame list and the polite list each held what the other needed, which is the twin
        // defect in miniature (verifier #64, V64-D1). Read-shaped commands are unaffected: the frame is
        // stripped and READ_SHAPE still sees "tell me", "what", "list".
        const startsWithRequestFrame = REQUEST_FRAME_PREFIX.test(commandText);
        const isQuestion = /\\?/.test(commandText) && !/\\b(?:ok|okay|right|alright|please|yes)\\s*\\?\\s*$/i.test(commandText)
          && !startsWithRequestFrame;`, 'question veto without polite');

// ---- the loan-verb list matches the English imperative list on import/export.
must(`|merge|update|close|complete|cancel|assign|move|transfer|end|create|add|set)\\s+хий\\S*/iu;`,
     `|merge|update|close|complete|cancel|assign|move|transfer|end|create|add|set|import|export|publish|share|upload|send|schedule)\\s+хий\\S*/iu;`, 'loan verbs');

const out = s.replace(/\n/g, '\r\n');
if ((out.match(/(^|[^\r])\n/g) || []).length) throw new Error('bare LF');
// The name survives only in the comment explaining why it is gone; no CODE may reference it.
const codeLines = out.split(/\r?\n/).filter((l) => !/^\s*\/\//.test(l));
if (codeLines.some((l) => l.includes('POLITE_REQUEST'))) throw new Error('a POLITE_REQUEST code reference survived');
writeFileSync(p, out); console.log('applied', n);
