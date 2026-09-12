// Permanent regression tests for Software Factory Phase 2's capability-based scheduler.
// Pure functions only (isTaskReady/isTaskPermanentlyBlocked/selectAgentForTask/
// selectTasksToDispatch) - no database, no network, no CLI. Covers the exact invariants
// named in the commercial-platform plan:
//   FACTORY_CAPABILITY_ROUTER_SELECTS_RELEVANT_AGENT
//   FACTORY_INDEPENDENT_TASKS_EXECUTE_IN_PARALLEL
//   FACTORY_DEPENDENT_TASK_WAITS_FOR_PREREQUISITE
//
// Run with: node --test scripts/factory-runner/scheduler.regression.test.mjs

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isTaskReady,
  isTaskPermanentlyBlocked,
  classifyQueuedTasks,
  idleReason,
  selectAgentForTask,
  selectTasksToDispatch,
} from './scheduler.mjs';
import { ALLOWLIST } from './sync-agents.mjs';

test('isTaskReady: a task with no dependencies is always ready', () => {
  assert.equal(isTaskReady({ id: 't1', depends_on: [] }, new Map()), true);
  assert.equal(isTaskReady({ id: 't1', depends_on: null }, new Map()), true);
});

test('isTaskReady: FACTORY_DEPENDENT_TASK_WAITS_FOR_PREREQUISITE - a task with an unfinished dependency is not ready', () => {
  const statusById = new Map([['t1', 'in_progress']]);
  assert.equal(isTaskReady({ id: 't2', depends_on: ['t1'] }, statusById), false);
});

test('isTaskReady: a task becomes ready only once every dependency is genuinely done', () => {
  const statusById = new Map([['t1', 'done'], ['t2', 'in_progress']]);
  assert.equal(isTaskReady({ id: 't3', depends_on: ['t1', 't2'] }, statusById), false);
  statusById.set('t2', 'done');
  assert.equal(isTaskReady({ id: 't3', depends_on: ['t1', 't2'] }, statusById), true);
});

test('isTaskReady: an archived dependency does NOT satisfy readiness (archived != done)', () => {
  const statusById = new Map([['t1', 'archived']]);
  assert.equal(isTaskReady({ id: 't2', depends_on: ['t1'] }, statusById), false);
});

test('isTaskPermanentlyBlocked: a rejected dependency permanently blocks the dependent', () => {
  const statusById = new Map([['t1', 'rejected']]);
  assert.equal(isTaskPermanentlyBlocked({ id: 't2', depends_on: ['t1'] }, statusById), true);
  assert.equal(isTaskReady({ id: 't2', depends_on: ['t1'] }, statusById), false);
});

test('selectAgentForTask: FACTORY_CAPABILITY_ROUTER_SELECTS_RELEVANT_AGENT - picks the agent whose capabilities actually match, never by name', () => {
  const candidates = [
    { id: 'a-frontend', name: 'brain-os-frontend', capabilities: ['react', 'ui'], activeRunCount: 0 },
    { id: 'a-db', name: 'brain-os-db-security-engineer', capabilities: ['postgres', 'rls', 'migrations'], activeRunCount: 0 },
  ];
  const selected = selectAgentForTask(['postgres', 'rls'], candidates);
  assert.equal(selected.id, 'a-db');
});

test('selectAgentForTask: excludes an agent with zero capability overlap even if idle', () => {
  const candidates = [{ id: 'a-frontend', name: 'frontend', capabilities: ['react'], activeRunCount: 0 }];
  const selected = selectAgentForTask(['postgres', 'rls'], candidates);
  assert.equal(selected, null);
});

test('selectAgentForTask: higher overlap wins over a partial match', () => {
  const candidates = [
    { id: 'a-partial', name: 'partial', capabilities: ['postgres'], activeRunCount: 0 },
    { id: 'a-full', name: 'full', capabilities: ['postgres', 'rls', 'migrations'], activeRunCount: 0 },
  ];
  const selected = selectAgentForTask(['postgres', 'rls', 'migrations'], candidates);
  assert.equal(selected.id, 'a-full');
});

test('selectAgentForTask: ties broken by least-loaded agent (do not pile onto a busy one)', () => {
  const candidates = [
    { id: 'a-busy', name: 'busy', capabilities: ['debugging'], activeRunCount: 3 },
    { id: 'a-idle', name: 'idle', capabilities: ['debugging'], activeRunCount: 0 },
  ];
  const selected = selectAgentForTask(['debugging'], candidates);
  assert.equal(selected.id, 'a-idle');
});

test('selectAgentForTask: empty required_capabilities matches any active agent (tie-broken by load)', () => {
  const candidates = [
    { id: 'a-busy', name: 'busy', capabilities: [], activeRunCount: 2 },
    { id: 'a-idle', name: 'idle', capabilities: [], activeRunCount: 0 },
  ];
  const selected = selectAgentForTask([], candidates);
  assert.equal(selected.id, 'a-idle');
});

test('selectTasksToDispatch: FACTORY_INDEPENDENT_TASKS_EXECUTE_IN_PARALLEL - independent ready tasks are all selected together, not serialized', () => {
  const tasks = [
    { id: 't1', status: 'queued', depends_on: [], created_at: '2026-08-30T10:00:00Z' },
    { id: 't2', status: 'queued', depends_on: [], created_at: '2026-08-30T10:00:01Z' },
    { id: 't3', status: 'queued', depends_on: [], created_at: '2026-08-30T10:00:02Z' },
  ];
  const toDispatch = selectTasksToDispatch(tasks, 5);
  assert.deepEqual(toDispatch.map((t) => t.id), ['t1', 't2', 't3']);
});

test('selectTasksToDispatch: a dependent task is excluded until its prerequisite is done, independents still proceed', () => {
  const tasks = [
    { id: 't1', status: 'in_progress', depends_on: [], created_at: '2026-08-30T10:00:00Z' },
    { id: 't2', status: 'queued', depends_on: ['t1'], created_at: '2026-08-30T10:00:01Z' },
    { id: 't3', status: 'queued', depends_on: [], created_at: '2026-08-30T10:00:02Z' },
  ];
  const toDispatch = selectTasksToDispatch(tasks, 5);
  assert.deepEqual(toDispatch.map((t) => t.id), ['t3']);
});

test('selectTasksToDispatch: respects the concurrency cap, earliest-created first', () => {
  const tasks = [
    { id: 't1', status: 'queued', depends_on: [], created_at: '2026-08-30T10:00:02Z' },
    { id: 't2', status: 'queued', depends_on: [], created_at: '2026-08-30T10:00:00Z' },
    { id: 't3', status: 'queued', depends_on: [], created_at: '2026-08-30T10:00:01Z' },
  ];
  const toDispatch = selectTasksToDispatch(tasks, 2);
  assert.deepEqual(toDispatch.map((t) => t.id), ['t2', 't3']);
});

test('selectTasksToDispatch: zero available slots dispatches nothing (concurrency cap enforced)', () => {
  const tasks = [{ id: 't1', status: 'queued', depends_on: [], created_at: '2026-08-30T10:00:00Z' }];
  assert.deepEqual(selectTasksToDispatch(tasks, 0), []);
});

test('selectTasksToDispatch: FACTORY_DEPENDENT_TASK_WAITS_FOR_PREREQUISITE (real live bug, fixed) - a dependent task dispatches once its now-DONE prerequisites are included in the input, even though they are no longer themselves dispatch candidates', () => {
  // Reproduces the exact live production bug found 2026-08-30 during the real Phase 2
  // scheduler smoke test: dispatchReadyTasks originally queried only non-terminal tasks,
  // so a genuinely-done dependency was invisible to isTaskReady (undefined !== 'done'),
  // permanently blocking VERIFY even after both its real dependencies finished. The fix:
  // callers must pass EVERY task (including done/archived/rejected ones) so the status
  // map is complete - this test locks that contract in.
  const allTasks = [
    { id: 'arch', status: 'done', depends_on: [], created_at: '2026-08-30T10:00:00Z' },
    { id: 'db', status: 'done', depends_on: [], created_at: '2026-08-30T10:00:01Z' },
    { id: 'verify', status: 'queued', depends_on: ['arch', 'db'], created_at: '2026-08-30T10:00:02Z' },
  ];
  const toDispatch = selectTasksToDispatch(allTasks, 5);
  assert.deepEqual(toDispatch.map((t) => t.id), ['verify']);
});

test('selectTasksToDispatch: a done/in_progress/archived task is never re-selected', () => {
  const tasks = [
    { id: 't1', status: 'done', depends_on: [], created_at: '2026-08-30T10:00:00Z' },
    { id: 't2', status: 'in_progress', depends_on: [], created_at: '2026-08-30T10:00:01Z' },
    { id: 't3', status: 'archived', depends_on: [], created_at: '2026-08-30T10:00:02Z' },
  ];
  assert.deepEqual(selectTasksToDispatch(tasks, 5), []);
});

test('FACTORY_PRODUCT_ARCHITECT_CAN_BE_DISPATCHED_WHEN_CAPABILITY_REQUIRED - a task requiring "architecture" routes to brain-os-product-architect, using the REAL registered capability list (sync-agents.mjs ALLOWLIST), not a synthetic mock', () => {
  // Real incident this locks in (qa/KNOWN_FAILURE_MODES.md, Phase 5): Product Architect
  // had real capabilities registered but no execution_provider at all, so no candidate
  // list the scheduler ever builds from live agents (execution_provider is not null)
  // could include it - an 'architecture' task was structurally undispatchable by
  // anyone. This test can't see the DB-level execution_provider fix directly (that's
  // factory_agent_registry_dispatchability_truth.sql's job), but it locks in the OTHER
  // half of the contract: the capability-matching logic itself must genuinely prefer
  // Product Architect for an architecture-shaped task, using its real, currently-
  // registered capability list - not a hand-picked test fixture that could silently
  // drift from what's actually configured.
  const productArchitectEntry = ALLOWLIST.find((e) => e.name === 'brain-os-product-architect');
  assert.ok(productArchitectEntry, 'brain-os-product-architect must remain in the sync ALLOWLIST');
  assert.ok(productArchitectEntry.capabilities.includes('architecture'), 'must retain the architecture capability');

  const candidates = ALLOWLIST.map((e) => ({ id: e.name, name: e.name, capabilities: e.capabilities, activeRunCount: 0 }));
  const selected = selectAgentForTask(['architecture'], candidates);
  assert.equal(selected?.id, 'brain-os-product-architect');
});

// ---- FACTORY_DEAD_CHAIN_IS_NOT_REPORTED_AS_WAITING -------------------------------------
// isTaskPermanentlyBlocked was unit-tested above and called by nothing (known debt #1 in
// docs/software-factory/COMPLETED_STATE.md). These rows pin the wiring: the classifier the
// dispatcher now consults, the reason it reports, and that the dispatch list is derived
// from the same classification rather than a second filter that could drift.
const T = (id, deps, status = 'queued', created = '2026-09-12T00:00:00Z') => ({ id, status, depends_on: deps, created_at: created });

test('classifyQueuedTasks: ready / waiting / permanently blocked are three different answers', () => {
  const tasks = [T('done1', [], 'done'), T('open1', [], 'in_progress'), T('bad1', [], 'rejected'),
    T('r', ['done1']), T('w', ['open1']), T('b', ['bad1', 'done1']), T('b2', ['bad1', 'open1'])];
  const c = classifyQueuedTasks(tasks);
  assert.deepEqual(c.ready.map((x) => x.id), ['r']);
  assert.deepEqual(c.waiting.map((x) => x.id), ['w']);
  assert.deepEqual(c.permanentlyBlocked.map((x) => x.task.id), ['b', 'b2'],
    'a rejected dependency blocks even when another dependency is still open - the chain is dead either way');
  assert.deepEqual(c.permanentlyBlocked[0].rejectedDependencies, ['bad1']);
});

test('classifyQueuedTasks: only QUEUED tasks are classified; terminal and running tasks are inputs, not outputs', () => {
  const c = classifyQueuedTasks([T('a', [], 'done'), T('b', [], 'in_progress'), T('c', ['zz'], 'rejected'), T('d', [], 'archived')]);
  assert.deepEqual([c.ready, c.waiting, c.permanentlyBlocked], [[], [], []]);
});

test('selectTasksToDispatch derives from classifyQueuedTasks - a permanently blocked task is never dispatched and never counted as ready', () => {
  const tasks = [T('bad1', [], 'rejected'), T('b', ['bad1']), T('r', [], 'queued', '2026-09-12T00:00:01Z')];
  assert.deepEqual(selectTasksToDispatch(tasks, 5).map((x) => x.id), ['r']);
  assert.deepEqual(selectTasksToDispatch(tasks, 5), classifyQueuedTasks(tasks).ready);
});

test('idleReason: a dead chain reads as permanently_blocked, a busy one as waiting_on_dependencies - never the same word', () => {
  const blocked = { ready: [], waiting: [], permanentlyBlocked: [{ task: T('b', ['x']), rejectedDependencies: ['x'] }] };
  const busy = { ready: [], waiting: [T('w', ['y'])], permanentlyBlocked: [] };
  const both = { ready: [], waiting: [T('w', ['y'])], permanentlyBlocked: blocked.permanentlyBlocked };
  const empty = { ready: [], waiting: [], permanentlyBlocked: [] };
  assert.equal(idleReason(3, blocked), 'permanently_blocked');
  assert.equal(idleReason(3, busy), 'waiting_on_dependencies');
  assert.equal(idleReason(3, both), 'waiting_on_dependencies', 'while anything can still become ready the Work Order is not dead');
  assert.equal(idleReason(3, empty), 'no_queued_tasks');
  assert.equal(idleReason(0, blocked), 'concurrency_cap_reached', 'no slots means nothing was classified as undispatchable by the cap');
  const answers = new Set([idleReason(3, blocked), idleReason(3, busy), idleReason(3, empty), idleReason(0, blocked)]);
  assert.equal(answers.size, 4, 'four situations, four distinct words - the defect was two of them sharing one');
});

test('ABLATION: with the rejected-dependency check disabled, the dead chain collapses into waiting - the row above depends on the detector', () => {
  // Reproduces the pre-wiring behaviour by classifying with the detector's answer forced
  // to false: the blocked task falls into WAITING and idleReason says waiting_on_dependencies.
  const tasks = [T('bad1', [], 'rejected'), T('b', ['bad1'])];
  const statusById = new Map(tasks.map((x) => [x.id, x.status]));
  const withoutDetector = { ready: [], waiting: tasks.filter((x) => x.status === 'queued' && !isTaskReady(x, statusById)), permanentlyBlocked: [] };
  assert.equal(idleReason(3, withoutDetector), 'waiting_on_dependencies');
  assert.equal(idleReason(3, classifyQueuedTasks(tasks)), 'permanently_blocked');
});
