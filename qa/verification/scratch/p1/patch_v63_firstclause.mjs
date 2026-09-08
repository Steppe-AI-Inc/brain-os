// Regression caught by the v56 corpus: "assign a number to each company and list them" started deriving
// intent. The new firstClauseIsMutation rule (V63-D3(a)) checked only that the first clause STARTS with a
// mutation verb, not that it has a referring object — so it re-admitted exactly the shape the object test
// exists to reject, one tier over. Both tiers must clear the same bar; that was the whole lesson of V63-D3.
//
// IMPERATIVE_OBJECT / STATEMENT_FINITE_VERB / objectRefers move up to sit beside the other request-shape
// rules, above every tier that uses them. A const read before its declaration is a TDZ crash, so declaration
// order here is load-bearing and the patch asserts it.
import { readFileSync, writeFileSync } from 'node:fs';
const p = process.argv[2] || 'supabase/functions/sem-ai-command/index.ts';
let s = readFileSync(p, 'utf8').replace(/\r\n/g, '\n');
let n = 0;
function must(a, b, label) { const c = s.split(a).length - 1; if (c !== 1) throw new Error(label + ': found ' + c); s = s.replace(a, () => b); n++; }

const OBJECT_BLOCK_RE = /        \/\/ An imperative needs an OBJECT THAT REFERS TO SOMETHING[\s\S]*?const objectRefers = \(rest: string\) => IMPERATIVE_OBJECT\.test\(rest\) && !STATEMENT_FINITE_VERB\.test\(rest\);\n/;
const m = OBJECT_BLOCK_RE.exec(s);
if (!m) throw new Error('object-test block not found');
const objectBlock = m[0];
s = s.replace(OBJECT_BLOCK_RE, '');
n++;

// Re-declare it above every tier, right after the other request-shape rules.
must(`        const lastClauseIsRead = commandClausesForRead.length > 1`,
     objectBlock + `        const lastClauseIsRead = commandClausesForRead.length > 1`, 'object block moved');

// The first-clause rule now clears the same bar as the imperative tier.
must(`        const firstClauseIsMutation = commandClausesForRead.length > 1
          && !/\\?/.test(firstClauseForRead)
          && /^\\s*(?:archiv|un-?archiv|restor|reactivat|delet|remov|renam|retitl|reassign|unassign|approv|reject|declin|activat|deactivat|invit|revok|enabl|disabl|promot|demot|hir|fir|terminat|dismiss|onboard|merg|split|reopen|bring|creat|add|assign|set|updat|chang|edit|clos|complet|finish|cancel|mark|mov|transfer|end|send|schedul|publish|shar|upload|grant|notify|email|pay|import|export)/i.test(firstClauseForRead);`,
`        const FIRST_CLAUSE_VERB = /^\\s*(?:archiv|un-?archiv|restor|reactivat|delet|remov|renam|retitl|reassign|unassign|approv|reject|declin|activat|deactivat|invit|revok|enabl|disabl|promot|demot|hir|fir|terminat|dismiss|onboard|merg|split|reopen|bring|creat|add|assign|set|updat|chang|edit|clos|complet|finish|cancel|mark|mov|transfer|end|send|schedul|publish|shar|upload|grant|notify|email|pay|import|export)\\w*/i;
        // Starting with a mutation verb is not enough — "assign a number to each company and list them"
        // does that and is a read. The first clause must clear the SAME object bar as every other tier;
        // admitting it on the verb alone re-opened, one tier over, exactly what the object test rejects.
        const firstClauseIsMutation = (() => {
          if (commandClausesForRead.length <= 1 || /\\?/.test(firstClauseForRead)) return false;
          const fm = FIRST_CLAUSE_VERB.exec(firstClauseForRead);
          if (!fm) return false;
          return objectRefers(firstClauseForRead.slice(fm[0].length).trim());
        })();`, 'first clause object');

const out = s.replace(/\n/g, '\r\n');
if ((out.match(/(^|[^\r])\n/g) || []).length) throw new Error('bare LF');
if (out.indexOf('const objectRefers') > out.indexOf('const firstClauseIsMutation')) throw new Error('objectRefers declared after its first use');
if ((out.match(/const IMPERATIVE_OBJECT/g) || []).length !== 1) throw new Error('IMPERATIVE_OBJECT declared more than once');
writeFileSync(p, out); console.log('applied', n);
