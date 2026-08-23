window.SEM = window.SEM || {};
SEM.Permissions = (() => {
  const roleRank = {founder:100, holding_admin:85, hr_finance:75, company_manager:65, team_lead:50, employee:35, contractor:25, investor_viewer:20, ai_agent:10};
  const roleLabel = {founder:'Founder / Owner', holding_admin:'Holding Admin', hr_finance:'HR / Finance', company_manager:'Company Manager', team_lead:'Team Lead', employee:'Employee', contractor:'Contractor', investor_viewer:'Investor Viewer', ai_agent:'AI Agent'};
  const rank = user => roleRank[user?.role] || 0;
  const has = (user, minRole) => rank(user) >= (roleRank[minRole]||0);
  const scopedCompanyIds = (user) => user?.companyScope || [];
  const canSeeCompany = (user, company) => has(user,'holding_admin') || scopedCompanyIds(user).includes(company.id);
  const canSeeOwnership = (user) => has(user,'holding_admin');
  const canSeeSalary = (user, person) => has(user,'hr_finance') || user?.personId === person?.id;
  const canEditKpi = (user) => has(user,'company_manager');
  const canApprove = (user) => has(user,'holding_admin') || user?.role === 'founder';
  const canUseFounderCommand = (user) => has(user,'company_manager');
  const safeCompany = (user, company) => {
    if(!company) return null;
    const base = {...company};
    if(!canSeeOwnership(user)) { delete base.ownerPersonId; delete base.parentEntityId; delete base.cashBalance; }
    return base;
  };
  const safePerson = (user, person) => {
    const p = {...person};
    if(!canSeeSalary(user, person)) delete p.compensationMonthly;
    if(!has(user,'company_manager') && user?.personId !== person.id) { delete p.email; delete p.managerPersonId; }
    return p;
  };
  const requiresApproval = (task) => task.approvalRequired || ['high','critical'].includes(task.riskLevel) || /salary|pay|contract|external|publish|send email|production|delete|hire|fire/i.test(`${task.title} ${task.description}`);
  return { roleRank, roleLabel, rank, has, canSeeCompany, canSeeOwnership, canSeeSalary, canEditKpi, canApprove, canUseFounderCommand, safeCompany, safePerson, requiresApproval };
})();
