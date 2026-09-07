import fs from 'node:fs';
const p = 'qa/verification/CURRENT_CAMPAIGN.json';
const d = JSON.parse(fs.readFileSync(p, 'utf8'));
const add = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
d.VERIFIER47_RUN = Object.assign(d.VERIFIER47_RUN || {}, add);
d.VERIFIER47_RUN.last_checkpoint_at = new Date().toISOString();
fs.writeFileSync(p, JSON.stringify(d, null, 2));
console.log('checkpoint written:', Object.keys(add).join(', '));
