#!/usr/bin/env node
// MUTATION PROOF for supervisor.injection.test.mjs.
//
// A security test that has never failed is not evidence. Each mutation below re-creates a
// guard weakness that INDEPENDENT VERIFICATION ACTUALLY FOUND in the first version of
// safeWorktree (KNOWN_FAILURE_MODES #62): the missing character allowlist, the bare
// prefix match with no path boundary, and the missing traversal check. If the injection
// suite stays green with any of them reintroduced, it is decorative.
//
// Mutates the REAL source, restores from a pristine byte copy in a finally, and aborts on
// a sha mismatch.
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = join(HERE, 'supervisor.mjs');
const SUITE = join(HERE, 'supervisor.injection.test.mjs');
const pristine = readFileSync(SRC);
const pristineSha = createHash('sha256').update(pristine).digest('hex');
const text = pristine.toString('utf8');

const MUTATIONS = [
  {
    name: 'the character allowlist is removed (historical defect #2 — quotes/newlines survived into cwd AND the prompt)',
    find: "if (!/^[A-Za-z]:(\\\\[A-Za-z0-9._-]+)+$/.test(normalized)) return REPO_ROOT;",
    replace: "if (!/^[A-Za-z]:/.test(normalized)) return REPO_ROOT;",
  },
  {
    name: 'the boundary-anchored root match reverts to a bare startsWith (historical defect #1 — devil/ and dev-attacker/ accepted)',
    find: "return candidate === r || candidate.startsWith(r + '\\\\');",
    replace: 'return candidate.startsWith(r);',
  },
  {
    name: 'the traversal check is removed',
    find: "if (normalized.includes('..')) return REPO_ROOT;",
    replace: '',
  },
  {
    name: 'R-D9 reintroduced: `shell: true` returns to the SQL transport',
    find: 'cwd: REPO_ROOT, maxBuffer: 10 * 1024 * 1024,',
    replace: 'cwd: REPO_ROOT, shell: true, maxBuffer: 10 * 1024 * 1024,',
  },
  {
    name: 'safeMeta stops refusing and starts sanitising (a cleaned-up attacker string that now looks validated)',
    find: 'return typeof value === \'string\' && pattern.test(value) && !value.includes(\'..\') ? value : null;',
    replace: "return typeof value === 'string' ? value.replace(/[^A-Za-z0-9._\\/-]/g, '') : null;",
  },
];

const runSuite = () => {
  try { execFileSync(process.execPath, [SUITE], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }); return ''; }
  catch (e) { return String(e.stdout || '') + String(e.stderr || ''); }
};

let unproven = 0;
try {
  if (runSuite() !== '') { console.log('BASELINE NOT CLEAN — the suite fails on unmutated source'); process.exit(1); }
  console.log('baseline: injection suite green on unmutated source\n');

  for (const m of MUTATIONS) {
    const hits = text.split(m.find).length - 1;
    if (hits !== 1) {
      console.log(`STALE ANCHOR  ${m.name}\n              matched ${hits}x, expected 1`);
      unproven++; continue;
    }
    writeFileSync(SRC, text.replace(m.find, m.replace), 'utf8');
    const out = runSuite();
    const failing = out.split(/\r?\n/).filter((l) => /^FAIL /.test(l)).map((l) => l.split(/\s+/)[1]);
    if (failing.length === 0) {
      console.log(`UNPROVEN      ${m.name}\n              the injection suite stayed GREEN with this weakness reintroduced`);
      unproven++;
    } else {
      console.log(`PROVEN        ${m.name}\n              caught by ${failing.length} case(s): ${failing.slice(0, 4).join(', ')}`);
    }
  }
} finally {
  writeFileSync(SRC, pristine);
  const after = createHash('sha256').update(readFileSync(SRC)).digest('hex');
  if (after !== pristineSha) { console.log(`\n*** SOURCE NOT RESTORED *** ${after}`); process.exit(2); }
  console.log(`\nsupervisor.mjs restored byte-identically (sha256 ${after.slice(0, 16)}…)`);
}
console.log(`supervisor.injection.mutation: ${MUTATIONS.length - unproven}/${MUTATIONS.length} proven, ${unproven} unproven`);
process.exit(unproven === 0 ? 0 : 1);
