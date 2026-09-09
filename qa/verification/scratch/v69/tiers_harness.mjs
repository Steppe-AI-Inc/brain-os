// VERIFIER #69 — the THREE real tiers sliced from index.ts (never re-implemented):
//   exec    : the raw-command lifecycle EXECUTOR gate (commandFallbackAllowed + head action + command name)
//   intent  : the request-intent tier (requestedIntent)
//   receipt : the never-silent receipt's REASON / entity naming block
// Each is `new Function` over a window of the real source. A window that is missing a name it must contain
// throws — this harness refuses to measure a fragment.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { stripTS, withSharedConstants } from '../../../scenarios-runner/_gate_extract.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
export const SRC = process.env.SEM_INDEX_SRC || resolve(HERE, '../../../../supabase/functions/sem-ai-command/index.ts');
const raw = readFileSync(SRC, 'utf8');
const src = raw.replace(/\r\n?/g, '\n');

function stmt(text, n) {
  // A declaration may carry a TS type annotation: `const x: string | null = ...`.
  const m = new RegExp('const ' + n + '(?:\\s*:[^=\\n]*)?\\s*=').exec(text);
  const at = m ? m.index : -1;
  if (at < 0) throw new Error(n + ' not found');
  let d = 0;
  for (let i = at; i < text.length; i++) {
    const c = text[i];
    if (c === '(' || c === '[' || c === '{') d++;
    else if (c === ')' || c === ']' || c === '}') d--;
    else if (c === ';' && d === 0) return stripTS(text.slice(at, i + 1));
  }
  throw new Error(n + ' unterminated');
}
function between(text, a, b, inclusiveB = true) {
  const s = text.indexOf(a); if (s < 0) throw new Error('window start missing: ' + a);
  const e = text.indexOf(b, s); if (e < 0) throw new Error('window end missing: ' + b);
  return text.slice(s, inclusiveB ? e + b.length : e);
}

// ---------------------------------------------------------------- EXECUTOR GATE
// From `const commandMentionsCompany` through `const commandFallbackAllowed = ...;`, plus the module-level
// verb patterns and the lifecycleCommandName / lifecycleVerbAt / headLifecycleAction statements that decide
// WHICH name the resolver is handed.
const execWindow = (() => {
  const a = between(src, 'const commandMentionsCompany = ', 'const commandFallbackAllowed = ', false);
  const b = stmt(src, 'commandFallbackAllowed');
  const c = stmt(src, 'lifecycleCommandName');
  const d = src.slice(src.indexOf('function lifecycleVerbAt('), src.indexOf('\n', src.indexOf('function lifecycleVerbAt(')));
  const e = stmt(src, 'archiveVerbAt') + '\n' + stmt(src, 'restoreVerbAt') + '\n' + stmt(src, 'headLifecycleAction');
  const body = stripTS(a) + '\n' + b + '\n' + c + '\n' + stripTS(d) + '\n' + e;
  for (const must of ['commandMentionsCompany', 'IMPERATIVE_HEAD_RE', 'commandNegatedLead', 'commandReadLeadEffective',
    'commandImperativePosition', 'commandFallbackAllowed', 'lifecycleCommandName', 'headLifecycleAction']) {
    if (!body.includes(must)) throw new Error('executor window missing ' + must);
  }
  return withSharedConstants(src, stmt(src, 'ARCHIVE_VERB_PATTERN') + '\n' + stmt(src, 'RESTORE_VERB_PATTERN') + '\n' + body);
})();
const execFn = new Function('command', 'result', 'contextPack',
  execWindow + '\n; return { allowed: commandFallbackAllowed, head: headLifecycleAction, '
  + 'name: commandFallbackAllowed ? (headLifecycleAction === "archive" ? lifecycleCommandName(ARCHIVE_VERB_PATTERN) : headLifecycleAction === "restore" ? lifecycleCommandName(RESTORE_VERB_PATTERN) : null) : null, '
  + 'negated: commandNegatedLead, question: commandIsQuestion, readLead: commandReadLeadEffective, imperative: commandImperativePosition, mentionsCompany: commandMentionsCompany };');
/** The real executor gate. Returns what the resolver would be handed. */
export function execGate(command, result = {}) {
  return execFn(String(command), result, { companies: [], archivedCompanies: [] });
}
// The resolver's EXACT/FUZZY decision, applied to a fixture (this small part is a faithful restatement of
// resolveCompanyLifecycleTargets' pick logic for a command guess: exact normalised name executes; a fuzzy
// substring hit ASKS and never executes; nothing -> no line unless the command mentions a company noun).
const normaliseName = (v) => String(v || '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
export function simulateResolve(gate, action, fixture) {
  if (!gate.allowed || gate.head !== action || !gate.name) return { executes: false, asks: false };
  const wantStatus = action === 'restore' ? 'archived' : 'active';
  const cands = [...new Set([gate.name, gate.name.split(/[,.;]/)[0].trim()].filter((x) => x.length >= 2))];
  for (const name of cands) {
    const target = normaliseName(name);
    if (target.length < 2) continue;
    const exact = fixture.filter((r) => normaliseName(r.name) === target);
    let pick = exact, fuzzy = false;
    if (pick.length === 0) { pick = fixture.filter((r) => normaliseName(r.name).includes(target)); fuzzy = true; }
    if (pick.length > 1 && !fuzzy) { const pref = pick.filter((r) => r.status === wantStatus); if (pref.length === 1) pick = pref; }
    if (fuzzy && pick.length > 0) return { executes: false, asks: true, pick };
    if (pick.length === 1) return { executes: true, asks: false, pick };
    if (pick.length > 1) return { executes: false, asks: true, pick };
  }
  return { executes: false, asks: false };
}

// ---------------------------------------------------------------- INTENT TIER
const intentWindow = (() => {
  const start = src.indexOf('const MUTATION_ARRAY_FIELDS');
  const marker = '= requestedIntentPrimary;';
  const anchor = src.indexOf(marker, start);
  if (start < 0 || anchor < 0) throw new Error('intent window markers missing');
  const s = stripTS(src.slice(start, anchor + marker.length));
  for (const must of ['lexiconAlways', 'lexiconPassive', 'lexiconObject', 'lexiconImperative', 'requestedIntentPrimary',
    'readShaped', 'confirmationShaped', 'MUTATION_VERB_WITH_OBJECT', 'IMPERATIVE_OBJECT', 'STRONG_OBJECT', 'objectRefers',
    'MN_LOAN_VERB', 'NEGATED_IMPERATIVE_HEAD']) if (!s.includes(must)) throw new Error('intent window missing ' + must);
  return withSharedConstants(src, s);
})();
const intentFn = new Function('command', 'result', 'commandFallbackResolvedVerb',
  intentWindow + '\n; return { requestedIntent, readShaped, confirmationShaped, lexiconVerb, lexiconAlways, lexiconPassive, lexiconObject, lexiconImperative, lexiconReadVetoed, isQuestion, firstClauseIsMutation, lastClauseIsRead, lastClauseIsMutation, alwaysInImperativePosition, modelIntentKind, modelMutationField };');
export function intent(command, opts = {}) {
  return intentFn(String(command), opts.result || {}, opts.fallbackVerb === undefined ? null : opts.fallbackVerb);
}

// ---------------------------------------------------------------- RECEIPT REASON BLOCK
// From `const commandEntityNoun` through `const reason = ...;` — the block that names the entity and picks
// the reason. Inputs: commandText, requestedIntent, modelIntent, pendingQuestion, claimExecutionEvidence.
const receiptWindow = (() => {
  const s = between(src, 'const verb = /^архивл/i.test', 'const receiptPrefix = ', false);
  for (const must of ['commandEntityNoun', 'commandEntity', 'pluraliseEntity', 'negatedRequest', 'hypotheticalRequest', 'const reason'])
    if (!s.includes(must)) throw new Error('receipt window missing ' + must);
  return withSharedConstants(src, stripTS(s));
})();
const receiptFn = new Function('commandText', 'requestedIntent', 'modelIntent', 'pendingQuestion', 'claimExecutionEvidence',
  'const failed = claimExecutionEvidence.find((e) => e.error) || null; const attempted = claimExecutionEvidence.length > 0;\n'
  + receiptWindow + '\n; return { reason, verb, commandEntityNoun, commandEntity, negatedRequest, hypotheticalRequest, plural: commandEntity ? pluraliseEntity(commandEntity) : null };');
export function receipt(commandText, requestedIntent, opts = {}) {
  return receiptFn(String(commandText), requestedIntent, opts.modelIntent || null, opts.pendingQuestion || '', opts.evidence || []);
}

// ---------------------------------------------------------------- whole-turn composition
/** One turn: executor gate -> (simulated resolve on a fixture) -> intent (consuming the executor outcome). */
export function turn(command, { result = {}, fixture = [] } = {}) {
  const g = execGate(command, result);
  const modelEmittedArchive = (Array.isArray(result.archiveCompanyIds) && result.archiveCompanyIds.length > 0) || (Array.isArray(result.archiveCompanyNames) && result.archiveCompanyNames.length > 0);
  const modelEmittedRestore = (Array.isArray(result.restoreCompanyIds) && result.restoreCompanyIds.length > 0) || (Array.isArray(result.restoreCompanyNames) && result.restoreCompanyNames.length > 0);
  const ra = simulateResolve(g, 'archive', fixture), rr = simulateResolve(g, 'restore', fixture);
  const fallbackVerb = (g.allowed && !modelEmittedArchive && !modelEmittedRestore) ? (ra.executes ? 'archive' : rr.executes ? 'restore' : null) : null;
  const it = intent(command, { result, fallbackVerb });
  return { gate: g, executes: ra.executes || rr.executes, asks: ra.asks || rr.asks, fallbackVerb, intent: it.requestedIntent, tier: it };
}

export function selfTest() {
  const bad = [];
  const want = (c, expIntent, expExec, fixture = [{ name: 'ACME', status: 'active' }]) => {
    const t = turn(c, { fixture });
    if ((t.intent !== null) !== expIntent) bad.push(`${JSON.stringify(c)} intent expected ${expIntent} got ${JSON.stringify(t.intent)}`);
    if (t.executes !== expExec) bad.push(`${JSON.stringify(c)} executes expected ${expExec} got ${t.executes}`);
  };
  want('archive company ACME', true, true);
  want('archive ACME', true, true);
  want('should we archive ACME?', true, false);
  want('what companies are archived?', false, false);
  want('I nearly archived ACME', false, false);
  want('do not archive ACME', true, false);
  want('archive Acme Holdings', true, false, [{ name: 'ACME', status: 'active' }]); // no exact -> nothing
  want('yes', true, false);
  want('Share price fell after the announcement', false, false);
  want('archive "Nomin Holding" then tell me what is left', true, true, [{ name: 'Nomin Holding', status: 'active' }]);
  const r = receipt('archive approval A-1', { verb: 'archive', field: null });
  if (!/approval/.test(r.reason)) bad.push('receipt did not name approval: ' + r.reason);
  return bad;
}
if (process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('tiers_harness.mjs')) {
  const bad = selfTest();
  if (bad.length) { console.error('TIERS HARNESS SELFTEST FAIL:\n  ' + bad.join('\n  ')); process.exit(2); }
  console.log('tiers harness selftest: OK — exec / intent / receipt windows are the product\'s');
}
