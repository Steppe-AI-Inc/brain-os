// SUPERVISOR_STATE.json - real operational state, not documentation.
//
// Written atomically (tmp + rename) because a Windows restart or a kill -9 in the middle
// of a write would otherwise leave a truncated JSON file, and the whole point of this file
// is that a cold-started supervisor can trust it. A corrupt state file is recovered from
// rather than crashed on: an unreadable state must never be the reason QA stops.
import { readFileSync, writeFileSync, renameSync, existsSync, copyFileSync } from 'node:fs';
import { P } from './paths.mjs';

export const STATES = [
  'STARTING', 'WATCHING', 'NEW_BUILD_DETECTED', 'FIX_REPORT_DETECTED',
  'QA_STARTING', 'QA_RUNNING', 'QA_CHECKPOINTING', 'WAITING_FOR_DEPLOYMENT',
  'WAITING_FOR_HOME_PC', 'WAITING_FOR_NETWORK', 'RETEST_STARTING', 'RECOVERING',
  'BLOCKED_CLAUDE_AUTH', 'PAUSED_RESOURCE_LIMIT', 'ERROR', 'STOPPED_BY_POLICY',
];

export const nowIso = () => new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');

export function readState() {
  try {
    return JSON.parse(readFileSync(P.supervisorState, 'utf8'));
  } catch (err) {
    // Preserve the damaged file rather than overwrite it silently - if state got corrupted
    // that is itself evidence worth keeping.
    if (existsSync(P.supervisorState)) {
      try { copyFileSync(P.supervisorState, P.supervisorState + '.corrupt-' + Date.now()); } catch {}
    }
    return { schema_version: 1, supervisor_state: 'STARTING', _recovered_from_corrupt_state: String(err) };
  }
}

export function writeState(patch) {
  const cur = readState();
  const next = { ...cur, ...patch };
  if (patch.supervisor_state && !STATES.includes(patch.supervisor_state)) {
    throw new Error(`Refusing to write unknown supervisor_state "${patch.supervisor_state}"`);
  }
  const tmp = P.supervisorState + '.tmp';
  writeFileSync(tmp, JSON.stringify(next, null, 2) + '\n');
  renameSync(tmp, P.supervisorState);
  return next;
}

// A state transition is also the moment worth logging - transitions are what an operator
// reads back afterwards to understand what the node did overnight.
export function transition(to, fields = {}) {
  const s = writeState({ supervisor_state: to, last_heartbeat: nowIso(), ...fields });
  return s;
}

export function heartbeat(fields = {}) {
  return writeState({ last_heartbeat: nowIso(), ...fields });
}
