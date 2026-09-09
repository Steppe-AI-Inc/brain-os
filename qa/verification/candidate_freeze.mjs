#!/usr/bin/env node
// FREEZE THE CANDIDATE AT THE FILESYSTEM, not in a document.
//
// "Do not modify a frozen candidate while its verifier is running" was a rule written in prose, enforced by
// remembering it. It failed the first time it was tested: re-verifying that a PREPARED patch still applied
// meant running the prepared-patch script, and that script - like 85 others in scratch/p1 - defaults its
// target to the candidate:
//
//     const p = process.argv[2] || 'supabase/functions/sem-ai-command/index.ts';
//
// So a script whose header says PREPARED, NOT APPLIED applies itself, in place, to the release candidate,
// and reports success. The candidate was restored from git within a minute and the verifier reads its own
// worktree, so nothing downstream was affected - but nothing about that was by design.
//
// The fix is not to edit 85 scripts. Any of them may be run again, more will be written, and a convention
// is exactly the kind of control this campaign keeps watching fail. Marking the FILE read-only turns every
// one of those writes, present and future, into a loud EPERM instead of a silent overwrite. Measured on
// this machine before being relied on: chmodSync(0o444) makes writeFileSync throw EPERM on Windows.
//
// WHAT THIS DOES NOT STOP, measured rather than assumed. Git does not write through the file handle - it
// unlinks and recreates - so `git checkout <branch> -- <path>` REPLACES a read-only candidate without
// complaint. Verified in a throwaway repo before this was written down, because a control believed to be
// stronger than it is, is worse than no control.
//
// That cuts both ways and the direction is the useful one: `git checkout -- <path>` remains the recovery
// path even while frozen, which is how the candidate was restored the day this was written. The exposure
// left is a deliberate git operation, which is a different and much more visible act than a script
// defaulting an argument. Two things still cover it: the watchdog pins the sha independently and aborts on
// a mismatch, and `status` compares the file against the recorded freeze and exits 1 when they differ.
////   node qa/verification/candidate_freeze.mjs status
//   node qa/verification/candidate_freeze.mjs freeze  <reason>
//   node qa/verification/candidate_freeze.mjs unfreeze <reason>
//
// A freeze is not reported until a probe has actually been REFUSED by the filesystem. A control that has
// not been shown to fire is a claim.
import { readFileSync, writeFileSync, chmodSync, openSync, closeSync, existsSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../..');
const CANDIDATE = join(ROOT, 'supabase/functions/sem-ai-command/index.ts');
const STATE = join(HERE, 'CANDIDATE_FREEZE.json');

const bytes = () => readFileSync(CANDIDATE);
const sha = () => createHash('sha256').update(bytes()).digest('hex');
const readState = () => (existsSync(STATE) ? JSON.parse(readFileSync(STATE, 'utf8')) : null);

// r+ asks for write access without writing anything. On a read-only file the OPEN is refused, so the probe
// can never damage the artifact it is checking - which matters, because it runs against the real candidate.
function writable() {
  try { closeSync(openSync(CANDIDATE, 'r+')); return true; }
  catch (e) { if (e.code === 'EPERM' || e.code === 'EACCES') return false; throw e; }
}

const cmd = process.argv[2] || 'status';
const reason = process.argv.slice(3).join(' ').trim();

if (cmd === 'status') {
  const st = readState();
  console.log('candidate : ' + CANDIDATE);
  console.log('sha256    : ' + sha());
  console.log('bytes     : ' + statSync(CANDIDATE).size);
  console.log('writable  : ' + writable());
  console.log('state     : ' + (st ? st.state + ' since ' + st.at + ' -- ' + st.reason : 'never recorded'));
  if (st && st.state === 'FROZEN' && st.sha256 !== sha()) {
    console.log('MISMATCH  : the frozen record names ' + st.sha256 + ', the file on disk is different');
    process.exit(1);
  }
  process.exit(0);
}

if (cmd === 'freeze') {
  if (!reason) { console.log('freeze needs a reason (which verifier, which candidate)'); process.exit(2); }
  chmodSync(CANDIDATE, 0o444);
  if (writable()) { console.log('FREEZE FAILED: the file is still writable after chmod'); process.exit(1); }
  const rec = { state: 'FROZEN', sha256: sha(), bytes: statSync(CANDIDATE).size, at: new Date().toISOString(), reason };
  writeFileSync(STATE, JSON.stringify(rec, null, 2) + '\n');
  console.log('FROZEN ' + rec.sha256 + ' (' + rec.bytes + ' bytes)');
  console.log('a write was attempted and REFUSED by the filesystem, so this is measured, not asserted');
  process.exit(0);
}

if (cmd === 'unfreeze') {
  if (!reason) { console.log('unfreeze needs a reason -- an unexplained thaw is how a frozen candidate moves'); process.exit(2); }
  const st = readState();
  if (st && st.state === 'FROZEN' && st.sha256 !== sha()) {
    console.log('REFUSING: the file already differs from the frozen record. Restore it first.');
    console.log('  recorded: ' + st.sha256);
    console.log('  on disk : ' + sha());
    process.exit(1);
  }
  chmodSync(CANDIDATE, 0o644);
  if (!writable()) { console.log('UNFREEZE FAILED: the file is still read-only'); process.exit(1); }
  writeFileSync(STATE, JSON.stringify({ state: 'THAWED', sha256: sha(), bytes: statSync(CANDIDATE).size, at: new Date().toISOString(), reason }, null, 2) + '\n');
  console.log('THAWED ' + sha() + ' -- ' + reason);
  process.exit(0);
}

console.log('unknown command: ' + cmd);
process.exit(2);
