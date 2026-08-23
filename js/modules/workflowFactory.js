window.SEM=window.SEM||{}; SEM.Modules=SEM.Modules||{};
SEM.Modules.workflowFactory = (()=>{
  const U=SEM.Utils;
  const workflows = [
    {id:'wf_ceo', title:'Daily CEO Command Brief', trigger:'Every morning / on demand', command:'Run today CEO operating brief. Check all companies, blocked projects, overdue tasks, approvals and only show decisions for Tulga.', agents:['a_chief','a_coo','a_qa']},
    {id:'wf_meeting', title:'Meeting Close Machine', trigger:'During client meeting', command:'During meeting, create quotation and proposal for 50 OpenSpot devices, standard payment terms, queue Slack approval and Google Drive export.', agents:['a_deal','a_sales','a_security','a_qa']},
    {id:'wf_sales', title:'Sales + Marketing Autopilot', trigger:'Weekly campaign', command:'Run OpenSpot sales push: create marketing campaign, social posts, chatbot qualification questions and CRM follow-up tasks.', agents:['a_sales','a_security','a_qa']},
    {id:'wf_software', title:'Product + Software Factory', trigger:'Any feature request', command:'Build next software feature as a software factory: create PRD, atomic tickets, QA cases and release approval gate. Do patch-only development.', agents:['a_product','a_software','a_qa','a_security']},
    {id:'wf_qa', title:'Autonomous QA / QC Regression', trigger:'Before every release', command:'Run QA QC regression test of SEM Brain UI, permissions, token budget, mindmap and workflow factory.', agents:['a_qa','a_security']},
    {id:'wf_docs', title:'Knowledge Ingestion', trigger:'New docs / meeting notes', command:'Upload/capture current knowledge into memory and create source-linked document curation tasks.', agents:['a_docs','a_qa']},
    {id:'wf_inventory', title:'Inventory + Procurement Watch', trigger:'Daily or quote creation', command:'Check inventory and create procurement approval tasks for low-stock product lines.', agents:['a_inventory','a_security']},
    {id:'wf_kpi', title:'KPI + Salary Governance', trigger:'Weekly', command:'Review employee KPI updates and create salary-impact recommendations with approval gate only.', agents:['a_kpi','a_security','a_qa']}
  ];
  function wfCard(w){ return `<div class="item"><div class="itemHeader"><div><b>${U.esc(w.title)}</b><p class="muted">${U.esc(w.trigger)}</p></div><span class="pill blue">${w.agents.length} agents</span></div><p>${U.esc(w.command)}</p><div class="badgeBar">${w.agents.map(a=>`<span class="pill purple">${U.esc(SEM.Store.byId('agents',a)?.name||a)}</span>`).join('')}</div><div class="actions" style="margin-top:10px"><button class="primary small" data-run-wf="${w.id}">Run workflow</button><button class="ghost small" data-preview-wf="${w.id}">Preview</button></div></div>`; }
  return {
    workflows,
    render(){ const s=SEM.Store.get(); SEM.ChatOps?.ensureSchema?.(); return `<div class="grid grid3"><div class="stat"><div class="label">Prebuilt Workflows</div><div class="num">${workflows.length}</div><span class="pill green">AI-native</span></div><div class="stat"><div class="label">Workflow Runs</div><div class="num">${(s.workflowRuns||[]).length}</div><span class="pill blue">logged</span></div><div class="stat"><div class="label">Factory Rule</div><div class="num">1</div><span class="pill orange">chat first</span></div></div><div class="grid grid2" style="margin-top:18px"><div class="card"><h3>Workflow Factory</h3><p class="muted">Menus are for checking. Work is started from chat or one-click workflow runs. Each workflow creates scoped agent work orders and never rewrites the whole system.</p><div class="list">${workflows.map(wfCard).join('')}</div></div><div class="card"><h3>Recent Workflow Runs</h3><div class="list">${(s.workflowRuns||[]).slice(0,12).map(r=>`<div class="item"><div class="itemHeader"><b>${U.esc(r.title)}</b>${U.statusPill(r.status)}</div><p class="muted">${U.esc(r.createdAt)} · ${U.esc(r.command||'')}</p></div>`).join('')||'<p class="muted">No workflow runs yet.</p>'}</div></div></div>`; },
    afterRender(){
      const runWorkflow=async(id,dryRun)=>{ const w=workflows.find(x=>x.id===id); if(!w) return; const result=await SEM.ChatOps.execute(w.command,{dryRun}); const s=SEM.Store.get(); if(!dryRun){ s.workflowRuns.unshift({id:U.uid('wfr'), workflowId:w.id, title:w.title, command:w.command, runId:result.id, status:'completed', createdAt:U.now()}); SEM.Store.save(); } U.toast(dryRun?'Workflow preview created':'Workflow executed'); SEM.App.navigate('chatOps'); };
      U.$$('[data-run-wf]').forEach(b=>b.onclick=()=>runWorkflow(b.dataset.runWf,false));
      U.$$('[data-preview-wf]').forEach(b=>b.onclick=()=>runWorkflow(b.dataset.previewWf,true));
    }
  };
})();
