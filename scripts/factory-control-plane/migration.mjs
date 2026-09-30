#!/usr/bin/env node
// THE FACTORY V1 CONTROL-PLANE MIGRATION: compose it, hash it, apply it to a DISPOSABLE plane.
//
//   node scripts/factory-control-plane/migration.mjs compose     print the migration (the v1 files, one transaction's statements)
//   node scripts/factory-control-plane/migration.mjs sha256      print its sha256 and the parts it is made of
//   FACTORY_DISPOSABLE_ADMIN_URL=<url> node scripts/factory-control-plane/migration.mjs apply
//                                                              BEGIN; <migration>; COMMIT; on that DISPOSABLE plane
//
// WHAT "THE MIGRATION" IS (contract §1, WO-1 r3). Every .sql file under supabase/control-plane/v1/, in byte order of path. The
// live-migration step is NOT built here: the verifier builds it from the committed bytes with the Director instrument
// qa/verification/auto-enrollment-v1/tools/build_live_migration_step.mjs, and the founder applies exactly that file. `compose`
// prints the parts, each preceded by one marker line, for reading; its sha256 is a developer label, not the step's.
//
// `apply` is a DEVELOPER tool for disposable planes, and it is not the founder's live path.
//   * The admin URL is read ONLY from the environment variable FACTORY_DISPOSABLE_ADMIN_URL: a database credential is never taken
//     from the command line (S-12). Any argument after the subcommand is a usage error, and it is never echoed.
//   * It refuses, before connecting, a URL that names the Brain OS production project or the live Factory plane.
//   * It refuses a superuser login after connecting: the live applying login is not a superuser, and a superuser skips every
//     privilege check the live plane makes. The developer suites apply through qa/factory/v1/applying_role_plane.mjs instead,
//     as a login aligned to the live applying login.
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, realpathSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const MIGRATION_DIR = join(ROOT, 'supabase', 'control-plane', 'v1');
// refused by name before any connection: the Brain OS production project, and the live Factory control plane
export const REFUSED_REFS = ['pvphxgrtdfrudejjhzjk', 'npvhuoozkbexddnvkqsj'];

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

/** The refusal for a URL that names a refused project, or null. Pure; nothing is connected. */
export function refusedRef(url) {
  const raw = String(url || '');
  const lenient = raw.replace(/%([0-9a-fA-F]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
  const text = (raw + '\n' + lenient).toLowerCase();
  const hit = REFUSED_REFS.find((m) => text.includes(m));
  return hit ? 'REFUSING - the URL names ' + (hit === REFUSED_REFS[0] ? 'the Brain OS PRODUCTION project' : 'the LIVE Factory control plane') + ' (' + hit + '); this tool applies to disposable planes only' : null;
}

/** Apply the migration in ONE transaction on the DISPOSABLE plane `adminUrl` names, as a non-superuser login. Returns { sha256 }. */
export async function apply(adminUrl, { log = () => {} } = {}) {
  const why = refusedRef(adminUrl);
  if (why) throw new Error(why);
  const sql = compose();
  const { default: pg } = await import('pg');
  const client = new pg.Client({ connectionString: adminUrl });
  await client.connect();
  try {
    const me = (await client.query('select r.rolsuper from pg_catalog.pg_roles r where r.rolname = current_user')).rows[0];
    if (!me || me.rolsuper) throw new Error('REFUSING - the login is a superuser; the live applying login is not, and a superuser skips every privilege check (apply as a login aligned to APPLYING_ROLE_OBSERVATION.json)');
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
  const USAGE = 'usage: migration.mjs compose | sha256 | apply   (apply reads the DISPOSABLE plane\'s admin URL from FACTORY_DISPOSABLE_ADMIN_URL; never from the command line)';
  // nothing after the subcommand: a URL or password given there is refused, and never echoed
  if (process.argv.length > 3) { console.log(USAGE); console.log('refused: no argument is accepted after the subcommand (a database credential never goes on a command line)'); process.exit(2); }
  if (cmd === 'compose') process.stdout.write(compose());
  else if (cmd === 'sha256') { const s = compose(); console.log(sha256(s) + '  factory-v1-migration.sql'); for (const f of parts()) console.log('  part ' + f + '  ' + sha256(lf(readFileSync(join(MIGRATION_DIR, f), 'utf8')))); }
  else if (cmd === 'apply') {
    const url = process.env.FACTORY_DISPOSABLE_ADMIN_URL;
    if (!url) { console.log(USAGE); process.exit(2); }
    try { const r = await apply(url); console.log('applied; migration sha256 ' + r.sha256); } catch (e) { console.log('FAILED - ' + (e && e.message)); process.exit(1); }
  } else { console.log(USAGE); process.exit(2); }
}
