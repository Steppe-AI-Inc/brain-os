#!/usr/bin/env node
// SECRET SCAN (WO-10 "the secret scan is clean"; S-12). Every file the candidate changed since the Director commit, plus every tracked
// file under the Factory's own paths, is read at the checked-out commit and scanned for secret SHAPES: private keys, credentials in
// URLs, bearer / service-role / cloud / provider tokens, JWTs, and a literal assigned to a secret NAME. A hit is reported with file:line
// and never printed in full. The only allowed values are the ones named below, each public by design.
//   node qa/implementation/auto-enrollment-v1/tools/secret_scan.mjs [<base commit>]      (default: the Director commit 8f9833ce)
import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');
const BASE = process.argv.slice(2).find((a) => !a.startsWith('--')) || '8f9833cea3bd8b70d995cfe5575b6dabadb8361d';
const git = (...a) => execFileSync('git', ['-C', ROOT, ...a], { encoding: 'utf8', maxBuffer: 1 << 26 }).trim();
const head = git('rev-parse', 'HEAD');
const changed = git('diff', '--name-only', '--diff-filter=AMR', BASE, head).split('\n').filter(Boolean);
const factoryPaths = git('ls-files', 'supabase/control-plane', 'scripts/factory-runner/enrolled', 'scripts/factory-runner/sea', 'scripts/factory-build',
  'scripts/factory-control-plane', 'qa/factory/v1', 'web/lib/factory', 'web/app/(app)/software-factory/computers', 'qa/implementation/auto-enrollment-v1').split('\n').filter(Boolean);
const files = [...new Set([...changed, ...factoryPaths])].filter((f) => existsSync(join(ROOT, f)) && !/\.(png|jpg|jpeg|gif|ico|exe|pdf|zip|woff2?)$/i.test(f)).sort();

const RULES = [
  ['private key block', /-----BEGIN (?:RSA |EC |OPENSSH |ENCRYPTED |DSA )?PRIVATE KEY-----/],
  ['credential in a URL', /\b(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis|amqp|https?):\/\/[^\s/:'"`@]{1,64}:[^\s@'"`]{6,}@[^\s'"`]+/i],
  ['JWT', /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/],
  ['GitHub token', /\b(?:ghp|gho|ghu|ghs|ghr|github_pat)_[A-Za-z0-9_]{20,}/],
  ['AWS access key', /\bAKIA[0-9A-Z]{16}\b/],
  ['OpenAI / Anthropic key', /\b(?:sk-(?:proj-|ant-)?[A-Za-z0-9_-]{24,})/],
  ['Supabase secret key', /\bsb_secret_[A-Za-z0-9_-]{16,}/],
  ['Slack token', /\bxox[abprs]-[A-Za-z0-9-]{10,}/],
  ['a literal assigned to a secret name', /\b(?:FACTORY_PAIRING_PEPPER|FACTORY_(?:NODE|ADMIN)_DB_URL|SUPABASE_SERVICE_ROLE_KEY|SERVICE_ROLE_KEY|FACTORY_RUNNER_PG_URL|PGPASSWORD|DB_PASSWORD)\s*[:=]\s*['"`][^'"`\s<>{}$]{12,}['"`]/],
  ['service-role JWT marker', /"role"\s*:\s*"service_role"/],
];
// public by design (each reviewed): the dev release key's PUBLIC seed text (release-manifest.mjs DEV_SEED_TEXT) and the RFC 8032
// test vector (a published test key); placeholders written as <...>
const ALLOW = [/RFC8032_TEST1|9d61b19deffd5a60ba844af492ec2cc44449c5697b326919703bac031cae7f60/, /DEV_SEED_TEXT/, /<[a-z0-9 ]+(?:password|pw|id)[a-z0-9 ]*>/i];

// POSITIVE CONTROL: one synthetic line per rule must hit (the samples are assembled at run time, so this file holds none)
if (process.argv.includes('--selftest')) {
  const j = (...p) => p.join('');
  const samples = [
    j('-----BEGIN ', 'PRIVATE KEY-----'), j('postgresql://factory_node_api:', 'Zq8wT2vLx9Ab', '@db.example.invalid:5432/postgres'),
    j('eyJhbGciOiJIUzI1NiJ9', '.', 'eyJzdWIiOiIxMjM0NTY3ODkwIn0', '.', 'c2lnbmF0dXJlLXNhbXBsZQ'), j('ghp_', 'A'.repeat(36)), j('AKIA', 'ABCDEFGHIJKLMNOP'),
    j('sk-', 'ant-', 'x'.repeat(30)), j('sb_secret_', 'y'.repeat(20)), j('xoxb-', '1234567890-abc'), j('FACTORY_PAIRING_PEPPER', " = '", 'Q'.repeat(44), "'"),
    j('{"role": "service', '_role"}'),
  ];
  const missed = RULES.filter(([, re], i) => !re.test(samples[i])).map(([n]) => n);
  console.log('secret_scan --selftest: ' + (RULES.length - missed.length) + '/' + RULES.length + ' rules hit their sample' + (missed.length ? '; MISSED: ' + missed.join(', ') : ''));
  process.exit(missed.length ? 1 : 0);
}

const hits = [];
for (const f of files) {
  let text;
  try { text = readFileSync(join(ROOT, f), 'utf8'); } catch { continue; }
  if (text.includes('\u0000')) continue; // binary
  text.split(/\r?\n/).forEach((line, i) => {
    for (const [name, re] of RULES) {
      const m = re.exec(line);
      if (!m || ALLOW.some((a) => a.test(line))) continue;
      // the scanner's own rules and the static contracts that name the patterns they refuse are not secrets
      if (/secret_scan\.mjs$|factory_v1_static_contract\.mjs$/.test(f)) continue;
      hits.push({ f, line: i + 1, name, sample: m[0].slice(0, 12) + '...(' + m[0].length + ' chars)' });
    }
  });
}
console.log('secret scan at ' + head + ' - ' + files.length + ' files (' + changed.length + ' changed since ' + BASE.slice(0, 8) + ', plus the Factory paths)');
for (const h of hits) console.log('HIT  ' + h.f + ':' + h.line + '  ' + h.name + '  ' + h.sample);
console.log('\nsecret_scan: ' + (hits.length ? hits.length + ' HIT(S) - review each' : 'clean (0 hits)'));
process.exit(hits.length ? 1 : 0);
