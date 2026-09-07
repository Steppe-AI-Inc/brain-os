// READ_ONLY_LIVE_CHECK_NEVER_REACHES_THE_DESTRUCTIVE_HARNESS
//
// live_preflight_abd.mjs --pre / --post is the tool that verifies production after a release. Until
// this change it opened its connection through openDb() — the entry that drops five schemas on any
// real engine — and was safe only because a hostname denylist refused first. This suite pins the
// structural fix: the read-only path is a different function on a different variable, it cannot
// borrow the destructive harness's URL, and it proves read-onlyness before it is handed out.
//
// Pure where it can be (source-level and refusal-path assertions need no engine). The one check
// that needs a real server — the 25006 probe — runs only when LIVE_READONLY_PG_URL is set and is
// skipped, not faked, otherwise.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const HERE = dirname(fileURLToPath(import.meta.url));
const PREFLIGHT = join(HERE, 'live_preflight_abd.mjs');
const src = readFileSync(PREFLIGHT, 'utf8');
const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

test('--pre and --post open the connection through openReadOnlyDb, never openDb', () => {
  assert.match(code, /MODE === 'smoke' \? await openDb\(\) : await openReadOnlyDb\(\)/,
    'the connection must be selected by mode, with openDb() reachable only from smoke');
  // No other call to openDb() may exist in the file.
  const calls = code.match(/\bopenDb\(\)/g) || [];
  assert.equal(calls.length, 1, 'exactly one openDb() call (the smoke branch); found ' + calls.length);
});

test('a live check with no LIVE_READONLY_PG_URL refuses instead of borrowing DBTEST_PG_URL', () => {
  // DBTEST_PG_URL set to a plausible disposable engine; LIVE_READONLY_PG_URL unset. If the read-only
  // path had any fallback to the destructive variable, this would try to connect (and fail with a
  // network error) rather than refuse before connecting.
  const env = { ...process.env, DBTEST_PG_URL: 'postgres://postgres:postgres@localhost:5432/postgres' };
  delete env.LIVE_READONLY_PG_URL;
  const r = spawnSync(process.execPath, [PREFLIGHT, '--post'], { encoding: 'utf8', env, timeout: 60000 });
  const out = (r.stdout || '') + (r.stderr || '');
  assert.match(out, /LIVE_READONLY_PG_URL is not set/, 'expected the read-only refusal; got: ' + out.slice(0, 300));
  assert.doesNotMatch(out, /ECONNREFUSED|ENOTFOUND|ETIMEDOUT|EHOSTUNREACH/, 'the process attempted a socket connection — a fallback exists');
});

test('openReadOnlyDb throws ReadOnlyProofError without its variable, and never plants a sentinel', async () => {
  delete process.env.LIVE_READONLY_PG_URL;
  const { openReadOnlyDb, ReadOnlyProofError } = await import('./db.mjs');
  await assert.rejects(openReadOnlyDb, ReadOnlyProofError);
  const dbSrc = readFileSync(join(HERE, 'db.mjs'), 'utf8');
  const roBody = dbSrc.slice(dbSrc.indexOf('export async function openReadOnlyDb'));
  assert.doesNotMatch(roBody, /assertDisposable|replantSentinel|drop schema/,
    'the read-only path must not touch the disposability/DROP machinery at all');
});

test('the read-only proof demands SQLSTATE 25006 specifically — a wrong-reason failure is not proof', () => {
  const dbSrc = readFileSync(join(HERE, 'db.mjs'), 'utf8');
  assert.match(dbSrc, /probe !== '25006'/);
  assert.match(dbSrc, /failed for a DIFFERENT reason/);
});

// Real-engine proof, only when a read-only URL is actually present.
test('LIVE: the connection proves it cannot write (25006)', { skip: !process.env.LIVE_READONLY_PG_URL }, async () => {
  const { openReadOnlyDb } = await import('./db.mjs');
  const db = await openReadOnlyDb();
  try {
    assert.equal(db.readOnlyProof.ddlProbeSqlstate, '25006');
    assert.equal(db.engine, 'real-postgresql-readonly');
  } finally { await db.close(); }
});
