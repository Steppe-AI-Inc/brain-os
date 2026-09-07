// PRODUCTION_WRITE_AUTHORITY_NOT_TECHNICALLY_ENFORCED — P1.
//
// This test asserts a property of the MACHINE, not of the code: that the host it runs on holds no
// ambient credential capable of writing production. It is the executable form of the invariant the
// founder set — "a normal dev / QA / Claude session CANNOT WRITE PRODUCTION DB, even if the agent
// ignores instructions, a prompt is wrong, `db push` is run accidentally, or pending migrations
// include unapproved files."
//
// IT IS EXPECTED TO FAIL TODAY. Six independent assertions fail on this laptop right now. That is
// the point: ledger #16 (2026-08-28) recommended exactly this control, it was recorded as "flagged
// for the founder; not implemented", and four weeks later the same class recurred and put two
// explicitly-excluded migrations into production. A recommendation that nothing executes is
// indistinguishable from no recommendation at all. This file is the difference.
//
// Each assertion names a route that was verified to exist on this machine by read-only inspection.
// None of them is hypothetical.
//
// NOTE ON WHERE IT RUNS. It will also fail on any machine deliberately holding founder credentials.
// That is a feature, not a bug to be exempted: the fix is that founder credentials live in a browser
// and in the broker environment, never on a machine that runs agent sessions. An exemption here
// would be a policy, and a policy is the thing this test exists to replace.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import os from 'node:os';
import { classifySecret, EVIDENCE, describeFinding } from '../lib/secret_evidence.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, '..', '..');
const isWin = process.platform === 'win32';

// spawnSync, not execFileSync. execFileSync THROWS on a non-zero exit, and on this platform the
// thrown error arrived with stdout and stderr both empty — so a command that printed the whole
// production project list was captured as no output at all, and the assertion below passed on a
// machine that plainly had authority. spawnSync returns status and output together and never
// throws, so the evidence survives the exit code. (Same lesson, third form: exit status is not
// evidence, and neither is the absence of output from a call that discarded it.)
const run = (cmd, args, opts = {}) => {
  const r = spawnSync(cmd, args, { encoding: 'utf8', timeout: 120000, shell: isWin, ...opts });
  const out = String((r.stdout || '') + (r.stderr || ''));
  return { ok: r.status === 0, status: r.status, out };
};

// ── ROUTE 1: the Supabase CLI token persisted in the OS credential store ────────────────────────
// Not a dotfile — `~/.supabase/` holds only telemetry. It is inherited by every process the user
// spawns, which is precisely how an unattended subagent reached production on 2026-08-28.
const PRODUCTION_REF = 'pvphxgrtdfrudejjhzjk';

test('ROUTE_1_no_ambient_supabase_cli_authority', () => {
  const env = { ...process.env };
  delete env.SUPABASE_ACCESS_TOKEN;
  const r = run('npx', ['--yes', 'supabase@latest', 'projects', 'list'], { env, cwd: os.tmpdir() });
  // EXIT STATUS IS NOT EVIDENCE. The first version of this assertion read `r.ok === false` as
  // "no authority" — but the CLI prints "Cannot find project ref" to stderr and exits non-zero
  // while STILL returning the full project list, because listing projects needs only the account
  // token. The test passed on a machine that plainly had authority. That is this campaign's own
  // most-repeated lesson landing inside the test written to enforce it, so the assertion now reads
  // the OUTPUT: authority is proven by production appearing in the response, not by a status code.
  assert.doesNotMatch(r.out, new RegExp(PRODUCTION_REF),
    'A scrubbed-environment `supabase projects list`, run from a temp directory with no repo and no '
    + 'SUPABASE_ACCESS_TOKEN, returned the production project. This machine holds a working '
    + 'production credential that no environment variable or dotfile reveals, and every agent '
    + 'session inherits it. Remedy: `supabase logout` here AND revoke the token in the dashboard — '
    + 'local deletion does not invalidate a token that has been usable for weeks.');
});

test('ROUTE_1b_no_supabase_credential_in_the_os_store', () => {
  if (!isWin) {
    assert.equal(existsSync(join(os.homedir(), '.supabase', 'access-token')), false,
      '~/.supabase/access-token exists.');
    return;
  }
  const r = run('cmdkey', ['/list']);
  // Any `Supabase CLI:*` target, not just the one name we happen to know — a future
  // `supabase link --password` may create a second entry under a different target.
  assert.doesNotMatch(r.out, /Supabase CLI:/i,
    'The Windows Credential Manager holds a `Supabase CLI:*` credential. It survives shells, '
    + 'sessions and environment scrubbing, and is inherited by every spawned process.');
});

// ── ROUTE 2: a service-role key on disk ─────────────────────────────────────────────────────────
// A real service-role key bypasses RLS entirely with a plain fetch — no CI, no hook, no token, no
// CLI. This test looks for KEY MATERIAL, not for the variable name.
//
// MEASURED ON THIS MACHINE, and it corrects an earlier claim of mine: `web/.env.production.local`,
// `.env.local` and `.env.qa.local` each carry the NAME `SUPABASE_SERVICE_ROLE_KEY`, but the value
// is Vercel's 13-character redaction placeholder `"[REDACTED]"`, not a key. Vercel redacts on
// `env pull` for variables already marked Sensitive. I had read a subagent's report of "each
// contains a SUPABASE_SERVICE_ROLE_KEY" as meaning the value was present, and escalated it as the
// worst live route without checking the bytes. It was not live. The assertion below is written to
// tell those two states apart, because "the variable is named here" and "the key is readable here"
// are entirely different findings and only one of them is an exposure.
test('ROUTE_2_no_service_role_key_readable_on_disk', () => {
  // Four-state evidence (qa/lib/secret_evidence.mjs): ABSENT / REDACTED / PRESENT / VALIDATED_LIVE.
  // Only PRESENT (or VALIDATED_LIVE) is an exposure. REDACTED — the state of this machine — is not.
  const findings = [];
  const found = [];
  const scan = (dir) => {
    let entries = [];
    try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      if (!e.isFile() || !e.name.startsWith('.env')) continue;
      const p = join(dir, e.name);
      let text = '';
      try { text = readFileSync(p, 'utf8'); } catch { continue; }
      for (const line of text.split(/\r?\n/)) {
        if (/^\s*#/.test(line)) continue;
        const m = line.match(/^\s*(SUPABASE_SERVICE_ROLE_KEY|[A-Z0-9_]*SERVICE_ROLE[A-Z0-9_]*)\s*=\s*(.*)$/i);
        if (!m) continue;
        const c = classifySecret(m[2]);
        findings.push(describeFinding(p + ' ' + m[1], m[2]));
        if (c.state === EVIDENCE.PRESENT || c.state === EVIDENCE.VALIDATED_LIVE) { found.push(p); break; }
      }
    }
  };
  scan(REPO);
  scan(join(REPO, 'web'));
  for (const f of findings) console.log('  ' + f);
  assert.deepEqual(found, [],
    'A Supabase service-role key is readable in: ' + found.join(', ') + '. A service-role key '
    + 'bypasses row-level security entirely and needs no CLI, no token and no CI to write '
    + 'production — a plain fetch against the URL in the same file is enough. Deleting these files '
    + 'is NOT the remedy: `vercel env pull` regenerates them. Rotate the key and mark the variable '
    + 'Sensitive in Vercel so it cannot be pulled back.');
});

// CLASSIFIED BY CAPABILITY, NOT PRESENCE (founder instruction, 2026-09-07). Read-only probes showed
// every Sensitive variable is type Secret/Hidden and `env pull` writes [REDACTED], so this session
// cannot obtain the service-role key through Vercel: NOT a DB write route. What the session CAN
// presumably do is `vercel deploy --prod` and `vercel env add/rm` — a web-app production route,
// owned by the GitHub/Vercel identity separation plan. The assertion is kept (a logged-in CLI on an
// agent machine is still a production deploy path) but it is not a P1 DB finding.
test('ROUTE_2b_vercel_session_is_a_web_deploy_route_not_a_db_route', () => {
  const candidates = [
    join(process.env.APPDATA || '', 'xdg.data', 'com.vercel.cli', 'auth.json'),
    join(os.homedir(), '.local', 'share', 'com.vercel.cli', 'auth.json'),
    join(os.homedir(), '.config', 'com.vercel.cli', 'auth.json'),
  ].filter(Boolean);
  const live = candidates.filter((p) => {
    if (!existsSync(p)) return false;
    try { return typeof JSON.parse(readFileSync(p, 'utf8')).token === 'string'; } catch { return false; }
  });
  assert.deepEqual(live, [],
    'A logged-in Vercel CLI session exists at: ' + live.join(', ') + '. While it exists, '
    + '`vercel env pull` regenerates the service-role key checked above, so route 2 cannot be '
    + 'closed by deleting files.');
});

// ── ROUTE 3: environment variables ──────────────────────────────────────────────────────────────
test('ROUTE_3_no_production_credentials_in_the_environment', () => {
  const present = ['SUPABASE_ACCESS_TOKEN', 'SUPABASE_DB_PASSWORD', 'SUPABASE_SERVICE_ROLE_KEY', 'DBTEST_PG_URL']
    .filter((k) => typeof process.env[k] === 'string' && process.env[k].length > 0);
  // DBTEST_PG_URL is only a violation when it points at a Supabase host.
  const bad = present.filter((k) => k !== 'DBTEST_PG_URL' || /supabase|pooler/i.test(process.env[k]));
  assert.deepEqual(bad, [], 'Production credentials are present in this environment: ' + bad.join(', '));
});

// ── ROUTE 5: the GitHub identity — why a protected environment is not yet a boundary ────────────
// An identity that can administer environments can remove its own reviewers, and `workflow` scope
// plus an unprotected master means a session can add a workflow that reads a repo-level secret.
test('ROUTE_5_github_identity_cannot_administer_the_boundary', () => {
  const scopes = run('gh', ['api', '-i', 'user']);
  if (!scopes.ok && /not found|not recognized|no such file/i.test(scopes.out)) return; // gh absent: not this machine's concern
  const header = (scopes.out.match(/x-oauth-scopes:\s*(.*)/i) || [, ''])[1];
  assert.doesNotMatch(header, /\bworkflow\b/,
    'This machine\'s GitHub token carries `workflow` scope, so a session can add or edit a workflow '
    + 'and push it. Scopes: ' + header.trim());

  const perm = run('gh', ['api', 'repos/Steppe-AI-Inc/brain-os', '--jq', '.permissions.admin']);
  if (perm.ok) {
    assert.notEqual(perm.out.trim(), 'true',
      'This machine\'s GitHub identity has ADMIN on the repository. It can therefore create, edit '
      + 'or delete the protected environment and its required reviewers — so a protected '
      + 'environment is not an authority boundary against this machine until the identity is '
      + 'downgraded to Contents/PR write with no Administration and no Workflows.');
  }
});

test('ROUTE_5b_no_repo_level_production_secret', () => {
  const r = run('gh', ['api', 'repos/Steppe-AI-Inc/brain-os/actions/secrets', '--jq', '.secrets[].name']);
  if (!r.ok) return; // cannot read secrets => already lacks the permission, which is the desired end state
  const names = r.out.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
  assert.deepEqual(names, [],
    'Repository-level Actions secrets exist: ' + names.join(', ') + '. A repo-level secret is '
    + 'readable by ANY workflow on ANY branch, so it is a production-write route that bypasses the '
    + 'approval gate entirely. Production secrets belong to a protected environment, not the repo.');
});
