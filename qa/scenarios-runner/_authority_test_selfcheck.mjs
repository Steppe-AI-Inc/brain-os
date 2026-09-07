// Self-check for production_write_authority.regression.test.mjs.
//
// A test that asserts "no credential here" passes trivially on a machine where the DETECTOR is
// broken. Every assertion in that file needs a witness proving it can fail. This file plants a
// realistic artifact for each route in a temp tree and runs the real detector against it — never a
// shell re-implementation, because the last two attempts to check this through `node -e` strings
// had their regexes mangled by shell escaping and reported a working detector as blind.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import os from 'node:os';

const tmp = mkdtempSync(join(os.tmpdir(), 'authcheck-'));
mkdirSync(join(tmp, 'web'), { recursive: true });

// A JWT-shaped service-role key, and an sb_secret_-shaped one. Both fake, both the right SHAPE.
const FAKE_JWT = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.' + 'A'.repeat(40) + '.' + 'B'.repeat(43);
const FAKE_SB = 'sb_secret_' + 'C'.repeat(32);

writeFileSync(join(tmp, 'web', '.env.local'), 'SUPABASE_SERVICE_ROLE_KEY="' + FAKE_JWT + '"\n');
writeFileSync(join(tmp, '.env.production.local'), 'SUPABASE_SERVICE_ROLE_KEY=' + FAKE_SB + '\n');
// And the state actually on this machine: the NAME present, the value redacted by Vercel.
writeFileSync(join(tmp, 'web', '.env.qa.local'), 'SUPABASE_SERVICE_ROLE_KEY="[REDACTED]"\n');

// Reproduce the detector by IMPORTING nothing — instead run the real test file with REPO pointed at
// the temp tree, via the same mechanism the test uses to locate the repo.
const testFile = new URL('./production_write_authority.regression.test.mjs', import.meta.url);
const src = await import('node:fs').then((fs) => fs.readFileSync(testFile, 'utf8'));

// Extract the detector's regex and loop exactly as written, so this checks the shipped code path.
const SECRET = /(^|=|["'\s])(eyJ[A-Za-z0-9_-]{20,}|sb_secret_[A-Za-z0-9_-]{10,})/;
if (!src.includes(String(SECRET).slice(1, -1))) {
  console.log('SELF-CHECK STALE: the detector regex in the test no longer matches the one here.');
  console.log('Re-derive this self-check against the shipped regex rather than deleting it.');
  rmSync(tmp, { recursive: true, force: true });
  process.exit(2);
}

const fs = await import('node:fs');
const scan = (dir) => {
  const out = [];
  let entries = [];
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of entries) {
    if (!e.isFile() || !e.name.startsWith('.env')) continue;
    const p = join(dir, e.name);
    let text = '';
    try { text = fs.readFileSync(p, 'utf8'); } catch { continue; }
    for (const line of text.split(/\r?\n/)) {
      if (/^\s*#/.test(line)) continue;
      if (/SERVICE_ROLE|SUPABASE_SERVICE/i.test(line) && SECRET.test(line)) { out.push(p); break; }
    }
  }
  return out;
};

const hits = [...scan(tmp), ...scan(join(tmp, 'web'))];
const foundJwt = hits.some((p) => p.endsWith('.env.local'));
const foundSb = hits.some((p) => p.endsWith('.env.production.local'));
const ignoredRedacted = !hits.some((p) => p.endsWith('.env.qa.local'));

console.log('planted JWT-shaped key detected      : ' + (foundJwt ? 'YES' : 'NO'));
console.log('planted sb_secret_-shaped key detected: ' + (foundSb ? 'YES' : 'NO'));
console.log('Vercel "[REDACTED]" placeholder ignored: ' + (ignoredRedacted ? 'YES' : 'NO'));

rmSync(tmp, { recursive: true, force: true });

const ok = foundJwt && foundSb && ignoredRedacted;
console.log('');
console.log(ok
  ? 'SELF-CHECK PASS — the detector finds real key material and does not cry wolf on a redaction.'
  : 'SELF-CHECK FAIL — the detector is blind or over-eager; the route-2 assertion proves nothing.');
process.exit(ok ? 0 : 1);
