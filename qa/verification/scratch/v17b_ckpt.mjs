// Merge a scenario result into qa/verification/CURRENT_CAMPAIGN.json.
// usage: node v17b_ckpt.mjs <scenarioKey> <status> <evidenceFile-or-inline>
import { readFileSync, writeFileSync } from 'node:fs';
const P = 'qa/verification/CURRENT_CAMPAIGN.json';
const j = JSON.parse(readFileSync(P, 'utf8'));
const [key, status, ...rest] = process.argv.slice(2);
const evidence = rest.join(' ');
j.scenarios = j.scenarios || {};
j.scenarios[key] = Object.assign({}, j.scenarios[key], { status, evidence, at: new Date().toISOString() });
j.last_checkpoint_at = new Date().toISOString();
writeFileSync(P, JSON.stringify(j, null, 1));
console.log('checkpointed ' + key + ' = ' + status);
