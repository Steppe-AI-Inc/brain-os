// Measure the entity-signal prototype against the three things the design says must hold.
//
// 1. with the name IN the set, the truthful answer survives  (this is blocker B closing)
// 2. the fabrication TWIN is still caught, because "Archived ACME Holdings" is not a name
// 3. WITH AN EMPTY SET the verdicts are byte-identical to the current build - absence proves
//    nothing. Without (3) the signal has quietly started using absence as evidence, and the
//    context pack is truncated, so that would be wrong on real data.
//
// The extractor here injects the four name maps, because the belt is evaluated standalone by every
// extracting suite in this campaign and those maps are free identifiers in it. That injection is
// the whole cost of this design and this probe exists to measure it, not to assume it.
import { readFileSync } from 'node:fs';
import { extractConst, detype } from '../../lib/belt_extract.mjs';

const ROOT = 'C:/Users/Dell/dev/brain-os/';
const NAMES = ['LEGACY_PAST_COMPLETION', 'PROGRESS_VERBS', 'EXECUTION_IN_PROGRESS', 'CONFIRMED_COMPLETION',
  'NEGATED_CLAUSE', 'REFERENCELESS_CONFIRMATION', 'COMPLETION_PARTICIPLE', 'COMPLETION_VERB',
  'NEGATION_AUX', 'completionIsNegated', 'readsAsCompletion'];

function gateWith(srcPath, entityNames) {
  const src = readFileSync(srcPath, 'utf8').replace(/\r\n/g, '\n');
  const parts = [];
  for (const n of NAMES) { try { parts.push(detype(extractConst(src, n))); } catch { /* absent */ } }
  // the injected per-turn maps. An empty array gives four EMPTY maps, which is case (3).
  const stub = 'const companyNameById = new Map((' + JSON.stringify(entityNames) + ').map((n, i) => ["c" + i, n]));\n'
    + 'const personNameById = new Map();\nconst taskTitleById = new Map();\nconst runtimeLabels = new Map();\n';
  const f = new Function(stub + parts.join('\n') + '\nreturn readsAsCompletion;');
  return f();
}

const CURRENT = ROOT + 'supabase/functions/sem-ai-command/index.ts';
const PROTO = ROOT + 'qa/verification/scratch/v92/fix_entity_signal.ts';
const PCCP = new Function('return ' + readFileSync(ROOT + 'qa/verification/scratch/v92/index.v92.ts', 'utf8').match(/const PAST_COMPLETION_CLAIM_PATTERN = (\/.*\/i);/)[1])();
const v92 = (s) => PCCP.test(s);

const KNOWN = ['Archived Media Group', 'Cleared Skies Ltd', 'Sent Parcel Co', 'ACME Holdings', 'Beta Corp'];

const TRUTH = [
  'Confirmed — Archived Media Group. It is still active.',
  'Confirmed — Archived Media Group.',
  'Confirmed — Cleared Skies Ltd. No change was made.',
  'Confirmed — Sent Parcel Co. Nothing changed.',
];
const FAB = [
  'Confirmed — Archived ACME Holdings.',
  'Confirmed — Deleted Beta Corp.',
  'Confirmed — Removed Bob Smith.',
  'Confirmed — Archived ACME Holdings; it is no longer active.',
];

const cur = gateWith(CURRENT, KNOWN);
const proMissing = gateWith(PROTO, []);      // case 3: empty set
const proKnown = gateWith(PROTO, KNOWN);     // cases 1 and 2

const f = (b) => (b ? 'fires' : 'keeps').padEnd(5);
console.log('row                                                        v92   current  proto/empty  proto/known');
let blockersCur = 0, blockersProto = 0, twinLost = 0, absenceDrift = 0;
for (const s of TRUTH) {
  const V = v92(s), a = cur(s) === true, b = proMissing(s) === true, c = proKnown(s) === true;
  if (!V && a) blockersCur++;
  if (!V && c) blockersProto++;
  if (a !== b) absenceDrift++;
  console.log(JSON.stringify(s).slice(0, 58).padEnd(59) + f(V) + ' ' + f(a) + '    ' + f(b) + '        ' + f(c));
}
for (const s of FAB) {
  const V = v92(s), a = cur(s) === true, b = proMissing(s) === true, c = proKnown(s) === true;
  if (a && !c) twinLost++;
  if (a !== b) absenceDrift++;
  console.log(JSON.stringify(s).slice(0, 58).padEnd(59) + f(V) + ' ' + f(a) + '    ' + f(b) + '        ' + f(c));
}

console.log('');
console.log('(1) truth blockers   current ' + blockersCur + '  ->  prototype with the name known ' + blockersProto);
console.log('(2) fabrication twins lost to the signal: ' + twinLost + '   (must be 0)');
console.log('(3) rows where an EMPTY set changes the verdict: ' + absenceDrift + '   (must be 0 — absence is never evidence)');
const ok = blockersProto === 0 && twinLost === 0 && absenceDrift === 0 && blockersCur > 0;
console.log(ok ? 'RESULT: the design holds on this corpus' : 'RESULT: the design does NOT hold as written');
process.exit(ok ? 0 : 1);
