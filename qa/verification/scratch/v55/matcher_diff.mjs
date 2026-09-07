// VERIFIER #55 — my own disambiguation-matcher differential (candidate vs deployed v92), plus the
// replay-branch decision (which field arms, what summary the founder sees) on the candidate via the
// real statements. Builds matchDisambiguationOption from each source with my scanner and pulls in
// every top-level const the function body references.
import fs from 'node:fs';
import { grabConst, grabFn } from './shared_arms_identity.mjs';
import { buildMatcher as theirBuildMatcher, buildDecide } from '../../lib/belt_extract.mjs';

const CAND = process.env.SEM_INDEX_SRC || 'supabase/functions/sem-ai-command/index.ts';
const V92 = 'qa/verification/scratch/v92/v92.lf.ts';

function detype(code) {
  return code
    .replace(/\(command: string, options: PendingActionOption\[\]\): PendingActionOption \| null/g, '(command, options)')
    .replace(/\((\w+): PendingActionOption\)/g, '($1)')
    .replace(/\((\w+): string\)/g, '($1)')
    .replace(/: Record<string, Record<string, string>>/g, '')
    .replace(/: Record<string, string>/g, '')
    .replace(/: string\[\]/g, '')
    .replace(/ as string\[\]/g, '')
    .replace(/ as string/g, '');
}
function buildMatcher(path) {
  const src = fs.readFileSync(path, 'utf8').replace(/\r\n/g, '\n');
  const fn = grabFn(src, 'matchDisambiguationOption');
  // top-level consts referenced by the function
  const topConsts = new Set([...src.matchAll(/^const ([A-Za-z_$][\w$]*)/gm)].map((m) => m[1]));
  const refs = [...new Set([...fn.matchAll(/\b([A-Z_][A-Z0-9_]{2,})\b/g)].map((m) => m[1]))].filter((n) => topConsts.has(n));
  const deps = refs.map((n) => detype(grabConst(src, n))).join('\n');
  const body = 'const knownEntityNames = new Set();\n' + deps + '\n' + detype(fn) + '\nreturn matchDisambiguationOption;';
  return { fn: new Function(body)(), refs };
}
const cand = buildMatcher(CAND), prod = buildMatcher(V92);
const theirs = theirBuildMatcher(CAND);
console.log('candidate matcher deps:', cand.refs.join(','), '| v92 deps:', prod.refs.join(',') || '(none)');

const opts = (labels, actionType = 'archive', entityType = 'company') => labels.map((label, i) => ({ id: 'id-' + (i + 1), label, entityType, actionType }));
const O2 = opts(['ACME Corp', 'ACME Company']);
const O3 = opts(['Nomin Holding', 'Nomin Trading', 'Nomin Foods']);
const OV = opts(['Restored Furniture Co', 'Restore Hardware Ltd'], 'archive');
const OP = opts(['Bob Smith', 'Bob Smithers'], 'end_employment', 'person');
const ON = opts(['No Limits Inc', 'Nothing Bundt Cakes']);
const SHAPES = [
  ['ACME Corp', O2], ['acme corp', O2], ['ACME Company', O2], ['ACME', O2], ['the first one', O2], ['option 1', O2], ['1', O2], ['2', O2], ['the second one', O2],
  ['second', O2], ['do the ACME Corp one', O2], ['ACME Corp please', O2], ['I meant ACME Corp', O2], ['both', O2], ['neither', O2], ['none of them', O2],
  ['Nomin Foods', O3], ['the third', O3], ['option 3', O3], ['the last one', O3], ['Nomin', O3], ['nomin trading', O3], ['3', O3], ['restore Restored Furniture Co', OV],
  ['Restored Furniture Co', OV], ['archive Restore Hardware Ltd', OV], ['Restore Hardware Ltd', OV], ['restore it', OV], ['Bob Smith', OP], ['bob smithers', OP], ['the Bob Smith one', OP],
  ['No Limits Inc', ON], ['Nothing Bundt Cakes', ON], ['option 2', ON], ['yes', O2], ['cancel', O2], ['ACME Corp or ACME Company', O2], ['not ACME Corp', O2],
];
let same = 0, diff = 0, mism = 0;
const decide = buildDecide(CAND);
for (const [cmd, o] of SHAPES) {
  let a, b, t;
  try { a = cand.fn(cmd, o); } catch (e) { a = 'THROW ' + e.message; }
  try { b = prod.fn(cmd, o); } catch (e) { b = 'THROW ' + e.message; }
  try { t = theirs(cmd, o); } catch (e) { t = 'THROW ' + e.message; }
  const la = a && a.id ? a.label : String(a), lb = b && b.id ? b.label : String(b), lt = t && t.id ? t.label : String(t);
  if (la !== lt) mism++;
  if (la === lb) same++; else diff++;
  let d = '';
  try { const r = decide(cmd, o); d = ' | replay armed=' + r.armed + ' summary=' + JSON.stringify(r.summary); } catch (e) { d = ' | replay THROW ' + e.message; }
  console.log((la === lb ? '  same ' : '  DIFF ') + JSON.stringify(cmd).padEnd(32) + ' cand=' + la.padEnd(22) + ' v92=' + lb.padEnd(22) + (la !== lt ? ' [MY-HARNESS-MISMATCH]' : '') + d);
}
console.log('shapes', SHAPES.length, 'same', same, 'diff', diff, 'my-harness-vs-belt_extract mismatches', mism);
