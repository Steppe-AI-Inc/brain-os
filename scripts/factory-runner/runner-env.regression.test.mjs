// The runner env loader: the CA path recorded on the provisioning machine is resolved for the machine that reads it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from 'node:fs';
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
    assert.equal(r.usable, false);
    assert.match(r.note, /copy the CA file/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

// ---- the shared judge (verification 2026-09-24, second round): every gate refuses what the worker would refuse ----------
// A throwaway self-signed certificate (public part only; its key was discarded when it was made). Nothing trusts it.
const TEST_CA = [
  '-----BEGIN CERTIFICATE-----',
  'MIIBtjCCAV2gAwIBAgIUfc8TQlVCDVL785DW+yQhwSIDBjYwCgYIKoZIzj0EAwIw',
  'MDEuMCwGA1UEAwwlZmFjdG9yeS1ydW5uZXItZW52LXJlZ3Jlc3Npb24tdGVzdC1j',
  'YTAgFw0yNjA5MjQwNjQxMDRaGA8yMTI2MDgzMTA2NDEwNFowMDEuMCwGA1UEAwwl',
  'ZmFjdG9yeS1ydW5uZXItZW52LXJlZ3Jlc3Npb24tdGVzdC1jYTBZMBMGByqGSM49',
  'AgEGCCqGSM49AwEHA0IABHEbxmDdstbnWfKHprC+SjYQMso2YPd2tjJqEmEOwbYy',
  '/4h9ZGq4Ao7uSxyE/xtf7GK0zMGSPTPiNU6pUWNY5TajUzBRMB0GA1UdDgQWBBRv',
  'pjJ9Al3JgUj+KJ+PUEWr8JJUXDAfBgNVHSMEGDAWgBRvpjJ9Al3JgUj+KJ+PUEWr',
  '8JJUXDAPBgNVHRMBAf8EBTADAQH/MAoGCCqGSM49BAMCA0cAMEQCIBIS5hRD6D0z',
  'FN/HUvBLR+v+P6EQY5Jw8U5D57346diFAiBbfMGSFxnhqQbnzpQu9jRsBqJ/boeO',
  't59OhEIKn+ko3Q==',
  '-----END CERTIFICATE-----',
].join('\n') + '\n';
const judge = (content, files = {}) => {
  const dir = mkdtempSync(join(tmpdir(), 'runner-env-'));
  try {
    for (const [n, c] of Object.entries(files)) writeFileSync(join(dir, n), c);
    writeFileSync(join(dir, 'runner.env'), typeof content === 'function' ? content(dir) : content);
    return loadRunnerUrl(join(dir, 'runner.env'));
  } finally { rmSync(dir, { recursive: true, force: true }); }
};
const GOOD = (dir) => 'postgresql://factory_runner:pw@db.example.invalid:5432/postgres?sslmode=verify-full&sslrootcert=' + encodeURIComponent(join(dir, 'ca.crt'));

test('a URL with a real CA beside it is usable', () => {
  const r = judge((d) => 'FACTORY_RUNNER_PG_URL=' + GOOD(d) + '\n', { 'ca.crt': TEST_CA });
  assert.equal(r.usable, true, r.note);
});

test('a value in one pair of quotes is the URL inside them', () => {
  const r = judge((d) => 'FACTORY_RUNNER_PG_URL="' + GOOD(d) + '"\n', { 'ca.crt': TEST_CA });
  assert.equal(r.usable, true, r.note);
  assert.ok(!r.url.startsWith('"'));
});

test('a UTF-16LE file (Windows PowerShell 5.1 re-save) is decoded and usable', () => {
  const r = judge((d) => Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from('FACTORY_RUNNER_PG_URL=' + GOOD(d) + '\r\n', 'utf16le')]), { 'ca.crt': TEST_CA });
  assert.equal(r.usable, true, r.note);
});

test('a UTF-16BE file is decoded and usable', () => {
  const r = judge((d) => { const b = Buffer.from('FACTORY_RUNNER_PG_URL=' + GOOD(d) + '\n', 'utf16le'); b.swap16(); return Buffer.concat([Buffer.from([0xfe, 0xff]), b]); }, { 'ca.crt': TEST_CA });
  assert.equal(r.usable, true, r.note);
});

test('NUL bytes without a byte-order mark are refused naming the encoding, not "no line"', () => {
  const r = judge((d) => Buffer.from('FACTORY_RUNNER_PG_URL=' + GOOD(d) + '\n', 'utf16le'), { 'ca.crt': TEST_CA });
  assert.equal(r.usable, false); assert.equal(r.url, null);
  assert.match(r.note, /NUL bytes|UTF-16/);
});

test('a key=value connection string is not a URL: refused, url null', () => {
  const r = judge('FACTORY_RUNNER_PG_URL=host=127.0.0.1 port=5432 user=factory_runner password=pw\n');
  assert.equal(r.usable, false); assert.equal(r.url, null);
  assert.match(r.note, /not a URL/);
});

test('the superuser is refused by the same rule the accessor applies', () => {
  const r = judge('FACTORY_RUNNER_PG_URL=postgresql://postgres:pw@127.0.0.1:54329/factory_control_plane\n');
  assert.equal(r.usable, false);
  assert.match(r.note, /REFUSED by the accessor: .*superuser/);
});

test('the production project is refused by name', () => {
  const r = judge('FACTORY_RUNNER_PG_URL=postgresql://factory_runner.pvphxgrtdfrudejjhzjk:pw@aws-0-x.pooler.example.com:5432/postgres?sslmode=verify-full\n');
  assert.equal(r.usable, false);
  assert.match(r.note, /PRODUCTION/);
});

test('plaintext across a network is refused', () => {
  const r = judge('FACTORY_RUNNER_PG_URL=postgresql://factory_runner:pw@db.example.invalid:5432/postgres\n');
  assert.equal(r.usable, false);
  assert.match(r.note, /over a network/);
});

test('a DER-encoded CA (the Windows export default) is refused naming the conversion - pg reads the file as PEM text', () => {
  const der = Buffer.from(TEST_CA.replace(/-----[A-Z ]+-----/g, '').replace(/\s+/g, ''), 'base64');
  const r = judge((d) => 'FACTORY_RUNNER_PG_URL=' + GOOD(d) + '\n', { 'ca.crt': der });
  assert.equal(r.usable, false);
  assert.match(r.note, /DER, not PEM/);
});

test('what pg itself would throw on is refused by the judge: a missing client cert/key, verify-* with uselibpqcompat and no CA', () => {
  const r1 = judge('FACTORY_RUNNER_PG_URL=postgresql://factory_runner:pw@127.0.0.1:5432/db?sslmode=require&sslcert=Z%3A%5Cnowhere%5Cclient.crt\n');
  assert.equal(r1.usable, false); assert.match(r1.note, /sslcert file .* does not exist/);
  const r2 = judge('FACTORY_RUNNER_PG_URL=postgresql://factory_runner:pw@plane.example.com:5432/db?sslmode=verify-ca&uselibpqcompat=true\n');
  assert.equal(r2.usable, false); assert.match(r2.note, /needs sslrootcert/);
});

test('the judge never throws: a directory where the CA should be is a refusal, not EISDIR', () => {
  let r;
  assert.doesNotThrow(() => { r = judge((d) => { mkdirSync(join(d, 'ca-dir')); return 'FACTORY_RUNNER_PG_URL=postgresql://factory_runner:pw@db.example.invalid:5432/postgres?sslmode=verify-full&sslrootcert=' + encodeURIComponent(join(d, 'ca-dir')) + '\n'; }); });
  assert.equal(r.usable, false); assert.match(r.note, /not a file|could not be judged/);
});

test('a CA file that is not a certificate is refused, naming the file', () => {
  const r = judge((d) => 'FACTORY_RUNNER_PG_URL=' + GOOD(d) + '\n', { 'ca.crt': 'this is not a certificate\n' });
  assert.equal(r.usable, false);
  assert.match(r.note, /is not a certificate/);
});


test('importing the loader first does not freeze db.mjs without a URL (ensureRunnerEnv, then db.mjs, sees the URL)', async () => {
  // runner-env.mjs once imported db.mjs (for the URL judge), and db.mjs captures FACTORY_RUNNER_PG_URL when it is first loaded:
  // a harness that imported the loader, then called ensureRunnerEnv(), got a db.mjs with no URL (live-plane acceptance, 2026-09-24).
  const { spawnSync } = await import('node:child_process');
  const { fileURLToPath, pathToFileURL } = await import('node:url');
  const here = join(fileURLToPath(import.meta.url), '..');
  const dir = mkdtempSync(join(tmpdir(), 'runner-env-'));
  try {
    const url = 'postgresql://factory_runner:pw@127.0.0.1:54329/factory_control_plane';
    writeFileSync(join(dir, 'runner.env'), 'FACTORY_RUNNER_PG_URL=' + url + '\n');
    const probe = "const m=await import(process.argv[1]);m.ensureRunnerEnv(process.argv[3]);const db=await import(process.argv[2]);process.stdout.write(String(db.FACTORY_RUNNER_PG_URL===process.argv[4]));";
    const env = { ...process.env }; delete env.FACTORY_RUNNER_PG_URL; delete env.FACTORY_RUNNER_ENV_FILE;
    const r = spawnSync(process.execPath, ['--input-type=module', '-e', probe, pathToFileURL(join(here, 'runner-env.mjs')).href, pathToFileURL(join(here, 'db.mjs')).href, join(dir, 'runner.env'), url], { encoding: 'utf8', env });
    assert.equal((r.stdout || '').trim(), 'true', (r.stdout || '') + (r.stderr || ''));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
