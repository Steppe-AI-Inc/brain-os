// FACTORY_WORKERS_CARRY_NO_AMBIENT_PRODUCTION_DB_AUTHORITY
//
// An executable inventory of every scripts/factory-runner path that reaches a database, classified
// by what it can DO — not by what it is documented to do.
//
//   READ_ONLY         reads through the canonical accessor's read(); cannot mutate.
//   DEV_WRITE         writes through the canonical accessor's write(); DML only, explicit
//                     least-privilege connection, refuses DDL/migration-history in the client.
//   PRODUCTION_WRITE  shells out to `supabase db query --linked` — inherits the machine's CLI
//                     credential, which on this machine is full production write, and can execute
//                     any statement that credential can.
//
// EXPECTED TO FAIL TODAY: ten scripts are PRODUCTION_WRITE. The test passes when that count is
// zero, and it will not accept a documentation change, an allowlist, or an environment flag as a
// substitute — only the absence of the mechanism.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const DIR = join(HERE, '..', '..', 'scripts', 'factory-runner');

const AMBIENT = /'supabase',\s*'db',\s*'query',\s*'--linked'|db query --linked/;
const CANONICAL_WRITE = /\bdb\.(write|transaction)\(/;
const CANONICAL_READ = /\bdb\.read\(/;
const CANONICAL_IMPORT = /from ['"]\.\/db\.mjs['"]/;

export function classify(source) {
  // Strip comments so a script that only MENTIONS the old mechanism is not counted as using it.
  const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  if (AMBIENT.test(code)) return 'PRODUCTION_WRITE';
  if (CANONICAL_IMPORT.test(code) && CANONICAL_WRITE.test(code)) return 'DEV_WRITE';
  if (CANONICAL_IMPORT.test(code) && CANONICAL_READ.test(code)) return 'READ_ONLY';
  return 'NO_DB';
}

export function inventory() {
  return readdirSync(DIR)
    .filter((f) => f.endsWith('.mjs') && !f.includes('.test.') && f !== 'db.mjs')
    .map((f) => ({ file: f, klass: classify(readFileSync(join(DIR, f), 'utf8')) }))
    .sort((a, b) => a.file.localeCompare(b.file));
}

test('FACTORY_INVENTORY — every script is classified and the table is printed', () => {
  const rows = inventory();
  for (const r of rows) console.log('  ' + r.klass.padEnd(18) + r.file);
  assert.ok(rows.length > 0);
});

test('FACTORY_WORKERS_CARRY_NO_AMBIENT_PRODUCTION_DB_AUTHORITY', () => {
  const prod = inventory().filter((r) => r.klass === 'PRODUCTION_WRITE').map((r) => r.file);
  assert.deepEqual(prod, [],
    prod.length + ' factory-runner script(s) reach the database through `supabase db query '
    + '--linked`, inheriting the machine CLI credential: ' + prod.join(', ') + '. Each must move '
    + 'to scripts/factory-runner/db.mjs (explicit FACTORY_RUNNER_PG_URL, DML only, DDL refused in '
    + 'the client). Production-write operations belong behind the release broker.');
});

// The classifier must be able to see each class, or the assertion above is vacuous.
test('the classifier distinguishes all four classes', () => {
  assert.equal(classify("execFile('npx', ['supabase', 'db', 'query', '--linked', '-f', f])"), 'PRODUCTION_WRITE');
  assert.equal(classify("import * as db from './db.mjs'; await db.write('insert into x values (1)')"), 'DEV_WRITE');
  assert.equal(classify("import * as db from './db.mjs'; await db.read('select 1')"), 'READ_ONLY');
  assert.equal(classify("console.log('hello')"), 'NO_DB');
  // A comment mentioning the old mechanism is not use of it.
  assert.equal(classify("// used to call supabase db query --linked\nimport * as db from './db.mjs'; db.read('select 1')"), 'READ_ONLY');
});
