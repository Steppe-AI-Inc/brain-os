// VERIFIER #57 — checkpoint writer (CURRENT_CAMPAIGN.json, verifier57_* keys only).
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
const ROOT = resolve(new URL('../../../..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const p = resolve(ROOT, 'qa/verification/CURRENT_CAMPAIGN.json');
const j = JSON.parse(readFileSync(p, 'utf8'));
const status = process.argv[2] || j.verifier57_status;
const extra = process.argv[3] ? JSON.parse(readFileSync(resolve(ROOT, process.argv[3]), 'utf8')) : null;
j.verifier57_last_checkpoint_at = new Date().toISOString();
j.verifier57_status = status;
if (extra) {
  const byId = new Map((j.verifier57_findings || []).map((f) => [f.id, f]));
  for (const f of extra) byId.set(f.id, f);
  j.verifier57_findings = [...byId.values()];
}
writeFileSync(p, JSON.stringify(j, null, 2) + '\n');
console.log('checkpoint written:', status, 'findings', (j.verifier57_findings || []).length);
