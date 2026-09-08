// VERIFIER #58 — merge findings from a JSON file into qa/verification/CURRENT_CAMPAIGN.json (verifier58_* keys only).
// usage: node checkpoint.mjs <findings.json> [status text]
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const HERE = dirname(fileURLToPath(import.meta.url)); const ROOT = resolve(HERE, '../../../..');
const p = resolve(ROOT, 'qa/verification/CURRENT_CAMPAIGN.json');
const j = JSON.parse(readFileSync(p, 'utf8'));
const [file, status] = process.argv.slice(2);
const add = file ? JSON.parse(readFileSync(resolve(HERE, file), 'utf8')) : [];
const byId = new Map((j.verifier58_findings || []).map((f) => [f.id, f]));
for (const f of add) byId.set(f.id, f);
j.verifier58_findings = [...byId.values()];
if (status) j.verifier58_status = status;
j.verifier58_last_checkpoint_at = new Date().toISOString();
writeFileSync(p, JSON.stringify(j, null, 2) + '\n');
console.log('checkpoint ok:', j.verifier58_findings.length, 'findings;', j.verifier58_last_checkpoint_at);
