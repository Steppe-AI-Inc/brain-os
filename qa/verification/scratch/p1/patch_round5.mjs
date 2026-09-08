// Round 5: the receipt keeps the deterministic report prefix (deletion counts, gap notices)
// that grounded the turn — the receipt adds the truth line, it never drops a real fact line.
import { readFileSync, writeFileSync } from 'node:fs';
const p = 'supabase/functions/sem-ai-command/index.ts';
let s = readFileSync(p, 'utf8').replace(/\r\n/g, '\n');
function must(a, b, label) { const n = s.split(a).length - 1; if (n !== 1) throw new Error(label + ': found ' + n); s = s.replace(a, () => b); }
must("          result.summary = [...factLines, `No change was made — ${reason}.`, pendingQuestion].filter(Boolean).join(' ');",
"          const receiptPrefix = typeof deterministicPrefix === 'string' && deterministicPrefix.trim().length > 0 ? deterministicPrefix.trim() : factLines.join(' ');\n          result.summary = [receiptPrefix, `No change was made — ${reason}.`, pendingQuestion].filter(Boolean).join(' ');", 'prefix');
const out = s.replace(/\n/g, '\r\n');
if ((out.match(/(^|[^\r])\n/g) || []).length) throw new Error('bare LF');
writeFileSync(p, out); console.log('ok round5');
