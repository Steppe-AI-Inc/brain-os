window.SEM = window.SEM || {};
SEM.ChatOps = (() => {
  const U = SEM.Utils;

  function ensureSchema() {
    const s = SEM.Store.get();
    if (!Array.isArray(s.chatOpsRuns)) s.chatOpsRuns = [];
    if (!Array.isArray(s.aiWorkOrders)) s.aiWorkOrders = [];
    if (!Array.isArray(s.workflowRuns)) s.workflowRuns = [];
    if (!Array.isArray(s.autoTestRuns)) s.autoTestRuns = [];
    if (!Array.isArray(s.qaCases)) s.qaCases = [];
    if (!Array.isArray(s.releases)) s.releases = [];
    if (!Array.isArray(s.agentMessages)) s.agentMessages = [];
    if (!s.sales) s.sales = { leads: [], campaigns: [], socialPosts: [], chatbots: [] };
    if (!Array.isArray(s.sales.leads)) s.sales.leads = [];
    if (!Array.isArray(s.sales.campaigns)) s.sales.campaigns = [];
    if (!Array.isArray(s.sales.socialPosts)) s.sales.socialPosts = [];
    if (!Array.isArray(s.sales.chatbots)) s.sales.chatbots = [];
    if (!Array.isArray(s.documents)) s.documents = [];
    if (!Array.isArray(s.productLines)) s.productLines = [];
    if (!Array.isArray(s.inventoryItems)) s.inventoryItems = [];
    if (!Array.isArray(s.productSpecs)) s.productSpecs = [];
    if (!Array.isArray(s.softwareTickets)) s.softwareTickets = [];
    if (!Array.isArray(s.meetings)) s.meetings = [];
    if (!Array.isArray(s.quotations)) s.quotations = [];
    if (!Array.isArray(s.proposals)) s.proposals = [];
    if (!Array.isArray(s.approvals)) s.approvals = [];
    if (!Array.isArray(s.tasks)) s.tasks = [];
    if (!Array.isArray(s.memories)) s.memories = [];
    if (!s.integrationSettings) s.integrationSettings = {};
    if (!s.integrationSettings.slack) s.integrationSettings.slack = { status: 'not_connected', defaultChannel: '#ops', pendingActions: [] };
    if (!Array.isArray(s.integrationSettings.slack.pendingActions)) s.integrationSettings.slack.pendingActions = [];
    if (!s.integrationSettings.googleDrive) s.integrationSettings.googleDrive = { status: 'not_connected', folderName: 'SEM Brain', pendingExports: [] };
    if (!Array.isArray(s.integrationSettings.googleDrive.pendingExports)) s.integrationSettings.googleDrive.pendingExports = [];
    return s;
  }

  function has(cmd, words) {
    const c = String(cmd || '').toLowerCase();
    return words.some(w => c.includes(w));
  }

  function classify(cmd) {
    if (has(cmd, ['qa', 'qc', 'test', 'regression', 'verify', 'check software'])) return 'qa';
    if (has(cmd, ['proposal', 'quotation', 'quote', 'commercial offer', 'meeting', 'close contract', 'contract fast'])) return 'deal_close';
    if (has(cmd, ['sales', 'marketing', 'social', 'linkedin', 'chatbot', 'crm', 'lead'])) return 'sales_growth';
    if (has(cmd, ['software', 'code', 'feature', 'ticket', 'release', 'bug', 'prd', 'product design'])) return 'software_factory';
    if (has(cmd, ['document', 'upload', 'knowledge', 'memory', 'google drive', 'drive'])) return 'knowledge_ops';
    if (has(cmd, ['inventory', 'stock', 'product line', 'procurement', 'warehouse'])) return 'inventory_ops';
    if (has(cmd, ['employee', 'kpi', 'salary', 'human', 'people', 'team'])) return 'people_kpi';
    if (has(cmd, ['daily', 'brief', 'manage all', 'all companies', 'holding', 'stuck', 'blocked'])) return 'ceo_daily_brief';
    return 'general_ops';
  }

  function agentForCategory(category) {
    return ({
      qa: 'a_qa',
      deal_close: 'a_deal',
      sales_growth: 'a_sales',
      software_factory: 'a_software',
      knowledge_ops: 'a_docs',
      inventory_ops: 'a_inventory',
      people_kpi: 'a_kpi',
      ceo_daily_brief: 'a_chief',
      general_ops: 'a_chief'
    })[category] || 'a_chief';
  }

  function companyIdFromCommand(cmd) {
    const c = String(cmd || '').toLowerCase();
    if (c.includes('fuel')) return 'c_sem_mn';
    if (c.includes('trade')) return 'c_tradebook';
    if (c.includes('robot') || c.includes('engineering')) return 'c_grt';
    if (c.includes('sem brain')) return 'c_parent';
    return 'c_openspot';
  }

  function personByRole(defaultId) {
    const s = ensureSchema();
    return s.people.find(p => p.id === defaultId)?.id || s.people[0]?.id || null;
  }

  function createTask({ title, description, companyId, projectId, ownerType = 'agent', ownerAgentId = 'a_chief', ownerPersonId = null, status = 'queued', priority = 'medium', riskLevel = 'low', approvalRequired = false, acceptanceCriteria = [], testMethod = [] }) {
    const s = ensureSchema();
    const task = {
      id: U.uid('task'), title, description, companyId: companyId || companyIdFromCommand(title + ' ' + description), projectId: projectId || null,
      ownerType, ownerAgentId: ownerType === 'agent' ? ownerAgentId : null, ownerPersonId: ownerType === 'human' ? ownerPersonId : null,
      status, priority, riskLevel, approvalRequired, acceptanceCriteria, testMethod, createdAt: U.now()
    };
    s.tasks.unshift(task);
    return task;
  }

  function createApproval({ title, reason, payload = {}, riskLevel = 'medium' }) {
    const s = ensureSchema();
    const approval = { id: U.uid('ap'), taskId: payload.taskId || null, title, reason, status: 'pending', riskLevel, createdAt: U.now(), payload };
    s.approvals.unshift(approval);
    return approval;
  }

  function createWorkOrder({ title, category, agentId, command, scope, status = 'queued', outputType = 'tasks' }) {
    const s = ensureSchema();
    const order = { id: U.uid('wo'), title, category, agentId, command, scope, status, outputType, createdAt: U.now(), logs: [] };
    s.aiWorkOrders.unshift(order);
    return order;
  }

  function queueSlack(text, channel = '#ops') {
    const s = ensureSchema();
    const action = { id: U.uid('slack'), type: 'chatops_notification', channel: s.integrationSettings.slack.defaultChannel || channel, text, status: 'queued', createdAt: U.now() };
    s.integrationSettings.slack.pendingActions.unshift(action);
    return action;
  }

  function queueDrive(title, type = 'workspace_export', payload = {}) {
    const s = ensureSchema();
    const item = { id: U.uid('gdrive'), type, title, payload, status: 'queued', createdAt: U.now() };
    s.integrationSettings.googleDrive.pendingExports.unshift(item);
    return item;
  }

  function productLine(productId) { return ensureSchema().productLines.find(p => p.id === productId) || ensureSchema().productLines[0]; }
  function lead() { return ensureSchema().sales.leads[0] || { id: 'lead_manual', name: 'Meeting Client', companyId: 'c_openspot' }; }
  function money(cur, n) { return `${cur || 'USD'} ${Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}`; }

  function createMeetingProposal(command, run) {
    const s = ensureSchema();
    const companyId = companyIdFromCommand(command);
    const l = lead();
    const lock = productLine('prod_openspot_lock');
    const service = productLine('prod_openspot_service');
    const setup = productLine('prod_install_setup');
    const qtyMatch = String(command).match(/(\d+)\s*(bay|bays|device|devices|unit|units)?/i);
    const qty = qtyMatch ? Number(qtyMatch[1]) : 10;
    const lines = [
      { productLineId: lock?.id, name: lock?.name || 'Product', qty, unit: lock?.unit || 'unit', currency: lock?.currency || 'USD', unitPrice: Number(lock?.unitPrice || 0), subtotal: Number(lock?.unitPrice || 0) * qty },
      { productLineId: service?.id, name: service?.name || 'Monthly Service', qty, unit: service?.unit || 'month', currency: service?.currency || 'USD', unitPrice: Number(service?.unitPrice || 0), subtotal: Number(service?.unitPrice || 0) * qty },
      { productLineId: setup?.id, name: setup?.name || 'Setup', qty: 1, unit: setup?.unit || 'site', currency: setup?.currency || 'USD', unitPrice: Number(setup?.unitPrice || 0), subtotal: Number(setup?.unitPrice || 0) }
    ];
    const total = lines.reduce((a, x) => a + x.subtotal, 0);
    const q = { id: U.uid('quote'), companyId, leadId: l.id, customerName: l.name, title: `AI-generated meeting proposal — ${qty} OpenSpot bays`, currency: 'USD', lines, discountPct: 0, taxPct: 0, totals: { subtotal: total, discount: 0, tax: 0, total, marginPct: 50 }, paymentTerms: '50% upfront, 40% on installation, 10% after acceptance', validityDays: 14, status: 'needs_approval', source: 'ai_native_chat', createdAt: U.now() };
    q.proposalText = `Client-ready commercial proposal\n\nClient: ${q.customerName}\nScope: ${qty} OpenSpot smart curb-lock bays + monthly service + site setup.\nTotal: ${money(q.currency, q.totals.total)}\nPayment terms: ${q.paymentTerms}\n\nApproval required before sending externally.`;
    s.quotations.unshift(q);
    s.proposals.unshift({ id: U.uid('proposal'), quotationId: q.id, title: q.title, status: 'draft_needs_approval', language: 'en', text: q.proposalText, createdAt: U.now() });
    createApproval({ title: `Approve AI-generated proposal: ${q.title}`, reason: 'External proposal must be reviewed before sending to client.', payload: { quotationId: q.id, runId: run.id }, riskLevel: 'medium' });
    queueSlack(`AI generated proposal for approval: ${q.title} — ${money(q.currency, q.totals.total)}`, '#sales');
    queueDrive(q.title, 'proposal_html', { quotationId: q.id });
    createTask({ title: `Follow up client after proposal approval: ${q.customerName}`, description: `Send proposal only after approval. Source command: ${command}`, companyId, projectId: 'pr_openspot_sales', ownerType: 'human', ownerPersonId: personByRole('p_sales'), priority: 'high', acceptanceCriteria: ['Approved proposal sent', 'Next meeting scheduled'], testMethod: ['Sales manager verifies CRM update'] });
    return [`Created quotation/proposal package (${money(q.currency, q.totals.total)})`, 'Queued approval, Slack alert, Drive export and sales follow-up task'];
  }

  function createSalesGrowth(command) {
    const s = ensureSchema();
    const companyId = companyIdFromCommand(command);
    s.sales.campaigns.unshift({ id: U.uid('camp'), title: 'AI ChatOps Sales Push', companyId, status: 'draft_needs_approval', goal: 'Generate qualified meetings from property owners, campuses and operators', ownerPersonId: personByRole('p_sales'), source: 'ai_native_chat', createdAt: U.now() });
    ['LinkedIn', 'X / Twitter', 'Email'].forEach(platform => s.sales.socialPosts.unshift({ id: U.uid('post'), platform, title: 'OpenSpot fast-close campaign draft', status: 'needs_approval', ownerPersonId: personByRole('p_sales'), copy: `Draft ${platform} post: Turn unmanaged parking into guaranteed reserved access with OpenSpot. Source: ${command.slice(0, 80)}`, createdAt: U.now() }));
    s.sales.chatbots.unshift({ id: U.uid('bot'), channel: 'Website / WhatsApp / Telegram', title: 'AI Lead Qualifier — OpenSpot', status: 'draft_needs_approval', goal: 'Ask bay count, site type, current parking pain, decision maker, budget range and desired timeline.', createdAt: U.now() });
    createApproval({ title: 'Approve AI-generated sales campaign assets', reason: 'External marketing/social/chatbot messaging requires approval before publishing.', payload: { source: 'ai_native_chat' }, riskLevel: 'medium' });
    createTask({ title: 'Review and approve AI-generated sales campaign', description: command, companyId, projectId: 'pr_openspot_sales', ownerType: 'human', ownerPersonId: personByRole('p_sales'), priority: 'high', approvalRequired: true, riskLevel: 'medium', acceptanceCriteria: ['Campaign reviewed', 'Posts approved or edited', 'Chatbot questions approved'], testMethod: ['Founder or manager approval exists'] });
    queueSlack('AI created sales campaign drafts. Approval required before publishing.', '#sales');
    return ['Created campaign, 3 social posts, chatbot script and approval gate'];
  }

  function createSoftwareFactory(command) {
    const s = ensureSchema();
    const companyId = 'c_parent';
    const prd = { id: U.uid('prd'), companyId, title: `AI PRD: ${command.slice(0, 64)}`, status: 'draft', ownerPersonId: personByRole('p_engineer'), problem: 'Founder requested AI-native software factory change from one chat command.', successCriteria: 'Feature is delivered as patch-only module update with tests and no full-system rewrite.', createdAt: U.now() };
    s.productSpecs.unshift(prd);
    const ticketTitles = [
      'Write product requirement and acceptance criteria',
      'Identify allowed modules and files only',
      'Implement patch-only code change',
      'Add module-specific UI check',
      'Run regression QA and record evidence',
      'Prepare release approval summary'
    ];
    ticketTitles.forEach((title, idx) => s.softwareTickets.unshift({ id: U.uid('sw'), title: `${title}: ${prd.title}`, module: idx === 1 ? 'Module Registry / allowed files' : 'target module only', status: 'queued', ownerPersonId: personByRole('p_engineer'), qaRequired: true, approvalRequired: idx >= 2, source: 'ai_native_chat', createdAt: U.now() }));
    s.qaCases.unshift({ id: U.uid('qa'), title: `Regression QA for ${prd.title}`, scope: 'patch-only software factory', status: 'queued', acceptanceCriteria: ['No unrelated modules changed', 'New UI works', 'Existing QA Lab passes', 'Token estimate under hard stop'], createdAt: U.now() });
    createApproval({ title: `Approve software factory release: ${prd.title}`, reason: 'Production-impacting software changes require release gate approval.', payload: { productSpecId: prd.id }, riskLevel: 'high' });
    queueSlack(`Software factory created PRD + tickets for: ${prd.title}`, '#engineering');
    return [`Created PRD, ${ticketTitles.length} engineering tickets, QA case and release approval gate`];
  }

  function createKnowledgeOps(command) {
    const s = ensureSchema();
    const companyId = companyIdFromCommand(command);
    const doc = { id: U.uid('doc'), companyId, title: `Knowledge capture from chat: ${command.slice(0, 50)}`, fileName: 'chatops-knowledge.md', type: 'manual_chat', sensitivity: 'internal', status: 'indexed', tags: ['chatops', 'knowledge'], summary: 'Founder requested knowledge capture or document ingestion from AI-native chat.', textSnippet: command.slice(0, 280), source: 'ai_native_chat', uploadedBy: 'p_tulga', createdAt: U.now() };
    s.documents.unshift(doc);
    s.memories.unshift({ id: U.uid('m'), entityType: 'document', entityId: doc.id, fact: `Knowledge item captured from founder command: ${command.slice(0, 180)}`, source: 'ai_native_chat', confidence: .7, sensitivity: 'internal', createdAt: U.now() });
    createTask({ title: `Curate memory from uploaded/current knowledge`, description: command, companyId, ownerType: 'agent', ownerAgentId: 'a_docs', priority: 'medium', acceptanceCriteria: ['Memory is source-linked', 'Sensitive data classified'], testMethod: ['Memory Curator Agent review'] });
    return ['Created document record, source-linked memory and curation task'];
  }

  function createInventoryOps(command) {
    const s = ensureSchema();
    const low = s.inventoryItems.filter(i => Number(i.qtyOnHand || 0) - Number(i.qtyReserved || 0) <= Number(i.reorderPoint || 0));
    low.forEach(i => {
      const p = s.productLines.find(x => x.id === i.productLineId);
      createTask({ title: `Inventory action required: ${p?.name || i.productLineId}`, description: `Available stock is at or below reorder point. Warehouse: ${i.warehouse}.`, companyId: i.companyId, ownerType: 'agent', ownerAgentId: 'a_inventory', priority: 'high', riskLevel: 'medium', approvalRequired: true, acceptanceCriteria: ['Stock verified', 'Procurement/manufacturing plan approved'], testMethod: ['Inventory Manager verifies stock ledger'] });
    });
    if (low.length) createApproval({ title: `Approve inventory/procurement actions (${low.length})`, reason: 'Inventory shortage can block proposals/contracts.', payload: { inventoryItemIds: low.map(x => x.id) }, riskLevel: 'medium' });
    return [`Checked inventory. ${low.length} item(s) need action.`];
  }

  function createPeopleKpi(command) {
    const s = ensureSchema();
    s.people.filter(p => p.id !== 'p_tulga').forEach(p => {
      createTask({ title: `Weekly KPI check-in: ${p.fullName}`, description: `AI manager must collect KPI evidence and blockers. Source: ${command}`, companyId: p.companyId, ownerType: 'human', ownerPersonId: p.id, priority: 'medium', riskLevel: 'low', approvalRequired: false, acceptanceCriteria: ['KPI evidence submitted', 'Blockers listed', 'Next week target confirmed'], testMethod: ['KPI Manager Agent reviews completion'] });
    });
    createApproval({ title: 'Review salary-impacting KPI recommendations only', reason: 'AI can recommend salary impact, but humans must approve salary actions.', payload: { source: 'people_kpi_chatops' }, riskLevel: 'high' });
    return ['Created KPI check-in tasks and salary-impact approval gate'];
  }

  function createDailyBrief(command) {
    const s = ensureSchema();
    const blockedProjects = s.projects.filter(p => String(p.blockers || '').trim());
    const riskyCompanies = [...s.companies].sort((a, b) => Number(b.riskScore || 0) - Number(a.riskScore || 0)).slice(0, 3);
    blockedProjects.forEach(p => createTask({ title: `Unblock project: ${p.title}`, description: p.blockers, companyId: p.companyId, projectId: p.id, ownerType: 'agent', ownerAgentId: 'a_coo', priority: Number(p.riskScore || 0) > 40 ? 'high' : 'medium', riskLevel: Number(p.riskScore || 0) > 40 ? 'high' : 'medium', approvalRequired: Number(p.riskScore || 0) > 50, acceptanceCriteria: ['Blocker owner identified', 'Next action created'], testMethod: ['Chief of Staff review'] }));
    const summary = `CEO brief created. Top risks: ${riskyCompanies.map(c => `${c.name} (${c.riskScore})`).join(', ')}. Blocked projects: ${blockedProjects.length}.`;
    s.memories.unshift({ id: U.uid('m'), entityType: 'brief', entityId: null, fact: summary, source: 'ai_native_chat_daily_brief', confidence: .85, sensitivity: 'internal', createdAt: U.now() });
    return [summary];
  }

  function runAutoQa(command) {
    const result = SEM.AutoTest?.runAll ? SEM.AutoTest.runAll({ source: 'chatops', command }) : { verdict: 'WARN', passed: 0, failed: 0, warnings: 1, tests: [{ name: 'AutoTest module', status: 'WARN', detail: 'AutoTest module not loaded.' }] };
    return [`QA run completed: ${result.verdict}. Passed ${result.passed}, failed ${result.failed}, warnings ${result.warnings}`];
  }

  function buildPlan(command) {
    const category = classify(command);
    const agentId = agentForCategory(category);
    const steps = [
      { id: 'context', title: 'Build minimal context pack', agentId: 'a_chief', status: 'planned' },
      { id: 'route', title: `Route command to ${category}`, agentId: 'a_chief', status: 'planned' },
      { id: 'work_order', title: 'Create scoped AI work order', agentId, status: 'planned' },
      { id: 'execute', title: 'Execute safe internal workflow actions', agentId, status: 'planned' },
      { id: 'approval', title: 'Create approval gates for risky/external actions', agentId: 'a_security', status: 'planned' },
      { id: 'qa', title: 'Run QA/evidence check', agentId: 'a_qa', status: 'planned' },
      { id: 'memory', title: 'Update source-linked memory and execution log', agentId: 'a_docs', status: 'planned' }
    ];
    return { category, agentId, steps };
  }

  async function execute(command, options = {}) {
    ensureSchema();
    const dryRun = !!options.dryRun;
    const contextPack = SEM.ContextPack?.build ? SEM.ContextPack.build(command) : { counts: {} };
    const planInfo = buildPlan(command);
    const tokenPlan = SEM.TokenBudget?.estimateCommand ? SEM.TokenBudget.estimateCommand(command, { category: planInfo.category, riskLevel: SEM.Pipeline?.riskOf ? SEM.Pipeline.riskOf(command) : 'medium', contextPack }) : { totalTokens: 0, route: 'no-llm', estimatedCostUsd: 0 };
    const s = ensureSchema();
    const run = { id: U.uid('run'), command, category: planInfo.category, agentId: planInfo.agentId, dryRun, status: dryRun ? 'preview' : 'completed', contextCounts: contextPack.counts || {}, tokenPlan, steps: planInfo.steps.map(x => ({ ...x })), outputs: [], createdAt: U.now() };

    if (!dryRun) {
      createWorkOrder({ title: `ChatOps work order: ${planInfo.category}`, category: planInfo.category, agentId: planInfo.agentId, command, scope: contextPack.counts || {}, status: 'completed' });
      let outputs = [];
      if (planInfo.category === 'deal_close') outputs = createMeetingProposal(command, run);
      else if (planInfo.category === 'sales_growth') outputs = createSalesGrowth(command);
      else if (planInfo.category === 'software_factory') outputs = createSoftwareFactory(command);
      else if (planInfo.category === 'knowledge_ops') outputs = createKnowledgeOps(command);
      else if (planInfo.category === 'inventory_ops') outputs = createInventoryOps(command);
      else if (planInfo.category === 'people_kpi') outputs = createPeopleKpi(command);
      else if (planInfo.category === 'ceo_daily_brief') outputs = createDailyBrief(command);
      else if (planInfo.category === 'qa') outputs = runAutoQa(command);
      else outputs = [
        ...createDailyBrief(command),
        ...createSalesGrowth(command),
        ...createSoftwareFactory(command)
      ];
      run.outputs = outputs;
      run.steps = run.steps.map(st => ({ ...st, status: 'done' }));
      s.agentMessages.unshift({ id: U.uid('msg'), runId: run.id, agentId: planInfo.agentId, role: 'executor', message: outputs.join('\n'), createdAt: U.now() });
    }

    s.chatOpsRuns.unshift(run);
    SEM.Store.save();
    return run;
  }

  return { ensureSchema, classify, buildPlan, execute };
})();
