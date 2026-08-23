window.SEM = window.SEM || {};
SEM.TokenBudget = (() => {
  const estimateTokens = (input) => Math.ceil(String(input||'').length / 4);
  const routeModel = (category, risk, estimatedInputTokens) => {
    if(estimatedInputTokens < 500 && ['filter','count','status'].includes(category)) return {route:'no-llm', model:'none', reason:'Database/query task'};
    if(estimatedInputTokens < 2500 && !['strategy','software_architecture','investor','legal'].includes(category)) return {route:'small', model:SEM.Store.get().settings.modelSmall, reason:'Classification/simple decomposition'};
    if(estimatedInputTokens < 9000 && risk !== 'critical') return {route:'medium', model:SEM.Store.get().settings.modelMedium, reason:'General task decomposition'};
    return {route:'strong', model:SEM.Store.get().settings.modelStrong, reason:'Complex/high-risk reasoning'};
  };
  const estimateCommand = (command, context={}) => {
    const contextText = JSON.stringify(context);
    const inputTokens = estimateTokens(command) + estimateTokens(contextText) + 1500;
    const outputTokens = Math.min(5000, Math.max(800, Math.ceil(inputTokens * 0.35)));
    const route = routeModel(context.category || 'general', context.riskLevel || 'low', inputTokens);
    const estimatedCostUsd = route.route === 'no-llm' ? 0 : Number(((inputTokens + outputTokens) / 1000000 * (route.route === 'strong' ? 8 : route.route === 'medium' ? 1.2 : 0.3)).toFixed(5));
    const settings = SEM.Store.get().settings;
    const needsBudgetApproval = inputTokens + outputTokens > settings.approvalThresholdTokens || inputTokens + outputTokens > settings.hardStopTokensPerCommand;
    return {inputTokens, outputTokens, totalTokens: inputTokens+outputTokens, ...route, estimatedCostUsd, needsBudgetApproval, hardStop: inputTokens+outputTokens > settings.hardStopTokensPerCommand};
  };
  const logEvent = (event) => { const s=SEM.Store.get(); s.tokenEvents.unshift({id:SEM.Utils.uid('tok'), createdAt:SEM.Utils.now(), ...event}); SEM.Store.save(); };
  const usageSummary = () => {
    const s=SEM.Store.get(); const today=SEM.Utils.today();
    const day=s.tokenEvents.filter(e=>(e.createdAt||'').startsWith(today));
    const month=s.tokenEvents.filter(e=>(e.createdAt||'').slice(0,7)===today.slice(0,7));
    const sum=(arr,key)=>arr.reduce((a,b)=>a+Number(b[key]||0),0);
    return {dailyTokens:sum(day,'totalTokens'), monthlyTokens:sum(month,'totalTokens'), dailyCost:sum(day,'estimatedCostUsd'), monthlyCost:sum(month,'estimatedCostUsd')};
  };
  return { estimateTokens, routeModel, estimateCommand, logEvent, usageSummary };
})();
