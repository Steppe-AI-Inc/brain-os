#!/usr/bin/env node
// verifier14 checkpoint helper: node v14_checkpoint.mjs <json-patch-file>
import fs from 'node:fs';
const P = 'qa/verification/CURRENT_CAMPAIGN.json';
const patch = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const d = JSON.parse(fs.readFileSync(P, 'utf8'));
function merge(a, b) {
  for (const k of Object.keys(b)) {
    if (b[k] && typeof b[k] === 'object' && !Array.isArray(b[k]) && a[k] && typeof a[k] === 'object' && !Array.isArray(a[k])) merge(a[k], b[k]);
    else a[k] = b[k];
  }
  return a;
}
merge(d, patch);
d.last_checkpoint_at = new Date().toISOString();
fs.writeFileSync(P, JSON.stringify(d, null, 1));
console.log('checkpoint written', d.last_checkpoint_at);
