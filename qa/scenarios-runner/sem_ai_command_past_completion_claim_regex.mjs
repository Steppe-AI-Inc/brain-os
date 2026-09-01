// Permanent regression for BUG-002 (Work-PC QA campaign C001, qa/bugs/BUG-002.md):
// Brain Chat must never claim a past-tense completion ("has been approved", "renamed:
// X → Y", "updated successfully") when nothing was actually executed this turn.
//
// This tests PAST_COMPLETION_CLAIM_PATTERN in isolation (pure regex logic, no Deno-
// specific APIs) - the real gate in supabase/functions/sem-ai-command/index.ts also
// requires !groundedOutcomeThisTurn AND !result.pendingAction AND the model not being
// in a deterministic-* mode, which can only be exercised by a live call against the
// deployed function (see qa/scenarios-runner/chat_must_not_fabricate_approval_decision.md
// for that behavioral spec). This file guards the specific defect QA found and this
// session fixed: a hedge-word false positive that would have overwritten the EXACT
// correct-refusal shape QA's own report praised ("I don't see that task - it may have
// been archived or deleted").
//
// IMPORTANT: keep this pattern byte-identical to the one in
// supabase/functions/sem-ai-command/index.ts - copy-paste, don't hand-retype, whenever
// either changes.
//
// Run with: node qa/scenarios-runner/sem_ai_command_past_completion_claim_regex.mjs

const PAST_COMPLETION_CLAIM_PATTERN = /(?<!may )(?<!might )(?<!could )(?<!can )\b(has been|have been|was|were)\b[^.]{0,30}\b(approved|declined|rejected|deleted|removed|renamed|updated|created|assigned|reassigned|completed|archived|restored|moved|ended|added|granted|confirmed)\b|\b(approved|declined|rejected|deleted|removed|renamed|updated|created|assigned|completed|archived|restored)\s+successfully\b|\brenamed:\s*.+(→|->)/i;

const cases = [
  { text: 'Approval 358eddeb-c6ac-4a85-ab26-77dc3960fcba (Complete corporate holding restructuring for OpenSpot Global Scale-Up) has been approved.', expect: true, label: 'BUG-002 exact approval fabrication (live QA reproduction)' },
  { text: 'Department "QA-Test Dept" has been permanently deleted.', expect: true, label: 'department fabrication (class sweep)' },
  { text: 'Project renamed: IQParking Core → QA-RENAMED-PROJECT.', expect: true, label: 'project rename fabrication (class sweep, arrow form)' },
  { text: 'The task has been assigned to them.', expect: true, label: 'assignment fabrication' },
  { text: 'Task updated successfully.', expect: true, label: '"X successfully" form' },
  { text: 'The channel was likely renamed at some point in the past by another admin.', expect: true, label: 'unhedged "was renamed" still caught alongside other qualifiers' },

  { text: 'I don’t see a task with ID QA-SWARM-TASK-001. It may have been archived, deleted, or the ID may be incorrect.', expect: false, label: 'FALSE-POSITIVE GUARD: honest decline, "may have been" hedged - must NOT match' },
  { text: 'I cannot permanently delete people via chat. Person records can only be hard-deleted as part of a fixture company’s own permanent deletion.', expect: false, label: 'correct refusal (people) - QA-praised gold-standard decline shape' },
  { text: 'I can help you create a new task. What should it be called?', expect: false, label: 'clarifying question' },
  { text: 'I found 3 companies matching "test". Which one did you mean?', expect: false, label: 'disambiguation' },
  { text: 'I’ll assign the task to them now.', expect: false, label: 'future-tense promise - handled by the separate FUTURE_PROMISE_PATTERN, not this one' },
  { text: 'This might have been deleted already, I can’t tell.', expect: false, label: 'hedged "might have been"' },
  { text: 'This could have been updated by someone else earlier.', expect: false, label: 'hedged "could have been"' },
];

let pass = 0;
let fail = 0;
for (const c of cases) {
  const matched = PAST_COMPLETION_CLAIM_PATTERN.test(c.text);
  const ok = matched === c.expect;
  console.log(`${ok ? 'OK  ' : 'FAIL'} [${matched ? 'MATCH' : 'no match'}] ${c.label}`);
  if (ok) pass++;
  else fail++;
}
console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
