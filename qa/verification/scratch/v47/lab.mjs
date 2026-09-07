// VERIFIER #47 lab — my own instrument. Independently written; the only thing borrowed from
// prior rounds is the location of the belt anchors, which I re-check here.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(HERE, '..', '..', '..', '..');
if (!fs.existsSync(path.join(ROOT, 'supabase/functions/sem-ai-command/index.ts'))) {
  throw new Error('v47 lab: ROOT resolved wrong -> ' + ROOT);
}
export const IDX = process.env.SEM_INDEX_SRC
  ? path.resolve(process.env.SEM_INDEX_SRC)
  : path.join(ROOT, 'supabase/functions/sem-ai-command/index.ts');
export const V92P = path.join(ROOT, 'qa/verification/scratch/v92/index.v92.ts');

export const SRC_LF = fs.readFileSync(IDX, 'utf8').replace(/\r\n/g, '\n');
export const V92_LF = fs.readFileSync(V92P, 'utf8').replace(/\r\n/g, '\n');

// ── candidate belt ────────────────────────────────────────────────────────────────────
export function extractBelt(source) {
  const s = source.replace(/\r\n/g, '\n');
  const a = s.indexOf('const LEGACY_PAST_COMPLETION');
  const b = s.indexOf('const readsAsCompletion', a);
  const c = s.indexOf('const legacyProseFallback', b);
  if (a < 0 || b < 0 || c < 0) throw new Error('v47: belt anchors missing');
  const slice = s.slice(a, c).split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n')
    .replace(/\(c:\s*string\):\s*boolean\s*=>/g, '(c) =>');
  if (/:\s*(?:string|boolean|number|any)\b\s*(?:\)|=>|=)/.test(slice)) throw new Error('v47: TypeScript survived stripping');
  return slice;
}
export function makeBelt(source, names, claims) {
  const f = new Function('__n', '__c', `const knownEntityNames = __n; const verifiedClaims = __c;
    ${extractBelt(source)}
    return { readsAsCompletion, completionIsNegated, EXECUTION_IN_PROGRESS, COMPLETION_VERB,
             COMPLETION_PARTICIPLE, CONFIRMED_COMPLETION, LEGACY_PAST_COMPLETION };`);
  return f(new Set((names || []).map((x) => String(x).toLowerCase())), claims || []);
}
export const belt = makeBelt(SRC_LF, []);
export const fires = (s) => belt.readsAsCompletion(String(s));

const line = (txt, needle) => {
  const l = txt.split('\n').find((x) => x.includes(needle));
  if (!l) throw new Error('v47: ' + needle + ' not found');
  return l.trim();
};
const reOf = (txt, name) => new Function(line(txt, 'const ' + name) + '\nreturn ' + name + ';')();

export const V92_PAST = reOf(V92_LF, 'PAST_COMPLETION_CLAIM_PATTERN');
export const V92_FUT = reOf(V92_LF, 'FUTURE_PROMISE_PATTERN');
export const CAND_FUT = reOf(SRC_LF, 'FUTURE_PROMISE_PATTERN');

// ── v92's THIRD prose arm, which qa/verification/lib/v92_reference.mjs omits ───────────
// v92 index.ts:2667/2973/3060/3135 build claimsTaskDeleted / claimsCompanyDeleted /
// claimsPersonDeleted / claimsGoalDeleted purely from PROSE (claimsLifecycleClaim over
// result.summary) with every id array empty and no pendingAction — exactly the ungrounded
// turn this campaign's differential holds fixed. They feed lifecycleMismatchCorrections,
// which OVERWRITES result.summary at :4174. Extracted from v92's own source, not retyped.
function extractFn(txt, name) {
  const a = txt.indexOf('function ' + name);
  if (a < 0) throw new Error('v47: function ' + name + ' missing');
  let depth = 0, end = -1;
  for (let k = txt.indexOf('{', a); k < txt.length; k++) {
    if (txt[k] === '{') depth++;
    else if (txt[k] === '}') { depth--; if (depth === 0) { end = k + 1; break; } }
  }
  return txt.slice(a, end)
    .replace(/\(summary:\s*string,\s*verbAlternation:\s*string,\s*nounAlternation:\s*string\):\s*boolean/, '(summary, verbAlternation, nounAlternation)');
}
export const v92ClaimsLifecycleClaim = new Function(
  extractFn(V92_LF, 'claimsLifecycleClaim') + '\nreturn claimsLifecycleClaim;')();
export const candClaimsLifecycleClaim = new Function(
  extractFn(SRC_LF, 'claimsLifecycleClaim') + '\nreturn claimsLifecycleClaim;')();

const LC_ARMS = [
  ['delet(ed|ing)|archiv(ed|ing)|remov(ed|ing)|restor(ed|ing)', 'task'],
  ['delet(ed|ing)|archiv(ed|ing)|remov(ed|ing)|restor(ed|ing)', 'company'],
  ['delet(ed|ing)|archiv(ed|ing)|remov(ed|ing)|end(ed|ing)|restor(ed|ing)', 'employe(e|d)|person|staff'],
  ['delet(ed|ing)|archiv(ed|ing)|remov(ed|ing)|restor(ed|ing)', 'goal'],
];
export const v92LifecycleArm = (s) => LC_ARMS.some(([v, n]) => v92ClaimsLifecycleClaim(String(s), v, n));
export const candLifecycleArm = (s) => LC_ARMS.some(([v, n]) => candClaimsLifecycleClaim(String(s), v, n));

/** TWO-ARM model, as qa/verification/lib/v92_reference.mjs has it. */
export const v92Destroys2 = (s) => V92_FUT.test(String(s)) || V92_PAST.test(String(s));
/** THREE-ARM model — what deployed v92 actually does to an ungrounded turn's prose. */
export const v92Destroys3 = (s) => v92LifecycleArm(s) || V92_FUT.test(String(s)) || V92_PAST.test(String(s));
/** what the candidate does to the same prose, across all of ITS arms. */
export const candDestroys = (s) => candLifecycleArm(s) || CAND_FUT.test(String(s)) || fires(s);

export function v92Arm3(s) {
  if (v92LifecycleArm(s)) return 'LIFECYCLE_MISMATCH';
  if (V92_FUT.test(String(s))) return 'FUTURE_PROMISE';
  if (V92_PAST.test(String(s))) return 'PAST_COMPLETION';
  return null;
}

// self-checks: each arm must be independently reachable, or this file is a one-arm model.
{
  const w1 = 'I am going to archive the company for you.';
  if (!(V92_FUT.test(w1) && !V92_PAST.test(w1))) throw new Error('v47 lab: future arm not distinguishable');
  const w2 = 'Deleting the task now.';
  if (!(v92LifecycleArm(w2) && !V92_FUT.test(w2) && !V92_PAST.test(w2))) {
    throw new Error('v47 lab: lifecycle arm not distinguishable — witness=' + w2);
  }
}
