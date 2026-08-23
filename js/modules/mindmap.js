window.SEM=window.SEM||{}; SEM.Modules=SEM.Modules||{};
SEM.Modules.mindmap = (()=>{
  const U=SEM.Utils;
  const colorFor = (type) => ({center:'#0f172a', company:'#f59e0b', project:'#3b82f6', person:'#22c55e', task:'#8b5cf6', approval:'#ef4444', agent:'#06b6d4', memory:'#64748b', sales:'#f97316', document:'#64748b', product:'#10b981', inventory:'#84cc16', quote:'#ec4899'}[type] || '#64748b');
  function visibleData(){
    const s=SEM.Store.get(), user=SEM.Store.currentUser();
    const companies=s.companies.filter(c=>SEM.Permissions.canSeeCompany(user,c));
    const companyIds=new Set(companies.map(c=>c.id));
    const people=s.people.filter(p=>companyIds.has(p.companyId) || user.personId===p.id).map(p=>SEM.Permissions.safePerson(user,p));
    const projects=s.projects.filter(p=>companyIds.has(p.companyId));
    const tasks=s.tasks.filter(t=>companyIds.has(t.companyId) || user.personId===t.ownerPersonId).slice(0,24);
    const approvals=s.approvals.filter(a=>a.status==='pending').slice(0,10);
    const agents=s.agents.filter(a=>a.active).slice(0,12);
    const memories=s.memories.filter(m=>m.sensitivity!=='restricted' && (companyIds.has(m.entityId) || m.entityType!=='company')).slice(0,12);
    const sales=(s.sales?.leads||[]).filter(l=>companyIds.has(l.companyId)).slice(0,10);
    const documents=(s.documents||[]).filter(d=>companyIds.has(d.companyId) && d.sensitivity!=='restricted').slice(0,10);
    const products=(s.productLines||[]).filter(p=>companyIds.has(p.companyId)).slice(0,10);
    const inventory=(s.inventoryItems||[]).filter(i=>companyIds.has(i.companyId)).slice(0,10);
    const quotations=(s.quotations||[]).filter(q=>companyIds.has(q.companyId)).slice(0,10);
    return {s,user,companies,people,projects,tasks,approvals,agents,memories,sales,documents,products,inventory,quotations};
  }
  function buildGraph(mode='ceo'){
    const d=visibleData(); const nodes=[], edges=[];
    const add=(id,label,type,meta={})=>{ if(nodes.find(n=>n.id===id)) return; nodes.push({id,label,type,...meta}); };
    const edge=(from,to,label='')=>{ if(nodes.find(n=>n.id===from)&&nodes.find(n=>n.id===to)) edges.push({from,to,label}); };
    add('center', d.user.role==='founder'?'SEM Technologies Brain':'My Operating Brain','center',{sub:SEM.Permissions.roleLabel[d.user.role]});
    d.companies.forEach(c=>{ const safe=SEM.Permissions.safeCompany(d.user,c); add(c.id,safe.name,'company',{sub:safe.legalEntity || 'company', risk:c.riskScore}); edge('center',c.id,'owns/manages'); });
    d.projects.forEach(p=>{ add(p.id,p.title,'project',{sub:p.status, risk:p.riskScore}); edge(p.companyId,p.id,'project'); });
    d.people.forEach(p=>{ add(p.id,p.fullName,'person',{sub:p.roleTitle || 'person', score:p.performanceScore}); edge(p.companyId,p.id,'team'); if(p.aiManagerId) edge(p.aiManagerId,p.id,'AI manages'); });
    d.tasks.forEach(t=>{ add(t.id,t.title,'task',{sub:t.status, risk:t.riskLevel}); edge(t.projectId || t.companyId,t.id,'task'); if(t.ownerPersonId) edge(t.id,t.ownerPersonId,'human owner'); if(t.ownerAgentId) edge(t.ownerAgentId,t.id,'AI owner'); });
    d.agents.forEach(a=>{ add(a.id,a.name,'agent',{sub:a.role}); edge('center',a.id,'digital worker'); });
    d.approvals.forEach(a=>{ add(a.id,a.title || 'Approval','approval',{sub:a.status, risk:a.riskLevel}); if(a.taskId) edge(a.taskId,a.id,'needs approval'); else edge('center',a.id,'approval'); });
    if(mode==='memory' || mode==='ceo') d.memories.forEach(m=>{ add(m.id,m.fact.slice(0,42)+(m.fact.length>42?'…':''),'memory',{sub:m.sensitivity}); edge(m.entityId || 'center',m.id,'memory'); });
    if(mode==='sales' || mode==='ceo') d.sales.forEach(l=>{ add(l.id,l.name,'sales',{sub:`${l.stage} · ${l.channel}`}); edge(l.companyId,l.id,'lead'); });
    if(mode==='memory' || mode==='ceo') d.documents.forEach(doc=>{ add(doc.id,doc.title,'document',{sub:doc.sensitivity}); edge(doc.companyId,doc.id,'document'); });
    if(mode==='sales' || mode==='ceo') d.products.forEach(p=>{ add(p.id,p.name,'product',{sub:`${p.category} · ${p.currency} ${p.unitPrice}`}); edge(p.companyId,p.id,'product'); });
    if(mode==='sales' || mode==='ceo') d.inventory.forEach(i=>{ add(i.id,`Stock ${i.qtyOnHand}/${i.qtyReserved}`,'inventory',{sub:i.warehouse}); edge(i.productLineId,i.id,'inventory'); });
    if(mode==='sales' || mode==='ceo') d.quotations.forEach(q=>{ add(q.id,q.title,'quote',{sub:`${q.status} · ${q.currency} ${q.totals?.total||0}`}); edge(q.companyId,q.id,'quotation'); });
    return {nodes,edges,privacyNote:SEM.Permissions.canSeeOwnership(d.user)?'Founder/holding view: ownership and cash are visible.':'Scoped view: ownership, parent structure and restricted financials are hidden.'};
  }
  function layout(nodes){
    const center={x:520,y:300}; const buckets={company:[],project:[],person:[],task:[],approval:[],agent:[],memory:[],sales:[],document:[],product:[],inventory:[],quote:[]};
    nodes.forEach(n=>{ if(n.type==='center'){n.x=center.x;n.y=center.y;} else (buckets[n.type]||buckets.task).push(n); });
    const rings=[['company',150],['project',220],['person',285],['agent',345],['task',395],['approval',440],['sales',480],['product',520],['inventory',555],['quote',590],['document',625],['memory',655]];
    rings.forEach(([type,r],ringIdx)=>{
      const arr=buckets[type]||[]; const start=(-70+ringIdx*17)*Math.PI/180;
      arr.forEach((n,i)=>{ const angle=start+(2*Math.PI*(i/(arr.length||1))); n.x=center.x+Math.cos(angle)*r; n.y=center.y+Math.sin(angle)*Math.min(r,260); });
    });
    return nodes;
  }
  function svg(graph){
    const nodes=layout(graph.nodes); const nodeById=Object.fromEntries(nodes.map(n=>[n.id,n]));
    const w=1040,h=620;
    const lines=graph.edges.map(e=>{ const a=nodeById[e.from], b=nodeById[e.to]; if(!a||!b) return ''; return `<line class="mmEdge" x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}"/><text class="mmEdgeLabel" x="${(a.x+b.x)/2}" y="${(a.y+b.y)/2}">${U.esc(e.label)}</text>`; }).join('');
    const dots=nodes.map(n=>{ const r=n.type==='center'?42:24; const label=U.esc(n.label); const short=label.length>30?label.slice(0,30)+'…':label; return `<g class="mmNode" data-node="${U.esc(n.id)}"><circle cx="${n.x}" cy="${n.y}" r="${r}" fill="${colorFor(n.type)}"></circle><text x="${n.x}" y="${n.y+(n.type==='center'?3:-2)}" text-anchor="middle">${short}</text><text class="mmSub" x="${n.x}" y="${n.y+r+15}" text-anchor="middle">${U.esc(n.sub||n.type)}</text></g>`; }).join('');
    return `<svg class="mindmapSvg" viewBox="0 0 ${w} ${h}" role="img" aria-label="SEM Brain operating mindmap">${lines}${dots}</svg>`;
  }
  function detailHtml(nodeId, graph){
    const n=graph.nodes.find(x=>x.id===nodeId); if(!n) return '<p class="muted">Select a node.</p>';
    const connections=graph.edges.filter(e=>e.from===nodeId||e.to===nodeId).map(e=>`${e.from===nodeId?'→':'←'} ${e.label||'linked'} ${e.from===nodeId?e.to:e.from}`);
    return `<div class="item"><div class="itemHeader"><b>${U.esc(n.label)}</b><span class="pill ${n.type==='approval'?'red':n.type==='company'?'orange':n.type==='agent'?'blue':'green'}">${U.esc(n.type)}</span></div><p class="muted">${U.esc(n.sub||'')}</p><div class="badgeBar">${n.risk?`<span class="pill orange">risk ${U.esc(n.risk)}</span>`:''}${n.score?`<span class="pill green">score ${U.esc(n.score)}</span>`:''}</div><h4>Connections</h4><ul>${connections.map(c=>`<li>${U.esc(c)}</li>`).join('')||'<li>No connections</li>'}</ul></div>`;
  }
  return { render(){ const graph=buildGraph('ceo'); return `<div class="grid grid2"><div class="card wideCard"><div class="sectionTitle"><div><h3>Operating Mindmap</h3><p class="muted">CEO-grade control map: companies → projects → people → AI agents → tasks → approvals → docs → products → inventory → quotes → memory.</p></div><div class="actions"><button class="small" id="mmModeCeo">CEO Map</button><button class="small" id="mmModeSales">Sales Map</button><button class="small" id="mmModeMemory">Memory Map</button></div></div><div class="mmPrivacy">${U.esc(graph.privacyNote)}</div><div id="mmCanvas">${svg(graph)}</div></div><div class="card"><h3>Node inspector</h3><div id="mmDetail"><p class="muted">Click any node to inspect context and links. This is the missing visual brain layer before 3D.</p></div><hr><h3>Mindmap QA Criteria</h3><div class="list"><div class="item"><b>Real data only</b><p class="muted">Nodes are generated from current workspace data, not decorative fake elements.</p></div><div class="item"><b>Permission scoped</b><p class="muted">Employee/manager views hide ownership, parent structure, salaries and restricted memories.</p></div><div class="item"><b>Token efficient</b><p class="muted">Mindmap reads local database state. No LLM call required.</p></div></div></div></div>`; }, afterRender(){ let current=buildGraph('ceo'); const redraw=(mode)=>{current=buildGraph(mode); U.$('#mmCanvas').innerHTML=svg(current); U.$('#mmDetail').innerHTML='<p class="muted">Click any node to inspect context and links.</p>'; bindNodes();}; const bindNodes=()=>U.$$('.mmNode').forEach(g=>g.onclick=()=>{U.$('#mmDetail').innerHTML=detailHtml(g.dataset.node,current);}); bindNodes(); U.$('#mmModeCeo').onclick=()=>redraw('ceo'); U.$('#mmModeSales').onclick=()=>redraw('sales'); U.$('#mmModeMemory').onclick=()=>redraw('memory'); }};
})();
