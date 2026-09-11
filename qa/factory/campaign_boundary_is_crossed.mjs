#!/usr/bin/env node
// CAMPAIGN_BOUNDARY_IS_CROSSED — the round ends, and something other than a human notices.
//
// FOUNDER_POKE_NOT_REQUIRED proves the director keeps a work order moving across worker boundaries. This
// proves the harder one: the boundary where the campaign has ACTUALLY stalled every time, which is a
// verifier round ending. The report lands. The verdict says FAILED. And then nothing happens, until someone
// types KEEP WORKING.
//
// Every row below runs against a FIXTURE repository built in a temp directory. The live campaign is never
// read and never touched: a test that can only be run by putting the real Edge round at risk is a test that
// will not be run.
//
// WHAT IS PROVED HERE, precisely: the boundary is OBSERVED from durable files and classified correctly, and
// dispatch is refused unless the work order carries explicit permission. What is NOT proved here is a whole
// real round end-to-end — that needs a verifier session, and FOUNDER_POKE_NOT_REQUIRED already holds the
// claim that a director dispatches without input.
import { verifierRound, readVerdict, readWatchdog } from '../../scripts/factory-runner/handlers/verifier-round.mjs';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const NL = String.fromCharCode(10);
let pass = 0;
const failures = [];
const check = (name, ok, detail) => {
  if (ok) { pass++; console.log('OK   ' + name); }
  else { failures.push(name); console.log('FAIL ' + name + (detail ? NL + '       ' + detail : '')); }
};

const root = mkdtempSync(join(tmpdir(), 'boundary-'));
const scratch = join(root, 'qa/verification/scratch');
mkdirSync(scratch, { recursive: true });

const wo = (payload) => ({ work_order_id: 'wo-1', handoff: root, payload: { repo: root, ...payload } });
const write = (n, text) => writeFileSync(join(scratch, n), text);

try {
  // ── THE VERDICT IS A SENTENCE IN THE REPORT, NOT AN EXIT CODE ────────────────────────────────────
  // THE FIXTURE IS A REAL REPORT'S LAST LINE, copied from verifier #88's artifact including its backticks.
  // The first draft wrote the hash bare, which is not what the reports look like - they are markdown - and
  // the pattern that only matched the bare form passed this row while failing on every real report. A
  // fixture that agrees with the code instead of with the artifact proves the code agrees with itself.
  const BT = String.fromCharCode(96);
  const failedReport = [
    '## Findings',
    'V88-D1 448 of 448 leak.',
    '',
    'FAILED — ' + BT + 'supabase/functions/sem-ai-command/index.ts' + BT + ' sha256 '
      + BT + '49884ee67c4ce25c63b630a8974e8d8b9ae16e1a2705c6762a35e7379409d37f' + BT,
  ].join(NL);
  const v = readVerdict(failedReport);
  check('B1 the verdict is read from the report, with the hash the verifier measured ITSELF',
    v && v.verdict === 'FAILED'
      && v.sha256 === '49884ee67c4ce25c63b630a8974e8d8b9ae16e1a2705c6762a35e7379409d37f',
    JSON.stringify(v));

  check('B2 a report that names a verdict WITHOUT a hash is a finished round that broke its own reporting'
    + ' contract, not a running one',
    (() => { const r = readVerdict('PASS'); return r && r.verdict === 'PASS' && r.sha256 === null; })(),
    JSON.stringify(readVerdict('PASS')));

  check('B2b the hash is read whether or not the report wraps it in BACKTICKS, because the reports are'
    + ' markdown and the bare form was what this pattern originally required',
    (() => {
      const bare = readVerdict('FAILED — x sha256 '
        + '49884ee67c4ce25c63b630a8974e8d8b9ae16e1a2705c6762a35e7379409d37f');
      return bare && bare.sha256 === v.sha256;
    })(),
    'the backticked fixture above gave ' + (v && v.sha256 ? v.sha256.slice(0, 12) : 'NOTHING')
    + ' — a pattern that reads only one of the two forms reports the other as a verdict that named no bytes');

  check('B3 a report with no verdict line at all reads as NO verdict — an unfinished round is not a pass',
    readVerdict('## Findings' + NL + 'Everything looks fine to me.') === null,
    JSON.stringify(readVerdict('## Findings' + NL + 'Everything looks fine to me.')));

  // ── THE FOUR STATES A ROUND CAN BE IN ────────────────────────────────────────────────────────────
  const undispatched = await verifierRound.observe({ wo: null, workOrder: wo({ round: 91, campaign: 151 }) });
  check('B4 a round with NO dispatch record is waiting, and dispatch is REFUSED without explicit permission',
    undispatched.outcome === 'waiting' && !undispatched.dispatch
      && /DISPATCH NOT PERMITTED/.test(undispatched.nextAction),
    JSON.stringify(undispatched));

  check('B5 ...and it records the exact command verbatim, so the refusal costs nobody the knowledge of what'
    + ' would have run',
    /dispatch-isolated-verifier\.sh/.test(undispatched.nextAction),
    undispatched.nextAction);

  const permitted = await verifierRound.observe({
    workOrder: wo({ round: 91, campaign: 151, candidateSha: 'abc123', template: 't.txt', allowDispatch: true }),
  });
  check('B6 with permission on the work order, the same round OFFERS a dispatch the director can call',
    permitted.outcome === 'waiting' && typeof permitted.dispatch === 'function',
    JSON.stringify({ outcome: permitted.outcome, hasDispatch: typeof permitted.dispatch }));

  check('B7 the offered dispatch is IDEMPOTENT on the dispatch RECORD, not on this process\'s memory —'
    + ' a record that appears between the offer and the call stops it',
    (() => {
      write('verifier91_dispatch.json', '{"round":91}');
      const r = permitted.dispatch();
      return r && r.skipped;
    })(),
    'the director dispatches BEFORE recording the transition, so losing a run is invisible and duplicating'
    + ' one puts two agents on one surface');

  // A round that is out, with a quiet log. THE SHAPE THAT HAS BEEN MISREAD AS A STALL.
  write('verifier91_output.log', '');
  write('watchdog-verifier91_output.state', '[t] attempt 1: dispatching verifier');
  const running = await verifierRound.observe({ workOrder: wo({ round: 91, campaign: 151 }) });
  check('B8 a dispatched round with a ZERO-BYTE log is WAITING, not stalled and not failed',
    running.outcome === 'waiting' && running.waitingFor === 'verifier',
    JSON.stringify({ outcome: running.outcome, waitingFor: running.waitingFor }));

  check('B9 ...and it says so in as many words, because "no output for hours" has been read as a stall'
    + ' before and the report is written at the END',
    /not evidence of a stall/i.test(running.nextAction) && /verifier-liveness/.test(running.nextAction),
    running.nextAction);

  // THE BOUNDARY ITSELF: the report lands, and the state changes with nobody typing anything.
  write('verifier91_output.log', failedReport);
  const landed = await verifierRound.observe({ workOrder: wo({ round: 91, campaign: 151 }) });
  check('B10 CAMPAIGN_BOUNDARY_IS_CROSSED: the report landing moves the round from WAITING to'
    + ' REPAIR_REQUIRED, observed from a file, with no founder and no chat input',
    running.outcome === 'waiting' && landed.outcome === 'repair_required',
    JSON.stringify({ before: running.outcome, after: landed.outcome }));

  check('B11 the repair request names the bytes the verdict was about, so the next round cannot be'
    + ' composed against a different candidate by accident',
    /49884ee67c4c/.test(landed.nextAction), landed.nextAction);

  check('B12 it raises the closure as WORK rather than doing it — composing a successor is judgment,'
    + ' and a handler that composed one would be an unreviewed patch author',
    /judgment work/.test(landed.nextAction) && !landed.dispatch,
    landed.nextAction);

  // A PASS is a DEPLOY decision, and deploy authority is the founder's.
  write('verifier92_dispatch.json', '{"round":92}');
  write('verifier92_output.log', 'PASS — ' + BT + 'supabase/functions/sem-ai-command/index.ts' + BT
    + ' sha256 ' + BT + '3e8526bac4ef5681bb874d69b0cf79d2fd725c37b32b5f557299fa741e3262f3' + BT);
  const passed = await verifierRound.observe({ workOrder: wo({ round: 92, campaign: 152 }) });
  check('B13 a PASS completes the round and explicitly does NOT chain into a deploy',
    passed.outcome === 'complete' && /deploy authority is the founder/i.test(passed.nextAction),
    JSON.stringify(passed));

  // A watchdog abort is terminal, and it is a DIFFERENT thing from a verdict.
  write('verifier93_dispatch.json', '{"round":93}');
  write('verifier93_output.log', '');
  write('watchdog-verifier93_output.state',
    '[t] attempt 1: dispatching' + NL + '[t] ABORT: source sha changed under the round');
  const aborted = await verifierRound.observe({ workOrder: wo({ round: 93, campaign: 153 }) });
  check('B14 a watchdog ABORT is repair_required and is reported as the watchdog\'s finding, never as a'
    + ' verdict the verifier gave',
    aborted.outcome === 'repair_required' && /watchdog:/.test(aborted.evidence)
      && /sha change/.test(aborted.nextAction),
    JSON.stringify(aborted));

  check('B15 the watchdog reader counts ATTEMPTS and finds the abort line',
    (() => {
      const w = readWatchdog('[t] attempt 1: dispatching' + NL + '[t] attempt 2: dispatching' + NL
        + '[t] ABORT: exhausted');
      return w.attempts === 2 && /ABORT/.test(w.aborted);
    })(), JSON.stringify(readWatchdog('[t] attempt 1: dispatching' + NL + '[t] ABORT: exhausted')));

  // ── THE ROUND THAT ENDED WITHOUT RUNNING ─────────────────────────────────────────────────────────
  //
  // Verifier #89, live: 33 minutes, then a provider safeguard refusal, 491 bytes, and a watchdog line
  // saying "watchdog done". No verdict. Reported as `waiting`, that is a wait with no end condition; as
  // `repair_required`, it would say the candidate FAILED, which it did not - it was never judged.
  write('verifier94_dispatch.json', '{"round":94}');
  write('verifier94_output.log', "API Error: Opus 5's safeguards flagged this message"
    + ' (https://www.anthropic.com/legal/aup). Claude Code cannot respond to this message with Opus 5.'
    + NL + 'Try rephrasing the request in a new session or change your model.' + NL + 'Details: `[bio]`');
  write('watchdog-verifier94_output.state', '[t] attempt 1: dispatching' + NL
    + '[t] attempt 1: verifier produced a real report (491 bytes); watchdog done.');
  const unrun = await verifierRound.observe({ workOrder: wo({ round: 94, campaign: 154 }) });
  check('B17 a round whose WATCHDOG SAYS DONE with no verdict is blocked_external, not waiting — a wait'
    + ' with no end condition is how a dead round stays open for ever',
    unrun.outcome === 'blocked_external', JSON.stringify({ outcome: unrun.outcome }));

  check('B18 ...and it is explicitly NOT recorded as a FAIL, because the candidate was never judged',
    /must never be\s+recorded as one|not a FAIL/.test(unrun.nextAction) && !/repair_required/.test(unrun.outcome),
    unrun.nextAction);

  check('B19 ...and it names the remedy the provider itself states: a different model, because waiting'
    + ' cannot clear a model-scoped refusal',
    /different model/.test(unrun.nextAction) && /waiting cannot clear/.test(unrun.nextAction),
    unrun.nextAction);

  // A work order that cannot say what it is about must stop, not guess.
  const vague = await verifierRound.observe({ workOrder: { work_order_id: 'x', payload: {} } });
  check('B16 a work order that does not name a round and a repository STOPS — a handler that guesses'
    + ' which round it is about is worse than one that refuses',
    vague.outcome === 'blocked_founder', JSON.stringify(vague));
} finally {
  rmSync(root, { recursive: true, force: true });
}

console.log('');
console.log('campaign_boundary_is_crossed: ' + pass + ' passed, ' + failures.length + ' failed');
console.log('');
console.log('The round ending is the place this campaign has stalled every single time, and it stalled');
console.log('because it was nobody\'s job. It is a work order now: observed from the files the round itself');
console.log('writes, classified without a human, and raised as WORK rather than performed.');
console.log('NOT PROVED HERE: a whole real round end to end. That needs a verifier session, and');
console.log('FOUNDER_POKE_NOT_REQUIRED already holds the claim that a director dispatches with no input.');
if (failures.length) { console.log('FAILURES:'); for (const f of failures) console.log(' - ' + f); process.exit(1); }
