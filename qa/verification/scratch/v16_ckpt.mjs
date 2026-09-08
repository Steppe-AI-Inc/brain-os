import fs from 'node:fs';
const p = 'qa/verification/CURRENT_CAMPAIGN.json';
const [key, status, ...rest] = process.argv.slice(2);
const d = JSON.parse(fs.readFileSync(p, 'utf8'));
d.scenarios = d.scenarios || {};
d.scenarios[key] = { status, evidence: rest.join(' '), at: new Date().toISOString() };
d.last_checkpoint_at = new Date().toISOString();
fs.writeFileSync(p, JSON.stringify(d, null, 1));
console.log('CKPT', key, status);
