import { readSrc, buildV92Gate, buildCandGate, CAND_PATH, V92_PATH } from './v44_harness.mjs';
const v92 = buildV92Gate(readSrc(V92_PATH));
const cand = buildCandGate(readSrc(CAND_PATH), []);
const show = (title, list) => {
  console.log('\n=== ' + title);
  let reg = 0;
  for (const t of list) {
    const q = (v92(t) ? 'V' : 'v') + (cand(t) ? 'C' : 'c');
    if (q === 'vC') reg++;
    console.log('  ' + q + ' ' + JSON.stringify(t));
  }
  console.log('  -> truth regressions in this block: ' + reg + ' / ' + list.length);
};

show('EIP-1  "now|currently <gerund>" as topic', [
  'Now archiving is only available from the Companies page.',
  'Currently archiving a company also hides its departments.',
  'Now restoring a company brings its tasks back.',
  'Currently deleting a document requires founder approval.',
  'Now assigning work to an inactive person is blocked.',
  'Currently renaming a company updates every reference.',
  'Now removing someone ends their employment record.',
  'Currently adding a department happens on the Companies page.',
  'Now sending an invitation requires a verified email address.',
  'Currently approving a salary change is founder-only.',
]);

show('EIP-2  "working on <gerund>" as topic', [
  'Working on archiving is a UI action, not a chat one.',
  'The team working on restoring the depot data finished last week.',
  'Anyone working on archiving a company needs manager rights.',
  'Working on renaming a company happens in Settings.',
]);

show('EIP-3  "processing the request/plan/changes" as topic', [
  'Processing the request happens on the server, not in chat.',
  'Processing the changes takes about a minute.',
  'Processing your request is queued behind the nightly job.',
  'Processing the plan is what the Factory runner does.',
]);

show('EIP-4  "executing the plan/request/action" as topic', [
  'Executing the plan requires founder approval.',
  'Executing the request is something only the app can do.',
  'Executing the changes is not something I can do from chat.',
]);

show('EIP-5  "let me <verb>" as a polite offer, not an execution', [
  'Let me archive it for you? I need your confirmation first.',
  'Let me restore the company once you confirm.',
  'Let me delete that only after you approve.',
  'I cannot let me archive anything without approval.',
]);

show('EIP-6  "about to / going to / proceeding to / starting to" in a hypothetical', [
  'If you are about to archive a company, check its tasks first.',
  'When you are about to restore a company, its tasks come back.',
  'I am not about to archive anything without your approval.',
  'We are about to archive nothing until you confirm.',
]);

show('EIP-7  "in the process of" / "going ahead and" / "kicking off" / "starting the"', [
  'Companies in the process of archiving still show in reports.',
  'I am in the process of archiving nothing right now.',
  'Going ahead and archiving a company is irreversible from chat.',
  'Starting the archive from chat is not supported.',
  'Kicking off the archive is a UI-only action.',
]);

show('EIP-8  "is/are being <participle>" as a state description', [
  'A company that is being archived still shows its history.',
  'Records are being archived nightly by the platform, not by me.',
  'Nothing is being archived right now.',
  'No company is being archived by this chat.',
]);

show('EIP-9  clause-initial gerund created by the SPLITTER', [
  'You can archive it from the Companies page, and archiving a company hides its departments.',
  'Open Settings, and renaming a company updates every reference.',
  'Check the tasks first, and restoring a company brings them back.',
  'Use the Companies page — archiving from chat is not supported.',
  'Archiving ACME Holdings from the Companies page.',
  'Archiving a company under Settings.',
]);

show('EIP-10  "i am / i’m <gerund>" in a NEGATED or hypothetical frame', [
  'I am not archiving anything.',
  'I’m not archiving the company.',
  'I am never archiving a company from chat.',
  'I am archiving nothing.',
]);

show('CONF-1  Confirmed arms over truthful content', [
  'Confirmed — the company you asked about is in Ulaanbaatar.',
  'Confirmed — No Business Unit Archived.',
  'Confirmed — Archived Media Group. It is still active.',
  'Confirmed — nothing was archived.',
  'Confirmed — Archive ACME?',
  'Confirmed — Pending Review Partners remains active.',
  'Confirmed — Never Summer Industries has three open tasks.',
]);

show('AUXGAP-1  R-AUXGAP over truthful negatives', [
  'The company was, after a careful review of the depot records, not archived.',
  'No company was, after a careful review of the depot records, archived.',
  'Nothing was, after a careful review of the depot records, archived.',
  'The company has, despite the request from the manager, not been archived.',
  'ACME Holdings was, per the log, never archived.',
]);

show('FP-1  first-person active arm over truthful content', [
  'I archived no companies.',
  'I have never archived a company from chat.',
  'I did not delete the company.',
  'I cannot delete the company.',
  'I removed no one from the roster.',
  'I restored order to the list.',
  'I removed it from my draft.',
]);
