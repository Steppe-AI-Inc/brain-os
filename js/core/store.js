window.SEM = window.SEM || {};
SEM.Store = (() => {
  const KEY = 'semBrain.v070.productionCore';
  const U = SEM.Utils;
  const seed = () => ({
    version: '0.7-production-core',
    currentUserId: 'user_founder',
    settings: {
      aiMode: 'fallback',
      aiEndpoint: '/api/ai-command',
      aiCommandClientKey: '',
      modelSmall: 'gpt-4.1-mini',
      modelMedium: 'gpt-4.1-mini',
      modelStrong: 'gpt-5.5-thinking',
      dailyTokenBudget: 120000,
      monthlyTokenBudget: 2500000,
      hardStopTokensPerCommand: 45000,
      approvalThresholdTokens: 15000,
      defaultTaskDeadlineDays: 3,
      requireApprovalForExternal: true,
      requireApprovalForSalary: true,
      requireApprovalForProduction: true,
      companyOwnershipHiddenFromEmployees: true,
      productionMode: 'local_fallback',
      supabaseUrl: '',
      supabaseAnonKey: '',
      supabaseProjectRef: '',
      chatOpsBackend: 'local',
      rlsRequired: true,
      backendProvider: 'vercel',
      auditLoggingRequired: true
    },
    users: [
      {id:'user_founder', name:'Tulga Galbadrakh', email:'founder@sem-tech.us', role:'founder', personId:'p_tulga', companyScope:['c_parent','c_openspot','c_grt','c_sem_mn','c_tradebook'], active:true},
      {id:'user_manager', name:'OpenSpot Manager', email:'manager@openspot.ai', role:'company_manager', personId:'p_manager', companyScope:['c_openspot'], active:true},
      {id:'user_engineer', name:'Engineer Demo', email:'engineer@sem.mn', role:'employee', personId:'p_engineer', companyScope:['c_grt','c_openspot'], active:true},
      {id:'user_sales', name:'Sales Demo', email:'sales@sem.mn', role:'employee', personId:'p_sales', companyScope:['c_openspot'], active:true},
      {id:'user_investor', name:'Investor Viewer', email:'investor@example.com', role:'investor_viewer', personId:'p_investor', companyScope:['c_openspot'], active:true}
    ],
    companies: [
      {id:'c_parent', name:'SEM Technologies LLC', country:'USA', legalEntity:'Wyoming LLC', parentEntityId:null, ownerPersonId:'p_tulga', managerPersonId:'p_tulga', status:'active', revenueMonthly:0, cashBalance:0, riskScore:12, strategicPriority:10, description:'Parent / holding company for Tulga-owned shares and international entities.'},
      {id:'c_openspot', name:'OpenSpot / Steppe AI Inc.', country:'USA / Mongolia', legalEntity:'Delaware C-Corp', parentEntityId:'c_parent', ownerPersonId:'p_tulga', managerPersonId:'p_manager', status:'active', revenueMonthly:35000, cashBalance:50000, riskScore:38, strategicPriority:10, description:'AI-enabled smart curb lock and parking access platform.'},
      {id:'c_grt', name:'SEM Global Robotics Technologies', country:'Mongolia', legalEntity:'LLC', parentEntityId:'c_parent', ownerPersonId:'p_tulga', managerPersonId:'p_engineer', status:'active', revenueMonthly:0, cashBalance:12000, riskScore:31, strategicPriority:8, description:'Engineering and R&D execution company.'},
      {id:'c_sem_mn', name:'SEM Mongolia Ops', country:'Mongolia', legalEntity:'LLC', parentEntityId:'c_parent', ownerPersonId:'p_tulga', managerPersonId:'p_manager', status:'active', revenueMonthly:17000, cashBalance:25000, riskScore:29, strategicPriority:7, description:'Legacy parking, fuel, EV, and operations entity.'},
      {id:'c_tradebook', name:'Trade-book.ai', country:'USA', legalEntity:'Wyoming LLC', parentEntityId:'c_parent', ownerPersonId:'p_tulga', managerPersonId:'p_sales', status:'planning', revenueMonthly:0, cashBalance:3000, riskScore:20, strategicPriority:5, description:'Trading system content and subscription project.'}
    ],
    people: [
      {id:'p_tulga', fullName:'Tulga Galbadrakh', email:'tulga@sem-tech.us', companyId:'c_parent', roleTitle:'Founder / CEO', responsibilities:'Strategy, fundraising, product direction, key deals', managerPersonId:null, compensationMonthly:0, performanceScore:95, aiManagerId:'a_chief'},
      {id:'p_manager', fullName:'Company Manager Demo', email:'manager@openspot.ai', companyId:'c_openspot', roleTitle:'Company Manager', responsibilities:'OpenSpot execution, weekly reporting, sales coordination', managerPersonId:'p_tulga', compensationMonthly:2500, performanceScore:78, aiManagerId:'a_coo'},
      {id:'p_engineer', fullName:'Engineer Demo', email:'engineer@sem.mn', companyId:'c_grt', roleTitle:'Software / Embedded Engineer', responsibilities:'Firmware, backend, product build, QA fixes', managerPersonId:'p_manager', compensationMonthly:1600, performanceScore:72, aiManagerId:'a_software'},
      {id:'p_sales', fullName:'Sales Demo', email:'sales@sem.mn', companyId:'c_openspot', roleTitle:'Sales / Marketing Operator', responsibilities:'CRM follow-ups, content, proposal preparation', managerPersonId:'p_manager', compensationMonthly:1200, performanceScore:69, aiManagerId:'a_sales'},
      {id:'p_investor', fullName:'Investor Viewer Demo', email:'investor@example.com', companyId:'c_openspot', roleTitle:'Read-only investor viewer', responsibilities:'Read-only progress view', managerPersonId:null, compensationMonthly:0, performanceScore:0, aiManagerId:null}
    ],
    agents: [
      {id:'a_chief', name:'Chief of Staff Agent', role:'chief_of_staff', skills:['intent_parse','daily_brief','escalation'], costLimitUsd:1.2, active:true},
      {id:'a_coo', name:'Company COO Agent', role:'operations', skills:['task_followup','blocker_detection','manager_checkin'], costLimitUsd:0.8, active:true},
      {id:'a_kpi', name:'KPI + Salary Agent', role:'people_ops', skills:['kpi_review','salary_recommendation','approval_gate'], costLimitUsd:0.6, active:true},
      {id:'a_sales', name:'Sales Manager Agent', role:'sales', skills:['crm','marketing','social','chatbot'], costLimitUsd:1.0, active:true},
      {id:'a_product', name:'Product Designer Agent', role:'product', skills:['prd','ux','design_review'], costLimitUsd:1.2, active:true},
      {id:'a_docs', name:'Document Knowledge Agent', role:'knowledge', skills:['document_ingestion','memory_extraction','source_trace'], costLimitUsd:0.7, active:true},
      {id:'a_inventory', name:'Product Inventory Agent', role:'inventory', skills:['pricing','stock_check','quote_line_items'], costLimitUsd:0.7, active:true},
      {id:'a_deal', name:'Meeting Deal Desk Agent', role:'deal_desk', skills:['quotation','proposal','terms','approval_gate'], costLimitUsd:1.1, active:true},
      {id:'a_integrations', name:'Integration Ops Agent', role:'integrations', skills:['slack_queue','drive_export','sync_check'], costLimitUsd:0.6, active:true},
      {id:'a_software', name:'Software Factory Agent', role:'software', skills:['tickets','qa','release_gates'], costLimitUsd:1.5, active:true},
      {id:'a_qa', name:'QA Tester Agent', role:'qa', skills:['acceptance_tests','hallucination_check','risk_check'], costLimitUsd:0.8, active:true},
      {id:'a_security', name:'Security Permission Agent', role:'security', skills:['access','approval','restricted_fields'], costLimitUsd:0.5, active:true}
    ],
    projects: [
      {id:'pr_openspot_sales', companyId:'c_openspot', title:'OpenSpot U.S. Sales Push', goal:'Build pipeline for pilots, parking owners, campuses and municipalities.', ownerPersonId:'p_sales', status:'active', deadline:'2026-07-31', blockers:'Need consistent follow-up cadence and proposal assets.', riskScore:37},
      {id:'pr_sembrain', companyId:'c_parent', title:'SEM Brain Product Build', goal:'Build AI operating brain for SEM group and future startup.', ownerPersonId:'p_engineer', status:'active', deadline:'2026-08-30', blockers:'Needs real AI backend and modular code discipline.', riskScore:42},
      {id:'pr_openspot_deploy', companyId:'c_openspot', title:'OpenSpot 1,000 Bay Deployment', goal:'Deploy signed 1,000-bay contract with stable operations.', ownerPersonId:'p_manager', status:'active', deadline:'2026-07-15', blockers:'Manufacturing, site scheduling, cellular reliability, field QA.', riskScore:55}
    ],
    tasks: [
      {id:'t_weekly_report', title:'Prepare OpenSpot weekly progress report', companyId:'c_openspot', projectId:'pr_openspot_deploy', description:'Summarize install, blockers, decisions, and next actions.', ownerType:'agent', ownerAgentId:'a_chief', ownerPersonId:null, status:'queued', priority:'high', riskLevel:'low', approvalRequired:false, deadline:'2026-06-24', acceptanceCriteria:['Report includes blockers','Report includes decisions needed'], testMethod:['QA checks completeness'], createdAt:U.now()},
      {id:'t_kpi_sales', title:'Define weekly CRM follow-up KPI', companyId:'c_openspot', projectId:'pr_openspot_sales', description:'Sales operator must update lead status and next action every week.', ownerType:'human', ownerPersonId:'p_sales', ownerAgentId:null, status:'in_progress', priority:'medium', riskLevel:'low', approvalRequired:false, deadline:'2026-06-24', acceptanceCriteria:['KPI has target number','Owner confirmed'], testMethod:['Review KPI record'], createdAt:U.now()}
    ],
    memories: [
      {id:'m_parent', entityType:'company', entityId:'c_parent', fact:'SEM Technologies LLC is the Wyoming registered parent/holding company intended to own Tulga’s shares in foreign companies and country entities.', source:'founder_statement', confidence:.98, sensitivity:'confidential', createdAt:U.now()},
      {id:'m_openspot_traction', entityType:'company', entityId:'c_openspot', fact:'OpenSpot has a public investor snapshot of 55 live units, approximately 97% uptime, $35k MRR, a 1,000-bay contract, and Berkeley pilot pending.', source:'founder_memory', confidence:.85, sensitivity:'internal', createdAt:U.now()},
      {id:'m_ai_strategy', entityType:'product', entityId:'pr_sembrain', fact:'SEM Brain should minimize token cost through database-first retrieval, small model routing, strict modules, patch-only changes, and approval gates.', source:'architecture_decision', confidence:.95, sensitivity:'internal', createdAt:U.now()}
    ],
    kpis: [
      {id:'k_sales_1', personId:'p_sales', period:'2026-W25', metric:'Qualified follow-ups completed', target:20, actual:12, weight:30, salaryImpactPct:-5, status:'below_target'},
      {id:'k_eng_1', personId:'p_engineer', period:'2026-W25', metric:'Software tickets closed with QA', target:8, actual:6, weight:25, salaryImpactPct:0, status:'watch'},
      {id:'k_mgr_1', personId:'p_manager', period:'2026-W25', metric:'Weekly company report submitted', target:1, actual:1, weight:20, salaryImpactPct:0, status:'on_track'}
    ],
    sales: {
      leads:[
        {id:'lead_1', companyId:'c_openspot', name:'Campus Parking Director', channel:'LinkedIn', stage:'qualified', ownerPersonId:'p_sales', nextAction:'Send reverse-parking proposal visual', lastTouch:'2026-06-17', risk:'medium'},
        {id:'lead_2', companyId:'c_openspot', name:'Retail property owner', channel:'Referral', stage:'new', ownerPersonId:'p_sales', nextAction:'Schedule discovery call', lastTouch:'2026-06-15', risk:'low'}
      ],
      campaigns:[{id:'camp_1', title:'OpenSpot Property Owner Push', companyId:'c_openspot', status:'draft', goal:'Generate 10 qualified property owner calls', ownerPersonId:'p_sales'}],
      socialPosts:[{id:'post_1', platform:'LinkedIn', title:'Guaranteed curb access', status:'needs_approval', ownerPersonId:'p_sales', copy:'Draft: Stop losing premium parking value to unauthorized vehicles.'}],
      chatbots:[{id:'bot_1', channel:'Website', title:'OpenSpot Lead Qualifier', status:'draft', goal:'Qualify property owners by bay count, location, pain, and urgency.'}]
    },
    documents: [
      {id:'doc_1', companyId:'c_openspot', title:'OpenSpot Investor Snapshot', fileName:'openspot-snapshot.md', type:'markdown', sensitivity:'internal', status:'indexed', tags:['traction','investor','sales'], summary:'OpenSpot snapshot with live units, uptime, MRR, 1,000-bay contract and Berkeley pilot context.', textSnippet:'55 live units, ~97% uptime, $35k MRR, 1,000-bay contract signed, Berkeley pilot pending.', source:'manual_seed', uploadedBy:'p_tulga', createdAt:U.now()},
      {id:'doc_2', companyId:'c_parent', title:'SEM Brain Architecture Notes', fileName:'sem-brain-architecture.md', type:'markdown', sensitivity:'confidential', status:'indexed', tags:['architecture','token','agents'], summary:'Token-safe modular architecture with context packs, model router, approval gates and patch-only development.', textSnippet:'SEM Brain minimizes token cost through database-first retrieval, module registry, patch-only updates, model routing and approval gates.', source:'manual_seed', uploadedBy:'p_tulga', createdAt:U.now()}
    ],
    productLines: [
      {id:'prod_openspot_lock', companyId:'c_openspot', name:'OpenSpot Smart Curb-Lock', category:'hardware', unit:'device', currency:'USD', unitPrice:2200, unitCost:980, marginPct:55, status:'active', description:'Solar/cellular smart curb parking lock with reservation and access control.'},
      {id:'prod_openspot_service', companyId:'c_openspot', name:'OpenSpot Monthly Service', category:'saas', unit:'bay/month', currency:'USD', unitPrice:89, unitCost:18, marginPct:80, status:'active', description:'Cloud access, monitoring, support and OTA service per bay.'},
      {id:'prod_install_setup', companyId:'c_openspot', name:'Installation + Site Setup', category:'service', unit:'site', currency:'USD', unitPrice:3500, unitCost:1700, marginPct:51, status:'active', description:'One-time survey, setup, installation coordination and operator onboarding.'},
      {id:'prod_fuelmetrix_station', companyId:'c_sem_mn', name:'Fuelmetrix Station Package', category:'automation', unit:'station', currency:'USD', unitPrice:18000, unitCost:10500, marginPct:42, status:'draft', description:'ANPR + dispenser automation + cloud reporting starter package.'}
    ],
    inventoryItems: [
      {id:'inv_lock_ready', productLineId:'prod_openspot_lock', companyId:'c_openspot', warehouse:'UB Workshop', qtyOnHand:55, qtyReserved:20, reorderPoint:40, status:'watch'},
      {id:'inv_lock_pipeline', productLineId:'prod_openspot_lock', companyId:'c_openspot', warehouse:'Manufacturing Pipeline', qtyOnHand:350, qtyReserved:100, reorderPoint:100, status:'ok'},
      {id:'inv_ev_parts', productLineId:'prod_install_setup', companyId:'c_openspot', warehouse:'Field Ops', qtyOnHand:18, qtyReserved:8, reorderPoint:15, status:'watch'}
    ],
    quoteTemplates: [
      {id:'qt_openspot_basic', companyId:'c_openspot', title:'OpenSpot Property Owner Proposal', currency:'USD', defaultPaymentTerms:'50% upfront, 40% on installation, 10% after acceptance', validityDays:14, defaultLines:[{productLineId:'prod_openspot_lock', qty:10},{productLineId:'prod_openspot_service', qty:10},{productLineId:'prod_install_setup', qty:1}]},
      {id:'qt_fuelmetrix', companyId:'c_sem_mn', title:'Fuelmetrix Station Proposal', currency:'USD', defaultPaymentTerms:'40% upfront, 40% delivery, 20% commissioning or approved barter structure', validityDays:14, defaultLines:[{productLineId:'prod_fuelmetrix_station', qty:1}]}
    ],

    proposalTemplates: [
      {id:'pt_openspot_en', companyId:'c_openspot', title:'OpenSpot Commercial Proposal — English', language:'en', type:'commercial_offer', tone:'premium_direct', sections:['executive_summary','problem','solution','scope','pricing','implementation','payment_terms','approval_next_steps'], defaultValidityDays:14},
      {id:'pt_openspot_mn', companyId:'c_openspot', title:'OpenSpot арилжааны санал — Монгол', language:'mn', type:'commercial_offer', tone:'formal_mongolian', sections:['summary','scope','pricing','implementation','payment_terms','next_steps'], defaultValidityDays:14},
      {id:'pt_fuelmetrix_mn', companyId:'c_sem_mn', title:'Fuelmetrix шатахуун түгээх станцын санал', language:'mn', type:'technical_commercial', tone:'formal_mongolian', sections:['summary','technical_scope','pricing','service','financing_barter','payment_terms','next_steps'], defaultValidityDays:14},
      {id:'pt_onepager_en', companyId:'c_parent', title:'Investor / Client One-Pager', language:'en', type:'one_pager', tone:'concise', sections:['headline','pain','solution','traction','commercial_terms','call_to_action'], defaultValidityDays:7}
    ],
    paymentTermsLibrary: [
      {id:'pay_50_40_10', title:'50/40/10 standard hardware deployment', terms:'50% upfront, 40% on installation, 10% after acceptance', approvalRequired:false, maxDays:14},
      {id:'pay_monthly_service', title:'Monthly recurring service', terms:'Monthly service invoiced at the beginning of each month; late payment pauses support SLA.', approvalRequired:false, maxDays:30},
      {id:'pay_barter_fuel', title:'Fuel barter option', terms:'Part of payment may be settled by approved fuel barter at agreed market-indexed value; founder approval required.', approvalRequired:true, maxDays:30},
      {id:'pay_financing', title:'Financing / staged rollout', terms:'Device payment split into staged monthly installments; ownership transfer and service continuity subject to signed financing agreement.', approvalRequired:true, maxDays:90}
    ],
    proposalVersions: [],
    meetings: [
      {id:'meet_1', companyId:'c_openspot', leadId:'lead_1', title:'Campus parking discovery call', status:'scheduled', meetingDate:'2026-06-24', objective:'Close next step by creating a proposal during the meeting.', notes:'Need bay count, site type, problem severity, budget owner and installation timeline.'}
    ],
    quotations: [],
    proposals: [],
    integrationSettings: {
      slack:{status:'not_connected', workspace:'', defaultChannel:'#sales', botName:'SEM Brain', outboundApprovalRequired:true, pendingActions:[]},
      googleDrive:{status:'not_connected', folderId:'', folderName:'SEM Brain Proposals', useDriveFileScope:true, pendingExports:[]}
    },
    automationIdeas: [
      {id:'auto_doc', area:'Knowledge', title:'Upload docs → extract memory → source linked answers', impact:'high', tokenSavings:'high', status:'planned'},
      {id:'auto_quote', area:'Sales', title:'Meeting notes → quotation → proposal → approval → send', impact:'critical', tokenSavings:'medium', status:'planned'},
      {id:'auto_inventory', area:'Operations', title:'Inventory low stock → procurement task → approval', impact:'high', tokenSavings:'high', status:'planned'},
      {id:'auto_slack', area:'Team Ops', title:'Slack updates → tasks/blockers/KPI evidence', impact:'high', tokenSavings:'medium', status:'planned'},
      {id:'auto_drive', area:'Docs', title:'Approved proposal → Google Drive export and client folder', impact:'medium', tokenSavings:'medium', status:'planned'},
      {id:'auto_release', area:'Software', title:'PRD → tickets → QA → release gate', impact:'critical', tokenSavings:'high', status:'active'},
      {id:'auto_kpi', area:'People', title:'Weekly employee updates → KPI score → salary recommendation', impact:'high', tokenSavings:'high', status:'active'},
      {id:'auto_finance', area:'Finance', title:'Invoice due → collection follow-up → cash forecast', impact:'high', tokenSavings:'medium', status:'planned'},
      {id:'auto_field', area:'Field Ops', title:'Device/site issue → technician task → customer update', impact:'high', tokenSavings:'medium', status:'planned'}
    ],
    productSpecs:[
      {id:'prd_1', companyId:'c_parent', title:'SEM Brain v0.6 Real AI Backend', status:'in_progress', ownerPersonId:'p_engineer', problem:'Need secure AI connection without browser API keys.', successCriteria:'Founder command uses backend endpoint and token budget gates.'}
    ],
    softwareTickets:[
      {id:'sw_1', title:'Create secure /api/ai-command backend', module:'api/ai-command.js', status:'queued', ownerPersonId:'p_engineer', qaRequired:true, approvalRequired:false},
      {id:'sw_2', title:'Add context pack builder', module:'js/ai/contextPack.js', status:'done', ownerPersonId:'p_engineer', qaRequired:true, approvalRequired:false}
    ],
    approvals: [
      {id:'ap_post_1', taskId:'t_post_approval', title:'Approve LinkedIn post before publishing', reason:'External marketing publication requires founder approval.', status:'pending', riskLevel:'medium', createdAt:U.now()}
    ],
    tokenEvents: [],
    commandSessions: [],
    qaRuns: [],
    chatOpsRuns: [],
    aiWorkOrders: [],
    workflowRuns: [],
    autoTestRuns: [],
    qaCases: [],
    releases: [],
    agentMessages: []
  });
  let state;
  const normalize = (raw) => {
    const base = seed();
    const next = {...base, ...(raw||{})};
    ['documents','productLines','inventoryItems','quoteTemplates','proposalTemplates','paymentTermsLibrary','proposalVersions','meetings','quotations','proposals','automationIdeas','tokenEvents','commandSessions','qaRuns','chatOpsRuns','aiWorkOrders','workflowRuns','autoTestRuns','qaCases','releases','agentMessages'].forEach(k=>{ if(!Array.isArray(next[k])) next[k]=base[k]||[]; });
    if(!next.integrationSettings) next.integrationSettings = base.integrationSettings;
    if(!next.integrationSettings.slack) next.integrationSettings.slack = base.integrationSettings.slack;
    if(!next.integrationSettings.googleDrive) next.integrationSettings.googleDrive = base.integrationSettings.googleDrive;
    next.version='0.7-production-core';
    return next;
  };
  const load = () => { try { state = normalize(JSON.parse(localStorage.getItem(KEY)) || seed()); } catch(e){ state = seed(); } save(); return state; };
  const save = () => { localStorage.setItem(KEY, JSON.stringify(state)); };
  const get = () => state || load();
  const set = (next) => { state = next; save(); };
  const reset = () => { state = seed(); save(); return state; };
  const byId = (collection, id) => get()[collection].find(x=>x.id===id);
  const upsert = (collection, item) => { const arr=get()[collection]; const i=arr.findIndex(x=>x.id===item.id); if(i>=0) arr[i]={...arr[i],...item}; else arr.unshift(item); save(); return item; };
  const remove = (collection, id) => { const s=get(); s[collection]=s[collection].filter(x=>x.id!==id); save(); };
  const currentUser = () => byId('users', get().currentUserId) || get().users[0];
  const currentPerson = () => byId('people', currentUser().personId);
  load();
  return { KEY, load, save, get, set, reset, seed, byId, upsert, remove, currentUser, currentPerson };
})();
