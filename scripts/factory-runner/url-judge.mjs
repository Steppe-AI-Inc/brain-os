// THE URL JUDGE, ON ITS OWN AND PURE. It used to live in db.mjs, and runner-env.mjs imported it from there for the shared
// judge - which made db.mjs load, and capture FACTORY_RUNNER_PG_URL, the moment anything imported the loader: a harness that
// imported the loader and then called ensureRunnerEnv() got a db.mjs frozen with no URL (found 2026-09-24 by the live-plane
// acceptance; it would have broken two_machine_real.mjs). No module-level state here, nothing read at import time.
// THE URL IS JUDGED BEFORE A SOCKET IS OPENED, and the judgement fails closed. Two machines sharing one
// control plane reach it over a network, and the three ways that goes wrong are all in the URL: it names
// the superuser; it names the production project; or it crosses a network in the clear. A connection that
// is refused here never sends the password anywhere. Loopback is the one exception to the TLS rule - it
// does not cross a network - and it is the only exception.
const LOOPBACK = /^(127\.\d+\.\d+\.\d+|\[?::1\]?|localhost)$/i;
const TLS_MODES = ['require', 'verify-ca', 'verify-full'];
// The Brain OS production project. A host that names it is the product database whatever else the URL says.
const PRODUCTION_HOST_MARKS = ['pvphxgrtdfrudejjhzjk'];
/** @returns {string|null} why this URL must not be connected to, or null when it may be. Pure; no I/O. */
export function assessUrl(url) {
  if (!url) return 'FACTORY_RUNNER_PG_URL is not set';
  let u;
  try { u = new URL(url); } catch { return 'FACTORY_RUNNER_PG_URL is not a URL'; }
  if (!/^postgres(ql)?:$/.test(u.protocol)) return 'FACTORY_RUNNER_PG_URL is not a postgresql:// URL';
  // THE QUERY STRING CANNOT OVERRIDE WHO OR WHERE. pg honours ?user=, ?host=, ?port=, ?password= and more OVER the URL's own
  // parts, and takes the LAST of a repeated key: '?user=postgres' made a least-privilege URL connect as the superuser and
  // '?sslmode=require&sslmode=disable' connected in the clear, both passing the checks below, which read the URL's own parts
  // (independent verification 2026-09-24, round 3). Only the TLS and client settings the Factory writes may appear, once each.
  const ALLOWED_QUERY = ['sslmode', 'sslrootcert', 'sslcert', 'sslkey', 'uselibpqcompat', 'application_name', 'connect_timeout', 'options'];
  const keys = [...u.searchParams.keys()];
  const foreign = [...new Set(keys.filter((k) => !ALLOWED_QUERY.includes(k)))];
  if (foreign.length) {
    return 'FACTORY_RUNNER_PG_URL carries ' + foreign.map((k) => '?' + k + '=').join(', ') + ' in its query string - pg lets query settings '
      + 'override the URL itself (the user, the host, TLS). Write the connection in the URL; only ' + ALLOWED_QUERY.join(', ') + ' may be query parameters.';
  }
  const repeated = [...new Set(keys.filter((k, i) => keys.indexOf(k) !== i))];
  if (repeated.length) return 'FACTORY_RUNNER_PG_URL repeats ' + repeated.join(', ') + ' in its query string - pg uses the LAST value, which is not the one checked here.';
  // a malformed escape in the user name is refused, not thrown (the supervisor used to die on it with no log line)
  let username;
  try { username = decodeURIComponent(u.username || ''); } catch { return 'FACTORY_RUNNER_PG_URL has a malformed percent-escape in its user name'; }
  // `postgres`, `supabase_admin`, and Supabase's pooler form `postgres.<ref>` are all the superuser.
  if (username === 'postgres' || username === 'supabase_admin' || /^postgres\./.test(username)) {
    return 'FACTORY_RUNNER_PG_URL connects as the `postgres` superuser. A least-privilege accessor pointed at '
      + 'a superuser is not least privilege; it is the same authority with a longer variable name.';
  }
  const host = (u.hostname || '').replace(/^\[|\]$/g, '');
  // the WHOLE url is searched - a pooler names the project in `options=project=<ref>`, not in the host
  // Decoded escape by escape, never all-or-nothing: one undecodable sequence anywhere (%C0, %zz) made the whole-URL decode throw
  // and the marks were then searched in the RAW text, so '%70vphx...' walked past the production guard while pg, which decodes
  // each part on its own, connected to the production tenant (verification 2026-09-24, round 4). Both spellings are searched.
  const lenient = String(url).replace(/%([0-9a-fA-F]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
  const lower = lenient.toLowerCase() + '\n' + String(url).toLowerCase();
  const extra = (process.env.FACTORY_FORBIDDEN_HOST_MARKS || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
  for (const mark of [...PRODUCTION_HOST_MARKS, ...extra]) {
    if (mark && lower.includes(mark.toLowerCase())) {
      return 'FACTORY_RUNNER_PG_URL names the PRODUCTION project (' + mark + '). The control plane is a separate, '
        + 'non-production database; nothing in the Factory may hold a connection into the product.';
    }
  }
  if (!LOOPBACK.test(host)) {
    const mode = (u.searchParams.get('sslmode') || '').toLowerCase();
    if (!TLS_MODES.includes(mode)) {
      return 'FACTORY_RUNNER_PG_URL reaches ' + host + ' over a network with sslmode=' + (mode || '(none)')
        + '. A shared control plane is reached over TLS or not at all: add ?sslmode=require (verify-full when the '
        + 'server certificate is known). Only a loopback address may connect in the clear.';
    }
  }
  return null;
}

