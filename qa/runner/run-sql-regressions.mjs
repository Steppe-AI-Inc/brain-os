#!/usr/bin/env node
// Safe runner for qa/scenarios-runner/*.sql against the LINKED project.
//
// Born from the 2026-09-07 incident: a script whose header COMMENT said "Caller wraps this in
// BEGIN;...ROLLBACK;" was selected by a sweep that grepped for "rollback;", ran unwrapped, and
// its writes persisted to production. This runner never trusts a file to manage its own
// transaction:
//   - every script is executed as   BEGIN; <file> ROLLBACK;   via a generated temp file
//     (an inner begin/rollback becomes a harmless nested no-op / warning);
//   - a file containing a bare COMMIT statement is REFUSED, not run;
//   - verdict JSON is written per script; a --only <name> filter runs one.
// Usage: node qa/runner/run-sql-regressions.mjs [--only sc056_cross_company_isolation] [--out <dir>]
import { readFileSync, writeFileSync, readdirSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { QA_DIR } from './lib/paths.mjs';

const args = process.argv.slice(2);
const only = args.includes('--only') ? args[args.indexOf('--only') + 1] : null;
const outDir = args.includes('--out') ? args[args.indexOf('--out') + 1] : join(QA_DIR, 'runs', 'sql-regressions');
const scriptsDir = join(QA_DIR, 'scenarios-runner');

function resolveSupabase() {
  if (process.env.QA_SUPABASE_BIN && existsSync(process.env.QA_SUPABASE_BIN)) return process.env.QA_SUPABASE_BIN;
  const cacheRoot = join(process.env.LOCALAPPDATA || '', 'npm-cache', '_npx');
  if (existsSync(cacheRoot)) for (const d of readdirSync(cacheRoot)) {
    const exe = join(cacheRoot, d, 'node_modules', '@supabase', 'cli-windows-x64', 'bin', 'supabase.exe');
    if (existsSync(exe)) return exe;
  }
  throw new Error('supabase CLI not found (set QA_SUPABASE_BIN)');
}

const exe = resolveSupabase();
mkdirSync(outDir, { recursive: true });
const files = readdirSync(scriptsDir).filter((f) => f.endsWith('.sql') && (!only || f.startsWith(only)));
const summary = [];
for (const f of files) {
  const src = readFileSync(join(scriptsDir, f), 'utf8');
  const stripped = src.replace(/--.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
  if (/\bcommit\s*;/i.test(stripped)) { summary.push({ script: f, result: 'REFUSED', reason: 'contains COMMIT' }); console.log('REFUSED  ' + f + '  (contains COMMIT)'); continue; }
  const wrapped = 'begin;\n' + src + '\nrollback;\n';
  const tmp = join(outDir, '.' + f + '.wrapped.sql');
  writeFileSync(tmp, wrapped);
  let out = '';
  try { out = execFileSync(exe, ['db', 'query', '--linked', '--file', tmp], { encoding: 'utf8', timeout: 180_000, maxBuffer: 16 * 1024 * 1024 }); }
  catch (e) { out = String(e.stdout || '') + String(e.stderr || e.message); }
  writeFileSync(join(outDir, f.replace(/\.sql$/, '.json')), out);
  let verdict = null, error = null;
  try { const j = JSON.parse(out.slice(out.indexOf('{'))); if (j.error) error = String(j.error.message).slice(0, 200); else verdict = (j.rows && j.rows[0] && (j.rows[0].verdict || j.rows[0])) || null; } catch { error = out.slice(0, 200); }
  const ap = verdict && typeof verdict === 'object' ? Object.entries(verdict).find(([k]) => /all_pass|^pass$/i.test(k))?.[1] : undefined;
  summary.push({ script: f, result: error ? 'ERROR' : (ap === true || ap === 'true') ? 'PASS' : (ap === false || ap === 'false') ? 'FAIL' : 'NO_ALL_PASS_KEY', error });
  console.log((error ? 'ERROR  ' : (ap === true || ap === 'true') ? 'PASS   ' : (ap === false || ap === 'false') ? 'FAIL   ' : 'INFO   ') + f + (error ? '  ' + error : ''));
}
writeFileSync(join(outDir, '_summary.json'), JSON.stringify({ run_at: new Date().toISOString(), wrapped_in_transaction: true, summary }, null, 2));
console.log('summary -> ' + join(outDir, '_summary.json'));
