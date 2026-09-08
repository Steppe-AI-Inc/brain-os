// V67-D3, second half — the receipt names the entity the founder named, for EVERY entity.
//
// Making `commandEntityNoun` read the one definition was necessary and not sufficient: `commandEntity`
// is a SEVENTH spelling of the same concept. It maps five nouns to a canonical name and returns null for
// everything else, and the reason line's fallback is the literal `'company'` — so "archive approval A-1"
// still answered *"I could not resolve which company you meant (searched the active and archived
// companies)"*. A false statement about what was searched, for 12 of 18 entity types.
//
// The repair is the same shape as the rest of this round: stop enumerating, normalise. Any noun the one
// definition recognises is carried through to the receipt; 'company' stops being a catch-all and becomes
// what it always should have been — the answer when the founder actually said "company", or when nothing
// identifiable was named at all.
import { readFileSync, writeFileSync } from 'node:fs';

const p = process.argv[2] || 'supabase/functions/sem-ai-command/index.ts';
let s = readFileSync(p, 'utf8').replace(/\r\n/g, '\n');
const edits = [];
function sub(what, from, to) {
  if (s.split(from).length - 1 !== 1) throw new Error(what + ': anchor missing or not unique');
  // Replacement FUNCTION, never a string: a `$'` in the replacement text means "everything after the
  // match" and silently duplicates the rest of the file (learned the hard way this round).
  s = s.replace(from, () => to);
  edits.push(what);
}

{
  const opening = '          const commandEntity = ';
  const at = s.indexOf(opening);
  if (at < 0) throw new Error('commandEntity: declaration not found');
  const line = s.slice(at, s.indexOf('\n', at));
  if (s.split(line).length - 1 !== 1) throw new Error('commandEntity: declaration not unique');
  if (!line.includes("/^department/")) throw new Error('commandEntity: not the five-noun map this fix expects');
  sub('commandEntity carries through any noun the one definition recognises', line,
    `          // A five-noun map returning null, with the reason line defaulting to the literal 'company',
          // is why "archive approval A-1" said "I could not resolve which COMPANY you meant (searched the
          // active and archived COMPANIES)" — false about what was searched, for 12 of 18 entity types
          // (verifier #67, V67-D3). Normalise instead of enumerating: singularise what the one definition
          // matched and carry it through. The five explicit arms stay because they map SYNONYMS onto a
          // canonical name (people/employee/staff -> person), which singularising alone cannot do.
          const commandEntity = /^task/.test(commandEntityNoun) ? 'task'
            : /^goal/.test(commandEntityNoun) ? 'goal'
            : /^(person|people|employee|staff|manager|owner|user)/.test(commandEntityNoun) ? 'person'
            : /^project/.test(commandEntityNoun) ? 'project'
            : /^department/.test(commandEntityNoun) ? 'department'
            : /^(compan|business|organi)/.test(commandEntityNoun) ? 'company'
            : commandEntityNoun ? commandEntityNoun.replace(/ies$/, 'y').replace(/([^s])s$/, '$1')
            : null;`);
}

const out = s.replace(/\n/g, '\r\n');
if ((out.match(/(^|[^\r])\n/g) || []).length) throw new Error('bare LF introduced');
writeFileSync(p, out);
console.log('applied ' + edits.length + ' edits:');
for (const e of edits) console.log('  - ' + e);
