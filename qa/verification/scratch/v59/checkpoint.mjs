#!/usr/bin/env node
// merge verifier59_* keys into qa/verification/CURRENT_CAMPAIGN.json (never touches other keys)
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const HERE = dirname(fileURLToPath(import.meta.url));
const FILE = resolve(HERE, '../../CURRENT_CAMPAIGN.json');
const patch = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const cur = JSON.parse(readFileSync(FILE, 'utf8'));
for (const [k, v] of Object.entries(patch)) {
  if (!k.startsWith('verifier59_')) throw new Error('only verifier59_* keys: ' + k);
  if (k === 'verifier59_findings') { const seen = new Map((cur[k] || []).map((f) => [f.id, f])); for (const f of v) seen.set(f.id, f); cur[k] = [...seen.values()]; }
  else cur[k] = v;
}
cur.verifier59_last_checkpoint_at = new Date().toISOString();
writeFileSync(FILE, JSON.stringify(cur, null, 2) + '\n');
console.log('checkpoint written: ' + Object.keys(patch).join(', '));
