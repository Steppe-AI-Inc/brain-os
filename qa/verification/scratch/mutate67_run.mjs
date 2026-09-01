import { readFileSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { ROOT, SRC, ORIG, ORIG_HASH, SUITES } from './mutate67_head.mjs';
import { MUTATIONS } from './mutate67.mjs';

function applyEnvelopeMove(src) {
  const envStart = src.indexOf('        // ONE AUTHORITATIVE RESPONSE ENVELOPE.');
  const envIdx = src.indexOf('result.verifiedResponse = {', envStart);
  let m = '        };\r\n', envEnd = src.indexOf(m, envIdx);
  if (envEnd === -1) { m = '        };\n'; envEnd = src.indexOf(m, envIdx); }
  if (envStart === -1 || envIdx === -1 || envEnd === -1) throw new Error('envelope block not found');
  envEnd += m.length;
  const block = src.slice(envStart, envEnd);
  const out = src.slice(0, envStart) + src.slice(envEnd);
  const anchor = out.indexOf('        // Bug 1 (2026-08-30 ');
  if (anchor === -1) throw new Error('confirmation-override anchor missing');
  return out.slice(0, anchor) + block + out.slice(anchor);
}

const undetected = [];
let ran = 0;
for (const [name, from, to] of MUTATIONS) {
  let mutated;
  if (from === 'ENVELOPE_MOVE') mutated = applyEnvelopeMove(ORIG);
  else {
    if (!ORIG.includes(from)) { console.log('SKIP   ' + name + '  (anchor not found)'); continue; }
    mutated = ORIG.replace(from, to);
    if (mutated === ORIG) { console.log('SKIP   ' + name + '  (no-op)'); continue; }
  }
  ran++;
  writeFileSync(SRC, mutated);
  const caught = [];
  for (const [tag, cmd] of SUITES) {
    try { execSync(cmd, { cwd: ROOT, stdio: 'pipe' }); } catch { caught.push(tag); }
  }
  writeFileSync(SRC, ORIG);
  const h = createHash('sha256').update(readFileSync(SRC)).digest('hex');
  if (h !== ORIG_HASH) throw new Error('RESTORE FAILED after ' + name);
  if (caught.length === 0) undetected.push(name);
  console.log((caught.length ? 'CAUGHT' : 'MISSED') + ' ' + name.padEnd(58) + ' by [' + caught.join(',') + ']');
}
console.log('');
console.log('mutations run: ' + ran + ', UNDETECTED: ' + undetected.length);
for (const u of undetected) console.log('  MISSED - ' + u);
console.log('sha256 after restore: ' + createHash('sha256').update(readFileSync(SRC)).digest('hex'));
console.log('baseline            : ' + ORIG_HASH);
