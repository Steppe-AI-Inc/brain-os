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
  selectAgentForTask,
  selectTasksToDispatch,
} from './scheduler.mjs';

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
