// Repair the clause-split regex LITERAL: it carries double-escaped classes, which in a literal mean a
// literal backslash followed by the letter, so the split never split and a mixed turn was swallowed whole.
import { readFileSync, writeFileSync } from 'node:fs';
const p = 'supabase/functions/sem-ai-command/index.ts';
let s = readFileSync(p, 'utf8');
const BS = String.fromCharCode(92);
const bad = 'text.split(/[,;]' + BS + BS + 's+|' + BS + BS + 's[' + BS + 'u2014' + BS + 'u2013-]' + BS + BS + 's+|' + BS + BS + 's+(?:and then|then|and)' + BS + BS + 's+/i)';
const good = 'text.split(/[,;]' + BS + 's+|' + BS + 's[' + BS + 'u2014' + BS + 'u2013-]' + BS + 's+|' + BS + 's+(?:and then|then|and)' + BS + 's+/i)';
const n = s.split(bad).length - 1;
if (n !== 1) throw new Error('expected exactly one broken split literal, found ' + n);
s = s.replace(bad, () => good);
writeFileSync(p, s);
console.log('repaired the clause-split literal');
