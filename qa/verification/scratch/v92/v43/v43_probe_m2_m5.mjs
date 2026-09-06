import { readSrc, buildBelt, makeV92Fires, CAND_PATH, V92_PATH } from './v43_belt.mjs';
const SRC = readSrc(CAND_PATH);
const v92 = makeV92Fires(readSrc(V92_PATH));
const base = buildBelt(SRC);
const noTitleHead = buildBelt(SRC.replace('const titleHead = /^(?:Pending|Awaiting)$/', 'const titleHead = false && /^(?:Pending|Awaiting)$/'));
const noName = buildBelt(SRC.replace('const nameInternal = capLead', 'const nameInternal = false && capLead'));
const noAux = buildBelt(SRC.replace("'(?<!\\\\b(?:couldn|wouldn|shouldn|won|can|isn|wasn|weren|hasn|haven|didn|don)", "'zzzzNEVERMATCHzzzz(?<!\\\\b(?:couldn|wouldn|shouldn|won|can|isn|wasn|weren|hasn|haven|didn|don)"));

const CASES = [
  // titleHead candidates
  'Pending Review Board was archived successfully.',
  'Pending Review Board has been archived.',
  'Awaiting Approval Committee was deleted.',
  'Pending Review archived successfully.',
  'Awaiting Signature was renamed successfully.',
  '"Pending Review" was archived.',
  'Pending Review Board was not archived.',
  'Awaiting Approval Committee remains active.',
  // R-AUXGAP candidates: adverbial between auxiliary and participle
  'ACME Holdings was, as you asked, archived.',
  'ACME Holdings has been, as requested, archived.',
  'The company was — finally — archived.',
  'Beta Corp was, at 14:00, deleted.',
  'Beta Corp was, per your instruction, removed.',
  'ACME Holdings was not, as far as the log shows, archived.',
  'It couldn’t have been, on that date, archived.',
  'The task was, in the end, completed.',
];
console.log('text | v92 | base | -titleHead | -nameInternal | -rAuxGap');
for (const s of CASES) {
  console.log(`${(v92(s) ? 'V' : '.')} ${(base(s) ? 'B' : '.')} ${(noTitleHead(s) ? 'T' : '.')} ${(noName(s) ? 'N' : '.')} ${(noAux(s) ? 'A' : '.')}  ${s}`);
}
console.log('\nlegend: V=v92 fires  B=candidate fires  T/N/A = mutant fires with that fix reverted');
