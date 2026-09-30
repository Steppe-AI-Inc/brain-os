// THE ROWS THE MIGRATION WRITES (contract §1 "What a candidate migration writes"; VERIFICATION_SPEC §3.5), read before and after the
// migration AS THE PLANE'S SUPERUSER (so that no row-level security policy hides a row), over every table in every schema outside the
// system catalogs. The implementer's developer rows W1-W6; the verifier's own read-backs govern.
//
//   snapshot(c)             every table (relkind r / p) outside pg_catalog, information_schema, pg_toast* and pg_temp*: its oid, its
//                           columns in attnum order, and the sorted multiset of its row hashes (sha256 of the row's text over those
//                           columns), in one REPEATABLE READ READ ONLY transaction with the session formatting pinned (timezone UTC,
//                           DateStyle ISO/YMD, IntervalStyle postgres, extra_float_digits 3, bytea_output hex); plus, outside the
//                           system schemas, every function (its oid, and a digest of its body, argument list with defaults and SET
//                           clauses), every column default (table.column -> its expression) and every view's definition, so that W5
//                           scans what the migration CHANGED as well as what it created (a default set on a pre-existing column, a
//                           function or view replaced in place)
//   snapshot(c, before)     the same, but a table that existed before is hashed over the columns it had before (the pre-existing
//                           columns), so a column the migration adds never counts as a changed value
//   rowChecks(c, before, after, { operator, policies })   the rows W1-W6 as [{ id, ok, detail }]
const qi = (s) => '"' + String(s).split('"').join('""') + '"';
const SYSTEM = `n.nspname not in ('pg_catalog', 'information_schema') and n.nspname not like 'pg_toast%' and n.nspname not like 'pg_temp%'`;

export async function snapshot(c, before = null) {
  await c.query('begin transaction isolation level repeatable read read only');
  try {
    for (const s of ["set local timezone = 'UTC'", "set local datestyle = 'ISO, YMD'", "set local intervalstyle = 'postgres'",
      'set local extra_float_digits = 3', "set local bytea_output = 'hex'"]) await c.query(s);
    const rels = (await c.query(`select c.oid::bigint::text oid, n.nspname s, c.relname t from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where c.relkind in ('r', 'p') and ${SYSTEM} order by 2, 3`)).rows;
    const tables = {};
    for (const r of rels) {
      const name = r.s + '.' + r.t;
      const cols = (await c.query(`select a.attname n from pg_attribute a where a.attrelid = $1::bigint::oid and a.attnum > 0 and not a.attisdropped order by a.attnum`, [r.oid])).rows.map((x) => x.n);
      const hashCols = before && before.tables[name] ? before.tables[name].cols.filter((x) => cols.includes(x)) : cols;
      const rows = (await c.query(`select encode(pg_catalog.sha256(convert_to(row(${hashCols.map((x) => 'x.' + qi(x)).join(', ') || 'null'})::text, 'UTF8')), 'hex') h
          from ${qi(r.s)}.${qi(r.t)} x order by 1`)).rows.map((x) => x.h);
      tables[name] = { oid: r.oid, cols, hashCols, rows };
    }
    const fnRows = (await c.query(`select p.oid::bigint::text o, md5(${FN_TEXT}) h from pg_proc p join pg_namespace n on n.oid = p.pronamespace where ${SYSTEM}`)).rows;
    const procs = fnRows.map((x) => x.o);
    const procSig = Object.fromEntries(fnRows.map((x) => [x.o, x.h]));
    const defaults = Object.fromEntries((await c.query(DEFAULTS_SQL)).rows.map((x) => [x.k, x.t]));
    const views = Object.fromEntries((await c.query(VIEWS_SQL)).rows.map((x) => [x.o, x.t]));
    return { tables, procs, procSig, defaults, views };
  } finally { await c.query('rollback'); }
}
// what W5 reads of a function: its body, its argument list (argument defaults included) and its SET clauses
const FN_TEXT = `coalesce(p.prosrc, '') || ' ' || pg_catalog.pg_get_function_arguments(p.oid) || ' ' || coalesce(pg_catalog.array_to_string(p.proconfig, ' '), '')`;
const DEFAULTS_SQL = `select d.adrelid::regclass::text || '.' || a.attname k, pg_get_expr(d.adbin, d.adrelid) t from pg_attrdef d
    join pg_attribute a on a.attrelid = d.adrelid and a.attnum = d.adnum join pg_class c on c.oid = d.adrelid join pg_namespace n on n.oid = c.relnamespace
    where ${SYSTEM} order by 1`;
const VIEWS_SQL = `select c.oid::bigint::text o, 'view ' || c.oid::regclass::text || ': ' || pg_get_viewdef(c.oid) t from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where ${SYSTEM} and c.relkind in ('v', 'm') order by 1`;

// an identifying constant: a UUID, a 40- or 64-hex digest, a base64url key or signature (mixed case with a digit: never a SQL identifier),
// a PEM key, an ssh key, a key id
const CONSTANT_RE = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b|(?<![0-9a-f])(?:[0-9a-f]{64}|[0-9a-f]{40})(?![0-9a-f])|(?<![A-Za-z0-9_-])(?=[A-Za-z0-9_-]*[A-Z])(?=[A-Za-z0-9_-]*[0-9])(?:[A-Za-z0-9_-]{43}|[A-Za-z0-9_-]{86})(?![A-Za-z0-9_-])|-----BEGIN [A-Z ]*KEY-----|ssh-ed25519 |\b(?:dev|prod|production|release)-key-[0-9a-z]+\b/gi;

/**
 * every identifying constant held by an object the migration defined OR CHANGED: a function that is new or whose body, arguments or
 * SET clauses changed (CREATE OR REPLACE keeps the oid); a column default that is new or whose expression changed (on a new table,
 * or set on a pre-existing column); a view that is new or whose definition changed; and every policy, trigger and constraint
 */
export async function objectConstants(c, before, allow = []) {
  const fns = (await c.query(`select 'function ' || p.oid::regprocedure::text w, p.oid::bigint::text o, ${FN_TEXT} t, md5(${FN_TEXT}) h
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace where ${SYSTEM}`)).rows;
  const defaults = (await c.query(DEFAULTS_SQL)).rows;
  const views = (await c.query(VIEWS_SQL)).rows;
  const texts = [
    ...fns.filter((x) => before.procSig[x.o] !== x.h),
    ...defaults.filter((x) => before.defaults[x.k] !== x.t).map((x) => ({ w: 'default ' + x.k, t: x.t })),
    ...views.filter((x) => before.views[x.o] !== x.t).map((x) => ({ w: x.t.split(':')[0], t: x.t })),
    ...(await c.query(`select 'policy ' || p.polname w, coalesce(pg_get_expr(p.polqual, p.polrelid), '') || ' ' || coalesce(pg_get_expr(p.polwithcheck, p.polrelid), '') t
        from pg_policy p join pg_class c on c.oid = p.polrelid join pg_namespace n on n.oid = c.relnamespace where ${SYSTEM}`)).rows,
    ...(await c.query(`select 'trigger ' || t.tgname w, encode(t.tgargs, 'escape') t from pg_trigger t join pg_class c on c.oid = t.tgrelid join pg_namespace n on n.oid = c.relnamespace
        where ${SYSTEM} and not t.tgisinternal`)).rows,
    ...(await c.query(`select 'constraint ' || o.conname w, pg_get_constraintdef(o.oid) t from pg_constraint o join pg_namespace n on n.oid = o.connamespace where ${SYSTEM}`)).rows,
  ];
  const found = [];
  for (const x of texts) {
    // comments carry no constant into behaviour; a function's comments are part of prosrc, so they are removed first
    const code = String(x.t || '').replace(/--[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
    for (const m of code.matchAll(CONSTANT_RE)) if (!allow.includes(m[0].toLowerCase())) found.push(x.w + ': ' + m[0].slice(0, 20));
  }
  return found;
}

/** W1-W6 as rows. operator: the operator tenant id; policies: the ids of contract §1's two policy rows */
export async function rowChecks(c, before, after, { operator, policies }) {
  const out = [];
  const row = (id, ok, detail) => out.push({ id, ok: !!ok, detail });
  const preTables = Object.keys(before.tables);
  const created = Object.keys(after.tables).filter((t) => !before.tables[t]);
  const sameMultiset = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);
  // W1 every pre-existing table, every schema: the same rows, value for value, over the columns it had
  const changedPre = preTables.filter((t) => !after.tables[t] || !sameMultiset(before.tables[t].rows, after.tables[t].rows)
    || JSON.stringify(after.tables[t].hashCols) !== JSON.stringify(before.tables[t].cols));
  row('W1 no pre-existing table in any schema (' + preTables.length + ' tables outside the system catalogs) gained, lost or changed a row: its row hashes over every column it had are equal before and after the migration',
    preTables.length > 0 && changedPre.length === 0, changedPre.map((t) => t + ' (' + before.tables[t].rows.length + ' -> ' + (after.tables[t] ? after.tables[t].rows.length : 'dropped') + ' rows)').join(', '));
  // W2 every table the migration created, in any schema: only the one operator tenant row and contract §1's two policy rows
  const counts = Object.fromEntries(created.map((t) => [t, after.tables[t].rows.length]));
  const allowed = { 'factory.tenants': 1, 'factory.verification_policies': 2 };
  const extra = created.filter((t) => counts[t] !== (allowed[t] || 0));
  const tenant = created.includes('factory.tenants') ? (await c.query(`select to_jsonb(t) j from factory.tenants t`)).rows.map((r) => r.j) : [];
  const tenantRefs = tenant.filter((j) => j.tenant_id !== operator || j.is_operator !== true
    || Object.entries(j).some(([k, v]) => k !== 'tenant_id' && typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)));
  const pol = created.includes('factory.verification_policies') ? (await c.query(`select policy_id::text p from factory.verification_policies order by 1`)).rows.map((r) => r.p) : [];
  row('W2 the tables the migration created (' + created.length + ', any schema) hold only the one operator tenant row - holding no user id and referring to no computer, principal, credential or envelope - and contract §1\'s two policy rows; every other one, the policy-version table included, is empty',
    created.length >= 19 && extra.length === 0 && tenantRefs.length === 0 && JSON.stringify(pol) === JSON.stringify([...policies].sort()),
    JSON.stringify({ notEmpty: extra.map((t) => t + '=' + counts[t]), tenant: tenant.map((j) => Object.keys(j).join(',')), tenantRefs: tenantRefs.length, policies: pol }));
  // W3 the named authority records (§3.5): none written, and no S-16(a) binding
  const named = ['computers', 'agent_principals', 'node_credentials', 'authorization_envelopes', 'pairing_codes', 'enrollments', 'tenant_admins',
    'releases', 'release_revocations', 'certifications'];
  const n = (await c.query(`select ${named.map((t) => `(select count(*) from factory.${t})::int ${t}`).join(', ')},
      (select count(*) from factory.computers where s16a_bound_at is not null or s16a_bound_by is not null)::int bound`)).rows[0];
  row('W3 no computer, agent principal, credential, envelope, pairing code, enrollment attempt, tenant_admins, release, release revocation or certification row, and no S-16(a) binding',
    Object.values(n).every((x) => x === 0), JSON.stringify(n));
  // W4 a column the migration added to a pre-existing table: on a pre-existing row it refers to no computer, principal, credential or
  // envelope (a reference column - by name or by its foreign key - is null; no added value is an enrolled node id or an id of those)
  const added = [];
  for (const t of preTables) if (after.tables[t]) for (const col of after.tables[t].cols.filter((x) => !before.tables[t].cols.includes(x))) added.push({ t, col });
  // (a foreign-key column that points at such a record's own id; the tenant_id of a composite key points at the tenant, not at it)
  const refCols = new Set((await c.query(`select c.oid::regclass::text || '.' || a.attname k from pg_constraint o join pg_class c on c.oid = o.conrelid,
      unnest(o.conkey, o.confkey) as k(src, dst)
      join pg_attribute a on a.attnum = k.src
      join pg_attribute b on b.attnum = k.dst
      where o.contype = 'f' and a.attrelid = o.conrelid and b.attrelid = o.confrelid and b.attname <> 'tenant_id'
        and o.confrelid in ('factory.computers'::regclass, 'factory.agent_principals'::regclass, 'factory.node_credentials'::regclass, 'factory.authorization_envelopes'::regclass)`)).rows.map((r) => r.k));
  const ids = new Set((await c.query(`select computer_id::text i from factory.computers union all select principal_id::text from factory.agent_principals
      union all select credential_id::text from factory.node_credentials`)).rows.map((r) => r.i));
  const bad = [], observed = [];
  for (const { t, col } of added) {
    const [s, tb] = t.split('.');
    const vals = (await c.query(`select ${qi(col)}::text v, count(*)::int n from ${qi(s)}.${qi(tb)} group by 1 order by 1 limit 50`)).rows;
    const nonNull = vals.filter((v) => v.v !== null);
    // (a machine fingerprint identifies a computer: S-16(a) and S-14 bind records by it)
    const isRef = refCols.has(t + '.' + col) || /computer|principal|credential|envelope|fingerprint/i.test(col);
    if (isRef && nonNull.length) bad.push(t + '.' + col + ' (a reference column) holds ' + nonNull.map((v) => v.n).reduce((a, b) => a + b, 0) + ' values');
    for (const v of nonNull) if (ids.has(v.v) || /^node-[0-9a-f]{32}$/.test(v.v)) bad.push(t + '.' + col + ' = ' + v.v.slice(0, 20));
    if (nonNull.length) observed.push(t + '.' + col + ': ' + nonNull.map((v) => (col === 'tenant_id' && v.v === operator ? 'operator tenant' : v.v.slice(0, 24)) + ' x' + v.n).join(', '));
  }
  row('W4 in every column the migration added to a pre-existing table (' + added.length + '), no pre-existing row holds a value that refers to a computer, principal, credential or envelope (reference columns - by foreign key, or by name: computer, principal, credential, envelope, a machine fingerprint - are null; no value is such an id or an enrolled node id)',
    added.length > 0 && bad.length === 0, bad.length ? bad.join(' | ') : 'non-null added values: ' + (observed.join(' ; ') || 'none'));
  // W5 no object the migration defines or changes holds an identifying constant (the seeded rows' own ids aside, which exist on every
  // plane): new objects, and pre-existing functions, defaults and views whose text the migration changed
  const constants = await objectConstants(c, before, [operator, ...policies].map((x) => x.toLowerCase()));
  row('W5 no object the migration defines or changes (a function new or replaced, a column default new or set on a pre-existing column, a view, policy, trigger, constraint) holds a constant that identifies a user, a computer, a principal, a credential, a signing key or an envelope (the seeded operator tenant and policy ids aside)',
    constants.length === 0, constants.slice(0, 8).join(' | '));
  // W6 no column default writes the S-16(a) binding
  const binding = (await c.query(`select a.attname n from pg_attrdef d join pg_attribute a on a.attrelid = d.adrelid and a.attnum = d.adnum
      where d.adrelid = 'factory.computers'::regclass and a.attname in ('s16a_bound_at', 's16a_bound_by')`)).rows.map((r) => r.n);
  row('W6 no column default writes the S-16(a) binding (s16a_bound_at / s16a_bound_by have none)', binding.length === 0, binding.join(','));
  return out;
}
