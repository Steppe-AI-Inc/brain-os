// Applies verifier #55's prepared V55-D1 fix to index.ts at the byte level (CRLF preserved).
// The strip `/['’]s$/` misses the bare-apostrophe possessive of an s-ending name
// ("Nothing Bundt Cakes' account"); the replacement also strips a bare apostrophe that follows an s.
import { readFileSync, writeFileSync } from 'node:fs';
const path = process.argv[2] || 'supabase/functions/sem-ai-command/index.ts';
const buf = readFileSync(path);
const src = buf.toString('utf8');
const FROM = ".replace(/['’]s$/, '')";
const TO = ".replace(/['’]s$|(?<=s)['’]$/, '')";
const before = src.split(FROM).length - 1;
if (before === 0) { console.error('no occurrence of the possessive strip found'); process.exit(2); }
const out = src.split(FROM).join(TO);
const bareLf = (out.match(/(^|[^\r])\n/g) || []).length;
if (bareLf !== 0) { console.error('bare LF would be introduced:', bareLf); process.exit(3); }
writeFileSync(path, out);
console.log(`replaced ${before} occurrence(s); after: ${out.split(TO).length - 1}; remaining old form: ${out.split(FROM).length - 1}`);
