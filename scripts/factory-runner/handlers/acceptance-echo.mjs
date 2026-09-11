// A HANDLER THAT EXISTS TO BE PROVED, NOT TO BE USEFUL.
//
// FOUNDER_POKE_NOT_REQUIRED needs a work order that crosses a REAL worker boundary — a separate OS process
// that finishes on its own schedule and leaves a durable artifact — without the Edge campaign being put at
// risk to demonstrate it. So this handler dispatches a detached process that sleeps and writes a file, and
// the director must notice, ingest it, and dispatch the next round with nobody typing anything.
//
// IT MUST BE A REAL PROCESS AND A REAL ARTIFACT. A handler that resolved in-memory would prove that a loop
// can count to two, which is not the claim. The claim is that work completing OUTSIDE the director, after
// the session that started everything has stopped participating, is noticed and acted on.
//
// IDEMPOTENCE IS THE HANDLER'S JOB. The director dispatches BEFORE it records the transition, because
// losing a run is invisible and duplicating one puts two agents on one surface. So `dispatch` here is
// keyed on the round number and refuses to start a second worker for a round that already has one.
import { spawn } from 'node:child_process';
import { mkdirSync, readdirSync, existsSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROUNDS_REQUIRED = 2;

const dirFor = (wo) => join(wo.handoff || '.', 'acceptance-echo', String(wo.work_order_id));
const artifactsIn = (d) => (existsSync(d) ? readdirSync(d).filter((f) => /^round-\d+\.json$/.test(f)) : []);
const markersIn = (d) => (existsSync(d) ? readdirSync(d).filter((f) => /^dispatched-\d+$/.test(f)) : []);

export const acceptanceEcho = {
  async observe({ workOrder }) {
    const d = dirFor(workOrder);
    mkdirSync(d, { recursive: true });
    const artifacts = artifactsIn(d);
    const markers = markersIn(d);
    const done = artifacts.length;
    const started = markers.length;

    // Every round that was asked for has produced its artifact.
    if (done >= ROUNDS_REQUIRED) {
      return {
        outcome: 'complete',
        evidence: 'artifacts: ' + JSON.stringify(artifacts),
        nextAction: 'nothing — ' + done + ' of ' + ROUNDS_REQUIRED + ' rounds produced durable artifacts',
      };
    }

    // A round is out and has not landed yet.
    if (started > done) {
      const age = Date.now() - Number(readFileSync(join(d, 'dispatched-' + started), 'utf8').trim() || 0);
      // A worker that has been out far longer than it should is DEAD, not merely slow. The lease elsewhere
      // in the Factory does this with a heartbeat; here the artifact is the only liveness signal there is,
      // so the bound is explicit rather than pretended.
      if (age > 60000) {
        return { outcome: 'dead', evidence: 'round ' + started + ' dispatched ' + Math.round(age / 1000)
          + 's ago with no artifact', nextAction: 're-dispatch round ' + started,
          dispatch: () => runRound(d, started, true), waitingFor: 'agent' };
      }
      return { outcome: 'waiting', waitingFor: 'agent',
        evidence: 'round ' + started + ' out for ' + Math.round(age / 1000) + 's; ' + done + ' landed',
        nextAction: 'wait for round ' + started + ' to write its artifact' };
    }

    // Nothing is out and the work is unfinished: dispatch the next round.
    const next = done + 1;
    return {
      outcome: 'waiting',
      waitingFor: 'agent',
      evidence: done + ' of ' + ROUNDS_REQUIRED + ' artifacts present; no round outstanding',
      nextAction: 'dispatch round ' + next,
      dispatch: () => runRound(d, next, false),
    };
  },
};

// KEYED ON THE ROUND, so a director that crashes between dispatching and recording does not start a second
// worker for the same round when it restarts. The marker is written BEFORE the spawn for the same reason:
// a marker with no process is recoverable (it times out and re-dispatches), a process with no marker is a
// duplicate nobody can see.
function runRound(d, round, force) {
  const marker = join(d, 'dispatched-' + round);
  if (existsSync(marker) && !force) return { round, already: true };
  writeFileSync(marker, String(Date.now()));

  // ARGV INDEXING UNDER `node -e`: there is NO script path, so process.argv[1] is the FIRST extra
  // argument. Measured: `node -e "..." AAA BBB` gives [execPath, "AAA", "BBB"]. Reading from index 2
  // made the worker write to the wrong path with a NaN delay, so no artifact ever arrived and the
  // director waited for ever - correctly, on a worker that was broken.
  const script = [
    'const fs=require("fs");',
    'setTimeout(()=>{',
    '  fs.writeFileSync(process.argv[1], JSON.stringify({round:Number(process.argv[2]),',
    '    pid:process.pid, finished_at:new Date().toISOString()},null,2));',
    '}, Number(process.argv[3]));',
  ].join('');

  const child = spawn(process.execPath,
    ['-e', script, join(d, 'round-' + round + '.json'), String(round), '2500'],
    { detached: true, stdio: 'ignore' });
  child.unref();
  return { round, pid: child.pid };
}
