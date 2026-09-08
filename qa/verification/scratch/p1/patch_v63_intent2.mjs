// V63-D3(a), remainder. The two survivors — "archive ACME and tell me when it is done" and "restore Zenith
// then show me the list" — were no longer read-shaped, but the OBJECT test still scanned the whole command,
// so the finite verb in the trailing REPORT clause ("...it is done", "show me...") disqualified the object
// of the imperative in the first clause.
//
// An imperative's object lives in the imperative's own clause. Both tiers now test each clause on its own
// terms instead of testing the sentence as one string.
import { readFileSync, writeFileSync } from 'node:fs';
const p = process.argv[2] || 'supabase/functions/sem-ai-command/index.ts';
let s = readFileSync(p, 'utf8').replace(/\r\n/g, '\n');
let n = 0;
function must(a, b, label) { const c = s.split(a).length - 1; if (c !== 1) throw new Error(label + ': found ' + c); s = s.replace(a, () => b); n++; }

must(`        const alwaysInImperativePosition = !!alwaysHeadRe
          && (headHasObject(commandForHead)
            || (commandClausesForRead.length > 1 && headHasObject(lastClauseForHead)));`,
`        // Each clause on its own terms: an imperative's object is in the imperative's clause, and a finite
        // verb in a trailing report clause says nothing about it (verifier #63, V63-D3(a)).
        const headClauses = commandClausesForRead.length > 1
          ? [commandForHead, firstClauseForRead, lastClauseForHead]
          : [commandForHead];
        const alwaysInImperativePosition = !!alwaysHeadRe && headClauses.some((c) => headHasObject(c));`, 'always clauses');

must(`        const imperativeSource = imperativeObjectOf(commandForHead)
          || (commandClausesForRead.length > 1 ? imperativeObjectOf(lastClauseForHead) : null);`,
`        const imperativeSource = headClauses.map((c) => imperativeObjectOf(c)).find((x) => x !== null) || null;`, 'imperative clauses');

const out = s.replace(/\n/g, '\r\n');
if ((out.match(/(^|[^\r])\n/g) || []).length) throw new Error('bare LF');
if (out.indexOf('const headClauses') > out.indexOf('const imperativeSource')) throw new Error('headClauses declared after use');
writeFileSync(p, out); console.log('applied', n);
