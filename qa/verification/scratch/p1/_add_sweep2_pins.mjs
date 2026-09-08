// Five behavioural pins for the five real survivors of the second-generation vacuity sweep. Every one of
// these guards could be neutered — a helper stubbed to a constant, a cap moved to a useless value — with the
// entire 65-suite battery staying green. Two of them are P1 fixes from earlier rounds, which is exactly the
// V63-D4 class recurring: I closed the three instances that finding named and did not establish the general
// property, so the sweep found more of the same shape immediately.
//
// All five are checked by EXECUTING the real code or by asserting a bound with its reason, never by matching
// a substring.
import { readFileSync, writeFileSync } from 'node:fs';
const p = 'qa/scenarios-runner/v63_intent_coverage_and_caps_contract.mjs';
let s = readFileSync(p, 'utf8').replace(/\r\n/g, '\n');
const anchor = 'console.log(`\\nv63_regression_additions: ${pass} passed, ${failures.length} failed `';
if (s.split(anchor).length - 1 !== 1) throw new Error('summary anchor not found');

const BLOCK = `
// ═══════════════════════════════ VACUITY SWEEP 2 — behavioural pins for guards nothing tested
// Each of these could be neutered with the whole battery green until this block existed. Found by
// qa/verification/scratch/p1/vacuity_sweep2.mjs, which stubs every named helper and moves every numeric cap.
{
  // 1. rpcPostcondition forced to always-true survived the battery — the plan path's evidence gate.
  //    Execute the real branch: an RPC that changed a row but did NOT confirm the postcondition must not
  //    report success, and must not report a passed postcondition (OTM §4.1; V60-D7, V61-D8).
  const eoaStart = src.indexOf('async function executeOneAction(');
  const eoaEnd = src.indexOf('\\nasync function executeActionPlan', eoaStart);
  const AsyncFn = Object.getPrototypeOf(async function () {}).constructor;
  const eoa = new AsyncFn('supabase', 'action', 'Deno',
    stripTS(src.slice(eoaStart, eoaEnd)).replace('async function executeOneAction(supabase, action)', 'async function __eoa(supabase, action)')
    + '\\n; return __eoa(supabase, action);');
  const rpcStub = (payload) => ({ rpc: async () => ({ data: payload, error: null }) });
  const unconfirmed = await eoa(rpcStub({ changed: true, authorized: true, postconditionPassed: false, reason: 'archived' }),
    { id: 'a1', operation: 'archive_company', targetIds: { companyId: 'c1' } }, { env: { get: () => undefined } });
  const confirmed = await eoa(rpcStub({ changed: true, authorized: true, postconditionPassed: true, reason: 'archived' }),
    { id: 'a1', operation: 'archive_company', targetIds: { companyId: 'c1' } }, { env: { get: () => undefined } });
  check('CONTRACT', 'an RPC that changed a row without confirming the postcondition is not a success (executed, not matched)',
    unconfirmed.success === false && unconfirmed.postconditionPassed === false
      && confirmed.success === true && confirmed.postconditionPassed === true,
    JSON.stringify({ unconfirmed, confirmed }));

  // 2. imageBytes stubbed to 0 survived — the only bound on an attached image.
  const ibStart = src.indexOf('function imageBytes(');
  const ib = new Function('base64', stripTS(src.slice(ibStart, src.indexOf('\\n}', ibStart) + 2)) + '\\n; return imageBytes(base64);');
  const oneMb = 'A'.repeat(Math.ceil(1024 * 1024 * 4 / 3));
  check('CONTRACT', 'imageBytes measures the decoded size, not zero and not the base64 length (executed)',
    Math.abs(ib(oneMb) - 1024 * 1024) < 4 && ib('') === 0,
    'imageBytes(1 MB of base64) = ' + ib(oneMb) + ', expected ~' + 1024 * 1024);

  // 3. NAMED_LOOKUP_ROW_CAP = 1 survived. The cap exists so a named entity is resolvable regardless of the
  //    display window; at 1 it cannot carry a disambiguation, which needs at least two candidates.
  const nlrc = Number((src.match(/const NAMED_LOOKUP_ROW_CAP = (\\d+)/) || [])[1]);
  check('CONTRACT', 'the named-entity lookup cap can still carry a disambiguation',
    nlrc >= 5 && nlrc <= 50,
    'NAMED_LOOKUP_ROW_CAP = ' + nlrc + '; below 5 a named lookup cannot present a real choice, above 50 it is a second window');

  // 4. HISTORY_FIELD_CAP = 9,999,999 survived — which is the V61-D1 P1 fix (one long turn must not be able
  //    to hard-stop a channel) pinned by the PRESENCE of shorten() rather than by its effect. Execute the
  //    real history mapper and require a long row to come back shortened and marked.
  const hStart = src.indexOf('const conversationHistory = (conversationRowsChronological || []).map(');
  const hEnd = src.indexOf('rejectedClaimCount };\\n  });', hStart) + 'rejectedClaimCount };\\n  });'.length;
  const histFn = new Function('conversationRowsChronological', 'historyWindowStart',
    stripTS(src.slice(hStart, hEnd)) + '\\n; return conversationHistory;');
  const long = 'x'.repeat(20000);
  const rows = histFn([{ command: long, output: { summary: long, turnVerdict: { executedOperationCount: 1, rejectedClaimCount: 0 } } }], 1);
  check('CONTRACT', 'a long history row is actually shortened, not merely passed through a shortener (executed)',
    rows[0].command.length < 1200 && rows[0].summary.length < 1200
      && /the full text is stored on the work order/.test(rows[0].command),
    'command ' + rows[0].command.length + ' chars, summary ' + String(rows[0].summary).length + ' chars');

  // 5. The model-context ceiling raised 100x survived. It has to sit below the real window of the smallest
  //    model this product is configured to call, or it stops being a gate at all.
  const mcw = Number((src.match(/envPositiveInt\\('SEM_AI_MODEL_CONTEXT_TOKENS', (\\d+)\\)/) || [])[1]);
  check('CONTRACT', 'the model-context ceiling is inside the range a real model actually offers',
    mcw >= 50000 && mcw <= 400000,
    'SEM_AI_MODEL_CONTEXT_TOKENS default = ' + mcw + '; above ~400k it is larger than any window this product calls, so it would never fire');
}

`;
writeFileSync(p, s.replace(anchor, BLOCK + anchor).replace(/\n/g, '\r\n'));
console.log('five behavioural pins added');
