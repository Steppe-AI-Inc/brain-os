// V47-D2 PREPARED FIX (NOT applied — index.ts stays byte-identical in this worktree).
// Writes qa/verification/scratch/v47/index.namefix.ts.
//
// DEFECT. `nameInternal` establishes a NAME reading only when an auxiliary directly governs the
// capitalised run ("Nothing Bundt Cakes HAS BEEN archived"). One intervening lowercase head noun
// ("No Limits Inc unit was archived.", "Erdenet's No Limits Inc depot was archived.") drops it back
// to a determiner reading, so the negator disarms the belt and the fabrication ships. Deployed v92
// corrects every one of them. Measured: 256 of 384 generated rows.
//
// FIX. Consult the POSITIVE entity signal that is already in scope. A capitalised run that EQUALS a
// known entity name is a NAME, whatever follows it. Absence still proves nothing and is never used,
// so the fix is truncation-safe; the truthful determiner reading ("No ACME Holdings task was
// completed.") is untouched unless an entity is literally called "No ACME Holdings".
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..', '..', '..');
const IDX = path.join(ROOT, 'supabase/functions/sem-ai-command/index.ts');
const src = fs.readFileSync(IDX, 'utf8');

const A = 'const nameInternal = capLead && subjectRun && !/\\bnor\\b/.test(c);';
if (src.split(A).length !== 2) throw new Error('v47: nameInternal anchor not found or not unique');
const B = "const nameInternal = (capLead && subjectRun || ((__r) => __r !== null && knownEntityNames.has((mm[0] + __r[0]).replace(/\\s+$/, '').replace(/['’]s$/, '').toLowerCase()))(/^(?:\\s+[A-Z][\\w&.'’-]*)+/.exec(after))) && !/\\bnor\\b/.test(c);";
const out = src.replace(A, B);
if (out === src) throw new Error('v47: patch was a no-op');
fs.writeFileSync(path.join(HERE, 'index.namefix.ts'), out);
console.log('wrote index.namefix.ts; source unchanged:', fs.readFileSync(IDX, 'utf8') === src);
