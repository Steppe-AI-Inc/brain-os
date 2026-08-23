window.SEM=window.SEM||{}; SEM.Modules=SEM.Modules||{};
SEM.Modules.productionCore = (()=>{
  const U=SEM.Utils;
  function pill(ok){ return ok ? '<span class="pill green">ready</span>' : '<span class="pill orange">not configured</span>'; }
  function renderChecks(){
    const s=SEM.Store.get();
    const checks=[
      ['Supabase schema file included', true, 'supabase/schema-v0.7-production-core.sql'],
      ['RLS policy file included', true, 'Row Level Security policies are in the schema file'],
      ['Real AI backend template included', true, 'api/ai-command.js + Supabase Edge Function'],
      ['Browser API keys protected', true, 'OpenAI key lives only in backend env'],
      ['Local fallback available', true, 'App still works without cloud for demos'],
      ['Supabase configured in this browser', SEM.DataService.isConfigured(), 'URL + anon key required'],
      ['Production mode selected', s.settings.productionMode==='cloud_supabase', `Current: ${s.settings.productionMode||'local_fallback'}`]
    ];
    return `<table class="table"><thead><tr><th>Requirement</th><th>Status</th><th>Evidence</th></tr></thead><tbody>${checks.map(c=>`<tr><td><b>${U.esc(c[0])}</b></td><td>${pill(c[1])}</td><td>${U.esc(c[2])}</td></tr>`).join('')}</tbody></table>`;
  }
  return {
    render(){ const s=SEM.Store.get(); const sess=SEM.DataService.getSession(); return `
      <div class="grid grid4">
        <div class="stat"><div class="label">Production Core</div><div class="num" style="font-size:24px">v0.7</div><span class="pill blue">cloud-ready</span></div>
        <div class="stat"><div class="label">Supabase</div><div class="num" style="font-size:24px">${SEM.DataService.isConfigured()?'Set':'Not set'}</div>${pill(SEM.DataService.isConfigured())}</div>
        <div class="stat"><div class="label">Session</div><div class="num" style="font-size:24px">${sess?'Signed in':'Local'}</div><span class="pill ${sess?'green':'orange'}">${sess?'auth':'fallback'}</span></div>
        <div class="stat"><div class="label">Security Rule</div><div class="num" style="font-size:24px">RLS</div><span class="pill purple">required</span></div>
      </div>
      <div class="grid grid2" style="margin-top:18px">
        <div class="card"><h3>Cloud configuration</h3><p class="muted">Configure Supabase after running <code>supabase/schema-v0.7-production-core.sql</code>. This page tests the real backend path without rewriting the UI.</p>
          <div class="formGroup"><label>Supabase Project URL</label><input id="supabaseUrl" value="${U.esc(s.settings.supabaseUrl||'')}" placeholder="https://xxxx.supabase.co" /></div>
          <div class="formGroup"><label>Supabase anon / publishable key</label><input id="supabaseAnonKey" value="${U.esc(s.settings.supabaseAnonKey||'')}" placeholder="eyJ..." /></div>
          <div class="formRow"><div class="formGroup"><label>Login email</label><input id="cloudEmail" placeholder="founder@example.com" /></div><div class="formGroup"><label>Password</label><input id="cloudPassword" type="password" placeholder="••••••••" /></div></div>
          <div class="actions"><button class="primary" id="saveCloudConfig">Save config</button><button class="ghost" id="cloudSignIn">Sign in</button><button class="ghost" id="cloudSignOut">Sign out</button><button class="ghost" id="testCloudDb">Test database</button></div><div id="cloudResult" style="margin-top:12px"></div>
        </div>
        <div class="card"><h3>Production readiness checks</h3>${renderChecks()}<hr><h4>Next acceptance test</h4><p class="muted">Login as Founder, type a proposal command in AI Native Chat, confirm tasks/approvals/model usage/audit logs are written server-side.</p><div class="actions"><button class="primary" id="createCloudSmokeTask">Create cloud smoke-test task</button><button class="ghost" data-route="chatOps">Go to AI Native Chat</button></div></div>
      </div>
      <div class="card" style="margin-top:18px"><h3>v0.7 production core scope</h3><div class="grid grid3"><div class="item"><b>Real users</b><p class="muted">Profiles, memberships and RLS are schema-driven. Employees see only assigned scope.</p></div><div class="item"><b>Real AI backend</b><p class="muted">Backend builds context packs and stores work orders, tasks, approvals, model usage and audit logs.</p></div><div class="item"><b>Token control</b><p class="muted">AI receives compact context packs, not full workspace dumps.</p></div></div></div>`; },
    afterRender(){
      U.$('#saveCloudConfig').onclick=()=>{ const s=SEM.Store.get(); s.settings.supabaseUrl=U.$('#supabaseUrl').value.trim(); s.settings.supabaseAnonKey=U.$('#supabaseAnonKey').value.trim(); s.settings.productionMode=s.settings.supabaseUrl&&s.settings.supabaseAnonKey?'cloud_supabase':'local_fallback'; SEM.Store.save(); U.toast('Cloud config saved'); SEM.App.render(); };
      U.$('#cloudSignIn').onclick=async()=>{ const box=U.$('#cloudResult'); box.innerHTML='<div class="item">Signing in…</div>'; try{ const r=await SEM.DataService.signIn(U.$('#cloudEmail').value.trim(), U.$('#cloudPassword').value); box.innerHTML=`<pre class="code">Signed in. Token expires in ${r.expires_in}s.</pre>`; SEM.App.render(); }catch(e){ box.innerHTML=`<div class="item"><b class="dangerText">Sign-in failed</b><p>${U.esc(e.message)}</p></div>`; } };
      U.$('#cloudSignOut').onclick=()=>{ SEM.DataService.clearSession(); U.toast('Cloud session cleared'); SEM.App.render(); };
      U.$('#testCloudDb').onclick=async()=>{ const box=U.$('#cloudResult'); box.innerHTML='<div class="item">Testing Supabase RLS tables…</div>'; try{ const r=await SEM.DataService.test(); box.innerHTML=`<pre class="code">${U.esc(JSON.stringify(r,null,2))}</pre>`; }catch(e){ box.innerHTML=`<div class="item"><b class="dangerText">Database test failed</b><p>${U.esc(e.message)}</p></div>`; } };
      U.$('#createCloudSmokeTask').onclick=async()=>{ const box=U.$('#cloudResult'); if(box) box.innerHTML='<div class="item">Creating cloud task…</div>'; try{ const r=await SEM.DataService.createCloudTaskFromLocal(); U.toast('Cloud smoke task created'); if(box) box.innerHTML=`<pre class="code">${U.esc(JSON.stringify(r,null,2))}</pre>`; }catch(e){ if(box) box.innerHTML=`<div class="item"><b class="dangerText">Cloud task failed</b><p>${U.esc(e.message)}</p></div>`; } };
    }
  };
})();
