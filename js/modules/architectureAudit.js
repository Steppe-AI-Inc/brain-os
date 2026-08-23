window.SEM=window.SEM||{}; SEM.Modules=SEM.Modules||{};
SEM.Modules.architectureAudit = (()=>{
  const U=SEM.Utils;
  const checks = () => ([
    ['Module split','READY','Core, AI and feature modules are separate. Small changes can target one file/module.'],
    ['Patch-only development','READY','Module Registry creates prompts that forbid full-app rewrites.'],
    ['Token preflight','READY','Token Control estimates context, output and model route before command execution.'],
    ['Context Pack Builder','READY','AI receives relevant records only, not whole workspace history.'],
    ['Model router','MVP READY','Routes no-LLM/small/medium/strong by category, risk and token size. Needs real model price table later.'],
    ['Multi-agent management','MVP READY','Agent registry exists and pipeline assigns work to AI/human owners. Needs durable queues in production.'],
    ['Human approval gates','READY','High-risk/external/salary/legal/production work creates approvals.'],
    ['Access control','MVP READY','Browser-level role filtering exists. Production still requires Supabase Row Level Security.'],
    ['Auditability','PARTIAL','Task/session/token logs exist. Need immutable server-side audit logs before production.'],
    ['Mindmap brain layer','READY IN v0.6.1','2D real-data mindmap added. 3D neuron map can wait until data model proves itself.'],
    ['Real AI backend','TEMPLATE READY','Vercel/Netlify/Supabase templates exist. Needs deployed env keys and endpoint tests.'],
    ['Production pilot readiness','NOT YET','Run QA, add RLS, deploy backend, connect real users, then pilot OpenSpot only.']
  ]);
  const statusPill=(s)=>`<span class="pill ${s==='READY'||s==='READY IN v0.6.1'?'green':s.includes('PARTIAL')||s.includes('MVP')?'orange':'red'}">${U.esc(s)}</span>`;
  return { render(){ const s=SEM.Store.get(); const summary=SEM.TokenBudget.usageSummary(); return `<div class="grid grid2"><div class="card"><h3>Architecture Readiness Audit</h3><p class="muted">Answer: architecture is ready for token-efficient controlled development, but not yet for unrestricted autonomous production.</p><table class="table"><thead><tr><th>Area</th><th>Status</th><th>Evidence</th></tr></thead><tbody>${checks().map(c=>`<tr><td><b>${U.esc(c[0])}</b></td><td>${statusPill(c[1])}</td><td>${U.esc(c[2])}</td></tr>`).join('')}</tbody></table></div><div class="card"><h3>Token-Safe Development Contract</h3><div class="terminal">Never request: “rebuild the whole system”.\n\nAlways request:\n1. Target module only\n2. Existing file names\n3. Patch/diff only\n4. No schema changes unless approved\n5. Tests for that module only\n6. Token impact estimate\n7. Backward compatibility preserved</div><h3 style="margin-top:16px">Current Budget</h3><div class="grid grid2"><div class="stat"><div class="label">Daily used estimate</div><div class="num">${summary.dailyTokens.toLocaleString()}</div></div><div class="stat"><div class="label">Hard stop / command</div><div class="num">${Number(s.settings.hardStopTokensPerCommand).toLocaleString()}</div></div></div><div class="item"><b>Recommendation</b><p class="muted">Next development should be a patch-only QA/RLS/backend hardening cycle, not feature expansion. Mindmap is now added as a low-token UI module.</p></div></div></div>`; }};
})();
