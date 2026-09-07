#!/usr/bin/env node
// Replays today's REAL receipts and DB diffs (2026-09-07, sem-ai-command v92) through the reusable
// MUTATION_TRUTH guard. Every case is an actual production observation from qa/BUG_QUEUE.json.
// Run: node qa/runner/mutation-truth-selftest.mjs   (exit 1 on any wrong verdict)
import { assertMutationTruth } from './lib/mutation-truth.mjs';

let failed = 0;
const expect = (name, res, wantPass, wantKinds = []) => {
  const kinds = res.violations.map((v) => v.kind);
  const ok = res.pass === wantPass && wantKinds.every((k) => kinds.includes(k));
  if (ok) console.log('PASS ' + name + (kinds.length ? '  [' + kinds.join(', ') + ']' : ''));
  else { failed++; console.error('FAIL ' + name + ' - got pass=' + res.pass + ' kinds=' + JSON.stringify(kinds) + ' claims=' + JSON.stringify(res.claims.map((c) => c.op + ':' + c.target))); }
};
const S = (entities) => ({ entities });

// BUG-002: fabricated project rename. Receipt claims; DB unchanged.
expect('BUG-002 fabricated rename -> CLAIM_WITHOUT_MUTATION',
  assertMutationTruth({ receipt: 'Project renamed to QA-C002-PROJ-CHATRENAME-02.', before: S({ p1: { type: 'project', name: 'QA-C002-PROJ-EDITED-01', status: 'active' } }), after: S({ p1: { type: 'project', name: 'QA-C002-PROJ-EDITED-01', status: 'active' } }) }),
  false, ['CLAIM_WITHOUT_MUTATION']);

// BUG-018: fabricated undo. Receipt "Renaming X back to Y." DB unchanged.
expect('BUG-018 fabricated undo -> CLAIM_WITHOUT_MUTATION',
  assertMutationTruth({ receipt: 'Renaming QA-MULTI-CO-V2 back to QA-MULTI-CO.', before: S({ c: { type: 'company', name: 'QA-MULTI-CO-V2', status: 'active' } }), after: S({ c: { type: 'company', name: 'QA-MULTI-CO-V2', status: 'active' } }) }),
  false, ['CLAIM_WITHOUT_MUTATION']);

// Control: real rename. Receipt matches diff.
expect('explicit rename control -> pass',
  assertMutationTruth({ receipt: 'Renamed QA-MULTI-CO-V2 to QA-MULTI-CO.', before: S({ c: { type: 'company', name: 'QA-MULTI-CO-V2', status: 'active' } }), after: S({ c: { type: 'company', name: 'QA-MULTI-CO', status: 'active' } }) }),
  true);

// BUG-012: manager reassigned (real) but receipted as a company move.
expect('BUG-012 wrong-relationship receipt -> CLAIM_WITHOUT_MUTATION + MUTATION_WITHOUT_RECEIPT',
  assertMutationTruth({ receipt: 'QA-SWARM-PERSON-001-EDITED reassigned to QA-SWARM-TEST-CO-VIA-CHAT.', before: S({ p: { type: 'person', name: 'QA-SWARM-PERSON-001-EDITED', company: 'QA-SWARM-TEST-CO-VIA-CHAT', manager: 'QA-C002-MGR-PERSON-03' } }), after: S({ p: { type: 'person', name: 'QA-SWARM-PERSON-001-EDITED', company: 'QA-SWARM-TEST-CO-VIA-CHAT', manager: 'QA-C002-MGR-PERSON-02' } }) }),
  false, ['CLAIM_WITHOUT_MUTATION', 'MUTATION_WITHOUT_RECEIPT']);

// BUG-021: failure line + success line; type flipped, no parent.
// The parent claim has NO matching diff at all (only org_type flipped), so structurally it is a claim
// without mutation, the type flip is an unreceipted mutation, and the two sentences contradict.
expect('BUG-021 contradictory receipt -> CONTRADICTORY_RECEIPT + CLAIM_WITHOUT_MUTATION + MUTATION_WITHOUT_RECEIPT',
  assertMutationTruth({ receipt: '1 of 1 requested company relationship(s) could not be created - missing a valid company reference or invalid owner/related-company combination.\nQA-C002-RENAMED-X is now recorded as a business unit of QA-MULTI-CO.', before: S({ x: { type: 'company', name: 'QA-C002-RENAMED-X', org_type: 'legal_entity', parent: null } }), after: S({ x: { type: 'company', name: 'QA-C002-RENAMED-X', org_type: 'business_unit', parent: null } }), allowUnreceiptedOps: [] }),
  false, ['CONTRADICTORY_RECEIPT', 'CLAIM_WITHOUT_MUTATION', 'MUTATION_WITHOUT_RECEIPT']);

// BUG-023: person created with NO company; receipt claims company + parent.
expect('BUG-023 orphan create with claimed company -> CLAIMED_RELATIONSHIP_ABSENT',
  assertMutationTruth({ receipt: 'Adding QA-C002-PENDING-01 to QA-C002-RENAMED-X (business unit under SEM Global Robotics Technologies LLC).', before: S({}), after: S({ 'person:QA-C002-PENDING-01': { type: 'person', name: 'QA-C002-PENDING-01', company: null } }) }),
  false, ['CLAIMED_RELATIONSHIP_ABSENT']);

// BUG-025: "Confirmed -" echo with no action.
expect('BUG-025 Confirmed echo -> SUCCESS_VOCABULARY_WITHOUT_ACTION',
  assertMutationTruth({ receipt: 'Confirmed - Did you mean QA-C002-RENAMED-X (the active business unit).', before: S({ x: { type: 'company', name: 'QA-C002-RENAMED-X' } }), after: S({ x: { type: 'company', name: 'QA-C002-RENAMED-X' } }) }),
  false, ['SUCCESS_VOCABULARY_WITHOUT_ACTION']);

// Multi-action PASS: two creates, both receipted, both parented.
expect('multi-action honest receipt -> pass',
  assertMutationTruth({ receipt: 'Created project QA-C002-MULTI-PROJ and task QA-C002-MULTI-TASK under QA-MULTI-CO with low priority.', before: S({}), after: S({ 'project:QA-C002-MULTI-PROJ': { type: 'project', name: 'QA-C002-MULTI-PROJ', company: 'QA-MULTI-CO' }, 'task:QA-C002-MULTI-TASK': { type: 'task', name: 'QA-C002-MULTI-TASK', company: 'QA-MULTI-CO', priority: 'low' } }) }),
  true);

// Honest decline: no claim, no diff -> pass (a question is not a claim).
expect('honest decline -> pass',
  assertMutationTruth({ receipt: "I don't see a company named QA-MULTI in the current context. Did you mean QA-C002-RENAMED-X, or is QA-MULTI a different company?", before: S({ x: { type: 'company', name: 'QA-C002-RENAMED-X' } }), after: S({ x: { type: 'company', name: 'QA-C002-RENAMED-X' } }) }),
  true);

// Silent mutation: DB changed, receipt says nothing -> MUTATION_WITHOUT_RECEIPT.
expect('silent mutation -> MUTATION_WITHOUT_RECEIPT',
  assertMutationTruth({ receipt: 'Noted.', before: S({ c: { type: 'company', name: 'QA-MULTI-CO-TWIN', status: 'active' } }), after: S({ c: { type: 'company', name: 'QA-MULTI-CO-TWIN', status: 'archived' } }) }),
  false, ['MUTATION_WITHOUT_RECEIPT']);

console.log(failed ? `FAILED ${failed}` : 'ALL PASS');
process.exit(failed ? 1 : 0);
