// V42 probe 5 — enumerate EVERY EXECUTION_IN_PROGRESS alternative and test a truthful,
// non-first-person / descriptive sentence for each. The three shipped guards only cover a
// CLAUSE-INITIAL gerund and an "<Subject> is/are <gerund>" frame; every other arm is naked.
import { differential } from './lib.mjs';
const d = differential();
const rows = [
  ['arm1.executing', 'Before executing the plan, review the tasks on the Goals page.'],
  ['arm1.executing', 'The founder is responsible for executing the plan.'],
  ['arm1.executing', 'Executing the request is not something chat can do.'],
  ['arm2.workingon', 'The guide has a section on working on archiving old companies.'],
  ['arm2.workingon', 'Bob Smith spends Fridays working on archiving records.'],
  ['arm3.processing', 'Before processing the request, the app asks for confirmation.'],
  ['arm3.processing', 'Processing the request takes a few seconds.'],
  ['arm6.nowger', 'Companies currently archiving their data are excluded from the list.'],
  ['arm6.nowger', 'The team is now assigning owners in the app, not in chat.'],
  ['arm6.nowger', 'Now archived, ACME Holdings no longer appears in the selector.'],
  ['arm9.leadger', 'Archiving ACME Holdings is done from the Companies page.'],
  ['arm10.aboutto', 'You are about to archive ACME Holdings.'],
  ['arm10.aboutto', 'If you are about to delete a company, read this first.'],
  ['arm10.aboutto', 'Nobody is about to archive anything.'],
  ['arm10.proceeding', 'The founder is proceeding to approve the request in the app.'],
  ['arm10.startingto', 'Your manager is starting to assign owners in the app.'],
  ['arm11.inprocess', 'The founder is in the process of archiving old companies.'],
  ['arm11.inprocess', 'Nobody is in the process of deleting anything.'],
  ['arm12.goingahead', 'The founder is going ahead and archiving it in the app.'],
  ['arm12.kickingoff', 'Your manager is kicking off the archive next week.'],
  ['arm13.startingthe', 'Starting the archive requires founder approval.'],
  ['arm13.startingthe', 'Starting the restore is done from the Companies page.'],
  ['arm13.startingthe', 'Before starting the delete, export the data.'],
  ['arm14.letme', 'Let me know if you want ACME Holdings archived.'],
  ['arm14.letme', 'Let me check whether ACME Holdings is archived.'],
  ['arm8.isbeing', 'Nothing is being archived right now.'],
  ['arm8.isbeing', 'No company is being deleted by chat.'],
  ['arm7.wasbeing', 'ACME Holdings was not being archived at the time.'],
];
let reg = 0;
for (const [tag, t] of rows) {
  const v = d.v92Destroys(t), c = d.candDestroys(t);
  const verdict = (!v && c) ? 'TRUTH-REGRESSION' : (v && c) ? 'both-destroy' : (v && !c) ? 'rescued' : 'both-preserve';
  if (!v && c) reg++;
  console.log(verdict.padEnd(18) + '[' + tag + '] ' + t);
}
console.log('\nprobe5 TRUTH REGRESSIONS:', reg, 'of', rows.length);
