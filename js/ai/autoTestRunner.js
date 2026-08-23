window.SEM = window.SEM || {};
SEM.AutoTest = (() => {
  const U = SEM.Utils;
  function status(condition, name, detailOk, detailFail, warn = false) {
    return { name, status: condition ? 'PASS' : (warn ? 'WARN' : 'FAIL'), detail: condition ? detailOk : detailFail };
  }
  function runAll(meta = {}) {
    const s = SEM.Store.get();
    const tests = [];
    tests.push(status(!!SEM.ChatOps?.execute, 'AI-native ChatOps orchestrator exists', 'ChatOps is available.', 'ChatOps orchestrator missing.'));
    tests.push(status(Array.isArray(s.companies) && s.companies.length > 0, 'Company database', `${s.companies.length} companies found.`, 'No companies found.'));
    tests.push(status(Array.isArray(s.people) && s.people.length > 0, 'People database', `${s.people.length} people found.`, 'No people found.'));
    tests.push(status(Array.isArray(s.tasks), 'Task database', `${s.tasks.length} tasks found.`, 'Tasks collection missing.'));
    tests.push(status(Array.isArray(s.memories), 'Memory database', `${s.memories.length} memories found.`, 'Memory collection missing.'));
    tests.push(status(!!SEM.ContextPack?.build, 'Context pack builder', 'Context pack builder is loaded.', 'Context pack builder missing.'));
    tests.push(status(!!SEM.TokenBudget?.estimateCommand, 'Token preflight estimator', 'Token estimator is loaded.', 'Token estimator missing.'));
    tests.push(status(!!SEM.Permissions?.canSeeCompanyOwnership, 'Permission layer', 'Permission helpers loaded.', 'Permission helpers missing.'));
    tests.push(status(!!SEM.Modules?.chatOps, 'Chat-first UI module', 'ChatOps page exists.', 'ChatOps page missing.'));
    tests.push(status(!!SEM.Modules?.workflowFactory, 'Workflow factory UI module', 'Workflow Factory page exists.', 'Workflow Factory page missing.'));
    tests.push(status((s.settings?.hardStopTokensPerCommand || 0) > 0, 'Hard token stop', `Hard stop is ${s.settings?.hardStopTokensPerCommand} tokens.`, 'Hard stop missing.'));
    tests.push(status((s.users || []).some(u => u.role === 'employee'), 'Employee role exists', 'Employee demo user exists.', 'No employee user found.'));
    tests.push(status(!(SEM.Permissions?.canSeeOwnership?.({ role: 'employee' })), 'Employee ownership hiding', 'Employee role cannot see ownership.', 'Employee role can see ownership — privacy risk.'));
    tests.push(status(Array.isArray(s.integrationSettings?.slack?.pendingActions), 'Slack queue', 'Slack queue exists.', 'Slack queue missing.', true));
    tests.push(status(Array.isArray(s.integrationSettings?.googleDrive?.pendingExports), 'Google Drive queue', 'Drive queue exists.', 'Drive queue missing.', true));
    const failed = tests.filter(t => t.status === 'FAIL').length;
    const warnings = tests.filter(t => t.status === 'WARN').length;
    const passed = tests.filter(t => t.status === 'PASS').length;
    const verdict = failed ? 'NO-GO' : warnings ? 'PASS_WITH_WARNINGS' : 'PASS';
    const run = { id: U.uid('qa'), verdict, passed, failed, warnings, tests, source: meta.source || 'manual', command: meta.command || '', createdAt: U.now() };
    if (!Array.isArray(s.autoTestRuns)) s.autoTestRuns = [];
    s.autoTestRuns.unshift(run);
    SEM.Store.save();
    return run;
  }
  return { runAll };
})();
