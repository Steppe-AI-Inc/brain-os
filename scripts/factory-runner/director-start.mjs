#!/usr/bin/env node
// `brain-factory director start`, in its repository-native form.
//
// This is the ENTRY POINT that a service manager, a scheduled task, or the acceptance harness launches. It
// is deliberately a separate file from director.mjs so the loop stays importable and testable without
// starting anything — a module that runs on import cannot be driven a tick at a time.
//
// It registers the handlers and starts the loop. It holds no state.
import { hostname } from 'node:os';
import { randomUUID } from 'node:crypto';
import { start, registerHandler } from './director.mjs';
import { acceptanceEcho } from './handlers/acceptance-echo.mjs';
import { verifierRound } from './handlers/verifier-round.mjs';

// `acceptance_echo` exists to BE PROVED — it is what FOUNDER_POKE_NOT_REQUIRED drives, and it does no real
// work. `verifier_round` is the real one: it reads an Edge verifier round from the files the round itself
// writes and says what state it is in, which is the boundary this campaign has stalled at every time.
//
// A HANDLER THAT IS NEVER REGISTERED IS DEAD CODE WITH PASSING TESTS. verifier-round.mjs was written, given
// 20 passing rows and a live check against two real rounds, and left unregistered — so no director could
// ever have dispatched it, while the acceptance case saying the founder is not the heartbeat went on
// passing over a handler nothing could reach. Registering it is the difference between a proof and a
// product, and forgetting to is how a campaign accumulates machinery it does not run.
registerHandler('acceptance_echo', acceptanceEcho);
registerHandler('verifier_round', verifierRound);

const argv = process.argv.slice(2);
const opt = (n, d) => { const i = argv.indexOf(n); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };

const nodeId = opt('--node-id', 'director-' + hostname() + '-' + randomUUID().slice(0, 8));
const intervalMs = Number(opt('--interval-ms', '2000'));
const maxIterations = Number(opt('--max-iterations', String(Infinity)));
// Lease length is a DEPLOYMENT choice, not a constant: a long lease means a killed director's work waits
// that long for a successor, and a short one means a paused process loses the lease it still wants.
const leaseSeconds = Number(opt('--lease-seconds', '60'));

// A DIRECTOR THAT DIES ON AN UNHANDLED REJECTION IS A DIRECTOR THAT STOPS BEING A HEARTBEAT. Anything this
// loop cannot classify is logged and the loop continues; the work order it was looking at keeps its state
// and is re-derived on the next tick, which is the whole point of holding nothing in memory.
process.on('unhandledRejection', (e) => {
  console.log('[director] unhandled rejection, continuing: ' + String(e && e.message).slice(0, 300));
});

start({ nodeId, intervalMs, maxIterations, leaseSeconds })
  .then((n) => console.log('[director] stopped after ' + n + ' iterations'))
  .catch((e) => { console.log('[director] fatal: ' + String(e && e.message)); process.exit(1); });
