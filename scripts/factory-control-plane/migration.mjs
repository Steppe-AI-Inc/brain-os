#!/usr/bin/env node
// THE FACTORY V1 CONTROL-PLANE MIGRATION: compose it, hash it, apply it to a DISPOSABLE plane.
//
//   node scripts/factory-control-plane/migration.mjs compose            print the migration (one transaction's statements)
//   node scripts/factory-control-plane/migration.mjs sha256             print its sha256 and the parts it is made of
//   node scripts/factory-control-plane/migration.mjs apply --admin <url>   BEGIN; <migration>; COMMIT; on that plane
//
// WHAT "THE MIGRATION" IS. The ordered concatenation of supabase/control-plane/v1/NNN_*.sql, each part preceded by one marker line.
// It opens and closes no transaction itself: `apply` wraps it in exactly one, and the founder's prepared live step is these same
// bytes inside the Director-specified wrapper (WO-1, AC-11). The composition is deterministic: the same tree gives the same bytes,
// so the sha256 printed here is the one a receipt records.
//
// `apply` is a DEVELOPER tool for disposable planes. It refuses the Brain OS production project by name, as every Factory tool
// does. It is not the founder's live path: applying to the live plane is a founder action (BLOCKED - FOUNDER), prepared
// separately and never run by the candidate.
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, realpathSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const MIGRATION_DIR = join(ROOT, 'supabase', 'control-plane', 'v1');
const PRODUCTION_MARKS = ['pvphxgrtdfrudejjhzjk'];

export function parts() {
  return readdirSync(MIGRATION_DIR).filter((f) => /^\d{3}_[a-z0-9_]+\.sql$/.test(f)).sort();
}

// LF only, whatever the checkout's line endings: the bytes must not depend on the machine that composed them
const lf = (s) => s.replace(/\r\n/g, '\n');

export function compose() {
  const out = ['-- FACTORY CONTROL PLANE V1 MIGRATION (composed from supabase/control-plane/v1; one transaction, opened by the caller)\n'];
  for (const f of parts()) {
    const body = lf(readFileSync(join(MIGRATION_DIR, f), 'utf8'));
    out.push('\n-- ==== part ' + f + ' ====\n');
    out.push(body.endsWith('\n') ? body : body + '\n');
  }
  return out.join('');
}

export const sha256 = (s) => createHash('sha256').update(s, 'utf8').digest('hex');

/** Apply the migration in ONE transaction on the plane `adminUrl` names. Returns { sha256 }. */
export async function apply(adminUrl, { log = () => {} } = {}) {
  const lower = String(adminUrl || '').toLowerCase();
  for (const m of PRODUCTION_MARKS) if (lower.includes(m)) throw new Error('REFUSING - the URL names the Brain OS PRODUCTION project (' + m + ')');
  const sql = compose();
  const { default: pg } = await import('pg');
  const client = new pg.Client({ connectionString: adminUrl });
  await client.connect();
  try {
    await client.query('begin');
    try {
      await client.query(sql);
      await client.query('commit');
    } catch (e) {
      try { await client.query('rollback'); } catch { /* the connection ended */ }
      throw e;
    }
  } finally {
    await client.end();
  }
  log('applied factory v1 migration sha256 ' + sha256(sql));
  return { sha256: sha256(sql) };
}

const isEntry = () => { try { const a = realpathSync(resolve(process.argv[1] || '')), b = realpathSync(fileURLToPath(import.meta.url)); return process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b; } catch { return false; } };
if (isEntry()) {
  const cmd = process.argv[2];
  const arg = (n) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : null; };
  if (cmd === 'compose') process.stdout.write(compose());
  else if (cmd === 'sha256') { const s = compose(); console.log(sha256(s) + '  factory-v1-migration.sql'); for (const f of parts()) console.log('  part ' + f + '  ' + sha256(lf(readFileSync(join(MIGRATION_DIR, f), 'utf8')))); }
  else if (cmd === 'apply') {
    const url = arg('--admin');
    if (!url) { console.log('usage: migration.mjs apply --admin <postgresql url of a DISPOSABLE plane provisioned as 69df2f52>'); process.exit(2); }
    try { const r = await apply(url); console.log('applied; migration sha256 ' + r.sha256); } catch (e) { console.log('FAILED - ' + (e && e.message)); process.exit(1); }
  } else { console.log('usage: migration.mjs compose | sha256 | apply --admin <url>'); process.exit(2); }
}
