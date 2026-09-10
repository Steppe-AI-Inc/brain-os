// Capability gate applied to every child process the orchestrator spawns.
//
// DEFENSE IN DEPTH ONLY. The primary boundary is that the worker classes have no shell, no
// network primitive and no file access outside their sandbox (worker-policy.mjs, enforced from
// the live init frame), and that the Work PC holds no production write/admin credential at all
// (founder decision 2026-09-10, A4). This module exists for the children that DO get a process
// environment - the allowlisted guard executor's node child, and the historical single Director -
// so that even a process with a shell finds nothing usable:
//
//   - the environment is an explicit ALLOWLIST; every credential-shaped variable is absent
//   - PATH is rewritten to start with a shim directory whose supabase/psql/vercel/pg_* entries
//     print CAPABILITY_ABSENT and exit 3, so a bare CLI name resolves to the shim, not the binary
//
// Nothing here matches command text. It removes what the process can find.
import { existsSync, mkdirSync, writeFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { RUNNER_DIR } from './paths.mjs';

export const SHIMS_DIR = join(RUNNER_DIR, 'shims');
export const SHIMMED = Object.freeze(['supabase', 'psql', 'pgcli', 'pg_dump', 'pg_restore', 'vercel']);

const STRIP_PREFIXES = ['SUPABASE_', 'PG', 'VERCEL_', 'NEXT_PUBLIC_SUPABASE_', 'GITHUB_', 'GH_', 'NPM_', 'AWS_', 'DATABASE_'];
const STRIP_EXACT = new Set(['DATABASE_URL', 'SUPABASE_ACCESS_TOKEN', 'SUPABASE_SERVICE_ROLE_KEY', 'VERCEL_OIDC_TOKEN', 'VERCEL_TOKEN']);

const KEEP_EXACT = new Set([
  'SystemRoot', 'SYSTEMROOT', 'windir', 'WINDIR', 'ComSpec', 'COMSPEC', 'PATHEXT',
  'TEMP', 'TMP', 'USERPROFILE', 'HOMEDRIVE', 'HOMEPATH', 'LOCALAPPDATA', 'APPDATA',
  'USERNAME', 'COMPUTERNAME', 'OS', 'PROCESSOR_ARCHITECTURE', 'NUMBER_OF_PROCESSORS',
  'SystemDrive', 'SYSTEMDRIVE', 'ProgramFiles', 'ProgramData', 'CommonProgramFiles',
  'HOME', 'LANG', 'TZ',
]);
const KEEP_PREFIXES = ['QA_', 'CLAUDE_', 'ANTHROPIC_', 'FAKE_', 'WORKER_', 'DIRECTOR_', 'NODE_'];

export function ensureShims() {
  mkdirSync(SHIMS_DIR, { recursive: true });
  for (const name of SHIMMED) {
    const cmd = join(SHIMS_DIR, name + '.cmd');
    if (!existsSync(cmd)) {
      writeFileSync(cmd,
        '@echo off\r\n'
        + 'echo CAPABILITY_ABSENT: ' + name + ' is not available to Work-PC QA worker processes (PRODUCTION_SQL_PROHIBITED_ON_WORK_PC, founder decision 2026-09-10). 1>&2\r\n'
        + 'exit /b 3\r\n');
    }
    const sh = join(SHIMS_DIR, name);
    if (!existsSync(sh)) {
      writeFileSync(sh, '#!/bin/sh\necho "CAPABILITY_ABSENT: ' + name + ' is not available to Work-PC QA worker processes" >&2\nexit 3\n');
    }
  }
  return SHIMS_DIR;
}

function shouldStrip(k) {
  if (STRIP_EXACT.has(k)) return true;
  const u = k.toUpperCase();
  return STRIP_PREFIXES.some((p) => u.startsWith(p));
}
function shouldKeep(k) {
  if (KEEP_EXACT.has(k)) return true;
  const u = k.toUpperCase();
  return KEEP_PREFIXES.some((p) => u.startsWith(p));
}

/**
 * Build the child environment from an allowlist. Anything credential-shaped is dropped first so a
 * "keep" prefix can never smuggle one back in (QA_SUPABASE_BIN is deliberately NOT kept).
 */
export function gatedEnv(base = process.env, extra = {}) {
  const shims = ensureShims();
  const out = {};
  for (const [k, v] of Object.entries(base)) {
    if (shouldStrip(k)) continue;
    if (k === 'QA_SUPABASE_BIN') continue;
    if (shouldKeep(k)) out[k] = v;
  }
  const pathKey = Object.keys(base).find((k) => k.toUpperCase() === 'PATH') || 'PATH';
  out[pathKey] = shims + ';' + (base[pathKey] || '');
  out.QA_CAPABILITY_GATE = '1';
  return { ...out, ...extra };
}

/** Self-check used by the acceptance harness: what does a gated child actually see? */
export function auditGatedEnv(env = gatedEnv()) {
  const leaked = Object.keys(env).filter((k) => shouldStrip(k));
  const shimFirst = String(env.PATH || env.Path || '').split(';')[0] === SHIMS_DIR;
  const shimsPresent = SHIMMED.every((n) => existsSync(join(SHIMS_DIR, n + '.cmd')));
  return { ok: leaked.length === 0 && shimFirst && shimsPresent, leaked, shimFirst, shimsPresent, shims: readdirSync(SHIMS_DIR) };
}
