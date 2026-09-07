// #57 residuals worth closing in the same round (cheap, contract-relevant):
//   V57-D4  a second candidate query on the full normalised name before "no company by that name"
//           (the anchor-word ilike is capped at 50 rows; a generic longest word can crowd out the exact row);
//   V57-D6a the lifecycle commandIsQuestion carries the POLITE_REQUEST exemption (a polite question with the
//           model emitting nothing is a request, not a read);
//   V57-D6b a negated / hypothetical lead with a lexicon verb gets an honest receipt reason.
import { readFileSync, writeFileSync } from 'node:fs';
const p = process.argv[2] || 'supabase/functions/sem-ai-command/index.ts';
let s = readFileSync(p, 'utf8').replace(/\r\n/g, '\n');
let n = 0;
function must(a, b, label) { const c = s.split(a).length - 1; if (c !== 1) throw new Error(label + ': found ' + c); s = s.replace(a, () => b); n++; }

// D4: exact stage searches the full name too (space-insensitive pattern), merged with the anchor-word rows.
must(`            const anchorWord = target.split(' ').sort((a, b) => b.length - a.length)[0];
            const { data: candidates } = await supabase.from('companies').select('id,name,status').ilike('name', \`%\${anchorWord}%\`).limit(50);
            const rows = (candidates || []) as CompanyLookupRow[];`,
`            const anchorWord = target.split(' ').sort((a, b) => b.length - a.length)[0];
            const { data: candidates } = await supabase.from('companies').select('id,name,status').ilike('name', \`%\${anchorWord}%\`).limit(50);
            // V57-D4: the anchor-word window is capped; a second query on the whole name (any punctuation
            // between the words) guarantees the exact row is a candidate whatever shares its longest word.
            const wholePattern = '%' + target.split(' ').map((w) => w.replace(/[%_]/g, '')).join('%') + '%';
            const { data: wholeRows } = await supabase.from('companies').select('id,name,status').ilike('name', wholePattern).limit(50);
            const seenIds = new Set<string>();
            const rows: CompanyLookupRow[] = [];
            for (const r of [...((candidates || []) as CompanyLookupRow[]), ...((wholeRows || []) as CompanyLookupRow[])]) { if (!seenIds.has(r.id)) { seenIds.add(r.id); rows.push(r); } }`, 'D4');

// D6a: polite question exemption on the lifecycle gate.
must(`        const commandIsQuestion = /\\?/.test(commandLower) && !/\\b(?:ok|okay|right|alright|please|yes)\\s*\\?\\s*$/.test(commandLower);`,
`        const commandIsQuestion = /\\?/.test(commandLower) && !/\\b(?:ok|okay|right|alright|please|yes)\\s*\\?\\s*$/.test(commandLower)
          && !/^\\s*(?:would you mind|would you (?:please )?(?!tell|explain|summari|describe|list|show|remind)|could you (?:please )?(?!tell|explain|summari|describe|list|show|remind)|can you (?:please )?(?!tell|explain|summari|describe|list|show|remind)|will you|can we|could we|shall we|please)\\b/.test(commandLower);`, 'D6a');

// D6b: honest receipt reason for a negated / hypothetical request.
must(`          const reason = pendingQuestion ? 'I need your answer first'`,
`          const negatedRequest = /^\\s*(?:do not|don['’]t|never|please do not|please don['’]t|stop|without|instead of|rather than|not|no)\\b/i.test(commandText) || /\\b(?:do not|don['’]t|never|not to|no longer|instead of|rather than|should not|shouldn['’]t|must not|mustn['’]t|won['’]t|will not|cannot|can['’]t)\\s+(?:\\w+\\s+){0,3}(?:archive|restore|delete|remove|rename|assign|approve|reject|unarchive|reactivate|end|close|cancel)/i.test(commandText);
          const hypotheticalRequest = /^\\s*(?:if|suppose|supposing|what if|imagine|say|assuming|in case)\\b/i.test(commandText) || /\\b(?:thinking about|wondering (?:if|whether)|considering|might|may want to|could we|should we|shall we)\\b/i.test(commandText);
          const reason = pendingQuestion ? 'I need your answer first'
            : negatedRequest ? 'you asked me not to, so nothing was executed'
            : hypotheticalRequest ? 'that read as a hypothetical, not an instruction — say the word and I will do it'`, 'D6b');

const out = s.replace(/\n/g, '\r\n');
if ((out.match(/(^|[^\r])\n/g) || []).length) throw new Error('bare LF');
writeFileSync(p, out); console.log('applied', n);
