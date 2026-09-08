// VERIFIER #48 — my own growth measurement for the open V46-D1 item, plus the V46-D5 vocabulary gap.
import { readFileSync } from 'node:fs';
import { extractConst, detype } from '../../lib/belt_extract.mjs';
const SRC = readFileSync('supabase/functions/sem-ai-command/index.ts', 'utf8');
const N = ['LEGACY_PAST_COMPLETION', 'PROGRESS_VERBS', 'EXECUTION_IN_PROGRESS', 'CONFIRMED_COMPLETION',
  'NEGATED_CLAUSE', 'REFERENCELESS_CONFIRMATION', 'COMPLETION_PARTICIPLE', 'COMPLETION_VERB',
  'NEGATION_AUX', 'completionIsNegated', 'readsAsCompletion'];
const body = N.map((n) => detype(extractConst(SRC, n))).join('\n');
const readsAsCompletion = new Function('const knownEntityNames = new Set();\n' + body + '\nreturn readsAsCompletion;')();

// The worst shape #46 identified: ONE unsplittable clause carrying many SKIPPED negators, so the
// scan loop runs to completion for each, with a completion verb present so the early return misses.
function mkClause(kb) {
  const unit = 'No Limits Inc and No Frills Ltd and Nothing Bundt Cakes and Never Summer Co ';
  let s = '';
  while (s.length < kb * 1024) s += unit;
  return s + 'was archived';
}
console.log('=== V46-D1 growth on ONE unsplittable clause carrying skipped negators ===');
for (let i = 0; i < 200; i++) readsAsCompletion(mkClause(1)); // JIT warm-up before any timing
const pts = [];
for (const kb of [1, 2, 4, 8, 16, 32]) {
  const s = mkClause(kb);
  readsAsCompletion(s);
  const reps = kb <= 4 ? 20 : 3;
  const t0 = process.hrtime.bigint();
  for (let i = 0; i < reps; i++) readsAsCompletion(s);
  const ms = Number(process.hrtime.bigint() - t0) / 1e6 / reps;
  pts.push([s.length, ms]);
  console.log('  ' + String(kb).padStart(3) + ' KB (' + s.length + ' chars): ' + ms.toFixed(2) + ' ms');
}
let e = 0; let k = 0;
for (let i = 1; i < pts.length; i++) {
  const ei = Math.log(pts[i][1] / pts[i - 1][1]) / Math.log(pts[i][0] / pts[i - 1][0]);
  if (Number.isFinite(ei)) { e += ei; k++; }
}
console.log('  mean growth exponent e = ' + (e / k).toFixed(2) + '   (1.0 linear, 2.0 quadratic, 3.0 cubic)');
console.log('  max_tokens is 8192 with no length cap on result.summary, so 16 KB+ is reachable in principle.');

// Realistic-prose control: is this reachable by an ordinary long reply?
const prose = ('The company was archived. Nothing else was changed. No task was deleted. '
  + 'I checked the log and no record shows anything unusual. ').repeat(200);
{
  const t0 = process.hrtime.bigint();
  readsAsCompletion(prose);
  console.log('  control: ' + prose.length + ' chars of ORDINARY punctuated prose: '
    + (Number(process.hrtime.bigint() - t0) / 1e6).toFixed(2) + ' ms');
}

// ── V46-D5: CONFIRMED_COMPLETION's participle list vs COMPLETION_PARTICIPLE's ─────────────────
const CC = extractConst(SRC, 'CONFIRMED_COMPLETION');
const CP = extractConst(SRC, 'COMPLETION_PARTICIPLE');
const words = (s) => [...new Set((s.match(/\b(?:archived|deleted|updated|created|restored|activated|deactivated|assigned|reassigned|approved|rejected|declined|removed|completed|renamed|ended|closed|cleared|sent|moved|granted|added|confirmed)\b/gi) || []).map((w) => w.toLowerCase()))];
const inCP = words(CP); const inCC = words(CC);
console.log('\n=== V46-D5 CONFIRMED_COMPLETION vocabulary gap ===');
console.log('  in COMPLETION_PARTICIPLE but NOT in CONFIRMED_COMPLETION: ' + inCP.filter((w) => !inCC.includes(w)).join(', '));
for (const s of ['Confirmed — Closed the work order.', 'Confirmed — Added Bob Smith.',
  'Confirmed — Closed Loop Systems is still active.', 'Confirmed — Added Value Partners trades normally.',
  'Confirmed — Closed Captions Ltd remains active.']) {
  console.log('  ' + (readsAsCompletion(s) ? 'CAUGHT   ' : 'SHIPPED  ') + JSON.stringify(s));
}
