window.SEM = window.SEM || {};
SEM.Utils = (() => {
  const $ = (sel, root=document) => root.querySelector(sel);
  const $$ = (sel, root=document) => [...root.querySelectorAll(sel)];
  const uid = (prefix='id') => `${prefix}_${Math.random().toString(36).slice(2,8)}_${Date.now().toString(36)}`;
  const today = () => new Date().toISOString().slice(0,10);
  const now = () => new Date().toISOString();
  const esc = (v='') => String(v).replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  const fmtMoney = n => `$${Number(n||0).toLocaleString(undefined,{maximumFractionDigits:0})}`;
  const toast = msg => { const t=$('#toast'); if(!t) return; t.textContent=msg; t.classList.remove('hidden'); setTimeout(()=>t.classList.add('hidden'),2600); };
  const download = (filename, data, type='application/json') => {
    const blob = new Blob([data], {type}); const url=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download=filename; a.click(); URL.revokeObjectURL(url);
  };
  const readFile = file => new Promise((resolve,reject)=>{const r=new FileReader(); r.onload=()=>resolve(r.result); r.onerror=reject; r.readAsText(file);});
  const clamp = (n,min,max)=>Math.max(min,Math.min(max,n));
  const keywordMatch = (text, words) => { const s=String(text||'').toLowerCase(); return words.some(w => s.includes(String(w).toLowerCase())); };
  const statusPill = (status) => {
    const map={done:'green',approved:'green',active:'green',pending:'orange',needs_approval:'orange',blocked:'red',critical:'red',high:'orange',medium:'blue',low:'green',draft:'blue',in_progress:'purple'};
    return `<span class="pill ${map[status]||'blue'}">${esc(String(status||'').replaceAll('_',' '))}</span>`;
  };
  return { $, $$, uid, today, now, esc, fmtMoney, toast, download, readFile, clamp, keywordMatch, statusPill };
})();
