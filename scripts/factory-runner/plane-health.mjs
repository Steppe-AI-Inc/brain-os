#!/usr/bin/env node
// PLANE HEALTH FOR A SHARED, NETWORKED CONTROL PLANE.  `node scripts/factory-runner/plane-health.mjs [--json] [--role r]`
//
// `node.mjs health` proves one node can reach one database link by link. Two machines sharing one plane over a
// network add questions that a loopback plane never had to answer, and each is a separate row here because each
// fails for a different reason and has a different fix:
//
//   * is the connection ACTUALLY encrypted (not merely requested)?          pg_stat_ssl for this backend
//   * is the role what least privilege means, on the server, not in a URL?  pg_roles attributes
//   * does the SERVER refuse DDL from this role (the boundary, not the client's second layer)?
//   * is the whole schema there (001, 002, 003), so both nodes run the same claim path?
//   * do the two clocks agree well enough for LEASES to mean the same thing on both machines?
//   * is the round trip short enough that a heartbeat every lease/3 cannot miss?
//   * which other nodes has this plane seen recently - is anyone else here?
//
// It never prints the URL or the password. Exit 0 when every row passes, 1 otherwise.
import { fileURLToPath } from 'node:url';
import { hostname } from 'node:os';
import * as db from './db.mjs';
import { health, nodeId, capabilities } from './node.mjs';
import { registerNode } from './claim.mjs';

const args = process.argv.slice(2);
const json = args.includes('--json');
// --role is an explicit statement (the bootstrap passes the role its operator gave). Without it the role the plane holds is KEPT:
// the default 'generic' demoted a running verifier to generic whenever this was run from a plain shell (verification round 4).
const roleArg = args.includes('--role') ? args[args.indexOf('--role') + 1] : null;
const ROLES = ['generic', 'verifier', 'release_broker'];

export async function planeHealth({ role: stated = roleArg } = {}) {
  let role = stated;
  const rows = [];
  let ok = true;
  const say = (good, label, detail) => { if (!good) ok = false; rows.push({ ok: good, label, detail: detail || '' }); };

  const base = await health();
  if (!base.ok) { say(false, 'node health (see the lines above)', base.reason || ''); return { ok: false, rows, base }; }
  say(true, 'node health passed (node.mjs health)');

  const url = process.env.FACTORY_RUNNER_PG_URL || '';
  let host = '?';
  try { host = new URL(url).hostname; } catch { /* judged by db.mjs already */ }
  const loopback = /^(127\.\d+\.\d+\.\d+|\[?::1\]?|localhost)$/i.test(host.replace(/^\[|\]$/g, ''));

  await db.withClient(async (c) => {
    // 1. encryption in use on THIS backend
    try {
      const s = await c.query('select ssl, version, cipher from pg_stat_ssl where pid = pg_backend_pid()');
      const r = s.rows[0] || {};
      if (loopback) rows.push({ ok: true, label: 'TLS ' + (r.ssl ? 'in use (' + r.version + ', ' + r.cipher + ')' : 'not in use - loopback, does not cross a network'), detail: '' });
      else say(r.ssl === true, 'TLS is IN USE on this connection' + (r.ssl ? ' (' + r.version + ', ' + r.cipher + ')' : ''),
        r.ssl ? '' : 'the server accepted a plaintext session across a network - fix the server (ssl=on, pg_hba hostssl) before any node uses it');
    } catch (e) { say(false, 'cannot read pg_stat_ssl', String(e.message).slice(0, 120)); }

    // 2. the role's attributes, on the server
    try {
      const a = (await c.query('select rolsuper, rolcreatedb, rolcreaterole, rolbypassrls, rolreplication, rolinherit from pg_roles where rolname = current_user')).rows[0];
      const bad = ['rolsuper', 'rolcreatedb', 'rolcreaterole', 'rolbypassrls', 'rolreplication'].filter((k) => a && a[k]);
      say(a && bad.length === 0, 'the role holds no create / grant / bypass-RLS / replication attribute', bad.length ? 'has ' + bad.join(', ') : '');
    } catch (e) { say(false, 'cannot read the role attributes', String(e.message).slice(0, 120)); }

    // 3. the SERVER refuses DDL from this role (withClient does not classify statements; that is the point here)
    try {
      await c.query('create table factory.__plane_health_probe (x int)');
      // it succeeded: the boundary is missing; remove the evidence and say so
      try { await c.query('drop table factory.__plane_health_probe'); } catch { /* leave it visible */ }
      say(false, 'the server refuses DDL from the runner role', 'CREATE TABLE succeeded - the role owns the schema or holds CREATE; revoke it (the client refusal is the second layer, not the boundary)');
    } catch (e) {
      say(e.code === '42501', 'the server refuses DDL from the runner role (' + (e.code || '?') + ')', e.code === '42501' ? '' : String(e.message).slice(0, 120));
    }

    // 4. the whole schema: 001 + 002 + 003
    try {
      const t = (await c.query("select table_name from information_schema.tables where table_schema = 'factory'")).rows.map((r) => r.table_name);
      const need = ['nodes', 'work_orders', 'work_order_dependencies', 'agent_runs', 'surface_locks', 'checkpoints', 'founder_notifications', 'director_lease'];
      const missing = need.filter((x) => !t.includes(x));
      say(missing.length === 0, 'schema files 001 and 002 are applied (' + t.length + ' tables)', missing.length ? 'missing ' + missing.join(', ') + ' - run provision-control-plane.mjs again (it applies every file)' : '');
      const cols = (await c.query("select table_name || '.' || column_name f from information_schema.columns where table_schema = 'factory' and ((table_name = 'work_orders' and column_name = 'weight') or (table_name = 'nodes' and column_name = 'max_heavy') or (table_name = 'agent_runs' and column_name in ('authoring_run_id','termination_reason','actual_model')))")).rows.map((r) => r.f);
      const needCols = ['work_orders.weight', 'nodes.max_heavy', 'agent_runs.termination_reason', 'agent_runs.actual_model'];
      const missCols = needCols.filter((x) => !cols.includes(x));
      say(missCols.length === 0, 'schema file 003 and the run columns are applied', missCols.length ? 'missing ' + missCols.join(', ') : '');
    } catch (e) { say(false, 'cannot read the schema', String(e.message).slice(0, 120)); }

    // 5. clocks: a lease is compared against the SERVER clock by every node, so what matters is each node's
    //    skew from the server, and it must be small against the lease (120 s default, heartbeat every 40 s).
    try {
      const t0 = Date.now();
      const r = await c.query('select extract(epoch from clock_timestamp()) * 1000 as ms');
      const t1 = Date.now();
      const rtt = t1 - t0;
      const skew = Number(r.rows[0].ms) - (t0 + rtt / 2);
      say(Math.abs(skew) < 5000, 'clock skew to the plane is ' + Math.round(skew) + ' ms (limit 5000)', Math.abs(skew) >= 5000 ? 'leases would expire at different moments on different machines - fix the machine clock (NTP)' : '');
      say(rtt < 5000, 'round trip ' + rtt + ' ms (limit 5000; heartbeat is every lease/3)', rtt >= 5000 ? 'a heartbeat could miss its lease' : '');
    } catch (e) { say(false, 'cannot read the plane clock', String(e.message).slice(0, 120)); }

    // 6. this node's role on the plane, and who else is here
    try {
      const held = (await c.query('select security_role from factory.nodes where node_id = $1', [nodeId()])).rows[0];
      if (!role) role = held ? held.security_role : 'generic';
      if (!ROLES.includes(role)) throw new Error('unknown role ' + role + ' (generic | verifier | release_broker)');
      // registered without liveness: only a working node stamps it (this check made a dead node read ALIVE - final verification),
      // and an existing record is the running worker's (its commit and handler version): only a role STATED with --role is written
      await registerNode({ nodeId: nodeId(), capabilities: capabilities(), securityRole: role, platform: process.platform + ' ' + hostname(), agentVersion: process.version, stamp: false, onlyIfAbsent: true });
      if (held && stated && held.security_role !== role) await db.write('update factory.nodes set security_role = $2 where node_id = $1', [nodeId(), role]);
      const me = (await c.query('select security_role from factory.nodes where node_id = $1', [nodeId()])).rows[0];
      say(me && me.security_role === role, 'registered on the plane as ' + role + ' with hostname ' + hostname()
        + (!stated && held ? ' (the role the plane holds, kept - pass --role to state one)' : held && held.security_role !== role ? ' (the plane held ' + held.security_role + '; a running worker of this node re-asserts its own role within a minute)' : ''));
      const others = (await c.query("select node_id, security_role, platform, last_heartbeat_at from factory.nodes where node_id <> $1 and last_heartbeat_at > now() - interval '24 hours' order by last_heartbeat_at desc", [nodeId()])).rows;
      rows.push({ ok: true, label: others.length + ' other node(s) seen on this plane in 24 h' + (others.length ? ': ' + others.map((o) => o.node_id.slice(0, 13) + ' ' + o.security_role + ' [' + o.platform + ']').join('; ') : ''), detail: '' });
      const hosts = new Set(others.map((o) => String(o.platform).split(' ')[1]).filter(Boolean));
      hosts.delete(hostname());
      rows.push({ ok: true, label: hosts.size ? 'other MACHINES on this plane: ' + [...hosts].join(', ') : 'no other machine has registered yet - the two-machine acceptance needs one', detail: '' });
    } catch (e) { say(false, 'cannot register or list nodes', String(e.message).slice(0, 120)); }
  });

  return { ok, rows, host, role };
}

if (process.argv[1] && /plane-health\.mjs$/.test(process.argv[1])) {
  const r = await planeHealth();
  console.log('');
  console.log('plane health (' + (r.host || '?') + ')');
  for (const row of r.rows) console.log('  ' + (row.ok ? 'ok   ' : 'FAIL ') + row.label + (row.detail ? '  — ' + row.detail : ''));
  console.log('');
  console.log(r.ok ? 'PLANE HEALTHY for this node.' : 'PLANE NOT HEALTHY — see the failing row.');
  if (json) console.log(JSON.stringify(r));
  process.exit(r.ok ? 0 : 1);
}
