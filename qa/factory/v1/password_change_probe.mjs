#!/usr/bin/env node
// PASSWORD-CHANGE PROBE (S-8's stated limit; founder request 2026-10-03) - ONE targeted question about the live Brain OS Auth
// configuration: can an authenticated session change its account's password WITHOUT the current password? If it can, whoever holds
// a stolen founder session can set a new password, sign in with it and so present a "fresh password entry" to Factory -> Update; the
// password re-entry then adds nothing beyond the session (S-8 says exactly this, and that the setting is the founder's).
//
// NON-MUTATING: the probe asks Brain OS Auth to set the password the test account ALREADY HAS, with nothing but a fresh session (no
// current password, no reauthentication nonce). Brain OS Auth refuses that either way, and the refusal says which rule refused it:
//   * a current-password or reauthentication requirement      -> NOT VULNERABLE (exit 0): a session alone cannot change the password
//   * its same-password rule (same_password)                  -> VULNERABLE (exit 2): the request passed every check a session could
//                                                                 meet, and only "it is the same password" stopped it
//   * anything else (a password-strength rule, an outage...)  -> UNKNOWN (exit 1), the code shown
// The session is fresh (made by the probe), which is what a stolen session usually is: a "recently signed in" exemption is measured too.
//
// NEVER the founder's account, and never the founder's password typed into a program (S-12): a dedicated test account of the Brain OS
// project under test, whose password is given in the environment variable PROBE_PASSWORD (read once and removed; never printed, never
// on a command line). The probe signs its session out at the end.
//   PROBE_PASSWORD=... node qa/factory/v1/password_change_probe.mjs --auth https://<ref>.supabase.co --anon-key <public anon key> --email <test account>
const args = {}; const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i += 2) args[String(argv[i]).replace(/^--/, '')] = argv[i + 1];
const password = process.env.PROBE_PASSWORD || '';
delete process.env.PROBE_PASSWORD;
const say = (s) => console.log(s);

export function classify(status, body) {
  const code = String((body && (body.error_code || body.code)) || '').toLowerCase();
  const text = String((body && (body.msg || body.message || body.error_description || body.error)) || '').toLowerCase();
  if (/current_password|reauthentication/.test(code) || /current password|reauthenticat/.test(text)) return { verdict: 'NOT VULNERABLE', exit: 0, code: code || status };
  if (code === 'same_password' || /should be different from the old password/.test(text)) return { verdict: 'VULNERABLE', exit: 2, code: code || status };
  return { verdict: 'UNKNOWN', exit: 1, code: code || String(status) };
}

async function main() {
  const auth = String(args.auth || '').replace(/\/+$/, ''), anon = String(args['anon-key'] || ''), email = String(args.email || '');
  if (!/^https:\/\/[a-z0-9]{20}\.supabase\.co$/.test(auth) || !anon || !/^[^@\s]+@[^@\s]+$/.test(email) || !password) {
    say('usage: PROBE_PASSWORD=<test account password> node qa/factory/v1/password_change_probe.mjs --auth https://<ref>.supabase.co --anon-key <key> --email <test account>');
    return 1;
  }
  const h = { apikey: anon, 'content-type': 'application/json' };
  const t = await fetch(auth + '/auth/v1/token?grant_type=password', { method: 'POST', headers: h, body: JSON.stringify({ email, password }), signal: AbortSignal.timeout(20000) });
  const tok = await t.json().catch(() => ({}));
  if (t.status !== 200 || !tok.access_token) { say('UNKNOWN - the test account could not sign in (HTTP ' + t.status + ' ' + (tok.error_code || tok.error || '') + ')'); return 1; }
  try {
    const u = await fetch(auth + '/auth/v1/user', { method: 'PUT', headers: { ...h, authorization: 'Bearer ' + tok.access_token }, body: JSON.stringify({ password }), signal: AbortSignal.timeout(20000) });
    const body = await u.json().catch(() => ({}));
    if (u.status === 200) { say('VULNERABLE - Brain OS Auth ACCEPTED the request with a session alone (and the same password)'); return 2; }
    const c = classify(u.status, body);
    say(c.verdict + ' - Brain OS Auth refused a password change made with a session alone: HTTP ' + u.status + ' ' + c.code);
    if (c.verdict === 'VULNERABLE') say('  the minimum fix is Brain OS Auth requiring the current password for a password change (production auth configuration: the founder\'s)');
    return c.exit;
  } finally {
    await fetch(auth + '/auth/v1/logout?scope=local', { method: 'POST', headers: { ...h, authorization: 'Bearer ' + tok.access_token }, signal: AbortSignal.timeout(20000) }).catch(() => {});
  }
}

if (/password_change_probe\.mjs$/.test(process.argv[1] || '')) process.exitCode = await main();
