// Regression caught by the v56 corpus: "ACME компанийг архивлаад Beta-г сэргээ" lost its intent.
//
// String.match with a non-global regex returns only the FIRST match, so the Cyrillic tier was judging
// "архивлаад" — a converb in the middle of the sentence ("having archived") — and never reached "сэргээ",
// the actual finite command at the end. In a verb-final language the operative verb is the LAST one, and a
// compound command legitimately carries earlier converbs. Scan every Cyrillic match and accept the first
// that is a real command in verb-final position, instead of judging whichever happened to appear first.
import { readFileSync, writeFileSync } from 'node:fs';
const p = process.argv[2] || 'supabase/functions/sem-ai-command/index.ts';
let s = readFileSync(p, 'utf8').replace(/\r\n/g, '\n');
function must(a, b, label) { const c = s.split(a).length - 1; if (c !== 1) throw new Error(label + ': found ' + c); s = s.replace(a, () => b); }

must(`        const alwaysCyrillic = alwaysCyrillicRaw
          && !MN_READ_SHAPE.test(commandText)
          && !MN_NOT_A_COMMAND.test(alwaysCyrillicRaw)
          && mnFinalWindow.includes(alwaysCyrillicRaw)
          ? alwaysCyrillicRaw : null;`,
`        // Every Cyrillic stem occurrence, not just the first: a compound command carries converbs before
        // the operative verb ("ACME компанийг архивлаад Beta-г сэргээ" — "having archived ACME, restore
        // Beta"), and the command is the LAST verb, not the first token that matched.
        const MN_STEMS_GLOBAL = /(?<!\\p{L})(архивл\\S*|устга\\S*|сэргээ\\S*|өөрчл\\S*|томил\\S*|болго\\S*|үүсгэ\\S*|нэмэ\\S*|соль\\S*|хас\\S*|оноо\\S*|шинэчил\\S*|дуусга\\S*|хаа|цуцла\\S*)(?!\\p{L})/giu;
        const mnCandidates = MN_READ_SHAPE.test(commandText) ? [] : [...commandText.matchAll(MN_STEMS_GLOBAL)].map((m) => m[1]);
        const alwaysCyrillic = (alwaysCyrillicRaw || mnCandidates.length > 0)
          ? (mnCandidates.find((w) => !MN_NOT_A_COMMAND.test(w) && mnFinalWindow.includes(w)) || null)
          : null;`, 'cyrillic scan');

const out = s.replace(/\n/g, '\r\n');
if ((out.match(/(^|[^\r])\n/g) || []).length) throw new Error('bare LF');
writeFileSync(p, out); console.log('cyrillic scan applied');
