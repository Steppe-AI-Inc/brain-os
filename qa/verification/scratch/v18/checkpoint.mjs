// VERIFIER #18 checkpoint writer. `node qa/verification/scratch/v18/checkpoint.mjs '<json patch>'`
import { readFileSync, writeFileSync } from 'node:fs';
const P = 'qa/verification/CURRENT_CAMPAIGN.json';
const d = JSON.parse(readFileSync(P, 'utf8'));
const patch = JSON.parse(process.argv[2]);
function merge(a, b) {
  for (const [k, v] of Object.entries(b)) {
    if (v && typeof v === 'object' && !Array.isArray(v) && a[k] && typeof a[k] === 'object' && !Array.isArray(a[k])) merge(a[k], v);
    else a[k] = v;
  }
}
merge(d, patch);
d.last_checkpoint_at = new Date().toISOString();
writeFileSync(P, JSON.stringify(d, null, 1) + '\n');
console.log('checkpointed:', Object.keys(patch).join(','));
