window.SEM = window.SEM || {};
SEM.DataService = (() => {
  const Store = () => SEM.Store.get();
  const U = () => SEM.Utils;
  const sessionKey = 'semBrain.v070.supabaseSession';

  function config(){
    const s = Store();
    return { url:(s.settings.supabaseUrl||'').replace(/\/$/,''), anonKey:s.settings.supabaseAnonKey||'' };
  }
  function isConfigured(){ const c=config(); return !!(c.url && c.anonKey); }
  function getSession(){ try { return JSON.parse(localStorage.getItem(sessionKey)||'null'); } catch { return null; } }
  function setSession(sess){ localStorage.setItem(sessionKey, JSON.stringify(sess||null)); }
  function clearSession(){ localStorage.removeItem(sessionKey); }
  function authHeaders(){
    const c=config(); const sess=getSession();
    return {
      apikey: c.anonKey,
      Authorization: `Bearer ${(sess && sess.access_token) || c.anonKey}`,
      'Content-Type':'application/json',
      Prefer:'return=representation'
    };
  }
  async function request(path, options={}){
    const c=config();
    if(!isConfigured()) throw new Error('Supabase URL and anon key are not configured.');
    const res = await fetch(`${c.url}${path}`, { ...options, headers:{...authHeaders(), ...(options.headers||{})} });
    const text = await res.text();
    let json; try { json = text ? JSON.parse(text) : null; } catch { json = text; }
    if(!res.ok) throw new Error(typeof json==='string' ? json : (json?.message || json?.error_description || json?.error || `HTTP ${res.status}`));
    return json;
  }
  async function signIn(email,password){
    const c=config(); if(!isConfigured()) throw new Error('Configure Supabase first.');
    const res=await fetch(`${c.url}/auth/v1/token?grant_type=password`,{method:'POST',headers:{apikey:c.anonKey,'Content-Type':'application/json'},body:JSON.stringify({email,password})});
    const json=await res.json();
    if(!res.ok) throw new Error(json.error_description||json.msg||json.message||'Sign-in failed');
    setSession(json); return json;
  }
  async function getProfile(){ return request('/rest/v1/profiles?select=*&limit=1'); }
  async function select(table, query='select=*'){ return request(`/rest/v1/${table}?${query}`); }
  async function insert(table, item){ return request(`/rest/v1/${table}`,{method:'POST',body:JSON.stringify(item)}); }
  async function update(table, id, patch){ return request(`/rest/v1/${table}?id=eq.${encodeURIComponent(id)}`,{method:'PATCH',body:JSON.stringify(patch)}); }
  async function test(){
    const out={configured:isConfigured(), session:!!getSession(), checks:[]};
    if(!out.configured) return out;
    for(const t of ['profiles','companies','tasks','approvals','audit_logs']){
      try{ const rows=await select(t,'select=id&limit=1'); out.checks.push({table:t,status:'PASS',detail:`${Array.isArray(rows)?rows.length:0} row sample`}); }
      catch(e){ out.checks.push({table:t,status:'FAIL',detail:e.message}); }
    }
    return out;
  }
  async function createCloudTaskFromLocal(){
    const s=Store();
    const task={
      title:'Cloud smoke test task from SEM Brain v0.7',
      description:'Created by Production Core to verify Supabase authenticated insert path.',
      status:'queued', priority:'low', risk_level:'low', approval_required:false,
      source:'production_core_smoke_test'
    };
    return insert('tasks', task);
  }
  return { config, isConfigured, getSession, setSession, clearSession, signIn, request, select, insert, update, test, getProfile, createCloudTaskFromLocal };
})();
