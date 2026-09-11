// THE CAMPAIGN BOUNDARY, AS A WORK ORDER.
//
// THE DEFECT THIS CLOSES. A verifier round ends. Its report says FAILED. Nothing happens — until a human
// types KEEP WORKING. The founder named that a Factory defect in its own right: "Founder must NOT be the
// Factory heartbeat", and the chat session must not be the scheduler either. The boundary between one round
// and the next is the exact place the campaign has always stopped, because it is the one step that was never
// anybody's job.
//
// So it becomes one. This handler reads a round from the REPOSITORY — the only durable record of it — and
// says what state it is in and what happens next. The director polls it on its own schedule, in its own OS
// process, with nobody watching.
//
// WHAT IT READS, and every one of these is a file some other process wrote:
//
//     qa/verification/scratch/verifier<N>_dispatch.json        the dispatch record: a round EXISTS
//     qa/verification/scratch/verifier<N>_output.log           the report, and its verdict line
//     qa/verification/scratch/watchdog-verifier<N>_output.state the watchdog's attempts and aborts
//
// IT DOES NOT READ A CHAT SESSION, a checkpoint written by the implementing agent, or anything describing
// what somebody intended. A round that produced no report has not finished, however confident the notes are.
//
// WHAT IT WILL NOT DO. It never decides that a candidate is good, never composes a fix, never touches the
// deploy surface, and never dispatches anything at all unless `allowDispatch` is explicitly true on the work
// order. The judgment between rounds — reading findings, composing a successor, re-pinning counts — is
// agent work, and this handler's job is to make sure that work is REQUESTED, not to do it.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const NL = String.fromCharCode(10);

const scratch = (repo) => join(repo, 'qa/verification/scratch');
const dispatchPath = (repo, n) => join(scratch(repo), 'verifier' + n + '_dispatch.json');
const logPath = (repo, n) => join(scratch(repo), 'verifier' + n + '_output.log');
const statePath = (repo, n) => join(scratch(repo), 'watchdog-verifier' + n + '_output.state');

const readOr = (p, fallback = '') => { try { return readFileSync(p, 'utf8'); } catch { return fallback; } };

/**
 * The verdict, read from the report the verifier actually wrote.
 *
 * A VERDICT IS A SENTENCE IN THE REPORT, NEVER AN EXIT CODE. Verifiers exit non-zero for reasons that have
 * nothing to do with their finding — an already-red suite in their own battery will do it — and a round that
 * crashed exits non-zero too. The contract is a final line naming PASS or FAILED together with the sha256
 * the verifier measured itself, so the verdict and the bytes it is about arrive as one statement.
 */
export function readVerdict(text) {
  const lines = String(text).split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  for (let i = lines.length - 1; i >= 0; i--) {
    // THE HASH IS USUALLY IN BACKTICKS, because the reports are markdown. The first version of this pattern
    // required a bare hash, matched nothing on #88's real report, and fell through to the no-hash branch —
    // so a verdict that named its bytes precisely was reported as "bytes it did not name". The fixture in
    // the regression had copied THIS CODE's assumption instead of a real report, so it agreed. Found only
    // by running the handler against the live round, which is why that is a step and not a formality.
    const m = /^(PASS|FAILED)\s*[—-]\s*(.+?)\s+sha256\s+['"`]?([0-9a-f]{64})['"`]?/i.exec(lines[i]);
    if (m) return { verdict: m[1].toUpperCase(), surface: m[2].replace(/[`'"]/g, ''), sha256: m[3], line: lines[i] };
  }
  // A report that names a verdict WITHOUT the hash is not nothing — it is a round that finished and broke
  // its own reporting contract, and saying so is more useful than reporting it as still running.
  for (let i = lines.length - 1; i >= 0; i--) {
    const m = /^(PASS|FAILED)\b/i.exec(lines[i]);
    if (m) return { verdict: m[1].toUpperCase(), surface: null, sha256: null, line: lines[i] };
  }
  return null;
}

/** What the watchdog says about its own attempts. Aborts and exhaustion are terminal for the round. */
export function readWatchdog(text) {
  const lines = String(text).split(/\r?\n/).filter(Boolean);
  const attempts = lines.filter((l) => /attempt \d+: dispatching/.test(l)).length;
  const aborted = lines.find((l) => /ABORT|source sha changed|exhausted/i.test(l)) || null;
  // THE WATCHDOG CAN FINISH WITHOUT A ROUND FINISHING. Verifier #89 hit a provider safeguard refusal and
  // the watchdog logged "watchdog done" over 491 bytes of API error. If nobody reads this line, a round
  // that never started waits for a report that will never be written — this handler said `waiting` about
  // it, forever, which is the quiet half of the same defect.
  const done = /watchdog done/i.test(text);
  return { attempts, aborted, done, last: lines[lines.length - 1] || null };
}

export const verifierRound = {
  /**
   * `workOrder.payload` carries: { repo, round, campaign, candidateSha, template, allowDispatch }.
   *
   * `repo` is the CONTROL repository that holds the scratch records — the same tree the dispatcher writes
   * into — which is not necessarily the tree holding the candidate.
   */
  async observe({ workOrder }) {
    const p = workOrder.payload || {};
    const repo = p.repo;
    const round = Number(p.round);
    if (!repo || !Number.isFinite(round)) {
      return {
        outcome: 'blocked_founder',
        evidence: 'payload: ' + JSON.stringify(p),
        nextAction: 'this work order does not say which round in which repository it is about, and a'
          + ' handler that guesses that is worse than one that stops',
      };
    }
    if (!existsSync(repo)) {
      return { outcome: 'blocked_external', evidence: repo + ' does not exist',
        nextAction: 'the control repository is not on this machine' };
    }

    const dispatched = existsSync(dispatchPath(repo, round));

    // ── NOT DISPATCHED YET ───────────────────────────────────────────────────────────────────────────
    if (!dispatched) {
      const cmd = ['bash', 'scripts/factory-runner/dispatch-isolated-verifier.sh',
        String(p.candidateSha || ''), String(p.campaign || ''), String(round), String(p.template || '')];
      if (!p.allowDispatch) {
        return {
          outcome: 'waiting', waitingFor: 'agent',
          evidence: 'round ' + round + ' has no dispatch record',
          nextAction: 'DISPATCH NOT PERMITTED on this work order. The exact command is recorded so a human'
            + ' or a later work order can run it verbatim: ' + cmd.join(' '),
        };
      }
      return {
        outcome: 'waiting', waitingFor: 'agent',
        evidence: 'round ' + round + ' has no dispatch record; dispatching',
        nextAction: 'dispatch verifier #' + round,
        // IDEMPOTENT ON THE DISPATCH RECORD, not on this handler's memory. The director dispatches BEFORE
        // it records the transition, because losing a run is invisible and duplicating one puts two agents
        // on one surface. The dispatcher itself also refuses an existing worktree.
        dispatch: () => {
          if (existsSync(dispatchPath(repo, round))) return { skipped: 'a dispatch record already exists' };
          execFileSync(cmd[0], cmd.slice(1), { cwd: repo, encoding: 'utf8', timeout: 300000 });
          return { dispatched: cmd.join(' ') };
        },
      };
    }

    // ── DISPATCHED: what does the round itself say? ──────────────────────────────────────────────────
    const log = readOr(logPath(repo, round));
    const wd = readWatchdog(readOr(statePath(repo, round)));
    const verdict = readVerdict(log);

    if (verdict) {
      const where = 'verifier #' + round + ': ' + verdict.line;
      if (verdict.verdict === 'PASS') {
        return {
          outcome: 'complete',
          evidence: where,
          nextAction: 'nothing automatic. A PASS is a DEPLOY decision and deploy authority is the'
            + " founder's, so this round ends here and the next step is a human one.",
        };
      }
      // FAILED is not a failure of the Factory. It is the Factory working, and it is the state the
      // campaign has always stalled in.
      return {
        outcome: 'repair_required',
        evidence: where,
        nextAction: 'round ' + round + ' FAILED on ' + (verdict.sha256 || 'bytes it did not name')
          + '. The next round needs an agent to read its findings, compose a successor, re-pin the moved'
          + ' counts on one commit, run the gates, freeze, bundle and dispatch. That is judgment work; this'
          + ' handler raises it as work rather than doing it.',
      };
    }

    if (wd.aborted) {
      return {
        outcome: 'repair_required',
        evidence: 'watchdog: ' + wd.aborted,
        nextAction: 'the watchdog stopped the round before a report existed — read its state file before'
          + ' dispatching anything, because a sha change means the candidate moved underneath it',
      };
    }

    // THE WATCHDOG SAYS DONE AND THERE IS NO VERDICT. The round is over and produced nothing to read.
    // Verifier #89 is the live case: 33 minutes, then a provider safeguard refusal, 491 bytes, and a
    // watchdog line saying done. Reporting this as `waiting` would be a wait with no end condition.
    if (wd.done) {
      const head = String(log).trim().split(/\r?\n/)[0] || '(the log is empty)';
      return {
        outcome: 'blocked_external',
        evidence: 'the watchdog finished but the log carries NO VERDICT (' + log.length + ' bytes): ' + head,
        nextAction: 'round ' + round + ' ENDED WITHOUT RUNNING. This is not a FAIL and must never be'
          + ' recorded as one — the candidate was not judged. Re-dispatch it, and if the log shows a'
          + ' model-scoped provider refusal, on a different model: waiting cannot clear a refusal and the'
          + ' same model with the same prompt reproduces it exactly.',
      };
    }

    // ── STILL RUNNING. The liveness question is separate from the progress question. ─────────────────
    const age = (() => {
      try { return Date.now() - statSync(dispatchPath(repo, round)).mtimeMs; } catch { return 0; }
    })();
    const logBytes = (() => { try { return statSync(logPath(repo, round)).size; } catch { return 0; } })();
    return {
      outcome: 'waiting',
      waitingFor: 'verifier',
      evidence: 'round ' + round + ' out for ' + Math.round(age / 60000) + ' min, attempt ' + wd.attempts
        + ', log ' + logBytes + ' bytes',
      // A QUIET LOG IS NOT A STALLED ROUND. The verifier's log is written when its session ends, so zero
      // bytes after hours is the NORMAL shape of a long round and has been mistaken for a stall before.
      // Liveness belongs to verifier-liveness.mjs, which asks five independent questions; this handler
      // reports progress and says so.
      nextAction: 'wait. A zero-byte log is not evidence of a stall — the report is written at the end.'
        + ' Ask verifier-liveness.mjs before concluding anything about whether it is alive.',
    };
  },
};

export default verifierRound;
