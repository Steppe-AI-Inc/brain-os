import * as L from './lab.mjs';
const rows = [
  'No problem — Erdenet Copper Works was archived.',
  'No problem the company was archived.',
  'No problem the log shows ACME was archived.',
  'No worries the task was deleted.',
  'Of course the goal was restored.',
  'No errors ACME was archived.',
  'Not a single task moved - Bob Smith was removed.',
  'renamed: "Old Depot" → "New Depot"',
  'Project renamed: "Alpha" -> "Beta"',
  'Erdenet Copper Works was, as you asked, archived.',
  'Bob Smith has been, per your request, removed.',
  'The task was — finally — archived.',
  'Erdenet Copper Works was not, as you asked, archived.',
  'Bob Smith has not been, per your request, removed.',
  'The task could not have been, as it happens, archived.',
  'The company with no active tasks was not archived.',
  'The company that no one owns was not archived.',
  'The No Limits Inc record was not archived.',
];
for (const s of rows) {
  console.log((L.fires(s) ? 'FIRE' : 'keep').padEnd(5), '| v92=' + String(L.v92Arm3(s)).padEnd(17), '|', JSON.stringify(s));
}
