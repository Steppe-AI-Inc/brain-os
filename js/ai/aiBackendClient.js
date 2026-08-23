window.SEM = window.SEM || {};
SEM.AIBackend = (() => {
  async function callRealAI({command, contextPack, tokenPlan}) {
    const settings = SEM.Store.get().settings;
    if(settings.aiMode !== 'real') throw new Error('AI mode is fallback. Enable Real AI Backend first.');
    const endpoint = settings.aiEndpoint || '/api/ai-command';
    const res = await fetch(endpoint, {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({ command, contextPack, tokenPlan, appVersion: SEM.Store.get().version })
    });
    const text = await res.text();
    let json;
    try { json = JSON.parse(text); } catch(e) { throw new Error(`AI endpoint returned non-JSON: ${text.slice(0,220)}`); }
    if(!res.ok) throw new Error(json.error || `AI endpoint error ${res.status}`);
    return json;
  }
  function normalizeAIResponse(payload) {
    if(!payload) return {tasks:[], summary:'No payload returned', approvals:[], memories:[]};
    if(payload.result) payload = payload.result;
    return {
      strategicGoal: payload.strategicGoal || payload.strategic_goal || 'Founder command execution',
      summary: payload.summary || 'AI generated tasks.',
      riskLevel: payload.riskLevel || payload.risk_level || 'medium',
      tasks: Array.isArray(payload.tasks) ? payload.tasks : [],
      approvals: Array.isArray(payload.approvals) ? payload.approvals : [],
      memories: Array.isArray(payload.memories) ? payload.memories : [],
      model: payload.model || payload.modelUsed || 'backend'
    };
  }
  return { callRealAI, normalizeAIResponse };
})();
