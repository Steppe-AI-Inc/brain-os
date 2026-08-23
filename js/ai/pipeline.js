window.SEM = window.SEM || {};
SEM.Pipeline = (() => {
  const U=SEM.Utils;
  const categoryOf = (command) => {
    const c=command.toLowerCase();
    if(/quote|quotation|proposal|meeting|close|contract draft|deal desk/.test(c)) return 'deal_desk';
    if(/document|upload|knowledge|drive|google drive|file|sop|manual|contract/.test(c)) return 'knowledge';
    if(/inventory|stock|product line|sku|pricing|price list|bom/.test(c)) return 'inventory';
    if(/slack|integration|sync|connector/.test(c)) return 'integrations';
    if(/sales|lead|crm|marketing|social|linkedin|chatbot|customer/.test(c)) return 'sales';
    if(/software|code|github|ticket|qa|release|backend|frontend|bug/.test(c)) return 'software';
    if(/product|prd|design|ux|wireframe|prototype/.test(c)) return 'product';
    if(/kpi|salary|employee|people|performance|manager/.test(c)) return 'people_ops';
    if(/cash|invoice|payment|finance|expense|runway/.test(c)) return 'finance';
    if(/investor|fundraising|safe|deck|update/.test(c)) return 'investor';
    return 'operations';
  };
  const riskOf = (command) => {
    const c=command.toLowerCase();
    if(/salary|fire|hire|contract|payment|bank|legal|delete|production|send external|publish/.test(c)) return 'high';
    if(/investor|customer|email|post|social|proposal/.test(c)) return 'medium';
    return 'low';
  };
  const agentFor = (category) => ({sales:'a_sales',deal_desk:'a_deal',knowledge:'a_docs',inventory:'a_inventory',integrations:'a_integrations',software:'a_software',product:'a_product',people_ops:'a_kpi',finance:'a_chief',investor:'a_chief',operations:'a_coo'}[category] || 'a_chief');
  function makeTask({title, description, companyId, projectId, category, ownerPersonId=null, riskLevel='low', approvalRequired=false, priority='medium', expectedOutput='Structured output', acceptanceCriteria=[]}) {
    return {
      id: U.uid('task'), title, description, companyId: companyId || 'c_parent', projectId: projectId || null,
      ownerType: ownerPersonId ? 'human' : 'agent', ownerPersonId, ownerAgentId: ownerPersonId ? null : agentFor(category),
      status: approvalRequired ? 'needs_approval' : 'queued', priority, riskLevel, approvalRequired,
      deadline: new Date(Date.now() + 86400000 * (SEM.Store.get().settings.defaultTaskDeadlineDays || 3)).toISOString().slice(0,10),
      expectedOutput: {type: expectedOutput},
      acceptanceCriteria: acceptanceCriteria.length ? acceptanceCriteria : ['Output directly satisfies the task','No hallucinated facts','Approval risks flagged'],
      testMethod: ['QA Tester Agent checks output against acceptance criteria'], createdAt: U.now()
    };
  }
  function fallbackDecompose(command, contextPack) {
    const cat=categoryOf(command), risk=riskOf(command); const companyId=contextPack.companies?.[0]?.id || (cat==='sales'?'c_openspot':'c_parent');
    const tasks=[];
    if(cat==='sales') {
      tasks.push(makeTask({category:cat, companyId, projectId:'pr_openspot_sales', title:'Build targeted sales lead list', description:'Create a qualified target list with company/person, segment, need, and next action.', ownerPersonId:'p_sales', acceptanceCriteria:['At least 10 leads or clear reason if fewer','Each lead has next action']}));
      tasks.push(makeTask({category:cat, companyId, projectId:'pr_openspot_sales', title:'Draft social media content pack', description:'Create LinkedIn/Facebook style posts for OpenSpot client acquisition.', riskLevel:'medium', approvalRequired:true, priority:'high', expectedOutput:'3 social post drafts', acceptanceCriteria:['3 posts drafted','No unsupported claims','Marked for approval before publishing']}));
      tasks.push(makeTask({category:cat, companyId, projectId:'pr_openspot_sales', title:'Create chatbot qualification script', description:'Create website/Telegram chatbot questions to qualify parking property leads.', approvalRequired:false, expectedOutput:'Chatbot script with qualification fields'}));
      tasks.push(makeTask({category:cat, companyId, projectId:'pr_openspot_sales', title:'Prepare CRM follow-up tasks', description:'Create follow-up tasks for inactive leads and assign owner.', ownerPersonId:'p_sales', acceptanceCriteria:['Every inactive lead has next action','Owner and due date included']}));
    } else if(cat==='deal_desk') {
      tasks.push(makeTask({category:cat, companyId:'c_openspot', projectId:'pr_openspot_sales', title:'Prepare meeting quotation pack', description:'Use product lines, inventory, pricing and client notes to create a quotation draft during the meeting.', riskLevel:'medium', approvalRequired:true, priority:'high', expectedOutput:'Quotation + proposal draft', acceptanceCriteria:['Line items reference product catalog','Payment terms included','Proposal marked approval required before sending']}));
      tasks.push(makeTask({category:cat, companyId:'c_openspot', projectId:'pr_openspot_sales', title:'Create meeting close checklist', description:'Create live checklist: pain, quantity, decision maker, budget, timeline, next step.', ownerPersonId:'p_sales', acceptanceCriteria:['Checklist covers qualification fields','Next step is captured']}));
      tasks.push(makeTask({category:'integrations', companyId:'c_openspot', projectId:'pr_openspot_sales', title:'Queue Slack and Google Drive proposal actions', description:'Prepare Slack approval alert and Google Drive proposal export queue after quotation approval.', riskLevel:'medium', approvalRequired:true}));
    } else if(cat==='knowledge') {
      tasks.push(makeTask({category:cat, companyId:'c_parent', projectId:'pr_sembrain', title:'Ingest and classify uploaded knowledge', description:'Review uploaded documents, classify company/entity, sensitivity, and tags.', ownerAgentId:'a_docs', acceptanceCriteria:['Documents are tagged','Sensitivity is set','Useful facts are stored as memory snippets']}));
      tasks.push(makeTask({category:cat, companyId:'c_parent', projectId:'pr_sembrain', title:'Extract durable memories with source trace', description:'Create concise, source-linked memory facts from uploaded documents only.', acceptanceCriteria:['No unsupported claims','Each memory links to source document','Restricted facts marked confidential/restricted']}));
    } else if(cat==='inventory') {
      tasks.push(makeTask({category:cat, companyId:'c_openspot', title:'Review product catalog and inventory readiness', description:'Check product lines, prices, available stock and reorder points.', acceptanceCriteria:['Low-stock products identified','Quote-ready product lines verified']}));
      tasks.push(makeTask({category:cat, companyId:'c_openspot', title:'Create procurement/manufacturing follow-up tasks', description:'Create approval-gated tasks for stock below reorder point.', riskLevel:'medium', approvalRequired:true, acceptanceCriteria:['No purchase action without approval','Quantity requirement listed']}));
    } else if(cat==='integrations') {
      tasks.push(makeTask({category:cat, companyId:'c_parent', projectId:'pr_sembrain', title:'Configure Slack and Google Drive integration plan', description:'Define channels, folders, scopes, security rules, approval gates and audit logs.', riskLevel:'medium', approvalRequired:false, acceptanceCriteria:['Slack use cases defined','Drive export flow defined','Server-side secrets required']}));
      tasks.push(makeTask({category:cat, companyId:'c_parent', projectId:'pr_sembrain', title:'Prepare secure connector backend tasks', description:'Create engineering tickets for Slack OAuth, chat.postMessage, Google Drive/Docs exports and audit logs.', ownerAgentId:'a_software', riskLevel:'medium', approvalRequired:true}));
    } else if(cat==='software') {
      tasks.push(makeTask({category:cat, companyId:'c_parent', projectId:'pr_sembrain', title:'Create atomic software tickets', description:'Split requested software change into module-specific tickets only.', priority:'high', acceptanceCriteria:['Tickets touch only relevant modules','Each ticket has tests']}));
      tasks.push(makeTask({category:cat, companyId:'c_parent', projectId:'pr_sembrain', title:'Create QA test cases', description:'Create acceptance and regression tests for the requested change.', ownerPersonId:'p_engineer'}));
      tasks.push(makeTask({category:cat, companyId:'c_parent', projectId:'pr_sembrain', title:'Prepare release approval gate', description:'Prepare a release checklist and approval gate before production deployment.', riskLevel:'high', approvalRequired:true}));
    } else if(cat==='product') {
      tasks.push(makeTask({category:cat, companyId:'c_parent', projectId:'pr_sembrain', title:'Draft PRD', description:'Create a product requirements document for the requested feature.', priority:'high'}));
      tasks.push(makeTask({category:cat, companyId:'c_parent', projectId:'pr_sembrain', title:'Create UX flow and screens list', description:'Define user flow, pages, states, and empty/error states.'}));
      tasks.push(makeTask({category:'software', companyId:'c_parent', projectId:'pr_sembrain', title:'Convert PRD into engineering tickets', description:'Create build tickets after PRD review.', approvalRequired:true, riskLevel:'medium'}));
    } else if(cat==='people_ops') {
      tasks.push(makeTask({category:cat, companyId:'c_parent', title:'Review missing KPIs', description:'Find people without measurable weekly KPIs and create manager follow-ups.', ownerPersonId:'p_manager'}));
      tasks.push(makeTask({category:cat, companyId:'c_parent', title:'Calculate KPI-linked payout impact', description:'Estimate salary impact from KPI performance; recommendation only.', riskLevel:'high', approvalRequired:true, acceptanceCriteria:['No automatic salary change','Founder approval required']}));
      tasks.push(makeTask({category:'operations', companyId:'c_parent', title:'AI manager follow-up plan', description:'Create weekly AI manager check-in tasks for each employee.'}));
    } else {
      tasks.push(makeTask({category:'operations', companyId, title:'Analyze command and affected company context', description:'Summarize what needs to be done from the founder command.'}));
      tasks.push(makeTask({category:'operations', companyId, title:'Create follow-up tasks for responsible managers', description:'Assign narrow tasks to human managers with due dates.', ownerPersonId:'p_manager'}));
      tasks.push(makeTask({category:'operations', companyId, title:'Prepare founder decision list', description:'Only escalate decisions requiring founder approval.', approvalRequired:risk!=='low', riskLevel:risk}));
    }
    return { strategicGoal: `Execute founder command: ${command.slice(0,90)}`, summary:`Fallback local pipeline created ${tasks.length} atomic tasks.`, riskLevel:risk, tasks, approvals:[], memories:[] };
  }
  function persistResult(command, contextPack, tokenPlan, result, source='fallback') {
    const s=SEM.Store.get();
    const session={id:U.uid('cmd'), command, contextCounts:contextPack.counts, tokenPlan, source, resultSummary:result.summary, createdAt:U.now()};
    s.commandSessions.unshift(session);
    for(const raw of result.tasks || []) {
      const t={...raw, id: raw.id || U.uid('task'), createdAt:raw.createdAt || U.now(), status: raw.approvalRequired ? 'needs_approval':'queued'};
      s.tasks.unshift(t);
      if(SEM.Permissions.requiresApproval(t)) {
        s.approvals.unshift({id:U.uid('ap'), taskId:t.id, title:`Approve: ${t.title}`, reason:'Risk or policy requires human approval before execution.', status:'pending', riskLevel:t.riskLevel || 'medium', createdAt:U.now()});
      }
    }
    for(const m of result.memories || []) {
      if(m.fact) s.memories.unshift({id:U.uid('mem'), entityType:m.entityType||'command', entityId:m.entityId||session.id, fact:m.fact, source:'ai_result', confidence:m.confidence||.75, sensitivity:m.sensitivity||'internal', createdAt:U.now()});
    }
    SEM.TokenBudget.logEvent({command:command.slice(0,140), source, totalTokens:tokenPlan.totalTokens, inputTokens:tokenPlan.inputTokens, outputTokens:tokenPlan.outputTokens, route:tokenPlan.route, model:tokenPlan.model, estimatedCostUsd:tokenPlan.estimatedCostUsd});
    SEM.Store.save();
    return session;
  }
  async function runCommand(command) {
    const contextPack=SEM.ContextPack.build(command);
    const tokenPlan=SEM.TokenBudget.estimateCommand(command, {category:categoryOf(command), riskLevel:riskOf(command), contextPack});
    if(tokenPlan.hardStop) throw new Error(`Hard stop: estimated ${tokenPlan.totalTokens} tokens exceeds per-command limit.`);
    let result, source='fallback';
    if(SEM.Store.get().settings.aiMode === 'real') {
      try { result = SEM.AIBackend.normalizeAIResponse(await SEM.AIBackend.callRealAI({command, contextPack, tokenPlan})); source='real_ai_backend'; }
      catch(e) { result = fallbackDecompose(command, contextPack); result.summary = `Real AI failed (${e.message}). Used local fallback. ${result.summary}`; source='fallback_after_error'; }
    } else {
      result = fallbackDecompose(command, contextPack);
    }
    const session = persistResult(command, contextPack, tokenPlan, result, source);
    return {session, result, contextPack, tokenPlan, source};
  }
  return { categoryOf, riskOf, fallbackDecompose, runCommand };
})();
