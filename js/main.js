window.SEM = window.SEM || {};
SEM.helloWorld = () => console.log('Hello, world!');
SEM.App = (() => {
  const U = SEM.Utils;
  const routeGroups = [
    { title: 'AI FIRST', routes: [
      ['chatOps', 'AI Native Chat', '✦'],
      ['workflowFactory', 'Workflow Factory', '↯'],
      ['autoTester', 'Autonomous QA', '✓'],
      ['mindmap', 'Operating Mindmap', '◎']
    ]},
    { title: 'CEO CONTROL', routes: [
      ['dashboard', 'Executive Dashboard', '◈'],
      ['productionCore', 'Production Core', '🛡'],
      ['deploymentCenter', 'Deployment Center', '🚀'],
      ['approvals', 'Approvals', '⚑'],
      ['tasks', 'Tasks', '☑'],
      ['myWork', 'My Work', '●'],
      ['tokenControl', 'Token Control', '◌']
    ]},
    { title: 'REVENUE OPS', routes: [
      ['dealDesk', 'Meeting Deal Desk', '$'],
      ['proposalFactory', 'Proposal Factory', '▣'],
      ['sales', 'Sales OS', '↗'],
      ['productInventory', 'Product + Inventory', '▤'],
      ['documents', 'Documents + Knowledge', '◫'],
      ['integrations', 'Slack + Drive', '⇄']
    ]},
    { title: 'FACTORIES', routes: [
      ['productFactory', 'Product Factory', '◆'],
      ['softwareFactory', 'Software Factory', '</>'],
      ['moduleRegistry', 'Module Registry', '▦'],
      ['architectureAudit', 'Architecture Audit', '◇'],
      ['qaLab', 'QA/QC Lab', '☑']
    ]},
    { title: 'ADMIN DATA', routes: [
      ['access', 'User Access', '◉'],
      ['companies', 'Companies', '▰'],
      ['people', 'People', '👤'],
      ['kpiSalary', 'KPI + Salary', '％'],
      ['projects', 'Projects', '▱'],
      ['memory', 'Memory', '∞'],
      ['agents', 'AI Agents', '⚙'],
      ['aiBackend', 'Real AI Backend', 'API'],
      ['automationExplorer', 'Automation Explorer', '⚡'],
      ['settings', 'Settings', '⚙'],
      ['command', 'Legacy Command', '⌘']
    ]}
  ];
  const routes = routeGroups.flatMap(g => g.routes);
  let currentRoute = location.hash.replace('#', '') || 'chatOps';
  const pageTitle = Object.fromEntries(routes.map(([id, label]) => [id, label]));

  function renderNav() {
    const nav = U.$('#nav');
    nav.innerHTML = `
      <div class="navSearchWrap"><input id="navSearch" class="navSearch" placeholder="${U.esc(SEM.I18n.t('shell.findModule','Find module…'))}" aria-label="Find module" /></div>
      ${routeGroups.map(group => `
        <div class="navGroup" data-nav-group="${U.esc(group.title)}">
          <div class="navGroupTitle">${U.esc(SEM.I18n.t('navGroup.'+group.title, group.title))}</div>
          ${group.routes.map(([id, label, icon]) => `
            <button class="navItem ${id === currentRoute ? 'active' : ''}" data-route="${id}" data-nav-label="${U.esc((label + ' ' + group.title).toLowerCase())}">
              <span class="navIcon">${U.esc(icon)}</span><span class="navText">${U.esc(SEM.I18n.t('nav.'+id, label))}</span>
            </button>
          `).join('')}
        </div>
      `).join('')}`;
    const search = U.$('#navSearch');
    search.oninput = () => {
      const q = search.value.trim().toLowerCase();
      U.$$('.navItem').forEach(btn => {
        const match = !q || (btn.dataset.navLabel || '').includes(q);
        btn.classList.toggle('hiddenBySearch', !match);
      });
      U.$$('.navGroup').forEach(group => {
        const visible = Array.from(group.querySelectorAll('.navItem')).some(x => !x.classList.contains('hiddenBySearch'));
        group.classList.toggle('hiddenBySearch', !visible);
      });
    };
  }

  function renderUser() {
    const user = SEM.Store.currentUser();
    const person = SEM.Store.currentPerson();
    U.$('#userPill').innerHTML = `
      <div class="avatar">${U.esc((user.name || 'U').slice(0, 1))}</div>
      <div><strong>${U.esc(user.name)}</strong><span>${U.esc(SEM.Permissions.roleLabel[user.role] || user.role)} · ${U.esc(person?.roleTitle || '')}</span></div>`;
  }

  function navigate(route) {
    currentRoute = route;
    location.hash = route;
    render();
  }

  function applyShellI18n() {
    document.documentElement.lang = SEM.I18n.locale();
    U.$('#eyebrowText').textContent = SEM.I18n.t('shell.eyebrow', 'Founder Operating Brain');
    U.$('#importBtn').textContent = SEM.I18n.t('shell.import', 'Import');
    U.$('#backupBtn').textContent = SEM.I18n.t('shell.export', 'Export');
    U.$('#newCommandBtn').textContent = SEM.I18n.t('shell.newCommand', 'New Command');
    U.$('#devRuleLabel').textContent = SEM.I18n.t('shell.devRuleLabel', 'Development rule');
    U.$('#devRuleTitle').textContent = SEM.I18n.t('shell.devRuleTitle', 'Patch-only. Module-only. Token-limited.');
    U.$('#devRuleBody').textContent = SEM.I18n.t('shell.devRuleBody', 'Change one module, not the whole system.');
    const loc = SEM.I18n.locale();
    U.$('#langEn').classList.toggle('active', loc === 'en');
    U.$('#langMn').classList.toggle('active', loc === 'mn');
  }

  function render() {
    applyShellI18n();
    renderNav();
    renderUser();
    U.$('#pageTitle').textContent = SEM.I18n.t('nav.'+currentRoute, pageTitle[currentRoute] || 'Dashboard');
    const view = U.$('#view');
    const mod = SEM.Modules?.[currentRoute];
    view.innerHTML = mod?.render ? mod.render() : `<div class="card"><h3>Module not found</h3><p class="muted">The route <b>${U.esc(currentRoute)}</b> is registered, but the module script was not loaded.</p></div>`;
    if (mod?.afterRender) mod.afterRender();
  }

  function bindGlobal() {
    document.body.addEventListener('click', e => {
      const langBtn = e.target.closest('[data-lang]');
      if (langBtn) { SEM.I18n.setLocale(langBtn.dataset.lang); render(); return; }
      const btn = e.target.closest('[data-route]');
      if (btn) navigate(btn.dataset.route);
    });
    U.$('#backupBtn').onclick = () => U.download(`sem-brain-backup-${Date.now()}.json`, JSON.stringify(SEM.Store.get(), null, 2));
    U.$('#importBtn').onclick = () => U.$('#importFile').click();
    U.$('#importFile').onchange = async (e) => {
      const f = e.target.files[0];
      if (!f) return;
      try {
        SEM.Store.set(JSON.parse(await U.readFile(f)));
        U.toast('Imported backup');
        render();
      } catch (err) { U.toast('Import failed'); }
      e.target.value = '';
    };
    window.addEventListener('hashchange', () => {
      currentRoute = location.hash.replace('#', '') || 'chatOps';
      render();
    });
  }

  function init() { bindGlobal(); render(); }
  return { init, render, navigate, routes, routeGroups };
})();
document.addEventListener('DOMContentLoaded', SEM.App.init);
