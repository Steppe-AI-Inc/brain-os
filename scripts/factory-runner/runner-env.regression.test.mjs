// The runner env loader: the CA path recorded on the provisioning machine is resolved for the machine that reads it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir, homedir } from 'node:os';
import { join } from 'node:path';
import { resolveCaPath, loadRunnerUrl } from './runner-env.mjs';

const URL_WITH = (ca) => 'postgresql://factory_runner.abc:pw@aws-0-x.pooler.example.com:5432/postgres?sslmode=verify-full&sslrootcert=' + encodeURIComponent(ca);

test('the recorded CA path is kept when it exists here', () => {
  const r = resolveCaPath(URL_WITH('C:\\Users\\Dell\\.brain-factory\\ca.crt'), { envFile: 'C:\\Users\\Dell\\.brain-factory\\runner.env', exists: (p) => p === 'C:\\Users\\Dell\\.brain-factory\\ca.crt' });
  assert.match(r.note, /exists as recorded/);
  assert.equal(new URL(r.url).searchParams.get('sslrootcert'), 'C:\\Users\\Dell\\.brain-factory\\ca.crt');
});

test('a CA path from another machine is resolved to the copy beside the env file', () => {
  const envFile = 'C:\\Users\\Work\\.brain-factory\\runner.env';
  const local = join('C:\\Users\\Work\\.brain-factory', 'ca.crt');
  const r = resolveCaPath(URL_WITH('C:\\Users\\Dell\\.brain-factory\\ca.crt'), { envFile, exists: (p) => p === local });
  assert.match(r.note, /resolved to the local copy/);
  assert.equal(new URL(r.url).searchParams.get('sslrootcert'), local);
  // nothing else in the URL changed
  const u = new URL(r.url);
  assert.equal(u.username, 'factory_runner.abc'); assert.equal(u.password, 'pw'); assert.equal(u.searchParams.get('sslmode'), 'verify-full');
});

test('a CA path that exists nowhere is left as is, flagged caMissing, and the note says what to copy', () => {
  const r = resolveCaPath(URL_WITH('C:\\Users\\Dell\\.brain-factory\\ca.crt'), { envFile: 'C:\\Users\\Work\\.brain-factory\\runner.env', exists: () => false });
  assert.match(r.note, /copy the CA file/);
  assert.equal(r.caMissing, true);
  assert.equal(new URL(r.url).searchParams.get('sslrootcert'), 'C:\\Users\\Dell\\.brain-factory\\ca.crt');
});

test('a URL without sslrootcert (loopback plane) is untouched', () => {
  const r = resolveCaPath('postgresql://factory_runner:pw@127.0.0.1:54329/factory_control_plane', { exists: () => false });
  assert.match(r.note, /no sslrootcert/);
});

test('loadRunnerUrl reads the file and resolves the CA beside it', () => {
  const dir = mkdtempSync(join(tmpdir(), 'runner-env-'));
  try {
    writeFileSync(join(dir, 'ca.crt'), 'x');
    writeFileSync(join(dir, 'runner.env'), 'FACTORY_RUNNER_PG_URL=' + URL_WITH('Z:\\nowhere\\ca.crt') + '\n');
    const r = loadRunnerUrl(join(dir, 'runner.env'));
    assert.equal(new URL(r.url).searchParams.get('sslrootcert'), join(dir, 'ca.crt'));
    const missing = loadRunnerUrl(join(dir, 'absent.env'));
    assert.equal(missing.url, null); assert.match(missing.note, /env file not found/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('an env file saved with a UTF-8 byte-order mark is read (Windows PowerShell 5.1 adds one on re-save)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'runner-env-'));
  try {
    writeFileSync(join(dir, 'runner.env'), '\uFEFFFACTORY_RUNNER_PG_URL=postgresql://factory_runner:pw@127.0.0.1:54329/factory_control_plane\r\n');
    const r = loadRunnerUrl(join(dir, 'runner.env'));
    assert.equal(r.url, 'postgresql://factory_runner:pw@127.0.0.1:54329/factory_control_plane');
    assert.equal(r.caMissing, false);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('loadRunnerUrl flags a CA that exists nowhere on this machine (the preflight and supervisor refuse on it)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'runner-env-'));
  try {
    writeFileSync(join(dir, 'runner.env'), 'FACTORY_RUNNER_PG_URL=' + URL_WITH('Z:\\nowhere\\no-such-ca-' + Date.now() + '.crt') + '\n');
    const r = loadRunnerUrl(join(dir, 'runner.env'));
    assert.ok(r.url);
    assert.equal(r.caMissing, true);
    assert.match(r.note, /copy the CA file/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
