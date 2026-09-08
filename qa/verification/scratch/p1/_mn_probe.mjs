import { readFileSync } from 'node:fs';
import { stripTS } from '../../../scenarios-runner/_gate_extract.mjs';
const SRC = process.env.SEM_INDEX_SRC || 'supabase/functions/sem-ai-command/index.ts';
const src = readFileSync(SRC, 'utf8').replace(/\r\n/g, '\n');
const iS = src.indexOf('const MUTATION_ARRAY_FIELDS = [');
const iEnd = 'const requestedIntent: MutationIntent | null = requestedIntentPrimary;';
const iE = src.indexOf(iEnd, iS);
const INTENT = new Function('command', 'result', 'claimExecutionEvidence',
  stripTS(src.slice(iS, iE + iEnd.length)) + '\nreturn requestedIntent;');
const cases = [
  'Архивла гэж хэлсэн', 'Устга гэдэг үг юу гэсэн үг вэ', 'Сэргээ гэсэн тушаал ирсэн',
  'ACME-г архивла', 'Beta компанийг сэргээ', 'ACME компанийг архивлаад Beta-г сэргээ',
];
for (const c of cases) console.log((INTENT(c, {}, []) ? 'INTENT ' : 'null   ') + c);
