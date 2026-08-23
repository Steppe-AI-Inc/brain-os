window.SEM = window.SEM || {};
SEM.ContextPack = (() => {
  const U=SEM.Utils;
  const wordsFrom = (cmd) => String(cmd||'').toLowerCase().split(/[^a-z0-9а-яөёү]+/i).filter(w=>w.length>2);
  const scoreText = (text, words) => words.reduce((score,w)=>score + (String(text||'').toLowerCase().includes(w) ? 1 : 0), 0);
  const build = (command, maxItems=12) => {
    const s=SEM.Store.get(); const user=SEM.Store.currentUser(); const words=wordsFrom(command);
    const allowedCompanies = s.companies.filter(c=>SEM.Permissions.canSeeCompany(user,c));
    const companyScores = allowedCompanies.map(c=>({item:SEM.Permissions.safeCompany(user,c), score:scoreText(`${c.name} ${c.description} ${c.country}`, words)})).sort((a,b)=>b.score-a.score);
    const chosenCompanyIds = companyScores.filter(x=>x.score>0).map(x=>x.item.id).concat(user.companyScope||[]);
    const relevantTasks=s.tasks.filter(t=>chosenCompanyIds.includes(t.companyId) || scoreText(`${t.title} ${t.description}`,words)>0).slice(0,maxItems);
    const relevantProjects=s.projects.filter(p=>chosenCompanyIds.includes(p.companyId) || scoreText(`${p.title} ${p.goal} ${p.blockers}`,words)>0).slice(0,maxItems);
    const relevantMemories=s.memories.map(m=>({item:m,score:scoreText(m.fact,words)})).filter(x=>x.score>0 || chosenCompanyIds.includes(x.item.entityId)).sort((a,b)=>b.score-a.score).slice(0,maxItems).map(x=>x.item);
    const relevantPeople=s.people.filter(p=>chosenCompanyIds.includes(p.companyId) || scoreText(`${p.fullName} ${p.roleTitle} ${p.responsibilities}`,words)>0).slice(0,maxItems).map(p=>SEM.Permissions.safePerson(user,p));
    const relevantDocs=(s.documents||[]).filter(d=>chosenCompanyIds.includes(d.companyId) || scoreText(`${d.title} ${d.summary} ${d.textSnippet} ${(d.tags||[]).join(' ')}`, words)>0).slice(0,6).map(d=>({id:d.id,companyId:d.companyId,title:d.title,type:d.type,sensitivity:d.sensitivity,status:d.status,summary:d.summary,tags:d.tags}));
    const relevantProducts=(s.productLines||[]).filter(p=>chosenCompanyIds.includes(p.companyId) || scoreText(`${p.name} ${p.category} ${p.description}`, words)>0).slice(0,8).map(p=>({id:p.id,companyId:p.companyId,name:p.name,category:p.category,currency:p.currency,unitPrice:p.unitPrice,unit:p.unit,status:p.status,description:p.description}));
    const relevantInventory=(s.inventoryItems||[]).filter(i=>chosenCompanyIds.includes(i.companyId) || relevantProducts.find(p=>p.id===i.productLineId)).slice(0,8);
    const relevantQuotes=(s.quotations||[]).filter(q=>chosenCompanyIds.includes(q.companyId) || scoreText(`${q.title} ${q.customerName} ${q.paymentTerms}`, words)>0).slice(0,5).map(q=>({id:q.id,companyId:q.companyId,title:q.title,customerName:q.customerName,total:q.totals?.total,currency:q.currency,status:q.status,marginPct:q.totals?.marginPct}));
    const relevantProposalTemplates=(s.proposalTemplates||[]).filter(t=>chosenCompanyIds.includes(t.companyId) || scoreText(`${t.title} ${t.language} ${t.type}`, words)>0 || words.includes('proposal') || words.includes('quotation')).slice(0,5).map(t=>({id:t.id,companyId:t.companyId,title:t.title,language:t.language,type:t.type,sections:t.sections}));
    const relevantPaymentTerms=(s.paymentTermsLibrary||[]).filter(t=>scoreText(`${t.title} ${t.terms}`, words)>0 || words.includes('payment') || words.includes('barter') || words.includes('financing') || words.includes('quotation')).slice(0,5).map(t=>({id:t.id,title:t.title,terms:t.terms,approvalRequired:t.approvalRequired,maxDays:t.maxDays}));
    const totalRecords=companyScores.filter(x=>x.score>0).slice(0,6).length+relevantProjects.length+relevantTasks.length+relevantMemories.length+relevantPeople.length+relevantDocs.length+relevantProducts.length+relevantInventory.length+relevantQuotes.length+relevantProposalTemplates.length+relevantPaymentTerms.length;
    return {
      builder:'SEM.ContextPack.v0.6.3',
      purpose:'minimal relevant context only; never full workspace',
      user:{id:user.id,name:user.name,role:user.role,companyScope:user.companyScope},
      commandKeywords: words.slice(0,20),
      companies: companyScores.filter(x=>x.score>0).slice(0,6).map(x=>x.item),
      projects: relevantProjects,
      tasks: relevantTasks,
      people: relevantPeople,
      memories: relevantMemories,
      documents: relevantDocs,
      productLines: relevantProducts,
      inventory: relevantInventory,
      quotations: relevantQuotes,
      proposalTemplates: relevantProposalTemplates,
      paymentTerms: relevantPaymentTerms,
      counts:{companies:allowedCompanies.length,projects:relevantProjects.length,tasks:relevantTasks.length,memories:relevantMemories.length,people:relevantPeople.length,documents:relevantDocs.length,productLines:relevantProducts.length,inventory:relevantInventory.length,quotations:relevantQuotes.length,proposalTemplates:relevantProposalTemplates.length,paymentTerms:relevantPaymentTerms.length,totalRecords}
    };
  };
  return { build };
})();
