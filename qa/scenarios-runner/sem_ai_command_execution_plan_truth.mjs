// Permanent regression for Bug 11 (2026-08-30 "Multi-Entity Execution, Confirmation Truth"
// campaign) — real typed execution plans for genuinely compound multi-action commands
// ("restore employee X, move them to company Y, and assign them task Z"). See
// qa/KNOWN_FAILURE_MODES.md for the full incident record. Prior to this fix, a compound
// command had no structured decomposition at all — it either flattened into one prose
// promise, or relied on multiple ad-hoc mutation fields firing together with zero real
// cross-action dependency awareness (an action whose real dependency failed would still
// run, or the founder would have no way to see which specific step of several succeeded
// or failed).
//
// This is pure JS/TS logic, not a SQL/RLS invariant — run with:
//   node qa/scenarios-runner/sem_ai_command_execution_plan_truth.mjs
// The dependency-resolution ALGORITHM is mirrored byte-for-byte (parameterized by an
// injectable per-action executor, so the real orchestration logic — topological order,
// dependency blocking, partial-failure classification — is tested deterministically
// without needing a real database). buildExecutionPlanReport is a genuine byte-for-byte
// copy of the shipped formatter.

// ---- byte-for-byte copy of executeActionPlan's orchestration loop (index.ts), generalized
// to take an injectable executor so real RPC/DB calls aren't needed to test the real
// dependency-ordering and blocking algorithm. ----
async function resolvePlanExecutionOrder(plan, executeOne) {
  const byId = new Map(plan.map((a) => [a.id, a]));
  const pending = new Set(plan.map((a) => a.id));
  let guard = 0;
  while (pending.size > 0 && guard < plan.length + 5) {
    guard++;
    let progressed = false;
    for (const id of [...pending]) {
      const action = byId.get(id);
      if (!action) { pending.delete(id); continue; }
      const deps = action.dependsOn || [];
      if (!deps.every((d) => !pending.has(d))) continue;
      const depsFailed = deps.some((d) => byId.get(d)?.status === 'failed' || byId.get(d)?.status === 'blocked');
      if (depsFailed) {
        action.status = 'blocked';
        action.result = { reason: 'dependency_failed', dependsOn: deps };
      } else {
        const outcome = await executeOne(action);
        action.status = outcome.success ? 'completed' : 'failed';
        action.result = { success: outcome.success, detail: outcome.detail };
      }
      pending.delete(id);
      progressed = true;
    }
    if (!progressed) {
      for (const id of pending) {
        const action = byId.get(id);
        if (action) { action.status = 'failed'; action.result = { reason: 'circular_dependency' }; }
      }
      break;
    }
  }
  const completedCount = plan.filter((a) => a.status === 'completed').length;
  const overallStatus = completedCount === plan.length ? 'completed' : completedCount === 0 ? 'failed' : 'partial';
  return { plan, overallStatus };
}

// ---- byte-for-byte copy: buildExecutionPlanReport (index.ts) ----
function buildExecutionPlanReport(plan, overallStatus, names) {
  const OPERATION_LABEL = {
    restore_employment: 'Restore employment', end_employment: 'End employment',
    reassign_person: 'Reassign', assign_task: 'Assign task',
    archive_company: 'Archive company', restore_company: 'Restore company',
    archive_task: 'Archive task', restore_task: 'Restore task',
    archive_goal: 'Archive goal', restore_goal: 'Restore goal',
  };
  // Operation-aware: assign_task's targetIds carries BOTH taskId and personId, but the
  // task is what identifies THIS action - a naive "personId first" priority order (live
  // self-caught bug while writing this fix's own regression test) produced "Assign task
  // (QA-MULTI-EMPLOYEE): done." instead of "Assign task (QA-MULTI-TASK): done.".
  const nameFor = (action) => {
    const t = action.targetIds || {};
    if (action.operation === 'assign_task') return String(names.taskTitleById.get(t.taskId) || t.taskId);
    if (t.personId) return String(names.personNameById.get(t.personId) || t.personId);
    if (t.taskId) return String(names.taskTitleById.get(t.taskId) || t.taskId);
    if (t.companyId) return String(names.companyNameById.get(t.companyId) || t.companyId);
    if (t.goalId) return String(names.goalTitleById.get(t.goalId) || t.goalId);
    return 'target';
  };
  const lines = plan.map((a) => {
    const label = OPERATION_LABEL[a.operation] || a.operation;
    const name = nameFor(a);
    if (a.status === 'completed') return `${label} (${name}): done.`;
    if (a.status === 'blocked') return `${label} (${name}): blocked — a required earlier step did not complete.`;
    return `${label} (${name}): failed${a.result && typeof a.result === 'object' && 'detail' in a.result && a.result.detail ? ` — ${a.result.detail}` : ''}.`;
  });
  const headline = overallStatus === 'completed' ? '**All steps completed.**'
    : overallStatus === 'partial' ? '**Partially completed.**'
    : '**Failed — nothing completed.**';
  return `${headline} ${lines.join(' ')}`;
}

let failed = false;
function assert(cond, name, detail) {
  if (!cond) { failed = true; console.error(`FAIL ${name}${detail ? ' — ' + detail : ''}`); }
  else console.log(`PASS ${name}`);
}

async function run() {
  // ============ MULTI_ACTION_DEPENDENCY_BLOCKS_DOWNSTREAM_ON_FAILURE ============
  // The exact spec example: restore employee -> then reassign. If restore fails, reassign
  // must never run at all - reported "blocked", not silently attempted or silently dropped.
  {
    const plan = [
      { id: 'a1', operation: 'restore_employment', targetIds: { personId: 'p1' }, dependsOn: null, status: 'planned', result: null },
      { id: 'a2', operation: 'reassign_person', targetIds: { personId: 'p1', operatingCompanyId: 'c1' }, dependsOn: ['a1'], status: 'planned', result: null },
    ];
    const executor = async (action) => (action.id === 'a1' ? { success: false, detail: 'denied' } : { success: true, detail: 'should never be called' });
    const { plan: result, overallStatus } = await resolvePlanExecutionOrder(plan, executor);
    assert(result[0].status === 'failed', 'CRITICAL: the failing dependency (restore_employment) is itself reported failed');
    assert(result[1].status === 'blocked', 'CRITICAL: the dependent action (reassign_person) is blocked, never executed, when its dependency failed');
    assert(overallStatus === 'failed', 'overall status is failed when nothing completed');
  }
  // Independent actions with no shared dependency both proceed even when an UNRELATED
  // action in the same plan fails - partial execution is acceptable and must be reported
  // per-action, never flattened into one failure sentence.
  {
    const plan = [
      { id: 'a1', operation: 'archive_company', targetIds: { companyId: 'c1' }, dependsOn: null, status: 'planned', result: null },
      { id: 'a2', operation: 'end_employment', targetIds: { personId: 'p1' }, dependsOn: null, status: 'planned', result: null },
    ];
    const executor = async (action) => (action.id === 'a1' ? { success: false, detail: 'denied' } : { success: true, detail: 'ended' });
    const { plan: result, overallStatus } = await resolvePlanExecutionOrder(plan, executor);
    assert(result[0].status === 'failed', 'independent action a1 fails on its own real outcome');
    assert(result[1].status === 'completed', 'CRITICAL: independent action a2 still completes despite unrelated a1 failing (partial execution is acceptable)');
    assert(overallStatus === 'partial', 'overall status is "partial" when some but not all actions completed');
  }
  // A successful dependency correctly unblocks its dependent action.
  {
    const plan = [
      { id: 'a1', operation: 'restore_employment', targetIds: { personId: 'p1' }, dependsOn: null, status: 'planned', result: null },
      { id: 'a2', operation: 'reassign_person', targetIds: { personId: 'p1', operatingCompanyId: 'c1' }, dependsOn: ['a1'], status: 'planned', result: null },
    ];
    const executor = async () => ({ success: true, detail: 'ok' });
    const { plan: result, overallStatus } = await resolvePlanExecutionOrder(plan, executor);
    assert(result[0].status === 'completed' && result[1].status === 'completed', 'a successful dependency correctly unblocks and runs its dependent action');
    assert(overallStatus === 'completed', 'overall status is "completed" only when every action completed');
  }
  // A three-action plan with a real chain: A -> B -> C. A fails, B and C both blocked
  // (transitively), never executed.
  {
    const plan = [
      { id: 'a1', operation: 'restore_employment', targetIds: { personId: 'p1' }, dependsOn: null, status: 'planned', result: null },
      { id: 'a2', operation: 'reassign_person', targetIds: { personId: 'p1' }, dependsOn: ['a1'], status: 'planned', result: null },
      { id: 'a3', operation: 'assign_task', targetIds: { taskId: 't1', personId: 'p1' }, dependsOn: ['a2'], status: 'planned', result: null },
    ];
    let calls = 0;
    const executor = async (action) => { calls++; return action.id === 'a1' ? { success: false, detail: 'denied' } : { success: true, detail: 'ok' }; };
    const { plan: result } = await resolvePlanExecutionOrder(plan, executor);
    assert(result[0].status === 'failed' && result[1].status === 'blocked' && result[2].status === 'blocked', 'a transitive dependency chain (A->B->C) blocks every downstream action when the root fails');
    assert(calls === 1, 'CRITICAL: only the failing root action is ever actually executed - transitively-blocked actions never call the real executor at all', calls);
  }
  // Circular dependency (defensive, should never happen from a well-formed model
  // response) fails every unresolved action rather than looping forever.
  {
    const plan = [
      { id: 'a1', operation: 'restore_employment', targetIds: { personId: 'p1' }, dependsOn: ['a2'], status: 'planned', result: null },
      { id: 'a2', operation: 'end_employment', targetIds: { personId: 'p1' }, dependsOn: ['a1'], status: 'planned', result: null },
    ];
    const { plan: result, overallStatus } = await resolvePlanExecutionOrder(plan, async () => ({ success: true, detail: 'ok' }));
    assert(result.every((a) => a.status === 'failed'), 'a circular dependency fails every unresolved action instead of looping forever');
    assert(overallStatus === 'failed', 'circular dependency plan reports overall failed, never partial/completed');
  }

  // ============ MULTI_ACTION_SUCCESS_REQUIRES_ALL_REQUIRED_POSTCONDITIONS /
  // MULTI_ACTION_FAILED_STEP_CANNOT_PRODUCE_FULL_SUCCESS (report formatting) ============
  {
    const names = { personNameById: new Map([['p1', 'QA-MULTI-EMPLOYEE']]), companyNameById: new Map([['c1', 'QA-MULTI-CO']]), taskTitleById: new Map([['t1', 'QA-MULTI-TASK']]), goalTitleById: new Map() };
    const plan = [
      { id: 'a1', operation: 'restore_employment', targetIds: { personId: 'p1' }, status: 'completed', result: { success: true, detail: 'restored' } },
      { id: 'a2', operation: 'reassign_person', targetIds: { personId: 'p1' }, status: 'completed', result: { success: true, detail: 'reassigned' } },
      { id: 'a3', operation: 'assign_task', targetIds: { taskId: 't1', personId: 'p1' }, status: 'completed', result: { success: true, detail: 'assigned' } },
    ];
    const report = buildExecutionPlanReport(plan, 'completed', names);
    assert(report.startsWith('**All steps completed.**'), 'a fully-completed plan report leads with an unambiguous "All steps completed" headline', report);
    assert(report.includes('QA-MULTI-EMPLOYEE') && report.includes('QA-MULTI-TASK'), 'the report names the real entities by their real names, not raw ids', report);
    assert(report.includes('Assign task (QA-MULTI-TASK)'), 'CRITICAL: assign_task names the TASK, not the person, despite targetIds carrying both taskId and personId (real self-caught bug in this exact fix)', report);
  }
  {
    const names = { personNameById: new Map([['p1', 'QA-MULTI-EMPLOYEE']]), companyNameById: new Map(), taskTitleById: new Map([['t1', 'QA-MULTI-TASK']]), goalTitleById: new Map() };
    const plan = [
      { id: 'a1', operation: 'restore_employment', targetIds: { personId: 'p1' }, status: 'failed', result: { success: false, detail: 'denied' } },
      { id: 'a2', operation: 'assign_task', targetIds: { taskId: 't1', personId: 'p1' }, status: 'blocked', result: { reason: 'dependency_failed' } },
    ];
    const report = buildExecutionPlanReport(plan, 'failed', names);
    assert(report.startsWith('**Failed — nothing completed.**'), 'CRITICAL: a plan where nothing completed never claims success, leads with an unambiguous failure headline', report);
    assert(!/All steps completed|done\./i.test(report), 'a failed plan report never contains success-shaped language anywhere', report);
    assert(report.includes('blocked'), 'a blocked downstream action is explicitly labeled "blocked" in the report, never silently omitted', report);
  }
  {
    const names = { personNameById: new Map([['p1', 'QA-MULTI-EMPLOYEE']]), companyNameById: new Map([['c1', 'QA-MULTI-CO']]), taskTitleById: new Map(), goalTitleById: new Map() };
    const plan = [
      { id: 'a1', operation: 'archive_company', targetIds: { companyId: 'c1' }, status: 'completed', result: { success: true, detail: 'archived' } },
      { id: 'a2', operation: 'end_employment', targetIds: { personId: 'p1' }, status: 'failed', result: { success: false, detail: 'denied' } },
    ];
    const report = buildExecutionPlanReport(plan, 'partial', names);
    assert(report.startsWith('**Partially completed.**'), 'CRITICAL: a partial plan is reported as "Partially completed", never as a full success', report);
    assert(!report.startsWith('**All steps completed.**'), 'a partial plan never uses the full-success headline');
  }

  console.log(failed ? '\nSOME REGRESSIONS FAILED' : '\nALL REGRESSIONS PASSED');
  process.exit(failed ? 1 : 0);
}

run();
