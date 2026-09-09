// VERIFIER #69 — STEP 2A arms 3 and 4: a VERIFIED envelope must let the truthful claim through; an
// executed-but-unverified or denied envelope must never support a claim.
import { turnClaim, NO_CHANGE } from './pipeline.mjs';
import fs from 'node:fs';

const ID = (n) => '1111111' + n + '-1111-4111-8111-111111111111';
const EV = (rt, action, id, ok) => ({ resourceType: rt, action, id, postconditionPassed: ok, request_id: null,
  channel_id: null, turn: null, action_type: action, entity_type: rt, canonical_entity_ids: [id],
  requested_values: null, executed: true, rows_affected: ok ? 1 : 0, backend_result: null, precondition: null,
  postcondition: null, postcondition_verified: ok, error: ok ? null : 'postcondition_not_confirmed', timestamp: 'now' });
const CLAIM = (rt, id, action) => ({ type: 'mutation_result', resourceType: rt, resourceId: id, action });

const TYPES = [['company', 'archive'], ['company', 'restore'], ['task', 'archive'], ['task', 'restore'],
  ['person', 'update'], ['goal', 'archive'], ['company', 'delete'], ['task', 'assign'], ['approval', 'approve'], ['company', 'rename']];
const CMD = { archive: 'archive company ACME', restore: 'restore company ACME', delete: 'delete company ACME',
  update: 'set the manager of Alice to Bob', assign: 'assign task QA-1 to Bob', approve: 'approve approval A-1', rename: 'rename company ACME to Beta' };
const SUM = { archive: 'ACME has been archived.', restore: 'ACME has been restored.', delete: 'ACME has been deleted.',
  update: 'Alice now reports to Bob.', assign: 'Assigned. Bob now owns QA-1.', approve: 'The approval has been approved.', rename: 'Renamed to Beta.' };

const out = { verified_suppressed: [], unverified_shipped: [], n_verified: 0, n_unverified: 0 };
let i = 0;
for (const [rt, action] of TYPES) {
  for (const variant of [0, 1]) {
    const id = ID(i++ % 10);
    const cmd = CMD[action], summary = SUM[action];
    // arm 3: VERIFIED envelope on the claimed id
    const okRun = turnClaim({ command: cmd, summary, claims: [CLAIM(rt, id, action)], evidence: [EV(rt, action, id, true)],
      labels: { company: { [id]: 'ACME' }, task: { [id]: 'QA-1' }, person: { [id]: 'Alice' }, goal: { [id]: 'G-1' } } });
    out.n_verified++;
    if (NO_CHANGE.test(okRun.summary)) out.verified_suppressed.push({ rt, action, got: okRun.summary });
    // arm 4: executed-but-UNVERIFIED (variant 0) / DENIED (variant 1)
    const badEv = variant === 0 ? [EV(rt, action, id, false)]
      : [{ ...EV(rt, action, id, false), executed: false, error: 'permission denied', rows_affected: 0 }];
    const badRun = turnClaim({ command: cmd, summary, claims: [CLAIM(rt, id, action)], evidence: badEv,
      labels: { company: { [id]: 'ACME' }, task: { [id]: 'QA-1' }, person: { [id]: 'Alice' }, goal: { [id]: 'G-1' } } });
    out.n_unverified++;
    // INSTRUMENT CORRECTION (the #68 standard): the first version of this detector counted the product's
    // own truthful refusal — "I can’t confirm from this turn’s execution record that ACME was archived" —
    // as a success claim, because the participle appears in it. A claim is an ASSERTION of completion; a
    // refusal that names the same participle is the opposite. 16 false positives came from that, and none
    // of them was a defect.
    const SUCCESS = /\b(archived|restored|deleted|renamed|approved|assigned|updated|now reports|now owns)\b/i;
    const REFUSAL = /can[’']?t confirm|could not|cannot confirm|no change was made|not confirmed|unverified/i;
    if (SUCCESS.test(badRun.summary) && !REFUSAL.test(badRun.summary) && !NO_CHANGE.test(badRun.summary)) out.unverified_shipped.push({ rt, action, variant, got: badRun.summary });
  }
}
console.log('VERIFIED envelope turns: ' + out.n_verified + ' — truthful claim wrongly suppressed: ' + out.verified_suppressed.length);
for (const s of out.verified_suppressed.slice(0, 8)) console.log('   ' + JSON.stringify(s));
console.log('UNVERIFIED/DENIED turns: ' + out.n_unverified + ' — success wording shipped: ' + out.unverified_shipped.length);
for (const s of out.unverified_shipped.slice(0, 8)) console.log('   ' + JSON.stringify(s));
fs.writeFileSync('qa/verification/scratch/v69/envelope_probe.json', JSON.stringify(out, null, 1));
