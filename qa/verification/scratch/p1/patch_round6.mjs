// Round 6: the confirmation-intent regex lost its backslashes in an earlier heredoc-built patch.
// Rewritten from String.raw; every other intent/resolver regex is asserted to carry its escapes.
import { readFileSync, writeFileSync } from 'node:fs';
const p = 'supabase/functions/sem-ai-command/index.ts';
let s = readFileSync(p, 'utf8').replace(/\r\n/g, '\n');
const line = s.match(/^        const CONFIRMATION_COMMAND = \/[^\n]*\/i;$/m);
if (!line) throw new Error('CONFIRMATION_COMMAND line not found');
const good = String.raw`        const CONFIRMATION_COMMAND = /^\s*(?:yes|y|yes please|ok|okay|confirm|confirmed|go ahead|do it|proceed|sure|please do|option\s*\d+|the (?:first|second|third|last) one|\d+)\s*[.!]?\s*$/i;`;
s = s.replace(line[0], good);
const checks = [
  [/const MUTATION_INTENT_ALWAYS = \/\^\\s\*/, 'MUTATION_INTENT_ALWAYS keeps \\s'],
  [/const MUTATION_INTENT_WITH_ENTITY = \/\^\\s\*/, 'MUTATION_INTENT_WITH_ENTITY keeps \\s'],
  [/const MUTATION_ENTITY_NOUN = \/\\b\(/, 'MUTATION_ENTITY_NOUN keeps \\b'],
  [/const commandMentionsCompany = \/\\b\(/, 'commandMentionsCompany keeps \\b'],
  [/\.replace\(\/\^\\s\*\(\?:the\|this\|that\|our\|my\)\\s\+\/i, ''\)/, 'lifecycleCommandName article strip keeps \\s'],
  [/const COMPANY_UUID_RE = \/\^\[0-9a-f\]\{8\}-/, 'COMPANY_UUID_RE intact'],
  [/const CONFIRMATION_COMMAND = \/\^\\s\*\(\?:yes/, 'CONFIRMATION_COMMAND repaired'],
];
for (const [re, label] of checks) { if (!re.test(s)) throw new Error('escape check failed: ' + label); console.log('ok', label); }
const out = s.replace(/\n/g, '\r\n');
if ((out.match(/(^|[^\r])\n/g) || []).length) throw new Error('bare LF');
writeFileSync(p, out); console.log('ok round6');
