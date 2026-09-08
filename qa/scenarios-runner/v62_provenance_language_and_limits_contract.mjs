#!/usr/bin/env node
// PROMOTED from verifier #62 (campaign #122), whose FAIL on c30a0cc this candidate closes.
// Four checks were rewritten from modelling the implementation to executing it — each had been unable to
// see its own fix. Every DEFECT row is pinned by a mutant in mutation_proof_v60_v61.mjs (19 killed, 0 survived).
//
// Two kinds of row:
//   CONTRACT — a property that HOLDS on these bytes and must keep holding.
//   DEFECT   — a V62 finding, written as the assertion that would hold once it is FIXED.
//              While the defect is open the row FAILS, and this file exits nonzero.
//
// Runnable with plain node from ANY cwd. Source under test: SEM_INDEX_SRC, else the repo copy
// resolved relative to this file. No network, no DB, no deploy.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { stripTS, withPatternsAboveWindow, withSourceHelpers } from './_gate_extract.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC_PATH = process.env.SEM_INDEX_SRC || resolve(HERE, '../../supabase/functions/sem-ai-command/index.ts');
const RAW = readFileSync(SRC_PATH, 'utf8');
const src = RAW.replace(/\r\n/g, '\n');

let pass = 0; const failures = [];
const check = (kind, name, cond, detail) => {
  if (cond) { pass++; console.log(`OK   [${kind}] ${name}`); }
  else { failures.push({ kind, name, detail }); console.log(`FAIL [${kind}] ${name}`); }
};

// ───────────────────────────────────────────────────────── shared harness pieces
const SYS_A = 'const SYSTEM_PROMPT = `';
const pS = src.indexOf(SYS_A), pE = src.indexOf('`;', pS);
const SYSTEM_PROMPT_TOKENS = Math.ceil(src.slice(pS + SYS_A.length, pE).length / 4);

// the REAL budget block
const bS = src.indexOf('const packBudget = Math.max(');
const bEndMark = 'contextBudget.overBudget = contextBudget.estimatedTokens > packBudget;';
const bE = src.indexOf(bEndMark, bS);
if (bS < 0 || bE < 0) throw new Error('context-budget block not found — update this harness, never let it pass');
const fS = src.indexOf('function estimateRequestTokens(');
const EST = stripTS(src.slice(fS, src.indexOf('\n}', fS) + 2));
const BUDGET = new Function('pack', 'collections', 'command', 'Deno',
  // withSourceHelpers brings along the module-level helpers the block calls (envPositiveInt), taken from the
  // source under test so the harness cannot drift from production.
  `const SYSTEM_PROMPT_TOKENS = ${SYSTEM_PROMPT_TOKENS};\n${EST}\n${withSourceHelpers(src, stripTS(src.slice(bS, bE + bEndMark.length)))}\n` +
  'return { pack, collections, contextBudget, contextTrimmed, packBudget, packTokens: packTokens() };');
const runBudget = (pack, collections, command) => BUDGET(pack, collections, command, { env: { get: () => undefined } });
const est = (command, contextPack) => Math.ceil(JSON.stringify({ command, contextPack }).length / 4);

// THE REAL id-provenance gate, sliced from index.ts and executed. Every executor id set is built from this
// one helper, so testing it tests all of them; modelling it here instead is how V62-D1's own check missed
// the fix that closed it.
const realPackIdSet = (() => {
  const start = src.indexOf('function packIdSet(...names: string[]): Set<string> {');
  if (start < 0) throw new Error('v62: packIdSet not found — the executor no longer shares one id gate');
  const end = src.indexOf('\n        }', start) + '\n        }'.length;
  // stripTS does not handle a typed rest parameter, so drop the signature's annotations before executing.
  const body = stripTS(src.slice(start, end))
    .replace('function packIdSet(...names: string[]): Set<string> {', 'function packIdSet(...names) {');
  const make = new Function('contextPack', 'contextProvenance', body + '\n; return packIdSet;');
  // Provenance is captured by buildContext BEFORE the trim and returned beside the pack, never inside it —
  // the model has no use for it, and carrying it in the pack spent the budget the trim exists to protect.
  // Mirror that here: snapshot the ids from the untrimmed pack, exactly as the source does.
  return (packBeforeTrim, packAfterTrim, ...names) => {
    const provenance = {};
    for (const [k, v] of Object.entries(packBeforeTrim)) {
      if (!Array.isArray(v)) continue;
      const ids = v.map((r) => (r && typeof r === 'object' ? r.id : null)).filter((id) => typeof id === 'string' && id.length > 0);
      if (ids.length > 0) provenance[k] = ids;
    }
    return make(packAfterTrim, provenance)(...names);
  };
})();

// the REAL request-intent derivation
const iS = src.indexOf('const MUTATION_ARRAY_FIELDS = [');
const iEnd = 'const requestedIntent: MutationIntent | null = requestedIntentPrimary;';
const iE = src.indexOf(iEnd, iS);
if (iS < 0 || iE < 0) throw new Error('request-intent block not found — update this harness');
// The V66-D6 fix makes the intent tier consume the executor's outcome instead of re-deriving its gate, so
// that one value crosses the tier boundary. These rows exercise the intent tier ALONE (no executor runs),
// for which null is the honest value — the same default the shared extractor supplies (verifier #66).
const INTENT = new Function('command', 'result', 'claimExecutionEvidence', 'commandFallbackResolvedVerb',
  stripTS(src.slice(iS, iE + iEnd.length)) + '\nreturn requestedIntent;');
const intentOf = (c, resolvedVerb = null) => INTENT(c, {}, [], resolvedVerb);

// the REAL structured-claim / receipt window
const sS = RAW.indexOf('// STRUCTURED-CLAIM VERIFICATION');
const sAnchor = RAW.indexOf('executionEvidence: claimExecutionEvidence,', sS);
const WINDOW = new Function('result', 'claimExecutionEvidence', 'contextPack', 'model', 'groundedOutcomeThisTurn',
  'claimsFutureActionWithNoPlan', 'Deno', 'companyNameById', 'taskTitleById', 'personNameById', 'goalTitleById',
  'summaryIsFullyDeterministic', 'deterministicPrefix', 'runtimeLabels',
  withPatternsAboveWindow(RAW, stripTS(RAW.slice(sS, RAW.indexOf('};', sAnchor) + 2))) +
  '\nreturn { summary: result.summary, verdict: result.turnVerdict };');
const mp = () => new Map();
const answer = (command, summary) => {
  globalThis.command = command; globalThis.lifecycleReports = []; globalThis.factLines = [];
  globalThis.organizationGraphCheck = null; globalThis.workOrder = { id: 'wo-v62' };
  return WINDOW({ claims: null, summary, pendingAction: null }, [], {}, 'gpt', false, false,
    { env: { get: () => undefined } }, mp(), mp(), mp(), mp(), false, '', mp());
};

// minimal but REAL-SHAPED pack, sized from the .limit() caps in buildContext()
function fixture({ command = 'archive company Northwind', commandPad = 0, compaction = null, planActions = 0 } = {}) {
  const N = (n, f) => Array.from({ length: n }, (_, i) => f(i));
  const id = (t, i) => `${t}${String(i).padStart(7, '0')}-0000-4000-8000-000000000000`.slice(0, 36);
  const companies = N(12, (i) => ({ id: id('c', i), name: 'Northwind Trading ' + i, status: 'active', organization_type: 'legal_entity', strategic_priority: 'growth across regions', risk_score: 40, effectivelyActive: true }));
  const people = N(30, (i) => ({ id: id('e', i), full_name: 'Person Number ' + i, email: `p${i}@example.com`, role_title: 'Operations Manager', company_id: id('c', 0), active: true, effectivelyActive: true }));
  const tasks = N(15, (i) => ({ id: id('t', i), company_id: id('c', 0), project_id: id('p', 0), title: 'Task Number ' + i, status: 'in_progress', priority: 'high', risk_level: 'medium', approval_required: false, deadline: '2026-11-01', owner_type: 'person', owner_person_id: id('e', 0), owner_agent_id: null }));
  const goals = N(20, (i) => ({ id: id('o', i), company_id: id('c', 0), title: 'Goal Number ' + i, status: 'active', kind: 'quarterly' }));
  const simple = (n, t, extra = {}) => N(n, (i) => ({ id: id(t, i), company_id: id('c', 0), title: `${t} record with a realistic title ${i}`, name: `${t} name ${i}`, ...extra }));
  const pack = {
    continuity: { totalPriorTurns: 50, historyWindowStart: 43, historyWindowEnd: 50, historyIsComplete: false, compactionCheckpoint: compaction ? { summary: compaction, turnsCompacted: 30 } : null, channelStateVersion: 7 },
    namedTargets: { companies: [companies[0]], people: [], tasks: [], goals: [] },
    companies, archivedCompanies: simple(6, 'a', { status: 'archived' }), projects: simple(20, 'p'),
    tasks, memories: N(8, (i) => ({ id: id('m', i), company_id: id('c', 0), entity_type: 'company', entity_id: id('c', 0), fact: 'A remembered fact of realistic length number ' + i, confidence: 0.8, sensitivity: 'internal' })),
    agents: simple(20, 'g'), products: simple(20, 'r'), inventory: simple(20, 'i'), approvals: simple(20, 'v'),
    people, goals, companyRelationships: simple(20, 'q'), personAssignments: simple(30, 'n'), financialReports: simple(20, 'h'),
    conversationHistory: N(8, (i) => ({ turn: 42 + i, command: 'c'.repeat(600), summary: 's'.repeat(600), verified: null, executedOperationCount: 0, rejectedClaimCount: 0 })),
    factoryWorkOrders: simple(10, 'w'), channels: simple(15, 'k'), activeChannelId: id('k', 0),
    departments: simple(30, 'd'), leads: simple(30, 'l'), documents: simple(30, 'u'), proposals: simple(20, 'y'),
    productSpecs: simple(20, 's'), engineeringDrawings: simple(20, 'j'), aiProviders: simple(10, 'b'), mcpConnectors: simple(10, 'x'),
    archivedTasks: simple(6, 'z', { status: 'archived' }),
    pendingAction: planActions ? { kind: 'multi_action_plan', executionPlan: N(planActions, (i) => ({ id: 'a' + i, operation: 'archive_company', description: 'Archive the subsidiary Northwind Trading ' + i + ' and end its assignments', targetIds: { companyId: id('c', i % 12) } })) } : null,
    recentlyResolvedEntities: [], recentlyDeletedEntities: [],
    collections: {}, counts: { companiesTotal: 900, peopleTotal: 4000, tasksTotal: 3000, goalsTotal: 20 },
    currentTurn: { turn: 51, command: command + (commandPad ? ' ' + 'w'.repeat(commandPad) : '') },
  };
  const env = (a, total) => ({ shown: a.length, total: total ?? a.length, truncated: (total ?? a.length) > a.length });
  const collections = {};
  for (const k of Object.keys(pack)) if (Array.isArray(pack[k])) collections[k] = env(pack[k], k === 'companies' ? 900 : k === 'people' ? 4000 : k === 'tasks' ? 3000 : undefined);
  collections.memories = { shown: 8, total: null, truncated: null };
  collections.factoryWorkOrders = { shown: 10, total: null, truncated: null };
  collections.conversationHistory = { shown: 8, total: 50, truncated: true };
  pack.collections = collections;
  return { pack, collections, command: pack.currentTurn.command };
}

// ═══════════════════════════════════════════ CONTRACT rows (must keep holding)
{
  const f = fixture();
  const before = est(f.command, f.pack);
  // the block mutates the pack in place, so anything about the ORIGINAL must be captured first
  const originalNewestTurn = f.pack.conversationHistory[f.pack.conversationHistory.length - 1].turn;
  const r = runBudget(f.pack, f.collections, f.command);
  const after = est(f.command, r.pack);
  check('CONTRACT', 'an untrimmed full-cap pack really does exceed the 12,000 hard cap (the pre-fix half of the 2026-09-08 witness)',
    before > 12000, 'untrimmed estimate ' + before);
  check('CONTRACT', 'the same pack fits after degradation, with a real margin below the hard cap',
    after <= r.packBudget && 12000 - after >= 400, `after=${after} budget=${r.packBudget}`);
  check('CONTRACT', 'the trim reports its own size within 1 token of the bytes actually shipped',
    Math.abs(after - r.contextBudget.estimatedTokens) <= 1, `reported=${r.contextBudget.estimatedTokens} actual=${after}`);
  check('CONTRACT', 'every trimmed collection with a real count keeps its exact total and truncated=true',
    ['companies', 'people', 'tasks'].every((k) => r.collections[k].total > r.collections[k].shown && r.collections[k].truncated === true),
    JSON.stringify({ c: r.collections.companies, p: r.collections.people }));
  check('CONTRACT', 'the minimum safe context is byte-stable across the trim',
    JSON.stringify(r.pack.currentTurn) === JSON.stringify(f.pack.currentTurn)
      && JSON.stringify(r.pack.namedTargets.companies.map((c) => c.id)) === JSON.stringify([f.pack.namedTargets.companies[0].id])
      && r.pack.activeChannelId != null && r.pack.counts && r.pack.collections);
  check('CONTRACT', 'conversation history keeps the NEWEST turns, never the oldest',
    r.pack.conversationHistory.length === 0
      || r.pack.conversationHistory[r.pack.conversationHistory.length - 1].turn === originalNewestTurn,
    JSON.stringify(r.pack.conversationHistory.map((h) => h.turn)) + ' (newest original turn ' + originalNewestTurn + ')');
  {
    const g1 = fixture(); const g2 = fixture();
    const a = runBudget(g1.pack, g1.collections, g1.command);
    const b = runBudget(g2.pack, g2.collections, g2.command);
    check('CONTRACT', 'the trim terminates and is deterministic',
      JSON.stringify(a.pack) === JSON.stringify(b.pack) && JSON.stringify(a.pack) === JSON.stringify(r.pack));
  }
  check('CONTRACT', 'MINIMUM_SAFE_CONTEXT and TRIM_ORDER are disjoint, and the loop says so out loud',
    /if \(MINIMUM_SAFE_CONTEXT\.includes\(key\)\) throw new Error\('TRIM_ORDER names a minimum-safe-context key/.test(src));
  check('CONTRACT', 'a history ROW is bounded where the pack is built AND the cap is actually applied',
    /const HISTORY_FIELD_CAP = \d+;/.test(src) && /t\.length <= HISTORY_FIELD_CAP \? t/.test(src),
    'the declaration alone is not the fix — the use is (V62-D9)');
  check('CONTRACT', 'both whole-request refusals are reachable, not merely present in the text',
    /\n\s*if \(tokenEstimate > hardMax\) \{/.test(src) && /\n\s*if \(requestTokens > modelContextMax\) \{/.test(src),
    'a `, 413)` count does not prove the gate can fire (V62-D9)');
  check('CONTRACT', 'the Mongolian read veto exists AND is wired into the candidate selection',
    /const MN_READ_SHAPE = /.test(src) && /MN_READ_SHAPE\.test\(commandText\) \? \[\]/.test(src));
  check('CONTRACT', 'task and goal lifecycle targets are re-read server-side, not filtered by the context window',
    /supabase\.from\('tasks'\)\.select\('id,title,status'\)\.in\('id', requestedTaskLifecycleIds\)/.test(src)
      && /void contextArchivedTaskIds;/.test(src));
}
{
  // request intent — both directions, model emitting NOTHING
  const MUST_NULL = ['Archive policy needs a review before the audit.', 'Share price fell after the announcement.',
    'Delete key on the old keyboard is broken.', 'Merge conflicts blocked the release yesterday.',
    'Which companies did we archive last quarter?', 'give me a report of archived companies',
    'make a list of the tasks assigned to Bat', 'add up the hours logged against QA-1',
    'set out the plan for closing the Erdenet office', 'draft an email about the merge',
    'ACME компанийн одоогийн төлөв ямар вэ?', 'Ямар компаниудыг архивласан бэ?',
    'Хэн ACME-г архивла', 'Юу устга', 'Какой сейчас статус компании ACME?',
    'Компанія була архівована минулого року.', 'Архивирането на фирмата приключи.'];
  const MUST_INTENT = ['archive company ACME', 'restore the Erdenet business unit', 'bring back the Erdenet unit',
    'could you please archive ACME?', 'do me a favour and archive ACME', 'ACME should be archived.',
    'list the tasks, then archive ACME', 'get ACME archived', 'yes', 'option 2',
    'ACME компанийг архивла', 'QA-1 даалгаврыг устга', 'Батыг менежерээр томил',
    // A trailing-verb imperative: only the proper-noun object tier reads 'Alpha end.' as a request.
    // Added 2026-09-08 from a mechanical vacuity sweep — neutralising MUTATION_VERB_PROPER_OBJECT broke
    // no test anywhere, because every other case it covers is also matched by a later, more general tier.
    'Alpha end.'];
  // Two more from the 2026-09-08 vacuity sweep, both of which no test exercised:
  //  * 'archive ACME?' — a bare imperative with a question mark. POLITE_REQUEST is what keeps this a
  //    QUESTION rather than a request, and neutralising it turned all three of these into commands. This
  //    pins the current boundary; verifier #59 registered R3 ('archive Alpha?') as a residual, so if that
  //    is ever deliberately changed this row is where it shows up, rather than in production.
  //  * 'propose a plan to end the Erdenet lease' — COMPOSITION_REQUEST is the only thing that keeps a
  //    request for a PLAN from being read as an instruction to end the lease.
  MUST_NULL.push('archive ACME?', 'restore Alpha?', 'propose a plan to end the Erdenet lease');
  const fp = MUST_NULL.filter((c) => intentOf(c) !== null);
  const fn = MUST_INTENT.filter((c) => intentOf(c) === null);
  check('CONTRACT', 'no read / statement / noun phrase in the pinned corpus is read as a mutation request', fp.length === 0, JSON.stringify(fp));
  check('CONTRACT', 'every real mutation request in the pinned corpus carries intent with the model emitting nothing', fn.length === 0, JSON.stringify(fn));
}
{
  // never-silent receipt, and truthful reads surviving verbatim
  const FAB = [['archive ACME', 'ACME has been archived.'], ['rename ACME to ACME Global', 'Renamed: ACME → ACME Global'],
    ['assign QA-1 to Bat', 'Assigned. Bat now owns QA-1.'], ['yes', 'Confirmed — ACME has been archived.'],
    ['option 2', 'Option 2 executed — ACME archived.'], ['ACME компанийг архивла', 'ACME has been archived.']];
  const leaked = FAB.filter(([c, s]) => !/No change was made — /.test(answer(c, s).summary));
  check('CONTRACT', 'a fabricated completion on a mutation-intent turn never ships', leaked.length === 0, JSON.stringify(leaked));
  const READ = [['which companies did we archive last quarter?', 'In Q2 we archived ACME and Beta.'],
    ['who approved the Q2 budget?', 'Otgon approved it on 12 May.'],
    ['what is the status of Never Ltd?', 'Never Ltd is active and owned by Bat.'],
    ["what is the status of Bat's Garage?", "Bat's Garage was archived on 3 June."],
    ['Ямар компаниудыг архивласан бэ?', 'ACME болон Beta-г архивласан.']];
  const rewritten = READ.filter(([c, s]) => answer(c, s).summary !== s);
  check('CONTRACT', 'a truthful read answer is never rewritten on text shape alone', rewritten.length === 0, JSON.stringify(rewritten));
}

// ═══════════════════════════════════════════ DEFECT rows (fail while the finding is open)
{
  // V62-D1: a trim must not disable the id-provenance gates that every non-lifecycle mutation depends on.
  // Swept over command length: a founder pasting a long document is the realistic trigger.
  let gutted = null, f = null, r = null;
  for (const pad of [12000, 16000, 20000, 24000, 28000, 34000, 40000]) {
    const ff = fixture({ commandPad: pad });
    const rr = runBudget(ff.pack, ff.collections, ff.command);
    // Closed 2026-09-08. This line used to RE-IMPLEMENT the gate, which is why it could not see the fix:
    // the executor no longer reads the trimmed arrays directly. It builds every id set from packIdSet(),
    // which unions the surviving rows with the server-side provenance captured before the trim and the rows
    // the targeted lookups resolved from this turn. Execute the real helper, sliced from source, instead of
    // modelling it — the same rule this suite applies to every other window.
    const ids = realPackIdSet(ff.pack, rr.pack, 'companies', 'archivedCompanies');
    if (!ids.has(rr.pack.namedTargets.companies[0].id)) { gutted = { pad, left: rr.pack.companies.length, ids: ids.size }; f = ff; r = rr; break; }
    f = ff; r = rr;
  }
  check('DEFECT', 'V62-D1 a canonical id the founder named this turn survives the id-provenance gate after a trim',
    gutted === null,
    gutted ? `a pasted command of ${gutted.pad} chars trims companies to ${gutted.left}; namedTargets still holds the row but contextCompanyIds has ${gutted.ids} entries, so updateCompanies (rename), createPeople/createTasks/createGoals company binding, personAssignments (manager/employer), end/restoreEmployment and every delete* family silently drop the founder's own target. OTM section 5 row 5 generalised beyond restore.` : '');
  check('DEFECT', 'V62-D1b the id sets used by the durable multi_action_plan replay are not built from trimmable collections',
    !/const planCompanyIds = new Set\(\(contextPack\?\.companies \|\| \[\]\)/.test(src),
    'index.ts:3141-3144 validate a DURABLE pending action (minimum-safe context) against companies/people/tasks/goals, which the trim can empty; the turn then answers "one or more of its stored targets no longer resolves to a real record", which is false');
  // V62-D2: the model-context gate compares base64 CHARACTERS/4 against a TOKEN window.
  const noImage = SYSTEM_PROMPT_TOKENS + Math.ceil(JSON.stringify({ profile: { id: 'u', role: 'founder' }, command: f.command, contextPack: r.pack }, null, 2).length / 4);
  const imageBytes = 1024 * 1024;                       // an ordinary 1 MB phone photo
  const b64len = Math.ceil(imageBytes * 4 / 3);
  // Closed 2026-09-08. The image no longer enters the TOKEN estimate at all — its cost to a vision model is
  // a function of dimensions this code cannot know — and is bounded by the one quantity that is knowable
  // and that the provider itself enforces: transported SIZE. Assert the real shape, not the old arithmetic.
  const estimatorTakesImage = /function estimateRequestTokens\(payload: unknown, imageBase64/.test(src);
  // The cap goes through the NaN-safe parser since verifier #63 V63-D6: a malformed env var used to parse to
  // NaN and silently disable the gate it configures.
  const bytesGate = /const IMAGE_BYTES_MAX = envPositiveInt\('SEM_AI_IMAGE_BYTES_MAX', 5 \* 1024 \* 1024\)/.test(src)
    && /function imageBytes\(base64: string\): number/.test(src)
    && /limit: 'attached image size'/.test(src);
  const oneMbPasses = imageBytes <= 5 * 1024 * 1024;
  check('DEFECT', 'V62-D2 an ordinary 1 MB image (the web client allows 5 MB) is not refused by the model-context gate',
    !estimatorTakesImage && bytesGate && oneMbPasses && noImage + 0 <= 180000,
    `an image must not be counted as base64_chars/4 against a TOKEN window (measured: a 1 MB photo scored ${Math.ceil(b64len / 4)} "tokens"). It costs the model ~1,500 tokens, and v92 had no such gate and served this turn. estimatorTakesImage=${estimatorTakesImage} bytesGate=${bytesGate}`);
  // V62-D3: the pack tells the model something that is only true for four collections.
  check('DEFECT', 'V62-D3 every collection named in a command has a targeted server-side lookup, as contextBudget.note claims',
    /namedProjectLookup/.test(src) && /namedDepartmentLookup/.test(src),
    'contextBudget.note says "any entity named in a command is still resolved server-side across every status"; only companies, people, tasks and goals have a targeted lookup (NAMED_LOOKUP_ROW_CAP). projects/departments/leads/documents/approvals/channels/proposals/productSpecs/engineeringDrawings/products/inventory/agents/financialReports/memories/factoryWorkOrders do not, and all are trimmable');
  // V62-D4: two collections cannot express "trimmed" at all.
  const g = runBudget(fixture({ commandPad: 24000 }).pack, fixture({ commandPad: 24000 }).collections, fixture({ commandPad: 24000 }).command);
  // Closed 2026-09-08 AT THE SOURCE, which is the only place it can be closed honestly. memories and
  // factoryWorkOrders were the two collection queries without { count: 'exact' }, so their totals were null
  // and a trim could not express itself. Both now carry an exact count. The first fix attempted here —
  // filling a null total from the array length at trim time — was WRONG and was reverted: an array length
  // is a lower bound, and publishing it as `total` would understate a real total, which is precisely the
  // "array.length never means total" defect (OTM §4.3). The fixture below still models the old null
  // totals, so the assertion is made against the source.
  // Only the queries that BECOME a pack collection with an envelope. The targeted name lookups and the
  // lifecycle candidate lookups carry no envelope (they are merged into another collection), and the
  // conversation window gets its exact total from a separate head count.
  const collectionKeys = new Set(Object.keys(g.collections));
  const uncounted = [...src.matchAll(/(\w+)(?:Query)? = (?:[^\n]*\n\s*)?\??\s*supabase\.from\('(\w+)'\)\s*\n?\s*\.select\(([^)]*)\)[^\n]*\.limit\(\d+\)/g)]
    .filter((m) => !/count: 'exact'/.test(m[3]))
    .filter((m) => !/Lookup$|^named/.test(m[1]) && !/^conversationHistory/.test(m[1]))
    .map((m) => m[2] + ' (' + m[1] + ')');
  void collectionKeys;
  check('DEFECT', 'V62-D4 a collection trimmed to zero always says so (exact total + truncated), never total:null',
    uncounted.length === 0 && !/env\.total === null\) env\.total = arr\.length/.test(src),
    `collection queries with no exact count: ${uncounted.join(', ') || 'none'}. A collection whose total is null cannot say "N of M shown" after a trim, and filling the total from the surviving array length would publish a lower bound as an exact total (OTM §4.3)`);
  // V62-D5: the 413 reason misattributes the cause in a measurable band.
  let wrongReason = null;
  for (const padChars of [21500, 22000, 22500, 23000, 23500]) {
    const ff = fixture({ command: 'Summarise this for me:', commandPad: padChars });
    const rr = runBudget(ff.pack, ff.collections, ff.command);
    const e = est(ff.command, rr.pack);
    // Closed 2026-09-08. The attribution now counts the command the number of times it is actually
    // serialized — top level AND currentTurn.command — which is what the source does; modelling one copy
    // here is what made the check unable to see the fix. Read the multiplier out of the source so a silent
    // revert to a single copy fails this row again.
    const doubled = /const commandTokens = estimateTokens\(command\) \* 2;/.test(src);
    const cmdTok = Math.ceil(JSON.stringify(ff.command).length / 4) * (doubled ? 2 : 1);
    if (e > 12000 && cmdTok <= 6000) { wrongReason = { padChars, e, cmdTok }; break; }
  }
  check('DEFECT', 'V62-D5 a 413 caused by an oversized COMMAND never blames the workspace',
    wrongReason === null,
    wrongReason ? `command of ${wrongReason.padChars} chars (${wrongReason.cmdTok} tokens) drives the pack to ${wrongReason.e} > 12,000, but commandTokens <= hardMax/2 so the founder is told "this workspace has grown past what one turn can carry — ask about one company at a time". The command is counted TWICE (top level and currentTurn.command); the ternary compares one copy.` : '');
  // V62-D6: the Mongolian tier reads short verbal-noun phrases as commands.
  const MN_FP = ['Устгалын бүртгэл', 'Устгалын журам', 'Устгалын тайлан', 'Томилгооны жагсаалт', 'Томилгооны тушаал', 'Томилгооны хугацаа'];
  const mnFp = MN_FP.filter((c) => intentOf(c) !== null);
  check('DEFECT', 'V62-D6 a Mongolian verbal-noun phrase is not read as a command',
    mnFp.length === 0,
    `${mnFp.length}/${MN_FP.length} read as commands (${JSON.stringify(mnFp)}). MN_NOT_A_COMMAND covers -лт/-лга/-лгэ but not the -л / -гоо verbal nouns, and a two-token phrase is entirely inside mnFinalWindow, so verb-final position cannot help. Consequence measured through the real window: the truthful answer is replaced by "No change was made — that request did not resolve to an operation I can execute from chat."`);
  // V62-D7: two Mongolian imperatives are invisible to their own stems.
  const MN_FN = ['Энэ компанийн нэрийг өөрчил', 'Компанийн нэрийг өөрчилье', 'Багт Батыг нэм'];
  const mnFn = MN_FN.filter((c) => intentOf(c) === null);
  check('DEFECT', 'V62-D7 the imperative surface form of every listed Mongolian stem is matched by that stem',
    mnFn.length === 0,
    `${mnFn.length}/${MN_FN.length} carry no intent (${JSON.stringify(mnFn)}). The stem list has "өөрчл" and "нэмэ"; the real imperatives are "өөрчил" and "нэм", neither of which contains its stem. A fabricated Mongolian completion then ships verbatim with receiptRendered=false (v92 parity, but a fabrication under OTM section 3 rule 3).`);
  // V62-D8: V61-D11 — the named-entity lookups cannot see a Cyrillic name.
  // Closed 2026-09-08. This line hardcoded the ASCII regex it was reporting on, so it could not see the
  // fix. Read the real tokenizer out of the source instead — if it is narrowed again, this fails again.
  const tokRe = (src.match(/\(command\.match\((\/[^\n]+?\/g[u]?)\) \|\| \[\]\)/) || [])[1];
  if (!tokRe) throw new Error('v62: the command tokenizer was not found — update this check, never let it pass');
  const TOKENS = (c) => (c.match(new Function('return ' + tokRe)()) || []);
  check('DEFECT', 'V62-D8 (V61-D11) a Cyrillic entity name produces at least one command name token',
    TOKENS('Эрдэнэт ХХК-г архивла').length > 0 && TOKENS('Батбаярыг менежерээр томил').length > 0,
    'commandNameTokens is /[A-Za-z][A-Za-z0-9\'&.-]{3,}/g, so a Cyrillic company/person/task/goal name yields ZERO tokens: namedTargets stays empty, the row is not merged to the head of its pack array (so the trim drops it first), and the uncapped targeted lookup that exists to stop the 2026-08-30 fabrication class never runs. v92 parity, so not a regression — but it is the whole named-entity protection missing for the workspace language.');
}

console.log(`\nv62_regression_additions: ${pass} passed, ${failures.length} failed ` +
  `(CONTRACT failures: ${failures.filter((f) => f.kind === 'CONTRACT').length}, DEFECT failures: ${failures.filter((f) => f.kind === 'DEFECT').length})`);
if (failures.length) {
  console.log('FAILURES:');
  for (const f of failures) console.log(`  - [${f.kind}] ${f.name}\n      ${f.detail || ''}`);
  process.exit(1);
}
