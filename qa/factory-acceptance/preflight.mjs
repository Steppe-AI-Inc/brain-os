#!/usr/bin/env node
// Preflight for Factory V1 independent acceptance.
//
//   node preflight.mjs            pin refs, verify pinned deps, prove resolution, open PGlite and
//                                 apply the migration chain, start the disposable embedded
//                                 PostgreSQL (if installed), prove it is local/non-production,
//                                 write results/PREFLIGHT.json
//   node preflight.mjs --teardown stop the embedded server and delete its data directory
//                                 (evidence artifacts are never touched)
import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pinRefs, operationalHead, rescanAll } from './lib/provenance.mjs';
import { pinnedDepsProvenance, proveResolution, embeddedPgProvenance, startEmbeddedPg, stopEmbeddedPg, deleteEmbeddedPgData, proveLocalNonProduction, REAL_PG_URL, STATE_PATH, PG_DATA_DIR } from './lib/deps.mjs';
import { openFactoryDb, assertTxContinuity } from './lib/pglite-factory.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const RESULTS = join(HERE, 'results');
const OUT = join(RESULTS, 'PREFLIGHT.json');
const nowIso = () => new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');

async function teardown() {
  const rec = existsSync(OUT) ? JSON.parse(readFileSync(OUT, 'utf8')) : {};
  const { spawnSync } = await import('node:child_process');
  const { rmSync } = await import('node:fs');
  const { PGDEPS_DIR } = await import('./lib/deps.mjs');
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const pgRunning = () => /postgres\.exe/i.test(spawnSync('tasklist', [], { encoding: 'utf8', windowsHide: true }).stdout);
  // 1. signal a --serve process (it stops the cluster itself when the state file disappears)
  try { rmSync(STATE_PATH, { force: true }); } catch {}
  for (let i = 0; i < 15 && pgRunning(); i++) await sleep(1000);
  // 2. belt and braces: pg_ctl stop on the data directory with the embedded binary
  let stopped = !pgRunning(), stopError = null, pgctl = null;
  if (!stopped) {
    const bin = join(PGDEPS_DIR, 'node_modules', '@embedded-postgres', 'windows-x64', 'native', 'bin', 'pg_ctl.exe');
    const r = spawnSync(bin, ['-D', PG_DATA_DIR, '-m', 'fast', 'stop'], { encoding: 'utf8', windowsHide: true, timeout: 60000 });
    pgctl = { status: r.status, out: (r.stdout + r.stderr).trim().slice(0, 200) };
    for (let i = 0; i < 15 && pgRunning(); i++) await sleep(1000);
    stopped = !pgRunning();
    if (!stopped) stopError = 'postgres.exe still running after pg_ctl stop';
  }
  // 3. delete the data directory (retry: Windows releases file locks a moment after exit)
  let deleted = false;
  for (let i = 0; i < 10 && !deleted; i++) { try { deleted = deleteEmbeddedPgData(); } catch (e) { stopError = stopError || String(e.message || e).slice(0, 200); await sleep(1000); } }
  rec.teardown_pgctl = pgctl;
  rec.teardown = { at: nowIso(), stopped, stop_error: stopError, data_dir_deleted: deleted, data_dir: PG_DATA_DIR, evidence_untouched: true };
  writeFileSync(OUT, JSON.stringify(rec, null, 2) + '\n');
  console.log('teardown:', JSON.stringify(rec.teardown));
}

// --serve: start a fresh disposable cluster and hold this process open until STATE_PATH is removed
// (by --teardown) or the process is signalled. The postgres child does not outlive its node parent on
// this platform, so the suites run while this mode is alive in a background shell.
async function serve() {
  const pg = await startEmbeddedPg();
  const hr = await openFactoryDb({ refKey: 'p1', realUrl: REAL_PG_URL });
  console.log('serve: embedded pg up on', REAL_PG_URL.replace(/:[^:@/]+@/, ':<password-redacted>@'), '| chain complete:', hr.migration_chain_complete, '| failed:', JSON.stringify(hr.failed_migrations));
  await hr.close();
  writeFileSync(STATE_PATH, JSON.stringify({ started_at: nowIso(), pid: process.pid, mode: 'serve', url_host: '127.0.0.1', port: 54329, db: 'dbtest', data_dir: PG_DATA_DIR }, null, 2));
  const stop = async (why) => { console.log('serve: stopping (' + why + ')'); await stopEmbeddedPg(pg); deleteEmbeddedPgData(); process.exit(0); };
  process.on('SIGINT', () => stop('SIGINT')); process.on('SIGTERM', () => stop('SIGTERM'));
  setInterval(() => { if (!existsSync(STATE_PATH)) stop('state file removed by --teardown'); }, 1000);
}

async function main() {
  if (process.argv.includes('--teardown')) return teardown();
  if (process.argv.includes('--serve')) return serve();
  mkdirSync(RESULTS, { recursive: true });
  const rec = { schema: 'qa.factory-acceptance.preflight/1', at: nowIso(), operational_head: operationalHead(), node: process.version };

  rec.pins = pinRefs();
  console.log('pins:', Object.entries(rec.pins).map(([k, v]) => k + '=' + v.sha.slice(0, 7) + (v.scan.ok ? ' clean' : ' DIRTY')).join('  '));

  rec.pinned_deps = pinnedDepsProvenance();
  rec.resolution = await proveResolution();
  console.log('deps:', JSON.stringify({ lock_matches_pinned: rec.pinned_deps.package_lock_matches_pinned, pglite: rec.pinned_deps.versions.pglite, resolves_under_deps_dir: rec.resolution.resolves_under_deps_dir, worktrees_clean: rec.resolution.worktrees_still_clean }));
  if (!rec.pinned_deps.package_lock_matches_pinned || !rec.resolution.resolves_under_deps_dir || rec.resolution.resolves_inside_a_worktree) {
    rec.verdict = 'PREFLIGHT_FAILED_DEPS'; writeFileSync(OUT, JSON.stringify(rec, null, 2) + '\n'); console.log(rec.verdict); process.exit(2);
  }

  // PGlite: bootstrap + full pinned migration chain.
  const h = await openFactoryDb({ refKey: 'p1' });
  rec.pglite = { engine: h.engine, version: h.version, security_label: h.security_label, migration_chain_complete: h.migration_chain_complete, applied: h.applied.length, failed: h.failed_migrations, tx_continuity: await assertTxContinuity(h) };
  await h.close();
  console.log('pglite:', h.version.slice(0, 40), 'migrations', h.applied.length, 'failed', h.failed_migrations.length, 'tx_continuity', rec.pglite.tx_continuity);
  for (const f of h.failed_migrations) console.log('  FAILED', f.file, f.error);

  // Embedded PostgreSQL (REAL_POSTGRES_LOCAL). Optional: absence is NO_VERDICT for race checks.
  rec.embedded_pg = embeddedPgProvenance();
  if (rec.embedded_pg.binary_exists) {
    try {
      const pg = await startEmbeddedPg();
      rec.embedded_pg.started = true;
      rec.embedded_pg.local_proof = await proveLocalNonProduction(REAL_PG_URL);
      rec.embedded_pg.url_shape = REAL_PG_URL.replace(/:[^:@/]+@/, ':<password-redacted>@');
      rec.embedded_pg.state_file = STATE_PATH;
      // The pinned adapter's disposability gate must accept it (pristine route) and plant its sentinel.
      const hr = await openFactoryDb({ refKey: 'p1', realUrl: REAL_PG_URL });
      rec.embedded_pg.adapter = { engine: hr.engine, version: hr.version, security_label: hr.security_label, migration_chain_complete: hr.migration_chain_complete, failed: hr.failed_migrations };
      const sentinel = await hr.query("select run_token from public._dbtest_disposable limit 1").catch(() => ({ rows: [] }));
      rec.embedded_pg.disposability_sentinel_planted = sentinel.rows.length === 1;
      await hr.close();
      // Leave the server running for the suites; teardown stops and deletes it.
      pg._qaKeepAlive = true;
      console.log('embedded pg:', rec.embedded_pg.postgres_version, '| local:', rec.embedded_pg.local_proof.loopback && rec.embedded_pg.local_proof.not_supabase_host, '| sentinel:', rec.embedded_pg.disposability_sentinel_planted, '| chain complete:', hr.migration_chain_complete);
      rec.embedded_pg.url_for_suites_env = 'DBTEST_PG_URL (set by the suites from lib/deps.mjs REAL_PG_URL)';
      // detach: the embedded server keeps running after this process exits (postgres.exe child)
      process.exitCode = 0;
      // do not await pg.stop(); the child is owned by pg_ctl and persists
    } catch (e) {
      rec.embedded_pg.started = false; rec.embedded_pg.error = String(e.message || e).slice(0, 400);
      console.log('embedded pg FAILED to start:', rec.embedded_pg.error);
    }
  } else {
    rec.embedded_pg.started = false; rec.embedded_pg.error = 'embedded-postgres not installed under pgdeps';
  }

  rec.rescan = rescanAll();
  rec.verdict = 'PREFLIGHT_OK';
  writeFileSync(OUT, JSON.stringify(rec, null, 2) + '\n');
  console.log(rec.verdict, '->', OUT);
  // pg_ctl-managed server: exit explicitly so the parent shell returns even though the child lives on.
  setTimeout(() => process.exit(0), 200);
}

main().catch((e) => { console.error('PREFLIGHT ERROR', e); process.exit(2); });
