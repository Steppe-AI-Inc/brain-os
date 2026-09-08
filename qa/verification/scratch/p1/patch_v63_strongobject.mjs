// "assign a number to each company and list them" is a READ, and it survived for years because its last
// clause is read-shaped. The first-clause rule (V63-D3(a)) overrode that, and requiring a referring object
// was not enough: "a number" is a determiner phrase, which the ordinary object test accepts.
//
// The override needs a STRONGER object than the tier it overrides, because it is overriding a signal that
// the founder actually gave — "and list them" says report, not act. So the first clause may only win when
// its object NAMES something: a proper noun, an identifier, a quoted string, an email address, a pronoun, or
// an explicit entity noun. "archive ACME then tell me" names ACME; "assign a number to each company" names
// nothing.
import { readFileSync, writeFileSync } from 'node:fs';
const p = process.argv[2] || 'supabase/functions/sem-ai-command/index.ts';
let s = readFileSync(p, 'utf8').replace(/\r\n/g, '\n');
function must(a, b, label) { const c = s.split(a).length - 1; if (c !== 1) throw new Error(label + ': found ' + c); s = s.replace(a, () => b); }

must(`          const fm = FIRST_CLAUSE_VERB.exec(firstClauseForRead);
          if (!fm) return false;
          return objectRefers(firstClauseForRead.slice(fm[0].length).trim());`,
`          const fm = FIRST_CLAUSE_VERB.exec(firstClauseForRead);
          if (!fm) return false;
          const rest = firstClauseForRead.slice(fm[0].length).trim();
          // A STRONGER bar than the ordinary object test, because this overrides a signal the founder gave:
          // "and list them" asks for a report. The first clause wins only if it NAMES its target.
          const STRONG_OBJECT = /^(?:the|a|an|this|that|my|our|your|its|their|his|her)?\\s*(?:[A-Z][A-Za-z0-9_-]*|\\S+[-_]?\\d|"[^"]+"|'[^']+'|[“][^”]+[”]|\\S+@\\S+\\.\\S+|it|them|compan(?:y|ies)|person|people|employee|manager|task|goal|project|department|lead|document|proposal|product|spec|drawing|approval|channel|team|invoice|report|order|contract|assignment|employment)\\b/;
          return objectRefers(rest) && STRONG_OBJECT.test(rest);`, 'strong object');

const out = s.replace(/\n/g, '\r\n');
if ((out.match(/(^|[^\r])\n/g) || []).length) throw new Error('bare LF');
writeFileSync(p, out); console.log('strong-object bar applied to the first-clause override');
