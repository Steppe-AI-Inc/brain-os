import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');
const P = path.join(ROOT, 'qa', 'verification', 'CURRENT_CAMPAIGN.json');
const d = JSON.parse(fs.readFileSync(P, 'utf8'));
const now = new Date().toISOString();
let blk = d.VERIFIER_40_RUN;
let out = d;
if (!blk) {
  blk = {
    base_commit: '4cf2a88f720b90e5f8aeddaefa85cfbb6db2cdd4',
    index_sha256_at_start: '3798ad2f819749ff36daf6dd522a9e00cfe95a521ceb6bf92f810fa6de6f2901',
    preflight: 'EXECUTION_READY (A rev-parse ok, B scratch write ok, C past_completion_claim_regex 13/0)',
    started_at: now,
    worktree: '/c/Users/Dell/dev/brain-os-verify-4cf2a88',
    artifact_branch: 'verify-4cf2a88-campaign100',
    steps: {}, findings: [], verdict: null,
  };
  out = { VERIFIER_40_RUN: blk, ...d };
}
blk.last_checkpoint_at = now;
for (const a of process.argv.slice(2)) {
  if (a.startsWith('step:')) { const [k, v] = a.slice(5).split('='); blk.steps[k] = v; }
  else if (a.startsWith('find:')) { blk.findings.push(a.slice(5)); }
  else if (a.startsWith('verdict:')) { blk.verdict = a.slice(8); }
  else { const i = a.indexOf('='); blk[a.slice(0, i)] = a.slice(i + 1); }
}
fs.writeFileSync(P, JSON.stringify(out, null, 1));
console.log('checkpoint ok; findings=' + blk.findings.length);
