// VERIFIER #55 checkpoint writer — usage: node checkpoint.mjs <status> [findings.json]
import fs from 'node:fs';
const p = 'qa/verification/CURRENT_CAMPAIGN.json';
const j = JSON.parse(fs.readFileSync(p, 'utf8'));
j.verifier55_last_checkpoint_at = new Date().toISOString();
if (process.argv[2]) j.verifier55_status = process.argv[2];
if (process.argv[3]) {
  const add = JSON.parse(fs.readFileSync(process.argv[3], 'utf8'));
  j.verifier55_findings = j.verifier55_findings || [];
  for (const f of add) {
    const i = j.verifier55_findings.findIndex((x) => x.id === f.id);
    if (i >= 0) j.verifier55_findings[i] = f; else j.verifier55_findings.push(f);
  }
}
fs.writeFileSync(p, JSON.stringify(j, null, 2) + '\n');
console.log('checkpoint ok', j.verifier55_last_checkpoint_at, 'findings', (j.verifier55_findings || []).length);
