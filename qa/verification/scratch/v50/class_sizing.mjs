// VERIFIER #50 — size the G-PA-T (pendingAction-turn history) class BEFORE and AFTER the V49-D1
// strip, and the E-F / L-F-STRADDLE classes, by running MY differential against three trees:
//   894c958  = the tree #49 FAILED (no strip)        27bd9f0 = the tree before that
//   HEAD     = this candidate
// The point: "moved toward v92 parity" is a direction, not a closure — this measures the distance left.
import { spawnSync } from 'node:child_process';
const TREES = [
  ['27bd9f0', 'qa/verification/scratch/v49/index.27bd9f0.ts'],
  ['894c958', 'qa/verification/scratch/v50/index.894c958.ts'],
  ['HEAD   ', 'supabase/functions/sem-ai-command/index.ts'],
];
for (const [label, src] of TREES) {
  const r = spawnSync(process.execPath, ['qa/verification/scratch/v50/differential.mjs'], { encoding: 'utf8', env: { ...process.env, SEM_INDEX_SRC: src, V50_LAX: label.trim() === 'HEAD' ? '' : '1' }, maxBuffer: 1 << 26 });
  const out = (r.stdout || '') + (r.stderr || '');
  const head = out.split('\n').filter((l) => /^(TRUTHFUL|FABRICATED)/.test(l)).join(' || ');
  if (!head) console.log(label + '  CRASH: ' + out.slice(-400).replace(/\s+/g, ' '));
  const sec = (name) => (out.match(new RegExp('^\\s+' + name.replace(/[-]/g, '\\-') + '\\s+n=.*$', 'm')) || ['(absent)'])[0].trim();
  console.log(`${label}  ${head}`);
  for (const s of ['G-PA-T', 'G-PA-F', 'E-F', 'E-T', 'L-F', 'L-F-STRADDLE', 'B-F', 'C-T']) console.log('          ' + sec(s));
  if (r.status === null) console.log('          (crashed: ' + out.slice(-300).replace(/\s+/g, ' ') + ')');
}
