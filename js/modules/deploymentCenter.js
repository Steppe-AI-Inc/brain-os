window.SEM=window.SEM||{}; SEM.Modules=SEM.Modules||{};
SEM.Modules.deploymentCenter = (()=>{
  const U = SEM.Utils;
  const projectUrl = 'https://gyqlkgnyyzpwaswhshlw.supabase.co';
  function configStatus(){
    const s=SEM.Store.get().settings||{};
    return {
      supabaseUrl: s.supabaseUrl || projectUrl,
      hasAnon: Boolean(s.supabaseAnonKey),
      productionMode: s.productionMode || 'local_fallback',
      cloudReady: Boolean(s.supabaseUrl && s.supabaseAnonKey)
    };
  }
  function step(title, status, body){
    const cls=status==='done'?'green':status==='now'?'blue':'orange';
    return `<div class="item"><div class="flexBetween"><b>${U.esc(title)}</b><span class="pill ${cls}">${U.esc(status)}</span></div><p class="muted">${body}</p></div>`;
  }
  function code(txt){ return `<pre class="code">${U.esc(txt)}</pre>`; }
  return {
    render(){
      const c=configStatus();
      const sqlPath='supabase/migrations/202606190001_sem_brain_v071_production_core.sql';
      return `
      <div class="grid grid4">
        <div class="stat"><div class="label">Auto Deploy Pack</div><div class="num" style="font-size:24px">v0.7.1</div><span class="pill blue">GitHub + Vercel</span></div>
        <div class="stat"><div class="label">Supabase URL</div><div class="num" style="font-size:18px">${U.esc(c.supabaseUrl.replace('https://',''))}</div><span class="pill green">project set</span></div>
        <div class="stat"><div class="label">Anon Key</div><div class="num" style="font-size:24px">${c.hasAnon?'Saved':'Missing'}</div><span class="pill ${c.hasAnon?'green':'orange'}">${c.hasAnon?'ready':'needed'}</span></div>
        <div class="stat"><div class="label">Future Updates</div><div class="num" style="font-size:24px">Auto</div><span class="pill purple">after GitHub</span></div>
      </div>

      <div class="grid grid2" style="margin-top:18px">
        <div class="card">
          <h3>Deployment path</h3>
          ${step('1. Run fixed database schema','now',`Use Supabase SQL Editor and run <code>${sqlPath}</code>. This fixes the earlier profiles-table ordering error.`)}
          ${step('2. Create Founder user','next','Create your user in Supabase Auth, then insert founder profile + SEM Technologies LLC seed data.')}
          ${step('3. Push project to GitHub','next','Create a private GitHub repo and upload this v0.7.1 folder.')}
          ${step('4. Connect GitHub to Vercel','next','Vercel deploys automatically on every GitHub push. Your app gets one permanent URL.')}
          ${step('5. Deploy Supabase Edge Function','next','Deploy sem-ai-command only after database + login works.')}
          ${step('6. Add OpenAI backend secret','later','Add OPENAI_API_KEY only to Supabase/Vercel backend secrets, never into browser code.')}
        </div>
        <div class="card">
          <h3>Environment variables</h3>
          <p class="muted">Set these in Vercel Project Settings → Environment Variables. Your browser app should not ask for Supabase config every time after this.</p>
          ${code(`NEXT_PUBLIC_SUPABASE_URL=${projectUrl}\nNEXT_PUBLIC_SUPABASE_ANON_KEY=your_publishable_anon_key\nSEM_BRAIN_APP_VERSION=0.7.1`)}
          <p class="muted">Backend-only secrets:</p>
          ${code(`OPENAI_API_KEY=sk-...       # backend only\nOPENAI_MODEL=gpt-4.1-mini\nSUPABASE_SERVICE_ROLE_KEY=... # backend only, never frontend`)}
          <div class="actions"><button class="primary" id="copyEnvTemplate">Copy env template</button><button class="ghost" data-route="productionCore">Open Production Core</button></div>
        </div>
      </div>

      <div class="grid grid2" style="margin-top:18px">
        <div class="card">
          <h3>Automatic update workflow</h3>
          <p class="muted">After GitHub + Vercel are connected, you no longer download ZIPs manually for every frontend/UI change.</p>
          ${code(`You request update\n→ patch one module only\n→ commit to GitHub\n→ Vercel auto-deploys\n→ open same SEM Brain URL`)}
          <h4>Database update rule</h4>
          <p class="muted">Database changes are migrations. They must be reviewed and run intentionally so employee/security data is not broken.</p>
        </div>
        <div class="card">
          <h3>Readiness buttons</h3>
          <p class="muted">Use these to jump to the critical checks.</p>
          <div class="actions stack">
            <button class="primary" data-route="productionCore">Test Supabase connection</button>
            <button class="ghost" data-route="qaLab">Run QA/QC Lab</button>
            <button class="ghost" data-route="architectureAudit">Audit architecture</button>
            <button class="ghost" data-route="chatOps">Test AI Native Chat</button>
            <button class="ghost" data-route="mindmap">Check operating mindmap</button>
          </div>
        </div>
      </div>

      <div class="card" style="margin-top:18px">
        <h3>Do not expose these</h3>
        <div class="grid grid3">
          <div class="item"><b>Never frontend</b><p class="muted">Database password, service_role key, OpenAI key, Slack token, Google secret.</p></div>
          <div class="item"><b>Browser-safe</b><p class="muted">Supabase URL and publishable/anon key only when RLS is enabled.</p></div>
          <div class="item"><b>Patch-only</b><p class="muted">Future updates must target one module. Do not regenerate the whole app.</p></div>
        </div>
      </div>`;
    },
    afterRender(){
      const btn=U.$('#copyEnvTemplate');
      if(btn) btn.onclick=async()=>{
        const txt=`NEXT_PUBLIC_SUPABASE_URL=${projectUrl}\nNEXT_PUBLIC_SUPABASE_ANON_KEY=your_publishable_anon_key\nSEM_BRAIN_APP_VERSION=0.7.1\nOPENAI_MODEL=gpt-4.1-mini`;
        try{ await navigator.clipboard.writeText(txt); U.toast('Environment template copied'); }catch(e){ U.toast('Copy failed'); }
      };
    }
  };
})();
