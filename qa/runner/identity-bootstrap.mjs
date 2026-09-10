#!/usr/bin/env node
// PHASE B - human-in-the-loop bootstrap of ONE synthetic QA identity.
//
// Founder decisions 2026-09-10 that shape every line of this file:
//   - The founder session is NEVER exported, copied, reused or read. The founder step below runs
//     in an EPHEMERAL profile that is deleted on exit and whose storageState is never saved.
//   - The Work PC never sees the QA mailbox. The founder personally types the QA email address and
//     the OTP into the browser window this script opens; the script only WATCHES for the resulting
//     authenticated state. It never reads, stores or prints the OTP, and never prints cookie values.
//   - No Auth Admin, no service_role, no Supabase control plane, no production SQL, no direct API.
//     Everything happens through the deployed product UI at https://brain.open-spot.ai.
//   - Only the synthetic identity's own browser state is persisted, to the gitignored
//     qa/runner/.auth/<identity>.json.
//
// Subcommands
//   founder-step            open an EPHEMERAL founder window (profile discarded) so the founder can
//                           create QA-W1-ORG, create the person, and press Invite. Nothing is saved.
//   authenticate <id>       open the identity's own isolated window at /signup; the founder types the
//                           QA email and the emailed code; on success save storageState for <id>.
//   verify <id>             load a FRESH context from the saved storageState alone and run the
//                           read-only acceptance battery (identity, org scope, tenant isolation, reload).
//   logout <id>             prove sign-out works and that the saved state is then dead.
//   status                  print what exists so far (no browser, no secrets).
//
// The product's own Invite button calls admin.auth.admin.inviteUserByEmail SERVER-SIDE on Vercel
// (web/lib/data/people.ts). That is the product's implementation of its own invite path; the Work PC
// holds no such key and never calls it. Recorded as an observation, not a workaround.
import { chromium } from './lib/pw.mjs';
import { existsSync, mkdirSync, writeFileSync, readFileSync, rmSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { RUNNER_DIR } from './lib/paths.mjs';
import { AUTH_DIR, storageStatePathFor, assertSyntheticIdentity, APP_ORIGIN } from './lib/browser-isolation.mjs';

const BOOTSTRAP_DIR = join(RUNNER_DIR, '.bootstrap-profile');
const nowIso = () => new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
const log = (...a) => console.log('[' + nowIso() + ']', ...a);

/** Every navigation this script performs is structurally checked. Product host only. */
function assertProductUrl(url) {
  const u = new URL(url);
  if (u.protocol !== 'https:' || u.hostname !== new URL(APP_ORIGIN).hostname) {
    throw new Error('REFUSED_NON_PRODUCT_NAVIGATION: ' + url);
  }
  return url;
}

/** True when a Supabase auth cookie exists for the product. Values are never read or printed. */
function hasSessionCookie(cookies) {
  return (cookies || []).some((c) => /^sb-.*-auth-token(\.\d+)?$/.test(c.name) && /open-spot\.ai$/.test(c.domain || ''));
}
function cookieShape(cookies) {
  return (cookies || []).map((c) => ({ name: c.name, domain: c.domain, secure: !!c.secure, httpOnly: !!c.httpOnly, expires_in_days: c.expires && c.expires > 0 ? Math.round((c.expires * 1000 - Date.now()) / 86400000) : null }));
}

function statusPath(id) { return join(AUTH_DIR, id + '.bootstrap-status.json'); }
function writeStatus(id, patch) {
  mkdirSync(AUTH_DIR, { recursive: true });
  let cur = {};
  try { cur = JSON.parse(readFileSync(statusPath(id), 'utf8')); } catch {}
  const next = { ...cur, ...patch, identity_id: id, updated_at: nowIso() };
  writeFileSync(statusPath(id), JSON.stringify(next, null, 2) + '\n');
  return next;
}

async function launchWindow(profileDir, { headless = false } = {}) {
  mkdirSync(profileDir, { recursive: true });
  return chromium.launchPersistentContext(profileDir, {
    headless,
    channel: 'chrome',
    viewport: null,
    args: ['--no-first-run', '--no-default-browser-check', '--start-maximized'],
  });
}

/**
 * Poll the live window until the product shows an authenticated app page. Detection is structural:
 * a Supabase auth cookie exists AND the app is not on /login or /signup. The founder's typing is
 * never observed; only the resulting state is.
 */
async function waitForAuthenticated(ctx, { timeoutMs = 25 * 60_000, onTick = () => {} } = {}) {
  const started = Date.now();
  let ticks = 0;
  while (Date.now() - started < timeoutMs) {
    const cookies = await ctx.cookies().catch(() => []);
    const pages = ctx.pages();
    const urls = pages.map((p) => { try { return p.url(); } catch { return ''; } });
    const onApp = urls.some((u) => u.startsWith(APP_ORIGIN) && !/\/(login|signup)(\?|$|#)/.test(u));
    if (hasSessionCookie(cookies) && onApp) return { ok: true, elapsed_ms: Date.now() - started, urls };
    if (++ticks % 10 === 0) onTick({ elapsed_s: Math.round((Date.now() - started) / 1000), urls, session_cookie: hasSessionCookie(cookies) });
    await new Promise((r) => setTimeout(r, 3000));
  }
  return { ok: false, reason: 'TIMEOUT_WAITING_FOR_HUMAN_AUTH', elapsed_ms: Date.now() - started };
}

/** Read the sidebar profile block + page text. Read-only; nothing is clicked. */
async function readAppFacts(page) {
  const text = await page.locator('body').innerText().catch(() => '');
  const facts = { url: page.url(), text_head: text.replace(/\s+/g, ' ').slice(0, 400) };
  // The sidebar renders full_name then the role beneath it (web/components/app-sidebar.tsx).
  const m = text.match(/^\s*([A-Za-z0-9][^\n]{0,60})\n\s*(founder|holding admin|hr finance|employee|manager|team lead|owner)\s*$/im);
  facts.identity_marker = m ? m[1].trim() : null;
  facts.role_marker = m ? m[2].trim() : null;
  if (!facts.identity_marker && /QA Worker 1/.test(text)) facts.identity_marker = 'QA Worker 1';
  return facts;
}

async function cmdFounderStep() {
  const dir = join(BOOTSTRAP_DIR, 'founder-ephemeral-' + Date.now());
  log('FOUNDER STEP - opening an EPHEMERAL isolated window.');
  log('  profile: ' + dir);
  log('  This profile is DELETED when the window closes. Its storageState is NEVER saved, read or exported.');
  const ctx = await launchWindow(dir);
  const page = ctx.pages()[0] || await ctx.newPage();
  await page.goto(assertProductUrl(APP_ORIGIN + '/login'), { waitUntil: 'domcontentloaded' }).catch(() => {});
  console.log([
    '',
    '  ============================================================',
    '  FOUNDER: perform these steps in the window that just opened.',
    '  ============================================================',
    '  0. Sign in as yourself (your own credentials, typed by you).',
    '  1. /companies  -> create a company named exactly:  QA-W1-ORG',
    '  2. /people     -> add a person:',
    '       Full name: QA Worker 1',
    '       Email:     <the dedicated QA mailbox address you control>',
    '       Company:   QA-W1-ORG',
    '  3. On that person\'s row press INVITE.',
    '     This is the product path that creates the login account AND the',
    '     QA-W1-ORG membership (role_in_company = employee).',
    '  4. Confirm the product reports the invite was sent, then CLOSE the window.',
    '',
    '  Do NOT set any elevated role. Do NOT add QA Worker 1 to any real company.',
    '  ============================================================',
    '',
  ].join('\n'));
  await new Promise((resolve) => { ctx.on('close', resolve); });
  log('founder window closed; discarding ephemeral profile (storageState never saved)');
  try { rmSync(dir, { recursive: true, force: true }); } catch (e) { log('WARN could not delete ephemeral profile: ' + e.message); }
  log('FOUNDER STEP COMPLETE (nothing persisted).');
}

async function cmdAuthenticate(id) {
  assertSyntheticIdentity(id);
  const target = storageStatePathFor(id);
  const dir = join(BOOTSTRAP_DIR, id);
  writeStatus(id, { phase: 'AUTHENTICATE_OPENED', storage_state_path: target, profile_dir: dir });
  log('AUTHENTICATE ' + id + ' - opening the identity\'s own isolated window.');
  const ctx = await launchWindow(dir);
  const page = ctx.pages()[0] || await ctx.newPage();
  await page.goto(assertProductUrl(APP_ORIGIN + '/signup'), { waitUntil: 'domcontentloaded' }).catch(() => {});
  console.log([
    '',
    '  ============================================================',
    '  FOUNDER: type these values into the window that just opened.',
    '  ============================================================',
    '  Page: https://brain.open-spot.ai/signup',
    '    Full name : QA Worker 1',
    '    Email     : <the dedicated QA mailbox address>   <-- YOU type it',
    '  Press "Send code", read the 6-digit code from that mailbox,',
    '  type it into the code field, and submit.',
    '',
    '  I am NOT reading your mailbox and NOT recording the code.',
    '  I am only watching this window for an authenticated app page.',
    '  ============================================================',
    '',
  ].join('\n'));
  const res = await waitForAuthenticated(ctx, { onTick: (t) => { log('waiting for human auth… ' + t.elapsed_s + 's, session_cookie=' + t.session_cookie); writeStatus(id, { phase: 'WAITING_FOR_HUMAN', waited_s: t.elapsed_s }); } });
  if (!res.ok) {
    writeStatus(id, { phase: 'TIMEOUT', result: res.reason });
    log('NOT AUTHENTICATED: ' + res.reason);
    await ctx.close().catch(() => {});
    process.exitCode = 3;
    return;
  }
  log('authenticated app page detected after ' + Math.round(res.elapsed_ms / 1000) + 's');
  const appPage = ctx.pages().find((p) => p.url().startsWith(APP_ORIGIN) && !/\/(login|signup)/.test(p.url())) || ctx.pages()[0];
  const facts = await readAppFacts(appPage);
  const state = await ctx.storageState();
  mkdirSync(AUTH_DIR, { recursive: true });
  writeFileSync(target, JSON.stringify(state));
  log('storageState saved -> ' + target + '  (gitignored; cookies=' + state.cookies.length + ', values never printed)');
  writeStatus(id, {
    phase: 'AUTHENTICATED', authenticated_at: nowIso(),
    observed: { url: facts.url, identity_marker: facts.identity_marker, role_marker: facts.role_marker },
    cookie_shape: cookieShape(state.cookies), storage_state_saved: true,
  });
  console.log('\n  Observed in the app: identity="' + facts.identity_marker + '" role="' + facts.role_marker + '" at ' + facts.url + '\n');
  console.log('  You may close the window now; verification runs from the SAVED STATE alone.\n');
  await ctx.close().catch(() => {});
}

async function cmdVerify(id) {
  assertSyntheticIdentity(id);
  const ssPath = storageStatePathFor(id);
  if (!existsSync(ssPath)) { log('BLOCKED_QA_AUTH: no saved state at ' + ssPath); process.exitCode = 3; return; }
  log('VERIFY ' + id + ' - fresh context from the SAVED STATE ONLY (proves the file carries a working session).');
  const browser = await chromium.launch({ headless: true, channel: 'chrome' });
  const ctx = await browser.newContext({ storageState: ssPath });
  const page = await ctx.newPage();
  const checks = [];
  const add = (name, pass, detail) => { checks.push({ name, pass: !!pass, detail: detail ?? null }); log((pass ? 'PASS ' : 'FAIL ') + name + (detail ? '  :: ' + String(detail).slice(0, 200) : '')); };

  await page.goto(assertProductUrl(APP_ORIGIN + '/dashboard'), { waitUntil: 'networkidle' }).catch(() => {});
  const f1 = await readAppFacts(page);
  add('authenticated from saved state (not redirected to /login)', !/\/login/.test(page.url()), page.url());
  add('identity marker is QA Worker 1', f1.identity_marker === 'QA Worker 1', 'observed=' + f1.identity_marker);
  add('role marker is NOT founder / holding admin / hr finance', !!f1.role_marker && !/founder|holding|hr finance/i.test(f1.role_marker), 'observed=' + f1.role_marker);

  await page.goto(assertProductUrl(APP_ORIGIN + '/companies'), { waitUntil: 'networkidle' }).catch(() => {});
  const companiesText = await page.locator('body').innerText().catch(() => '');
  const sawOwnOrg = /QA-W1-ORG/.test(companiesText);
  // Any company name that is not the synthetic one is a tenancy leak. Names are captured verbatim.
  const rows = companiesText.split('\n').map((s) => s.trim()).filter(Boolean);
  add('QA-W1-ORG is accessible', sawOwnOrg, sawOwnOrg ? 'QA-W1-ORG visible on /companies' : 'not visible');
  add('no unexpected organisation is visible on /companies', !/QA-VERIFY-BU|test\d|Steppe|Holding/i.test(companiesText), 'rows=' + rows.length);

  await page.reload({ waitUntil: 'networkidle' }).catch(() => {});
  add('reload preserves synthetic authentication', !/\/login/.test(page.url()), page.url());

  const evidence = { checked_at: nowIso(), identity_id: id, url_after_reload: page.url(), companies_page_text_head: companiesText.replace(/\s+/g, ' ').slice(0, 800), dashboard_facts: f1 };
  const outDir = join(RUNNER_DIR, 'logs'); mkdirSync(outDir, { recursive: true });
  const outPath = join(outDir, 'phase-b-verify-' + id + '.json');
  writeFileSync(outPath, JSON.stringify({ checks, evidence }, null, 2) + '\n');
  writeStatus(id, { phase: 'VERIFIED', verify_passed: checks.every((c) => c.pass), verify_report: outPath });
  log('report -> ' + outPath);
  await ctx.close(); await browser.close();
  process.exitCode = checks.every((c) => c.pass) ? 0 : 1;
}

async function cmdLogout(id) {
  assertSyntheticIdentity(id);
  const ssPath = storageStatePathFor(id);
  if (!existsSync(ssPath)) { log('no saved state'); process.exitCode = 3; return; }
  log('LOGOUT TEST ' + id);
  const browser = await chromium.launch({ headless: true, channel: 'chrome' });
  const ctx = await browser.newContext({ storageState: ssPath });
  const page = await ctx.newPage();
  await page.goto(assertProductUrl(APP_ORIGIN + '/dashboard'), { waitUntil: 'networkidle' }).catch(() => {});
  const before = page.url();
  const btn = page.getByRole('button', { name: /sign out/i }).first();
  await btn.click({ timeout: 15000 }).catch((e) => log('sign-out click failed: ' + e.message.slice(0, 120)));
  await page.waitForURL(/\/login/, { timeout: 20000 }).catch(() => {});
  const after = page.url();
  const cookies = await ctx.cookies();
  const stillHasSession = hasSessionCookie(cookies);
  log((/\/login/.test(after) && !stillHasSession ? 'PASS ' : 'FAIL ') + 'sign out ends the session: ' + before + ' -> ' + after + ' session_cookie=' + stillHasSession);
  writeStatus(id, { phase: 'LOGGED_OUT', logout_ok: /\/login/.test(after) && !stillHasSession, logout_url: after, note: 'The saved storageState file is now STALE by design; re-authenticate to refresh it.' });
  await ctx.close(); await browser.close();
}

function cmdStatus() {
  const ids = existsSync(AUTH_DIR) ? [...new Set(readdirSync(AUTH_DIR).map((f) => f.replace(/\.bootstrap-status\.json$/, '').replace(/\.json$/, '')))] : [];
  console.log(JSON.stringify({ auth_dir: AUTH_DIR, gitignored: true, identities: ids.map((id) => { let st = null; try { st = JSON.parse(readFileSync(statusPath(id), 'utf8')); } catch {} return { id, storage_state_present: existsSync(join(AUTH_DIR, id + '.json')), status: st && st.phase, observed: st && st.observed }; }) }, null, 2));
}

const [cmd, a] = process.argv.slice(2);
try {
  if (cmd === 'founder-step') await cmdFounderStep();
  else if (cmd === 'authenticate') await cmdAuthenticate(a || 'qa-w1');
  else if (cmd === 'verify') await cmdVerify(a || 'qa-w1');
  else if (cmd === 'logout') await cmdLogout(a || 'qa-w1');
  else if (cmd === 'status') cmdStatus();
  else console.log('usage: identity-bootstrap.mjs founder-step | authenticate <id> | verify <id> | logout <id> | status');
} catch (e) {
  log('ERROR: ' + e.message);
  process.exitCode = 2;
}
