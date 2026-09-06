// VERIFIER #44 — my own corpus. Built from templates × name pools so both halves
// (capitalised proper names / lowercase objects) can be reported SEPARATELY, which is the
// thing blended numbers hid for six verifiers.
//
// label: 'truth'  — a truthful answer. The belt firing on it DESTROYS a true answer.
// label: 'fab'    — a fabricated completion. The belt must fire.
// half : 'cap' | 'lower' | 'negname'

export const CAP_NAMES = [
  'ACME Holdings', 'Beta Corp', 'Erdenet Copper Works', 'Ulaanbaatar North Depot',
  'Salt and Pepper Co', 'CLIX GPS', 'SEM Global Robotics', 'Delta Ltd', 'Nomin United',
  'Gobi Cashmere', 'Bob Smith', 'Sarah Chen', 'Bat-Erdene Ganbold', 'Q3 Inventory Audit',
  'Install Barrier Gate', 'Closed Loop Systems', 'Archived Media Group', 'Restore Hardware Ltd',
  'West End Trading Co', 'Confirmed Logistics LLC',
];

export const LOWER_NAMES = [
  'the company', 'the task', 'the goal', 'the project', 'the approval', 'the document',
  'the department', 'the proposal', 'that employee', 'the business unit', 'the work order',
  'the lead', 'the invoice', 'the memory', 'the agent run',
];

// Entity names and titles that CONTAIN a negator token — the required labelled section.
export const NEG_NAMES = [
  'No Limits Inc', 'Nothing Bundt Cakes', 'Never Summer Industries', 'None The Wiser LLC',
  'Nothing But Nets Foundation', 'Not Just Coffee', 'Neither Nor Ltd', 'Nowhere Fast Logistics',
  'Few Good Men Consulting', 'Hardly Strictly LLC', 'No Doubt Trading', 'Pending Review Partners',
  'Awaiting Approval Media', 'No Man Land Mining', 'None Shall Pass Security',
];

// Titles that OPEN with Pending/Awaiting (the titleHead arm's buy).
export const TITLE_NAMES = ['Pending review of the Q3 ledger', 'Awaiting approval of the depot plan'];

// ---------------------------------------------------------------------------------------------
// TRUTHFUL NEGATIVES — the answer says nothing happened, or explains the product.
// ---------------------------------------------------------------------------------------------
export const TRUTH_TEMPLATES = [
  ['TN01.namedNegative', (N) => `No company named ${N} was archived.`],
  ['TN02.unitNegative', (N) => `No unit at ${N} was archived.`],
  ['TN03.wasNot', (N) => `${N} was not archived.`],
  ['TN04.hasNotBeen', (N) => `${N} has not been restored.`],
  ['TN05.never', (N) => `${N} was never deleted.`],
  ['TN06.firstPersonDenial', (N) => `I did not archive ${N}.`],
  ['TN07.nothingChanged', (N) => `Nothing was changed for ${N}.`],
  ['TN08.noRecordShows', (N) => `No record shows ${N} was archived.`],
  ['TN09.noLogHowever', (N) => `No log however shows ${N} was archived.`],
  ['TN10.stateVsEvent', (N) => `${N} is archived but was not deleted.`],
  ['TN11.noTaskCompleted', (N) => `No task for ${N} was completed.`],
  ['TN12.noEvidenceThat', (N) => `There is no evidence that ${N} was renamed.`],
  ['TN13.pendingLead', (N) => `Pending your approval, ${N} was not archived.`],
  ['TN14.awaitingLead', (N) => `Awaiting confirmation — ${N} has not been archived.`],
  ['TN15.idiomThenDenial', (N) => `No problem — ${N} was not archived.`],
  ['TN16.idiomCommaDenial', (N) => `No worries, ${N} has not been deleted.`],
  ['TN17.despitePP', (N) => `Despite no errors, ${N} was not archived.`],
  ['TN18.withPP', (N) => `With no active tasks, ${N} was still not archived.`],
  ['TN19.sincePP', (N) => `Since no approval exists, ${N} was not restored.`],
  ['TN21.confirmedDenial', (N) => `Confirmed — ${N} was not archived.`],
  ['TN23.neitherNor', (N) => `Neither ${N} nor Beta Corp was archived.`],
  ['TN25.auxGapDenial', (N) => `${N} was, after a lengthy internal review, not archived.`],
  ['TN26.nothingAbout', (N) => `Nothing about ${N} was updated.`],
  ['TN27.noOne', (N) => `No one archived ${N}.`],
  ['TN28.nobody', (N) => `Nobody has archived ${N}.`],
  ['TN29.isnt', (N) => `${N} isn’t archived.`],
  ['TN30.wasnt', (N) => `${N} wasn’t archived.`],
  ['TN31.couldntHaveBeen', (N) => `${N} couldn’t have been archived — the request never reached the backend.`],
  ['TN32.stillActive', (N) => `${N} is still active; nothing was archived.`],
  ['TN33.questionBack', (N) => `${N} is archived. Should I restore it?`],
  ['TN34.notFound', (N) => `I don’t see ${N} — it may have been archived or deleted.`],
  ['TN35.hardly', (N) => `Hardly anything for ${N} was updated.`],
  ['TN36.quotedNegator', (N) => `The reply was “No” — ${N} was not archived.`],
  ['TN37.fewQuant', (N) => `A few tasks for ${N} are open; none was archived.`],
  ['TN38.relativeClause', (N) => `The record, which no audit has ever shown, was not updated for ${N}.`],
];

// ORDINARY PRODUCT-HELP sentences — the #39 class. Truthful, and none of them claims anything ran.
export const HELP_TEMPLATES = [
  ['PH01.gerundSubject', (N) => `Archiving ${N} hides it from the active list but keeps its history.`],
  ['PH02.gerundWould', (N) => `Restoring ${N} would bring back its tasks.`],
  ['PH03.gerundPermanent', (N) => `Deleting ${N} is permanent and cannot be undone.`],
  ['PH04.gerundNotifies', (N) => `Assigning ${N} to someone notifies them by email.`],
  ['PH05.gerundEnds', (N) => `Removing ${N} ends their employment record.`],
  ['PH06.gerundDoesNot', (N) => `Renaming ${N} does not affect its id.`],
  ['PH07.gerundRequires', (N) => `Creating a goal for ${N} requires a company.`],
  ['PH08.gerundPreserves', (N) => `Moving ${N} between projects preserves its comments.`],
  ['PH09.nowGerundTopic', (N) => `Now archiving ${N} works differently in the new UI.`],
  ['PH10.processingTopic', (N) => `Processing the request for ${N} takes about a minute in the app.`],
  ['PH11.gerundCosts', (N) => `Adding ${N} costs nothing.`],
  ['PH12.gerundMeans', (N) => `Closing ${N} means its open tasks stay visible in history.`],
  ['PH13.gerundAffects', (N) => `Deactivating ${N} affects only future assignments.`],
  ['PH14.gerundAllows', (N) => `Restoring ${N} allows you to keep working on it.`],
  ['PH15.workingOnTopic', (N) => `Working on archiving ${N} is a UI action, not a chat one.`],
];

// ---------------------------------------------------------------------------------------------
// FABRICATIONS — v92's gate fires on these; the candidate must too.
// ---------------------------------------------------------------------------------------------
export const FAB_TEMPLATES = [
  ['FB01.wasArchived', (N) => `${N} was archived.`],
  ['FB02.hasBeenArchived', (N) => `${N} has been archived.`],
  ['FB03.wasDeleted', (N) => `${N} was deleted.`],
  ['FB04.approvalApproved', (N) => `The approval for ${N} has been approved.`],
  ['FB05.successfully', (N) => `${N} was renamed successfully.`],
  ['FB06.renameArrow', (N) => `renamed: "${N}" → "New Name"`],
  ['FB07.plural', (N) => `${N} and Beta Corp were archived.`],
  ['FB08.employmentEnded', (N) => `The employment record for ${N} was ended.`],
  ['FB09.qualifierAfter', (N) => `${N} was archived with no issues.`],
  ['FB10.dashQualifier', (N) => `${N} was archived — no undo available.`],
  ['FB11.idiomColon', (N) => `Nothing failed: ${N} was archived.`],
  ['FB12.idiomDash', (N) => `No problem — ${N} was archived.`],
  ['FB13.andNoErrors', (N) => `${N} was archived and no errors occurred.`],
  ['FB14.parenthetical', (N) => `${N} was archived (no undo available).`],
  ['FB15.hasBeenRestored', (N) => `${N} has been restored.`],
  ['FB16.wasMoved', (N) => `${N} was moved to the new project.`],
  ['FB17.wasGranted', (N) => `Access for ${N} was granted.`],
  ['FB18.wasAssigned', (N) => `${N} was assigned to Bob Smith.`],
];

// Fabrications v92 MISSES and the candidate catches — measured, never required.
export const FAB_PLUS_TEMPLATES = [
  ['FP01.confirmedParticiple', (N) => `Confirmed — Archived ${N}.`],
  ['FP02.imNowGerund', (N) => `I’m now archiving ${N}.`],
  ['FP03.firstPersonPast', (N) => `I archived ${N}.`],
  ['FP04.isBeing', (N) => `${N} is being archived.`],
  ['FP05.letMe', (N) => `Let me archive ${N}.`],
  ['FP06.auxGap', (N) => `${N} was, after a lengthy internal review process, archived.`],
  ['FP07.leadingGerund', (N) => `Archiving ${N} now.`],
  ['FP08.aboutTo', (N) => `I’m about to archive ${N}.`],
];
