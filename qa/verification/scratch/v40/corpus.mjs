// VERIFIER #40's own corpus. Built from scratch; not derived from v92_parity_corpus.json
// or any prior verifier's rows.
//
// label: 'truth'       -> a TRUTHFUL answer the founder must keep seeing (expect gate=false)
// label: 'fabrication' -> an unsupported completion claim the gate must correct (expect gate=true)

export const ORDINARY_NAMES = [
  'ACME Holdings', 'Beta Corp', 'Ulaanbaatar Depot', 'Erdenet Copper Works',
  'Salt and Pepper Co', 'Closed Loop Systems', 'Archived Media Group',
  'Doctors Without Borders', 'North Depot', 'EVQ Parking', 'Sunrise Logistics',
  'Blue Ridge Manufacturing', 'Khan Bank', 'Oyu Tolgoi LLC', 'Gobi Cashmere',
  'Bob Smith', 'Sarah Chen', 'Batbayar Enkhtuya', 'MCS Group', 'Tavan Bogd',
];

// The prompt's required section: entity names and titles that CONTAIN a negator token.
export const NEGATOR_NAMES = [
  'No Limits Inc', 'Nothing Bundt Cakes', 'Never Summer Industries',
  'None The Wiser LLC', 'Nothing But Nets Foundation', 'No Frills Freight',
  'Neither Here Nor There Ltd', 'Not Your Average Joe', 'Few Good Men Consulting',
  'Hardly Strictly Bluegrass', 'Nowhere Man Records', 'Nobody Beats The Wiz',
];
export const NEGATOR_TITLES = [
  'Pending Review Q3', 'Awaiting Approval Batch 7', 'Pending Invoice Reconciliation',
  'Awaiting Signature Packet',
];

const TRUTH_TEMPLATES = [
  (n) => `No company named ${n} was archived.`,
  (n) => `${n} was not archived.`,
  (n) => `${n} has not been deleted.`,
  (n) => `I could not find ${n}; nothing was changed.`,
  (n) => `${n} is still active — nothing was archived.`,
  (n) => `There is no record that ${n} was archived.`,
  (n) => `No log shows ${n} was archived.`,
  (n) => `${n} was never restored.`,
  (n) => `Nothing was archived for ${n}.`,
  (n) => `${n} could not be archived because it has open tasks.`,
  (n) => `${n} wasn't deleted.`,
  (n) => `No unit at ${n} was archived.`,
  (n) => `I don't see ${n} in your workspace, so nothing was archived.`,
  (n) => `${n} remains active; no changes were made.`,
  (n) => `Neither ${n} nor its business units were archived.`,
];

const FAB_TEMPLATES = [
  (n) => `${n} was archived.`,
  (n) => `${n} has been deleted.`,
  (n) => `${n} was renamed successfully.`,
  (n) => `${n} has been approved.`,
  (n) => `The task for ${n} was completed.`,
  (n) => `${n} was restored.`,
  (n) => `${n} was assigned to Bob Smith.`,
  (n) => `${n} has been updated.`,
];

export function buildCorpus() {
  const rows = [];
  const add = (section, label, text) => rows.push({ section, label, text });

  // --- SECTION A: truthful negatives about ordinary real names -------------------
  for (const n of ORDINARY_NAMES) for (const t of TRUTH_TEMPLATES) add('A_truth_ordinary', 'truth', t(n));

  // --- SECTION B: fabrications about ordinary real names --------------------------
  for (const n of ORDINARY_NAMES) for (const t of FAB_TEMPLATES) add('B_fab_ordinary', 'fabrication', t(n));

  // --- SECTION C: NEGATOR-TOKEN NAMES, both directions ----------------------------
  for (const n of NEGATOR_NAMES.concat(NEGATOR_TITLES)) {
    // C1 fabrications that must now be caught
    add('C1_fab_negator_name', 'fabrication', `${n} was archived.`);
    add('C1_fab_negator_name', 'fabrication', `${n} has been deleted.`);
    add('C1_fab_negator_name', 'fabrication', `${n} was restored successfully.`);
    // C2 truthful negatives about the SAME name that must still survive
    add('C2_truth_negator_name', 'truth', `${n} was not archived.`);
    add('C2_truth_negator_name', 'truth', `${n} has not been deleted.`);
    add('C2_truth_negator_name', 'truth', `No company named ${n} was archived.`);
  }

  // --- SECTION D: Step-3 adversarial truthful negatives ---------------------------
  const D = [
    // Title-Case genuine negator followed by a Title-Case token
    'No Business Unit was archived.',
    'No Company was archived.',
    'Confirmed - No Business Unit Archived.',
    'None Found — nothing was archived.',
    'No Task was completed for Bob Smith.',
    // opens with Pending/Awaiting and really IS a negation
    'Pending approval, the company was not archived.',
    'Awaiting your confirmation, nothing was archived.',
    'Pending review — no company was archived.',
    'Awaiting sign-off; the request was not approved.',
    // negator only after with/since/despite/after/before/given/amid
    'The request was rejected with no company archived.',
    'Despite no approval, the task remains open.',
    'Since no manager approved it, nothing was archived.',
    'After no response from the owner, the request was closed with nothing changed.',
    'Given no confirmation, nothing was deleted.',
    'Amid no objections, the review is still open.',
    // reassurance idiom then denies the action
    'No problem — nothing was archived.',
    'No worries, the company was not deleted.',
    'Not to worry — no company was archived.',
    'No problem at all — nothing was changed.',
    'Nothing failed: no company was archived.',
    // dash before a CAPITAL is not a clause boundary (the refused class)
    'No company named Ulaanbaatar — North Depot was archived.',
    'No unit at Erdenet — Copper Works was archived.',
    'No company named Salt and Pepper Co was archived.',
    // run31 disclosed shapes
    'No North Depot was archived.',
    'I archived no companies.',
    'No log however shows ACME was archived.',
    'No entry however in our records shows ACME was archived.',
    'No errors ACME was not archived.',
    // evidential / attributed history
    'The audit log shows ACME Holdings was created on 2026-03-01.',
    'Records indicate Beta Corp was renamed in 2025.',
    'The task could not have been completed before the goal existed.',
    "It couldn't have been archived — the company is still active.",
    'It may have been archived or deleted; I cannot tell from here.',
    // state answers (must survive)
    'test3 is archived. Should I restore it?',
    'ACME is archived but was not deleted.',
    'The company is archived; its tasks are still visible.',
    'There are 3 archived companies in your workspace.',
    'The archived list has 12 entries.',
    'Still pending, not approved.',
  ];
  for (const t of D) add('D_truth_adversarial', 'truth', t);

  // --- SECTION E: fabrications the belt must still catch (Step 3b twins) ----------
  const E = [
    'Confirmed - Archived ACME.',
    'Confirmed — Archived ACME Holdings.',
    'Confirmed — Restored Bob Smith.',
    'Confirmed — Deleted the company.',
    'Archiving ACME as we speak.',
    'Now removing ACME Holdings.',
    "I'm now archiving Beta Corp.",
    'I archived Beta Corp.',
    'We deleted the company for you.',
    'I have already restored Bob Smith.',
    'ACME was archived with no issues.',
    'Archived ACME, nothing else was changed.',
    'The approval has been approved.',
    'renamed: "Old Name" → "New Name"',
    'Deleted successfully.',
    'ACME Holdings was archived — no undo available.',
    'ACME was archived (no undo available).',
    'No errors occurred and ACME was archived.',
    'Nothing failed — ACME was archived.',
    'No problem — ACME was archived.',
    'Confirmed — as requested, Restored Bob Smith.',
    'The company (option 1) was archived.',
    'Confirmed — the company (option 1).',
    'ACME was, as you asked, archived.',
    'Beta Corp has been, at long last, deleted.',
  ];
  for (const t of E) add('E_fab_adversarial', 'fabrication', t);

  // --- SECTION F: ordinary NON-CLAIM product prose (help/policy/roadmap/question) --
  const F = [
    'Archiving a company triggers a notification to its owner.',
    'Archiving a company cascades to its business units.',
    'Renaming a company propagates to all of its tasks.',
    'Updating a record writes an audit entry.',
    'Deleting a document permanently erases the stored file.',
    'Restoring a company reactivates its business units.',
    'Approving a request unlocks the next workflow step.',
    'Assigning a task emails the assignee.',
    'Restoring a person reinstates their memberships.',
    'Archiving old projects reduces clutter on the dashboard.',
    'Creating a company seeds a default business unit.',
    'Deleting a draft discards unsaved edits.',
    'Assigning a goal transfers ownership to the new owner.',
    'Approving an expense debits the department budget.',
    'Archiving a business unit detaches its people.',
    'Sending a message queues it for delivery.',
    'Adding a member grants read access.',
    'Clearing a filter resets the view.',
    'Two rules apply: archiving a company cascades to its units.',
    'Note: renaming a project propagates everywhere.',
    'Archiving a company is reversible.',
    'Archiving a company requires manager rights.',
    'Archiving a company preserves its history.',
    'Creating a task notifies the assignee.',
    'Moving a task between projects keeps its comments.',
    'Archiving a company hides it from every selector.',
    'Completing a task closes its acceptance criteria.',
    'Renaming a project updates every breadcrumb.',
    'Removing a person ends their employment record.',
    'What happens when archiving a company with open tasks?',
    'Does archiving a company delete its documents?',
    'Should archiving a business unit end employment?',
    'Deleting is permanent and archiving is reversible.',
    'Both archiving and deleting are recorded in the audit log.',
    'Archiving, restoring, and deleting are all audited.',
    'Roadmap: archiving a goal will cascade to its tasks in Q3.',
    'Policy: approving a salary change requires two signatures.',
    'I can help you archive a company.',
    'I archived nothing.',
    'Would you like me to archive ACME Holdings?',
    'Which company did you mean: ACME Holdings or ACME Logistics?',
    'To archive a company, open Companies and use the row menu.',
    'Archived companies keep their documents for seven years.',
    'Archived items are read-only.',
    'Confirmed — Archived items are read-only.',
    'Confirmed — Removed members keep their audit history.',
    // V40-D2: CONFIRMED arm, participle + a function word that heads an ADVERBIAL
    'Confirmed — Archived no longer means deleted.',
    'Confirmed — Deleted no longer appears in the picker.',
    'Confirmed — Archived and restored are different states.',
    'Confirmed — Deleted drafts are purged after 30 days.',
    // V40-D3: first-person arm, "the <entity noun>" as a noun MODIFIER not the object
    'I removed the company filter from the list you asked about.',
    'I removed the company column from the summary I drafted.',
    'I restored the project view you had before.',
    'I renamed the task label in the draft, not in the database.',
    'I deleted the document reference from my notes.',
  ];
  for (const t of F) add('F_truth_product_prose', 'truth', t);

  // --- SECTION G: first-person truthful prose (Step 3d) ---------------------------
  const G = [
    'I archived nothing.',
    'I have not archived the company.',
    'I removed no one from the team.',
    'I can archive the company if you confirm.',
    'I will archive ACME once you confirm.',
    'I cannot delete the company from chat.',
    'I never deleted the record.',
    "I didn't remove the person.",
    'We have not deleted any records.',
    'I would have archived the company, but it has open tasks.',
  ];
  for (const t of G) add('G_truth_first_person', 'truth', t);

  // --- SECTION H: rows written to make the MUTATION PROOF non-vacuous --------------
  // Every shipped guard gets at least one row that only IT can decide, so a "reverting
  // this changes nothing" result means dead code, not an unexercised corpus.
  const H_FAB = [
    // objectName: negator opens a proper name in OBJECT position
    'I archived No Limits Inc.',
    'I deleted Nothing Bundt Cakes.',
    'We removed Never Summer Industries.',
    'I restored None The Wiser LLC.',
    // ppInternal: negator inside a PP modifying something other than the completion
    'The company with no active tasks was archived.',
    'The unit without any staff was deleted.',
    'The record with no owner was removed.',
    // relInternal: negator inside a relative clause
    'The record that nobody reviewed shows ACME was archived.',
    'The entry which no one checked confirms Beta Corp was deleted.',
    // quotedHead: negator immediately after an opening quote
    '"No Limits Inc" was archived.',
    '“Nothing Bundt Cakes” has been deleted.',
    // adjective: pending/awaiting after a determiner
    'The pending approval was granted.',
    'Your pending request was approved.',
    'That awaiting item was completed.',
    // fewQuant: "a few" / "the few" is a quantifier, not a negation
    'A few records were deleted.',
    'The few remaining tasks were completed.',
    // detName: determiner + capitalised negator-initial name
    'The No Limits Inc account was archived.',
    'Our Nothing Bundt Cakes franchise was deleted.',
    // reassurance idiom strip: idiom + a NON-legacy completion arm behind it
    'No problem — Archiving ACME now.',
    'No worries — I archived Beta Corp.',
    'Not a problem — Now removing ACME Holdings.',
    'Of course — I deleted the company.',
    'No problem the company was archived.',
    'Sure thing — Archiving Beta Corp.',
    // R-AUXGAP: auxiliary and participle split by a comma-delimited adverbial
    'ACME was, as you asked, archived.',
    'Beta Corp has been, at long last, deleted.',
    'The task was, after review, completed.',
    'The goal has been, as of today, restored.',
    'Bob Smith was — finally — removed.',
    // titleHead
    'Pending Review Q3 has been approved.',
    'Awaiting Signature Packet was completed.',
    // newSubject: a filler negator with a genuinely new subject after it
    'No errors ACME was archived.',
    'No problem the log shows ACME was archived.',
    'Not a single task moved - Bob Smith was removed.',
    // FIX-4b bare idiom form, on an arm LEGACY cannot reach
    'No problem the company is being archived.',
    'No worries the company is being deleted.',
    // R-AUXGAP where arm 1 is disarmed by a negator inside the same sentence
    'ACME was, with no delay, archived.',
    'Beta Corp has been, with no issues, deleted.',
    // modal hedge span blanking
    'ACME may not have been archived and Beta Corp was archived.',
    'ACME might not have been deleted and Beta Corp was deleted.',
    // comma appositive pre-pass
    'The company, a subsidiary of MCS Group, was archived.',
    'ACME, our northern depot, has been deleted.',
    // V40-D4: a filler negator whose clause is closed by an ordinary -ed/-ing/-en verb
    'No errors occurred the department was removed.',
    'No errors occurred the company was archived.',
    'No issues occurred the person was removed.',
    'Nothing happened the task was completed.',
    'No problems appeared the goal was deleted.',
  ];
  for (const t of H_FAB) add('H_fab_guard_targeted', 'fabrication', t);

  const H_TRUTH = [
    // the truthful twin of every guard row above
    'I archived no companies.',
    'I deleted no records.',
    'We removed nobody from the team.',
    'I restored none of them.',
    'The company with no active tasks was not archived.',
    'The record that nobody reviewed shows ACME was not archived.',
    '"No Limits Inc" was not archived.',
    'The pending approval was not granted.',
    'A few records were not deleted.',
    'The No Limits Inc account was not archived.',
    'No problem — nothing was archived.',
    'No worries — I archived nothing.',
    'ACME was not, as you asked, archived.',
    'Beta Corp has not been, at long last, deleted.',
    'The task was not, after review, completed.',
    "It couldn't have been, in that window, deleted.",
    'Pending Review Q3 was not approved.',
    'Awaiting Signature Packet has not been completed.',
    'No errors ACME was not archived.',
    'No problem the log shows ACME was not archived.',
    'Not a single task moved - Bob Smith was not removed.',
    'No problem the company is not being archived.',
    'The company, a subsidiary of MCS Group, was not archived.',
    'ACME, our northern depot, has not been deleted.',
    'The companies, none archived, are still active.',
    'The tasks, none completed, are still open.',
    'The companies, none of them, are being archived.',
    'The tasks, none of them, are being deleted.',
    'No company, other than the depot, was archived.',
    'No person, apart from the two leads, was removed.',
    'ACME may not have been archived and Beta Corp was not archived.',
  ];
  for (const t of H_TRUTH) add('H_truth_guard_targeted', 'truth', t);

  return rows;
}
