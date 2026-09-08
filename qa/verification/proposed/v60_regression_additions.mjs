#!/usr/bin/env node
// v60_regression_additions — independent verifier #60 (campaign #120), candidate 9e39a47.
//
// Every row is tagged CONTRACT or DEFECT.
//   CONTRACT = a property the shipped source must hold; a failure means a real regression.
//   DEFECT   = a defect verifier #60 measured on 9e39a47; it FAILS on the candidate by design
//              and must pass once the defect is closed. Red here is the finding, not a bug in
//              this file.
// ANY failure exits non-zero.
//
// The source under test is resolved from SEM_INDEX_SRC, else from this file's own location, so
// the suite runs correctly from ANY working directory. Nothing is re-implemented: the context
// budget block and the structured-claim window are SLICED out of index.ts and executed.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..', '..', '..');           // qa/verification/proposed -> repo root
const SRC = process.env.SEM_INDEX_SRC || resolve(ROOT, 'supabase/functions/sem-ai-command/index.ts');
const GATE = resolve(ROOT, 'qa/scenarios-runner/_gate_extract.mjs');
const { stripTS, withPatternsAboveWindow } = await import('file://' + GATE.replace(/\\/g, '/'));
const rawSrc = readFileSync(SRC, 'utf8');
const src = rawSrc.replace(/\r\n/g, '\n');

let pass = 0; const failures = [];
const check = (kind, name, cond, detail) => {
  if (cond) { pass++; console.log(`OK   [${kind}] ${name}`); }
  else { failures.push(`[${kind}] ${name}` + (detail ? '\n       ' + detail : '')); console.log(`FAIL [${kind}] ${name}`); }
};

// ---------------------------------------------------------------------------------------
// The real context-budget block, sliced and executed.
// ---------------------------------------------------------------------------------------
function trimRunner() {
  const start = src.indexOf('const packBudget = ');
  // The block now ATTACHES contextBudget before the trim loop (so packTokens() measures the bytes that
  // will actually be sent) and finishes by writing estimatedTokens/overBudget. Slice to that final write,
  // falling back to the older layout where the attach was the last statement. Marker choice only — every
  // assertion below is unchanged, and the fallback keeps this suite meaningful against the old bytes.
  const finalMark = src.indexOf('contextBudget.overBudget = ', start);
  const endMark = finalMark >= 0 ? finalMark : src.indexOf('packRecord.contextBudget = ', start);
  if (start < 0 || endMark < 0) return null;
  const end = src.indexOf('\n', endMark);
  const block = stripTS(src.slice(start, end));
  const fn = new Function('command', 'pack', 'collections', 'Deno', `
    ${block}
    return { pack, collections, trimmed: contextTrimmed, budget: packBudget,
             loop: packRecord.contextBudget.estimatedTokens,
             preflight: Math.ceil(JSON.stringify({ command, contextPack: pack }).length / 4) };`);
  return (command, pack, collections, maxTokens = 12000) =>
    fn(command, pack, collections, { env: { get: (k) => (k === 'SEM_AI_MAX_TOKENS' ? String(maxTokens) : undefined) } });
}
const runTrim = trimRunner();
check('CONTRACT', 'the context-budget block is present and executable (incident 2026-09-08 / ledger #133)', runTrim !== null);

const uuid = (n) => `${String(n).padStart(8, '0')}-1111-4222-8333-444455556666`;
const many = (f, n) => Array.from({ length: n }, (_, i) => f(i));
const ARRAY_KEYS = ['companies', 'archivedCompanies', 'projects', 'tasks', 'memories', 'agents', 'products', 'inventory',
  'approvals', 'people', 'goals', 'companyRelationships', 'personAssignments', 'financialReports', 'conversationHistory',
  'factoryWorkOrders', 'channels', 'departments', 'leads', 'documents', 'proposals', 'productSpecs',
  'engineeringDrawings', 'aiProviders', 'mcpConnectors', 'archivedTasks'];

// A workspace whose trimmable arrays are already AT OR BELOW their floors, but whose untrimmable
// free text is bulky. This is the shape in which the trim loop can do nothing at all.
function floorShapedPack({ approvalReason = 540, namedAtTail = true } = {}) {
  const pack = { continuity: { verdict: 'read_only' }, activeChannelId: uuid(1), pendingAction: null,
    recentlyResolvedEntities: null, recentlyDeletedEntities: null,
    counts: { tasksTotal: 30, companiesTotal: 12 }, currentTurn: { turn: 4, command: 'x' } };
  const sizes = { companies: 8, archivedCompanies: 3, projects: 8, tasks: 8, memories: 4, agents: 5, products: 5,
    inventory: 5, approvals: 20, people: 10, goals: 8, companyRelationships: 8, personAssignments: 10,
    financialReports: 4, conversationHistory: 4, factoryWorkOrders: 4, channels: 6, departments: 8, leads: 8,
    documents: 8, proposals: 5, productSpecs: 5, engineeringDrawings: 5, aiProviders: 4, mcpConnectors: 4, archivedTasks: 4 };
  for (const k of ARRAY_KEYS) {
    pack[k] = many((i) => (k === 'approvals'
      ? { id: uuid(i), company_id: uuid(i), title: `Approval ${i}`, status: 'pending', risk_level: 'high', reason: 'x'.repeat(approvalReason) }
      : { id: uuid(i), company_id: uuid(i), name: `Row ${i} with an ordinary entity name`, title: `Row ${i} with an ordinary title`, full_name: `Person ${i}`, status: 'active' }), sizes[k]);
  }
  const named = { companies: ['name', 'QA-VERIFY-NAMED-CO'], people: ['full_name', 'QA-VERIFY-NAMED-PERSON'],
    tasks: ['title', 'QA-VERIFY-NAMED-TASK'], goals: ['title', 'QA-VERIFY-NAMED-GOAL'] };
  for (const [k, [field, val]] of Object.entries(named)) {
    const row = { ...pack[k][0], id: uuid(900), [field]: val };
    if (namedAtTail) pack[k].push(row); else pack[k].unshift(row);
  }
  const collections = {};
  for (const k of ARRAY_KEYS) collections[k] = { shown: pack[k].length, total: pack[k].length + 40, truncated: true };
  pack.collections = collections;
  return { pack, collections };
}

if (runTrim) {
  const CMD = 'What is the exact current title of the project that belongs to QA-VERIFY-NAMED-CO as stored right now?';

  // ---- V60-D1: the loop must never hand serve() a pack it knows is over budget. ----
  {
    const { pack, collections } = floorShapedPack({ approvalReason: 540 });
    const r = runTrim(CMD, pack, collections, 12000);
    check('DEFECT', 'V60-D1 an over-budget pack whose arrays are all at their floors still ends under the preflight cap',
      r.preflight <= 12000,
      `post-trim estimate ${r.preflight} > hardMax 12000 after ${r.trimmed.length} trims — serve() returns {"error":"Token preflight hard stop"} and the founder gets no answer at all (incident 2026-09-08 unclosed for this shape)`);
    check('DEFECT', 'V60-D1 the trim loop reports honestly when it could not reach the budget',
      r.loop <= r.budget || Object.prototype.hasOwnProperty.call(pack.contextBudget, 'overBudget'),
      `contextBudget.estimatedTokens=${r.loop} exceeds budget=${r.budget} and nothing on the pack says so`);
  }

  // ---- V60-D2: the row the founder named THIS TURN is merged at the array tail; the trim
  //      slices the head, so it is the first thing discarded. ----
  {
    // Where does the SOURCE put the targeted named-entity lookup rows in each merged
    // collection? `[...(x.data || []), ...extra]` puts them at the TAIL; the trim slices the
    // HEAD (arr.slice(0, keep)) — so the row the founder named this turn is the first thing
    // discarded, defeating the very lookup that exists to stop the "no data -> plausible
    // guess" fabrication (ledger: the 2026-08-30 test4 incident).
    const mergeTail = {
      companies: /return \[\.\.\.\(companies\.data \|\| \[\]\), \.\.\.extra\]/.test(src),
      people: /return \[\.\.\.\(people\.data \|\| \[\]\), \.\.\.extra\]/.test(src),
      tasks: /return \[\.\.\.\(tasks\.data \|\| \[\]\), \.\.\.extra\]/.test(src),
      goals: /return \[\.\.\.\(goals\.data \|\| \[\]\), \.\.\.extra\]/.test(src),
    };
    const trimKeepsTail = (k) => new RegExp("\\['" + k + "', \\d+, true\\]").test(src);
    const { pack, collections } = floorShapedPack({ approvalReason: 2400, namedAtTail: true });
    const r = runTrim(CMD, pack, collections, 12000);
    for (const [k, field, val] of [['companies', 'name', 'QA-VERIFY-NAMED-CO'], ['people', 'full_name', 'QA-VERIFY-NAMED-PERSON'],
      ['tasks', 'title', 'QA-VERIFY-NAMED-TASK'], ['goals', 'title', 'QA-VERIFY-NAMED-GOAL']]) {
      const trimmedThisKey = r.trimmed.some((t) => t.startsWith(k + ' '));
      const wouldLose = mergeTail[k] && trimmedThisKey && !trimKeepsTail(k) && !r.pack[k].some((x) => x[field] === val);
      check('DEFECT', `V60-D2 the ${k} row named in this turn is not the first casualty of the budget trim`,
        !wouldLose,
        `the merge appends the named-lookup rows at the tail and the trim keeps the head: ${JSON.stringify(r.trimmed.filter((t) => t.startsWith(k + ' ')))}`);
    }
  }

  // ---- CONTRACT: a trim never lets a collection claim completeness it does not have. ----
  {
    const { pack, collections } = floorShapedPack({ approvalReason: 2400 });
    const r = runTrim(CMD, pack, collections, 12000);
    const lies = [];
    for (const k of ARRAY_KEYS) {
      const env = r.collections[k]; const arr = r.pack[k];
      if (!env || !Array.isArray(arr)) continue;
      if (env.shown !== arr.length) lies.push(`${k}: shown ${env.shown} != ${arr.length}`);
      if (env.total !== null && env.total > env.shown && env.truncated !== true) lies.push(`${k}: truncated=${env.truncated}`);
    }
    check('CONTRACT', 'every trimmed collection still reports shown/total/truncated truthfully (OTM §4.3)', lies.length === 0, lies.join('; '));
  }

  // ---- CONTRACT: the loop's estimate must not underestimate what serve() measures by more
  //      than the reserve the budget leaves. ----
  {
    const { pack, collections } = floorShapedPack({ approvalReason: 2400 });
    const r = runTrim(CMD, pack, collections, 12000);
    const reserve = 12000 - r.budget;
    check('CONTRACT', 'the trim loop does not underestimate the preflight by more than the reserve',
      (r.preflight - r.loop) < reserve, `gap ${r.preflight - r.loop} tokens against a ${reserve}-token reserve`);
  }

  // ---- CONTRACT: the loop always terminates and never grows the pack. ----
  {
    const { pack, collections } = floorShapedPack({ approvalReason: 2400 });
    const before = Math.ceil(JSON.stringify({ command: CMD, contextPack: JSON.parse(JSON.stringify(pack)) }).length / 4);
    const r = runTrim(CMD, pack, collections, 12000);
    check('CONTRACT', 'the trim never increases the pack', r.preflight <= before + 200, `${before} -> ${r.preflight}`);
  }
}

// ---------------------------------------------------------------------------------------
// V60-D8 — the pack-literal envelope backstop must be DERIVED from the pack literal, not from a
// hardcoded list of names. index.ts's own comment claims the static contract pins this.
// ---------------------------------------------------------------------------------------
{
  const packStart = src.indexOf('const pack = { continuity,');
  const packLine = packStart >= 0 ? src.slice(packStart, src.indexOf('\n', packStart)) : '';
  const collStart = src.indexOf('const collections = {');
  const collBlock = collStart >= 0 ? src.slice(collStart, src.indexOf('\n  };', collStart)) : '';
  const packKeys = [...packLine.matchAll(/([A-Za-z_$][\w$]*)\s*:\s*(?:\(?[A-Za-z_$][\w$.]*\.data\s*\|\|\s*\[\]\)?|merged\w+|pack[A-Z]\w+|conversationHistory|factoryWorkOrders)/g)].map((m) => m[1]);
  const missing = packKeys.filter((k) => !new RegExp('\\b' + k + '\\s*:').test(collBlock));
  check('CONTRACT', 'every array collection in the pack literal has a CollectionEnvelope entry', missing.length === 0, 'missing: ' + missing.join(', '));
  // The committed envelope contract derives its key list from the pack literal with a
  // VALUE-SHAPE regex (pack*/merged*/x.data || []). Any array written another way is invisible
  // to it: verifier #60 added `salaryBands: (approvals.data||[]).slice(0,20)` to the pack with
  // no envelope and no TRIM_ORDER entry and the entire committed battery stayed green.
  // Rewritten 2026-09-08 (closure of this finding). The original probe reached into the envelope suite,
  // pulled out its value-shape regex and asked whether that regex matched — which tests HOW the suite is
  // written. The suite now enumerates every key in the pack literal instead, so there is no such regex to
  // extract and the probe would report a false FAIL. Assert the PROPERTY the finding is about: add the
  // verifier's own mutant to a copy of index.ts and require the committed suite to fail on it.
  const envSuitePath = resolve(ROOT, 'qa/scenarios-runner/architecture_collection_envelope_contract.mjs');
  let derivFindsIt = false;
  try {
    const mutant = resolve(ROOT, 'qa/verification/scratch/p1/mutants/V60-D8-probe.ts');
    const mutated = src.replace('const pack = { continuity,', 'const pack = { continuity, salaryBands: (approvals.data||[]).slice(0,20),');
    if (mutated !== src) {
      mkdirSync(dirname(mutant), { recursive: true });
      writeFileSync(mutant, mutated);
      try {
        execFileSync(process.execPath, [envSuitePath], { env: { ...process.env, SEM_INDEX_SRC: mutant }, stdio: 'pipe' });
      } catch { derivFindsIt = true; }
    }
  } catch { derivFindsIt = false; }
  check('DEFECT', 'V60-D8 the envelope backstop sees ANY array added to the pack, not only the three value shapes it pattern-matches',
    derivFindsIt,
    'architecture_collection_envelope_contract.mjs derives its key list from a value-shape regex; an array written as a .slice()/.map()/.filter() expression carries no CollectionEnvelope and no TRIM_ORDER entry and nothing fails (measured by mutation, verifier #60). index.ts calls this a "Backstop" in its own comment.');
}

// ---------------------------------------------------------------------------------------
// V60-D7 — the create-family postcondition (OTM §4.1) is not pinned by any committed suite.
// These are structural contracts on the two helpers whose mutants survived the whole battery.
// ---------------------------------------------------------------------------------------
{
  const vre = src.match(/async function verifyRowsExist\([^)]*\)[^{]*\{([\s\S]{0,600}?)\n {8}\}/);
  check('CONTRACT', 'verifyRowsExist actually queries the database for the created ids',
    !!vre && /supabase\s*\.\s*from\(/.test(vre[1]) && /\.in\(/.test(vre[1]),
    'verifyRowsExist must re-read the rows; a body that returns the requested ids unchecked would let every create claim ship unverified');
  const rc = src.match(/const recordCreate = \([^)]*\) => \{([\s\S]{0,400}?)\};/);
  check('CONTRACT', 'recordCreate grounds each created row on the re-read set',
    !!rc && /seen\.has\(/.test(rc[1]),
    'recordCreate must consult the verifyRowsExist result; without it recordExecution(..., true) is ungated for the whole create family');
  // A recordExecution(..., true) whose id comes from a MODEL/plan-supplied map rather than
  // from a row the backend read back. (Create sites that pass an inserted row's own id are
  // grounded on a real returned row and are not counted here.)
  const fromPlanMap = src.split('\n').map((l, i) => [i + 1, l])
    .filter(([, l]) => /recordExecution\([^;]*,\s*true\s*[,)]/.test(l) && /targetIds|mapping\[/.test(l));
  check('CONTRACT', 'verified evidence is never keyed off a plan action\'s own status word alone',
    fromPlanMap.length === 0 || /postconditionPassed/.test(src.slice(src.indexOf('async function executeOneAction'), src.indexOf('async function executeActionPlan'))),
    fromPlanMap.map(([n, l]) => `line ${n}: ${l.trim().slice(0, 110)}`).join(' | '));

  // V60-D7: the multi-action-plan confirmation path grounds verified evidence on the plan
  // action's own status word. executeOneAction sets success from `changed === true` and never
  // reads the postconditionPassed the RPC returns — so a mutation whose persisted state did
  // NOT confirm is reported "done." and carries a VERIFIED envelope, while the direct
  // archive/restore path explicitly refuses exactly that case.
  const eoa = src.slice(src.indexOf('async function executeOneAction'), src.indexOf('async function executeActionPlan'));
  check('DEFECT', 'V60-D7 executeOneAction consults the RPC postcondition, not only `changed`',
    /postconditionPassed/.test(eoa),
    'the plan path records recordExecution(..., true) for any action it calls "completed"; archive_company/restore_company/archive_task/... all return postconditionPassed and it is never read on this path (OTM §4.1)');
}

// ---------------------------------------------------------------------------------------
// The real structured-claim window: intent derivation and the never-silent receipt.
// ---------------------------------------------------------------------------------------
function windowRunner() {
  const start = rawSrc.indexOf('// STRUCTURED-CLAIM VERIFICATION');
  if (start < 0) return null;
  const anchor = rawSrc.indexOf('executionEvidence: claimExecutionEvidence,', start);
  const slice = withPatternsAboveWindow(rawSrc, stripTS(rawSrc.slice(start, rawSrc.indexOf('};', anchor) + 2)));
  const fn = new Function('result', 'claimExecutionEvidence', 'contextPack', 'model', 'groundedOutcomeThisTurn', 'claimsFutureActionWithNoPlan', 'Deno',
    'companyNameById', 'taskTitleById', 'personNameById', 'goalTitleById', 'summaryIsFullyDeterministic', 'deterministicPrefix', 'runtimeLabels',
    slice + '\n; return { summary: result.summary, verdict: result.turnVerdict };');
  const mk = () => new Map();
  return (command, summary, requestIntent) => {
    globalThis.command = command; globalThis.lifecycleReports = []; globalThis.factLines = [];
    globalThis.organizationGraphCheck = null; globalThis.workOrder = { id: 'wo-v60' };
    const result = { claims: null, summary, pendingAction: null };
    if (requestIntent) result.requestIntent = requestIntent;
    return fn(result, [], {}, 'gpt', false, false, { env: { get: () => undefined } }, mk(), mk(), mk(), mk(), false, '', mk());
  };
}
const runWindow = windowRunner();
check('CONTRACT', 'the structured-claim window is present and executable', runWindow !== null);

const FAB = 'Done. That has been completed successfully and saved.';
const RECEIPT = /No change was made — /;
// Ordinary imperative mutation requests. Every one of these is a request to CHANGE something.
const IMPERATIVES = [
  'archive the company ACME', 'delete the task QA-1', 'assign QA-1 to Bob', 'rename the project Alpha to Beta',
  'cancel the pricing approval', 'schedule the review for Monday', 'send the proposal to the client',
  'publish the product spec', 'share the document with Bob', 'upload the contract to documents',
  'duplicate the QA-1 task', 'copy the Q2 report to Q3', 'stop the running agent', 'pause the Beta project',
  'resume the Beta project', 'link Beta to ACME as a subsidiary', 'unlink Beta from ACME',
  'attach the contract to ACME', 'detach the contract from ACME', 'flag QA-1 as high risk',
  'tag ACME as strategic', 'reset the QA-1 deadline', 'clear the manager of Alice',
  'grant Bob access to ACME', 'post the update to the channel', 'notify Bob about QA-1',
  'email the report to the client', 'message Bob about the deadline', 'order 20 more units of SKU-1',
  'reserve 5 units for ACME', 'issue the invoice to ACME', 'pay the outstanding invoice',
  'refund the client for order 7', 'charge the client for Q2', 'import the people from the CSV',
  'export the tasks to CSV', 'empty the archived tasks list',
];
if (runWindow) {
  // ---- CONTRACT: with the model's own classification present, no fabrication ships. ----
  {
    const ship = IMPERATIVES.filter((c) => !RECEIPT.test(runWindow(c, FAB, { kind: 'mutation', action: 'archive' }).summary));
    check('CONTRACT', 'a fabricated completion never ships when the model classifies the request as a mutation',
      ship.length === 0, ship.slice(0, 5).join(' | '));
  }
  // ---- V60-D3: the model must not be able to switch its own truth gate off. ----
  {
    const ship = IMPERATIVES.filter((c) => !RECEIPT.test(runWindow(c, FAB, { kind: 'read', action: null }).summary));
    check('DEFECT', 'V60-D3 a model-declared kind:"read" on an imperative mutation request does not disable the receipt',
      ship.length === 0, `${ship.length}/${IMPERATIVES.length} fabricated completions ship verbatim; the request lexicon is vetoed by the very component the gate polices`);
    const ship2 = IMPERATIVES.filter((c) => !RECEIPT.test(runWindow(c, FAB, { kind: 'other', action: null }).summary));
    check('DEFECT', 'V60-D3 a model-declared kind:"other" on an imperative mutation request does not disable the receipt',
      ship2.length === 0, `${ship2.length}/${IMPERATIVES.length} ship`);
  }
  // ---- V60-D4: the model-emits-nothing fallback tier. ----
  {
    const ship = IMPERATIVES.filter((c) => !RECEIPT.test(runWindow(c, FAB, null).summary));
    check('DEFECT', 'V60-D4 an imperative mutation request with NO model classification still gets the receipt',
      ship.length === 0, `${ship.length}/${IMPERATIVES.length} verbs are outside the request lexicon and ship the fabrication verbatim: ${ship.slice(0, 8).map((c) => c.split(' ')[0]).join(', ')}`);
  }
  // ---- CONTRACT: truthful read answers are never rewritten on text shape alone. ----
  {
    const READS = [
      ['what did we do earlier in this channel?', 'Earlier in this channel I archived ACME and restored Beta.'],
      ['is ACME archived?', 'ACME is archived.'], ['when was ACME archived?', 'ACME was archived on 2026-09-01.'],
      ['who approved it?', 'Approval 123 was approved by the founder on Monday.'],
      ['list my companies', 'Here are your companies: ACME, Beta, North Depot.'],
      ['what happened to QA-1?', 'QA-1 was assigned to Bob last week and completed on Friday.'],
    ];
    const broken = READS.filter(([c, s]) => runWindow(c, s, { kind: 'read', action: null }).summary !== s);
    check('CONTRACT', 'a truthful answer to a read request survives verbatim', broken.length === 0, JSON.stringify(broken.slice(0, 2)));
  }
}

console.log(`\nv60_regression_additions: ${pass} passed, ${failures.length} failed`);
if (failures.length) { console.log('FAILURES:'); for (const f of failures) console.log('  - ' + f); process.exit(1); }
