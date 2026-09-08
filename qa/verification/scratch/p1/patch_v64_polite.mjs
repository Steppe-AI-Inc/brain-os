// V64-D1, remainder — and it is the same twin defect a THIRD time, in a third list.
//
// "would you be able to archive ACME?", "any chance you could archive ACME?", "mind archiving ACME?" end in
// a question mark, so isQuestion vetoes them unless POLITE_REQUEST matches — and POLITE_REQUEST is yet
// another hand-maintained list of request frames, separate from the two just unified. Verifier #64 noted the
// inconsistency exactly: "would you mind archiving ACME?" works and "would you be able to" does not, for no
// reason a founder could predict.
//
// So the third twin goes the same way as the second: a command that BEGINS WITH A REQUEST FRAME is a
// request, whatever punctuation it ends with. POLITE_REQUEST stays for the shapes that are polite without
// being frames, but it is no longer the only thing standing between a politely-phrased instruction and
// silence. Read-shaped commands are unaffected: "can you tell me what companies I have?" strips its frame
// and is still caught by READ_SHAPE on "tell me".
//
// V64-D2 — contextBudget.trimmedCount was only written when the trim list overflowed its 12-entry cap, so it
// read 0 on every ordinary trimmed turn while contextBudget.trimmed listed real trims. A count that is
// present and wrong is worse than one that is absent.
import { readFileSync, writeFileSync } from 'node:fs';
const p = process.argv[2] || 'supabase/functions/sem-ai-command/index.ts';
let s = readFileSync(p, 'utf8').replace(/\r\n/g, '\n');
let n = 0;
function must(a, b, label) { const c = s.split(a).length - 1; if (c !== 1) throw new Error(label + ': found ' + c); s = s.replace(a, () => b); n++; }

must(`        const isQuestion = /\\?/.test(commandText) && !/\\b(?:ok|okay|right|alright|please|yes)\\s*\\?\\s*$/i.test(commandText) && !POLITE_REQUEST.test(commandText);`,
`        // A command that BEGINS WITH A REQUEST FRAME is a request whatever punctuation ends it. Without this
        // the question mark was decisive and POLITE_REQUEST — a third hand-maintained list of the same
        // concept — was the only escape, so "would you mind archiving ACME?" worked while "would you be able
        // to archive ACME?" did not (verifier #64, V64-D1). Read-shaped commands are unaffected: the frame is
        // stripped and READ_SHAPE still sees "tell me", "what", "list".
        const startsWithRequestFrame = REQUEST_FRAME_PREFIX.test(commandText);
        const isQuestion = /\\?/.test(commandText) && !/\\b(?:ok|okay|right|alright|please|yes)\\s*\\?\\s*$/i.test(commandText)
          && !POLITE_REQUEST.test(commandText) && !startsWithRequestFrame;`, 'question veto');

must(`  if (contextTrimmed.length > 12) {
    contextBudget.trimmedCount = contextTrimmed.length;
    contextTrimmed.splice(12, contextTrimmed.length - 12);
  }`,
`  // The count is ALWAYS the real number of trims. It used to be written only when the list overflowed its
  // cap, so it read 0 on every ordinary trimmed turn while contextBudget.trimmed listed real trims — a count
  // that is present and wrong (verifier #64, V64-D2).
  contextBudget.trimmedCount = contextTrimmed.length;
  if (contextTrimmed.length > 12) contextTrimmed.splice(12, contextTrimmed.length - 12);`, 'trimmed count');

const out = s.replace(/\n/g, '\r\n');
if ((out.match(/(^|[^\r])\n/g) || []).length) throw new Error('bare LF');
writeFileSync(p, out); console.log('applied', n);
