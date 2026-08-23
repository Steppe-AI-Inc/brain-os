window.SEM=window.SEM||{}; SEM.Modules=SEM.Modules||{};
SEM.Modules.chatOps = (()=>{
  const U=SEM.Utils;
  const examples = [
    'Run today CEO operating brief. Check all companies, blocked projects, overdue tasks, approvals and only show decisions for Tulga.',
    'During meeting, create quotation and proposal for 50 OpenSpot devices, standard payment terms, queue Slack approval and Google Drive export.',
    'Run OpenSpot sales push: create marketing campaign, social posts, chatbot qualification questions and CRM follow-up tasks.',
    'Build next software feature as a software factory: create PRD, atomic tickets, QA cases and release approval gate. Do patch-only development.',
    'Run QA QC regression test of SEM Brain UI, permissions, token budget, mindmap and workflow factory.',
    'Upload/capture current knowledge into memory and create source-linked document curation tasks.',
    'Check inventory and create procurement approval tasks for low-stock product lines.',
    'Review employee KPI updates and create salary-impact recommendations with approval gate only.'
  ];
  const chips = [
    ['CEO brief', examples[0]], ['Meeting close', examples[1]], ['Sales push', examples[2]], ['Software factory', examples[3]], ['Run QA', examples[4]], ['KPI review', examples[7]]
  ];
  function agentName(id){ return SEM.Store.byId('agents',id)?.name || id || 'AI Manager'; }
  function stepList(run){
    return `<div class="list">${(run.steps||[]).map((st,i)=>`<div class="agentStep"><div class="agentStepIndex">${i+1}</div><div><b>${U.esc(st.title)}</b><div class="smallText">${U.esc(agentName(st.agentId))} · ${U.esc(st.status||'planned')}</div></div></div>`).join('')}</div>`;
  }
  function aiReply(run){
    const out = (run.outputs||[]).length ? run.outputs.join('\n') : 'Plan ready. No data was changed because this was a preview.';
    return `<div class="workflowOutput">${U.esc(out)}</div>
      <div class="metricGrid">
        <div class="metricMini"><b>${Number(run.tokenPlan?.totalTokens||0).toLocaleString()}</b><span>Token estimate</span></div>
        <div class="metricMini"><b>${U.esc(run.tokenPlan?.route||'no-llm')}</b><span>Model route</span></div>
        <div class="metricMini"><b>${(run.steps||[]).length}</b><span>Agent steps</span></div>
      </div>
      <details style="margin-top:12px"><summary><b>Show agent execution plan</b></summary><div style="margin-top:10px">${stepList(run)}</div></details>`;
  }
  function threadHtml(){
    const runs=(SEM.Store.get().chatOpsRuns||[]).slice(0,8).reverse();
    if(!runs.length){
      return `<div class="chatEmpty"><h3>Command your whole company from one chat.</h3><p>Type one outcome. SEM Brain will route it to AI managers, create work orders, tasks, proposals, approvals, Slack/Drive queues, QA evidence, and memory updates. Menus are only for checking.</p><div class="quickChips">${chips.map(([label,cmd])=>`<button class="quickChip" data-chip="${U.esc(cmd)}">${U.esc(label)}</button>`).join('')}</div></div>`;
    }
    return runs.map(run=>`
      <div class="msg user"><div class="msgAvatar">T</div><div class="msgBubble">${U.esc(run.command)}<div class="msgMeta">Founder command · ${U.esc(run.createdAt)}</div></div></div>
      <div class="msg ai"><div class="msgAvatar">Σ</div><div class="msgBubble"><b>${run.dryRun?'Preview':'Executed'}: ${U.esc(run.category)}</b> ${U.statusPill(run.status)}${aiReply(run)}<div class="msgMeta">${U.esc(agentName(run.agentId))}</div></div></div>`).join('');
  }
  function sidePanel(){
    const s=SEM.Store.get(); const runs=s.chatOpsRuns||[];
    return `<div class="chatSidebar">
      <div class="card"><h3>AI-first controls</h3><p class="muted">Use chat for execution. Use modules only to inspect, edit, audit and approve.</p><div class="actions"><button class="primary small" data-route="workflowFactory">Workflow Factory</button><button class="ghost small" data-route="autoTester">Run QA</button><button class="ghost small" data-route="mindmap">Mindmap</button></div></div>
      <div class="card"><h3>Quick commands</h3><div class="quickChips">${chips.map(([label,cmd])=>`<button class="quickChip" data-chip="${U.esc(cmd)}">${U.esc(label)}</button>`).join('')}</div></div>
      <div class="card"><h3>System pulse</h3><div class="metricGrid" style="grid-template-columns:1fr 1fr"><div class="metricMini"><b>${runs.length}</b><span>Chat runs</span></div><div class="metricMini"><b>${(s.aiWorkOrders||[]).length}</b><span>Work orders</span></div><div class="metricMini"><b>${s.approvals.filter(a=>a.status==='pending').length}</b><span>Approvals</span></div><div class="metricMini"><b>${Number(s.settings?.hardStopTokensPerCommand||0).toLocaleString()}</b><span>Hard stop</span></div></div></div>
      <div class="card"><h3>Recent outputs</h3><div class="list">${runs.slice(0,6).map(r=>`<div class="item"><div class="itemHeader"><b>${U.esc(r.category)}</b>${U.statusPill(r.status)}</div><p class="smallText">${U.esc(r.command.slice(0,110))}${r.command.length>110?'…':''}</p></div>`).join('')||'<p class="muted">No runs yet.</p>'}</div></div>
    </div>`;
  }
  function render(){
    SEM.ChatOps?.ensureSchema?.();
    return `<div class="chatShell"><div class="card chatMain"><div class="chatHero"><h3>SEM Brain AI Native Chat</h3><p>One chat controls sales, proposals, product, engineering, KPI, approvals, knowledge, inventory and QA.</p></div><div class="chatThread" id="chatThread">${threadHtml()}</div><div class="chatComposer"><div class="composerBox"><textarea id="chatOpsInput" placeholder="Message SEM Brain… Example: Create proposal for 50 OpenSpot devices, queue approval, export to Drive, create follow-up tasks."></textarea><button class="primary sendBtn" id="chatOpsExecute">Send</button></div><div class="actions" style="margin-top:10px"><button class="ghost small" id="chatOpsPreview">Preview only</button><button class="ghost small" id="chatOpsQA">Run autonomous QA</button><button class="ghost small" id="clearChatView">Clear chat history</button></div><div id="chatOpsOutput" style="margin-top:10px"></div></div></div>${sidePanel()}</div>`;
  }
  async function submit(dryRun=false){
    const input=U.$('#chatOpsInput'); const cmd=input.value.trim(); if(!cmd) return U.toast('Enter a command first');
    input.disabled=true; const send=U.$('#chatOpsExecute'); send.disabled=true; send.textContent='Working…';
    try{
      const out=await SEM.ChatOps.execute(cmd,{dryRun});
      input.value='';
      U.toast(dryRun?'Plan preview created':'Workflow executed');
      SEM.App.render();
      setTimeout(()=>{ const t=U.$('#chatThread'); if(t) t.scrollTop=t.scrollHeight; },80);
      return out;
    }catch(e){ U.$('#chatOpsOutput').innerHTML=`<div class="item"><b class="dangerText">ChatOps failed</b><pre class="code">${U.esc(e.message||String(e))}</pre></div>`; }
    finally{ if(input){input.disabled=false; input.focus();} if(send){send.disabled=false; send.textContent='Send';} }
  }
  function afterRender(){
    U.$$('.quickChip[data-chip]').forEach(b=>b.onclick=()=>{ const input=U.$('#chatOpsInput'); input.value=b.dataset.chip; input.focus(); });
    const input=U.$('#chatOpsInput');
    if(input){ input.onkeydown=(e)=>{ if(e.key==='Enter' && !e.shiftKey){ e.preventDefault(); submit(false); } }; }
    U.$('#chatOpsExecute').onclick=()=>submit(false);
    U.$('#chatOpsPreview').onclick=()=>submit(true);
    U.$('#chatOpsQA').onclick=()=>{ const result=SEM.AutoTest.runAll({source:'chatops_button'}); U.toast(`QA complete: ${result.verdict}`); SEM.App.navigate('autoTester'); };
    U.$('#clearChatView').onclick=()=>{ if(confirm('Clear ChatOps run history from this browser workspace?')){ const s=SEM.Store.get(); s.chatOpsRuns=[]; s.agentMessages=[]; SEM.Store.save(); SEM.App.render(); } };
    setTimeout(()=>{ const t=U.$('#chatThread'); if(t) t.scrollTop=t.scrollHeight; },80);
  }
  return { render, afterRender };
})();
