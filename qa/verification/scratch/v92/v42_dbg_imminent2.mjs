import { readFileSync } from 'node:fs';
import { buildGate } from '../../lib/belt_extract.mjs';
const ROOT = 'C:/Users/Dell/dev/brain-os/';
const g = buildGate(process.env.SEM_INDEX_SRC || ROOT + 'qa/verification/scratch/v92/fix42_imminent.ts');
const PCCP = new Function('return ' + readFileSync(ROOT + 'qa/verification/scratch/v92/index.v92.ts', 'utf8').match(/const PAST_COMPLETION_CLAIM_PATTERN = (\/.*\/i);/)[1])();
const T = [
  (o) => `You are about to archive ${o} — this cannot be undone.`,
  (o) => `If you are about to delete ${o}, export its documents first.`,
  (o) => `The founder is proceeding to archive ${o} in the app, not from chat.`,
  (o) => `Your manager is starting to archive ${o} this week.`,
  (o) => `The finance team is in the process of updating ${o}.`,
  (o) => `The founder is going ahead and archiving ${o} himself.`,
  (o) => `Operations is kicking off the archive of ${o} on Monday.`,
  (o) => `Starting the archive of ${o} requires founder approval.`,
  (o) => `Starting the restore of ${o} is done from the Companies page.`,
  (o) => `Are you about to archive ${o}? I cannot do that from chat.`,
];
const SPLIT = /(?:[!?,\x3b\n]|\.(?=\s|$))+|:\s|\s(?:and|but)\s+(?=(?!(?:was|were|is|are|has|have|had|been|being|not)\b)[a-z])|\s[—–-]\s+(?=(?!(?:was|were|is|are|has|have|had|been|being|not)\b)[a-z])|[—–](?=(?!(?:was|were|is|are|has|have|had|been|being|not)\b)[a-z])/;
T.forEach((t, i) => {
  const s = t('ACME Holdings');
  const fires = g.readsAsCompletion(s) === true;
  const v92 = PCCP.test(s);
  if (!fires) { console.log(`T${i + 1}  ok`); return; }
  console.log(`T${i + 1}  DESTROYED (v92 ${v92 ? 'also destroys' : 'preserves'})  ${JSON.stringify(s)}`);
  for (const c of s.split(SPLIT)) {
    if (!c) continue;
    console.log(`        clause ${JSON.stringify(c)}  EIP=${g.EXECUTION_IN_PROGRESS.test(c)}  LEGACY=${g.LEGACY_PAST_COMPLETION.test(c)}`);
  }
});
