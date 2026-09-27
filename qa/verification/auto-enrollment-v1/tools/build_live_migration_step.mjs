// Director instrument (never connects to a database): builds the live-migration step of AC-11 and WO-1's founder boundary. It is
// the one file the founder applies to the live Factory plane, and the file the verifier runs on each disposable copy
// (VERIFICATION_SPEC §3.3). The implementer supplies only the migration; it never writes or edits this tool or its output.
// It reads its inputs and writes one NEW file (never an existing one). Nothing else.
// usage: node build_live_migration_step.mjs <out.sql> <migration.sql> [<migration.sql> ...]
//   <migration.sql>  the candidate migration (contract §1): every .sql file the candidate adds under supabase/control-plane/,
//                    recursively, excluding supabase/control-plane/edge/, since 69df2f52, or since the last founder-applied step once
//                    one exists; each file's committed blob bytes (git show <candidate sha>:<path>, never re-encoded), given by
//                    repository-relative path in byte order of path (the tool refuses any other order);
//   fixed inputs     ../BASELINE_69df2f52_EVIDENCE_MANIFEST.json (field lists, counts, hashes) and
//                    ../BASELINE_69df2f52_EVIDENCE_ROWS.json (the literal values), both Director-committed.
// It prints the sha256 of each migration file, of the two fixed inputs (LF) and of the output. The output is a pure function of
// those bytes (no path, no time), so a rebuild gives the same sha256.
//
// THE OUTPUT, in order:
//   comment lines naming the inputs by sha256;
//   set client_encoding = 'UTF8';   so psql from any console and node-postgres store the same bytes;
//   begin;
//   each migration file, byte for byte, then one LF;
//   reset session authorization; reset role; set local row_security = off;   the check runs as the applying login, and a policy
//                                    that would apply to its reads raises instead of running;
//   set constraints all immediate;   the deferred checks and constraint triggers the migration queued fire here, before the check;
//   set local search_path = pg_catalog, pg_temp;  set local timezone = 'UTC';
//   do $aev1_check$ ... $aev1_check$;   the check below: any difference raises, so the transaction aborts;
//   commit;
// The wrapper creates no object, and SET LOCAL and SET CONSTRAINTS end with the transaction, so AC-10's catalog difference is the
// migration's own. Apply the step in one session: as one simple-Query message (node-postgres client.query(<file text>) with no
// parameters, as provision-control-plane.mjs applied the 69df2f52 schema) or with `psql -X -v ON_ERROR_STOP=1 -f <file>`. Never
// `supabase db query --file`: it does not keep one transaction across a file (KNOWN_FAILURE_MODES #32). An error anywhere, the
// check's included, then commits nothing.
//
// THE MIGRATION IS REFUSED (exit 2, nothing written) when it:
//   - is not UTF-8, or holds a byte-order mark or a NUL;
//   - holds a backslash anywhere, so no psql meta-command exists and no escape moves where a literal ends (in a function body,
//     chr(92) gives the character);
//   - holds a psql variable reference outside literals, comments and dollar bodies (`:name`, `:'name'`, `:"name"`, `:{?name}`),
//     which psql would replace with a client value (`::` and `:=` are not references; write an array slice as `[a : b]`);
//   - has a statement that begins with BEGIN, START, COMMIT, END, ROLLBACK, ABORT, SAVEPOINT, RELEASE or PREPARE TRANSACTION: each
//     ends or splits the step's transaction. Statements are split at every `;` outside literals, comments and dollar bodies,
//     parentheses included, so a SQL-standard body (BEGIN ATOMIC ... END) is refused too; write it dollar-quoted. A COMMIT inside
//     a DO block or a procedure fails inside the step's transaction block, and the step aborts;
//   - has a COPY statement (psql would read its data from the rest of the file);
//   - leaves a literal, quoted identifier, dollar quote or block comment open, or has text after its last `;`;
//   - has a dollar-quote delimiter directly after a number or a parameter (psql and the server could disagree where it starts);
//   - contains `$aev1_` (the wrapper's dollar-quote tags).
//
// WHY THE CHECK MEANS "THE MANIFEST HASHES ARE UNCHANGED", with no sha256 or canonical JSON in SQL.
// baseline_manifest.mjs hashes, per row, the canonical JSON of the object node-postgres returns for its SELECT, and per set the
// canonical JSON of those objects in query order. The check:
//   1. asserts that factory.agent_runs, work_orders and checkpoints are ordinary tables, and that every evidence column has its
//      69df2f52 type (COLUMN_TYPES). For these types node-postgres and to_jsonb give the same JSON value: uuid and text the same
//      string, text[] the same array of strings and nulls, jsonb the same document, the to_char text the same string. to_jsonb
//      of a built-in type never uses a cast;
//   2. runs, per table, the manifest's SELECT as baseline_manifest.mjs builds it (the same field list, to_char rendering and
//      ORDER BY), with its WHERE replaced by the manifest's own row ids. Rows the legacy fleet adds later at 69df2f52 are not
//      evidence and are not read;
//   3. compares the rows it returns, in order, field by field: to_jsonb(row) -> field against the literal expected value, by
//      jsonb equality. The first differing row and field, an extra row, or a count below the manifest's raises an exception;
//   4. raises when code could still run after it, at commit: a deferrable constraint trigger (one fired by SET CONSTRAINTS can
//      defer another to commit), a deferrable exclusion constraint (its recheck can call a function) or a holdable cursor (its
//      query runs at commit). It looks in the whole database, the platform's schemas included; before the founder applies the
//      step, a Director observation record shows the live plane holds none (§3.3). What runs after commit (a trigger that a later
//      write fires, a scheduled job) is outside the step; AC-11's live re-read and S-15 judge it.
// jsonb equality of two such values implies equal canonical JSON: keys compare as sets (canonical JSON sorts them), strings
// exactly, numbers by value (equal values parse to the same double). So when the check passes, every manifest row exists once,
// its row hash equals the one its literal gives, and so does the set hash of the manifest's rows in the manifest's order. Before
// writing anything, this tool recomputes those hashes from the literals with baseline_manifest.mjs's own canonical JSON, and
// refuses unless each equals the manifest's. So: the check passes => every manifest row hash and set hash is unchanged at that
// point of the transaction, and (by 4) at its commit. On the disposable copy, where the manifest's selections return exactly these
// rows, these are the manifest's set hashes; the verifier's re-hash after the step (§3.3) also catches an inserted row. The
// converse holds, except that the check is stricter: a changed column type or relation kind, a jsonb number more precise than a
// double, or code that could run after the check aborts though the hash might not change. The check trusts pg_catalog's
// functions, operators and types, and every cast; §3.3 checks on the copy that the step changes none of them. Its PL/pgSQL
// variables win over column names (#variable_conflict use_variable), and none is named like an evidence column.
// This file holds no backslash character, so its bytes survive any transport unchanged.
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const LF = String.fromCharCode(10), CR = String.fromCharCode(13), BACKSLASH = String.fromCharCode(92);
const sha = (b) => createHash('sha256').update(b).digest('hex');
class Refused extends Error {}
const refuse = (m) => { throw new Refused(m); };

// ---- what baseline_manifest.mjs does, pinned here; a change there needs a Director revision of this tool
const INSTRUMENT = 'qa/verification/auto-enrollment-v1/tools/baseline_manifest.mjs';
const HASH_RULE = 'row sha256 = sha256 of canonical JSON of exactly the listed fields: object keys sorted recursively (jsonb included), '
  + 'timestamps rendered by SQL as UTC text with microseconds (YYYY-MM-DDTHH24:MI:SS.USZ), null as null, numbers as JSON numbers; '
  + 'set_sha256 = sha256 of the canonical JSON array of the row objects in the query order (runs: started_at, run_id; work orders: '
  + 'created_at, work_order_id; checkpoints: created_at, checkpoint_id)';
const TS = new Set(['started_at', 'finished_at', 'completed_at', 'created_at']);
const sel = (fields) => fields.map((f) => TS.has(f) ? `to_char(${f} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as ${f}` : f).join(', ');
const canon = (v) => {
  if (v instanceof Date) return JSON.stringify(v.toISOString());
  if (Array.isArray(v)) return '[' + v.map(canon).join(',') + ']';
  if (v && typeof v === 'object') return '{' + Object.keys(v).sort().map((k) => JSON.stringify(k) + ':' + canon(v[k])).join(',') + '}';
  return JSON.stringify(v === undefined ? null : v);
};
const h = (o) => sha(canon(o));
const TABLES = ['agent_runs', 'work_orders', 'checkpoints'];
const ID = { agent_runs: 'run_id', work_orders: 'work_order_id', checkpoints: 'checkpoint_id' };
const ORDER = { agent_runs: 'started_at, run_id', work_orders: 'created_at, work_order_id', checkpoints: 'created_at, checkpoint_id' };
// The 69df2f52 type of every evidence column, as format_type prints it (supabase/control-plane/001_factory_control_plane.sql at
// 69df2f52; equal to the columns of LIVE_PLANE_CATALOG_SNAPSHOT_PRE_CANDIDATE.json).
const T = 'timestamp with time zone';
const COLUMN_TYPES = {
  agent_runs: { run_id: 'uuid', work_order_id: 'uuid', node_id: 'text', status: 'text', base_commit: 'text', head_commit: 'text',
    started_at: T, finished_at: T, authoring_run_id: 'uuid', authoring_node_id: 'text', verification_run_id: 'uuid',
    verification_node_id: 'text', verification_status: 'text', summary: 'text', error: 'text' },
  work_orders: { work_order_id: 'uuid', title: 'text', work_type: 'text', status: 'text', owned_surface: 'text[]',
    requires_security_role: 'text', requires_capabilities: 'text[]', completed_at: T, handoff: 'text' },
  checkpoints: { checkpoint_id: 'uuid', run_id: 'uuid', work_order_id: 'uuid', location: 'text', scenario: 'text', payload: 'jsonb',
    created_at: T },
};
const IDS = { agent_runs: 'run_ids', work_orders: 'wo_ids', checkpoints: 'cp_ids' };
const REC = { agent_runs: 'r_run', work_orders: 'r_wo', checkpoints: 'r_cp' };
const VARS = ['expected', 'column_types', 'tbl', 'col', 'typ', 'got', 'i', 'row_now', 'row_want', ...Object.values(IDS), ...Object.values(REC)];
for (const t of TABLES) for (const f of [...Object.keys(COLUMN_TYPES[t]), 'created_at']) if (VARS.includes(f)) throw new Error('a variable is named like column ' + f);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const UTC_JSONB = /^([0-9]{4}-[0-9]{2}-[0-9]{2})T([0-9]{2}:[0-9]{2}:[0-9]{2})(?:[.]([0-9]{1,6}))?[+]00:00$/;

// ---- the literal expected values, proved against the manifest
const ts = (v, where) => {
  if (v === null) return null;
  const m = typeof v === 'string' && UTC_JSONB.exec(v);
  if (!m) refuse(where + ': timestamp ' + JSON.stringify(v) + ' is not UTC text as to_jsonb renders it');
  return m[1] + 'T' + m[2] + '.' + (m[3] || '').padEnd(6, '0') + 'Z';
};
const wellFormed = (s) => {
  for (let k = 0; k < s.length; k++) {
    const c = s.charCodeAt(k);
    if (c === 0) return false;
    if (c >= 0xd800 && c <= 0xdbff) { const n = s.charCodeAt(k + 1); if (!(n >= 0xdc00 && n <= 0xdfff)) return false; k++; } else if (c >= 0xdc00 && c <= 0xdfff) return false;
  }
  return true;
};
const literalOk = (v, where) => {
  if (v === null || typeof v === 'boolean') return;
  if (typeof v === 'number') { if (!Number.isSafeInteger(v)) refuse(where + ': number ' + v + ' is not a safe integer'); return; }
  if (typeof v === 'string') { if (!wellFormed(v)) refuse(where + ': a string SQL cannot hold'); return; }
  if (Array.isArray(v)) { v.forEach((x) => literalOk(x, where)); return; }
  if (typeof v === 'object') { for (const k of Object.keys(v)) { literalOk(k, where); literalOk(v[k], where); } return; }
  refuse(where + ': a value JSON cannot carry');
};
function expectedRows(manifestText, rowsText) {
  const M = JSON.parse(manifestText), R = JSON.parse(rowsText);
  if (M.instrument !== INSTRUMENT || M.hash_rule !== HASH_RULE) refuse('the manifest was not made by ' + INSTRUMENT + ' under the hash rule this tool reproduces');
  const X = {};
  for (const t of TABLES) {
    const F = (M.fields || {})[t], pinned = Object.keys(COLUMN_TYPES[t]);
    if (!Array.isArray(F) || F.length !== pinned.length || !pinned.every((f) => F.includes(f))) refuse('the manifest fields of ' + t + ' are not the pinned 69df2f52 evidence columns');
    const listed = M[t];
    if (!Array.isArray(listed) || !listed.length || (M.counts || {})[t] !== listed.length) refuse('the manifest count of ' + t + ' does not match its rows');
    if (new Set(listed.map((m) => m[ID[t]])).size !== listed.length) refuse('the manifest lists a ' + t + ' id twice');
    const byId = new Map();
    for (const r of R[t] || []) { if (byId.has(r[ID[t]])) refuse('the rows file holds ' + t + ' ' + r[ID[t]] + ' twice'); byId.set(r[ID[t]], r); }
    const rows = listed.map((m) => {
      const id = m[ID[t]], r = byId.get(id), o = {};
      if (!r) refuse('manifest row ' + t + ' ' + id + ' is not in the rows file');
      for (const f of F) {
        if (!(f in r)) refuse('rows file ' + t + ' ' + id + ' has no field ' + f);
        o[f] = TS.has(f) ? ts(r[f], t + ' ' + id + ' ' + f) : r[f];
        literalOk(o[f], t + ' ' + id + ' ' + f);
      }
      if (!UUID.test(o[ID[t]])) refuse(t + ' id ' + JSON.stringify(o[ID[t]]) + ' is not a uuid');
      if (h(o) !== m.sha256) refuse('the rows file does not reproduce the manifest hash of ' + t + ' ' + id);
      return o;
    });
    if (h(rows) !== (M.set_sha256 || {})[t]) refuse('the rows file does not reproduce the manifest set hash of ' + t);
    X[t] = { fields: F, rows };
  }
  return X;
}

// ---- the migration, split the way psql and the server split it, and refused wherever they could disagree
const IDSTART = (ch) => ch !== undefined && ch !== '' && (/[A-Za-z_]/.test(ch) || ch.charCodeAt(0) >= 0x80);
const IDCONT = (ch) => ch !== undefined && ch !== '' && (/[A-Za-z0-9_$]/.test(ch) || ch.charCodeAt(0) >= 0x80);
// the dollar-quote delimiter ($tag$ or $$) that starts at s[i], or null
const dollarDelimiter = (s, i) => {
  let j = i + 1;
  if (IDSTART(s[j])) { j++; while (j < s.length && s[j] !== '$' && IDCONT(s[j])) j++; }
  return s[j] === '$' ? s.slice(i, j + 1) : null;
};
const TXN = new Set(['begin', 'start', 'commit', 'end', 'rollback', 'abort', 'savepoint', 'release']);
function scanMigration(src, name) {
  const no = (why) => refuse(name + ': ' + why);
  if (src.includes(BACKSLASH)) no('a backslash (a psql meta-command, or an escape that moves where a literal ends)');
  if (src.includes(String.fromCharCode(0xfeff))) no('a byte-order mark');
  if (src.includes(String.fromCharCode(0))) no('a NUL character');
  if (src.includes('$aev1_')) no('the reserved dollar-quote tag prefix $aev1_');
  let code = '', prev = ' ', run = '', i = 0;
  const put = (ch) => { run = IDCONT(ch) ? (IDCONT(prev) ? run : ch) : ''; prev = ch; code += ch; };
  const gap = () => { prev = ' '; run = ''; code += ' '; };
  while (i < src.length) {
    const c = src[i], d = src[i + 1];
    if (c === '-' && d === '-') { while (i < src.length && src[i] !== LF && src[i] !== CR) i++; gap(); continue; }
    if (c === '/' && d === '*') {
      let depth = 1; i += 2;
      while (depth > 0) {
        if (i >= src.length) no('a block comment is still open at the end');
        if (src[i] === '/' && src[i + 1] === '*') { depth++; i += 2; } else if (src[i] === '*' && src[i + 1] === '/') { depth--; i += 2; } else i++;
      }
      gap(); continue;
    }
    if (c === "'" || c === '"') {
      let j = i + 1;
      for (;;) {
        const k = src.indexOf(c, j);
        if (k < 0) no((c === "'" ? 'a literal' : 'a quoted identifier') + ' is still open at the end');
        if (src[k + 1] === c) { j = k + 2; continue; }
        i = k + 1; break;
      }
      gap(); continue;
    }
    if (c === '$') {
      const tag = dollarDelimiter(src, i);
      if (tag && IDCONT(prev)) {
        if (!IDSTART(run)) no('a dollar-quote delimiter ' + tag + ' directly after a number or a parameter');
        put(c); i++; continue;
      }
      if (tag) {
        const k = src.indexOf(tag, i + tag.length);
        if (k < 0) no('dollar quote ' + tag + ' is still open at the end');
        i = k + tag.length; gap(); continue;
      }
    }
    if (c === ':') {
      if (d === ':' || d === '=') { put(c); put(d); i += 2; continue; }
      if (IDCONT(d) || d === "'" || d === '"' || d === '{') no('a psql variable reference :' + d + '... (write an array slice as [a : b])');
    }
    put(c); i++;
  }
  const stmts = code.split(';');
  if (stmts.pop().trim() !== '') no('text after the last `;`');
  if (!stmts.some((s) => s.trim())) no('no statement');
  for (const s of stmts) {
    const flat = s.split('').map((ch) => (ch.charCodeAt(0) <= 32 ? ' ' : ch)).join('').trim();
    const w = /^([A-Za-z_][A-Za-z0-9_$]*)(?: +([A-Za-z_][A-Za-z0-9_$]*))?/.exec(flat);
    if (!w) continue;
    const a = w[1].toLowerCase(), b = (w[2] || '').toLowerCase();
    if (TXN.has(a) || (a === 'prepare' && b === 'transaction')) no('a transaction-control statement (' + w[0] + '); the step supplies begin and commit');
    if (a === 'copy') no('a COPY statement');
  }
}

// ---- the step
function buildStep(migrations, manifestText, rowsText) {
  const X = expectedRows(manifestText, rowsText);
  const mig = migrations.map(({ name, bytes }) => {
    let text;
    try { text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes); } catch { refuse(name + ': not UTF-8'); }
    scanMigration(text, name);
    return { bytes, sha256: sha(bytes) };
  });
  const q = (s) => "'" + s.split("'").join("''") + "'";
  const data = '{' + TABLES.map((t) => JSON.stringify(t) + ':[' + LF + X[t].rows.map(canon).join(',' + LF) + LF + ']').join(',' + LF) + '}';
  const types = canon(COLUMN_TYPES);
  if ((data + types).includes('$aev1_')) refuse('an expected value contains the reserved tag prefix $aev1_');
  const rowsCheck = (t) => {
    const F = X[t].fields, n = X[t].rows.length;
    return [
      `  i := 0;`,
      `  for ${REC[t]} in select ${sel(F)} from factory.${t} where ${ID[t]} = any(${IDS[t]}) order by ${ORDER[t]} loop`,
      `    i := i + 1;`,
      `    row_now := pg_catalog.to_jsonb(${REC[t]});`,
      `    row_want := expected -> '${t}' -> (i - 1);`,
      `    if row_want is null then`,
      `      raise exception 'AC-11 baseline check: factory.${t} returns more rows than the manifest lists for its ids (position %)', i;`,
      `    end if;`,
      `    foreach col in array array[${F.map(q).join(', ')}] loop`,
      `      if (row_now -> col) is distinct from (row_want -> col) then`,
      `        raise exception 'AC-11 baseline check: factory.${t}, manifest position % (${ID[t]} %): field % differs', i, row_want ->> '${ID[t]}', col;`,
      `      end if;`,
      `    end loop;`,
      `  end loop;`,
      `  if i <> ${n} then`,
      `    raise exception 'AC-11 baseline check: factory.${t} holds % of the manifest''s ${n} rows', i;`,
      `  end if;`,
    ].join(LF);
  };
  const trailer = [
    // the check runs as the applying login, with row security off, whatever role or session state the migration left: a SET ROLE
    // or a row-security policy whose function writes cannot run inside the check's reads (a policy that would apply raises instead)
    `reset session authorization;`,
    `reset role;`,
    `set local row_security = off;`,
    `set constraints all immediate;`,
    `set local search_path = pg_catalog, pg_temp;`,
    `set local timezone = 'UTC';`,
    `do $aev1_check$`,
    `#variable_conflict use_variable`,
    `declare`,
    `  -- Every manifest row, in manifest order, with exactly its manifest fields: values from BASELINE_69df2f52_EVIDENCE_ROWS.json,`,
    `  -- timestamps as to_char renders them. Checked at build time to reproduce every manifest row hash and set hash.`,
    `  expected constant jsonb := $aev1_data$`,
    data,
    `$aev1_data$::jsonb;`,
    `  column_types constant jsonb := $aev1_data$${types}$aev1_data$::jsonb;`,
    ...TABLES.map((t) => `  ${IDS[t]} constant uuid[] := ${q('{' + X[t].rows.map((r) => r[ID[t]]).join(',') + '}')};`),
    `  tbl text;`, `  col text;`, `  typ text;`, `  got text;`, `  i integer;`, `  row_now jsonb;`, `  row_want jsonb;`,
    ...TABLES.map((t) => `  ${REC[t]} record;`),
    `begin`,
    `  if current_user <> session_user or pg_catalog.current_setting('row_security') <> 'off'`,
    `     or pg_catalog.current_setting('client_encoding') <> 'UTF8' then`,
    `    raise exception 'AC-11 baseline check: the check must run as the applying login, row security off, client encoding UTF8';`,
    `  end if;`,
    ...TABLES.map((t) => `  if pg_catalog.row_security_active('factory.${t}') then raise exception 'AC-11 baseline check: row security is active on factory.${t}'; end if;`),
    `  if pg_catalog.pg_current_xact_id_if_assigned() is null then`,
    `    raise exception 'AC-11 baseline check: the migration wrote nothing in this transaction (apply the step in one session)';`,
    `  end if;`,
    `  foreach tbl in array array[${TABLES.map(q).join(', ')}] loop`,
    `    if (select c.relkind from pg_catalog.pg_class c where c.oid = pg_catalog.to_regclass('factory.' || tbl)) is distinct from 'r' then`,
    `      raise exception 'AC-11 baseline check: factory.% is not an ordinary table', tbl;`,
    `    end if;`,
    `    for col, typ in select e.key, e.value #>> '{}' from pg_catalog.jsonb_each(column_types -> tbl) e loop`,
    `      got := (select pg_catalog.format_type(a.atttypid, a.atttypmod) from pg_catalog.pg_attribute a`,
    `               where a.attrelid = pg_catalog.to_regclass('factory.' || tbl) and a.attname = col::name and a.attnum > 0 and not a.attisdropped);`,
    `      if got is distinct from typ then`,
    `        raise exception 'AC-11 baseline check: factory.%.% is %, not the 69df2f52 type %', tbl, col, coalesce(got, 'missing'), typ;`,
    `      end if;`,
    `    end loop;`,
    `  end loop;`,
    ...TABLES.map(rowsCheck),
    `  -- Nothing may run after this check: a deferrable constraint trigger or exclusion constraint, or a holdable cursor, could.`,
    `  got := null;`,
    `  select pg_catalog.format('deferrable constraint trigger %s on %s', t.tgname, t.tgrelid::pg_catalog.regclass) into got`,
    `    from pg_catalog.pg_trigger t where t.tgdeferrable and not t.tgisinternal limit 1;`,
    `  if got is null then`,
    `    select pg_catalog.format('deferrable exclusion constraint %s on %s', x.conname, x.conrelid::pg_catalog.regclass) into got`,
    `      from pg_catalog.pg_constraint x where x.contype = 'x' and x.condeferrable limit 1;`,
    `  end if;`,
    `  if got is null then`,
    `    select pg_catalog.format('holdable cursor %s', u.name) into got from pg_catalog.pg_cursors u where u.is_holdable limit 1;`,
    `  end if;`,
    `  if got is not null then`,
    `    raise exception 'AC-11 baseline check: % could run code after this check, at commit', got;`,
    `  end if;`,
    `  raise notice 'AC-11 baseline check passed: ${TABLES.map((t) => X[t].rows.length + ' ' + t).join(', ')}; every manifest evidence field unchanged';`,
    `end`,
    `$aev1_check$;`,
    `commit;`,
  ].join(LF) + LF;
  const header = [
    `-- Live-migration step, Factory Node Management + Zero-Touch Auto Enrollment (V1): AC-11 and the WO-1 founder boundary.`,
    `-- Built by qa/verification/auto-enrollment-v1/tools/build_live_migration_step.mjs, a Director instrument. Never edit this file.`,
    ...mig.map((m, k) => `-- migration ${k + 1} of ${mig.length}: sha256 ${m.sha256}, ${m.bytes.length} bytes, embedded verbatim after begin.`),
    `-- BASELINE_69df2f52_EVIDENCE_MANIFEST.json sha256 ${sha(manifestText)} (LF); BASELINE_69df2f52_EVIDENCE_ROWS.json sha256 ${sha(rowsText)} (LF).`,
    `-- Apply exactly this file in one session: as one simple-Query message, or psql -X -v ON_ERROR_STOP=1 -f <this file>. Never`,
    `-- supabase db query --file. It commits only if every manifest evidence field is unchanged after the migration's last statement.`,
    `set client_encoding = 'UTF8';`,
    `begin;`,
  ].join(LF) + LF;
  const parts = [Buffer.from(header, 'utf8')];
  for (const m of mig) parts.push(m.bytes, Buffer.from(LF, 'utf8'));
  parts.push(Buffer.from(trailer, 'utf8'));
  const report = [
    ...mig.map((m, k) => `migration ${k + 1} sha256 ${m.sha256} (${m.bytes.length} bytes)`),
    `manifest sha256 ${sha(manifestText)} (LF); rows sha256 ${sha(rowsText)} (LF)`,
    `self-check: the rows file reproduces every manifest row hash and set hash (${TABLES.map((t) => t + ' ' + X[t].rows.length).join(', ')})`,
  ];
  return { output: Buffer.concat(parts), report };
}

// ---- main (I/O)
const [out, ...migPaths] = process.argv.slice(2);
if (!out || !migPaths.length) { console.log('usage: build_live_migration_step.mjs <out.sql> <migration.sql> [<migration.sql> ...]'); process.exit(2); }
// the candidate migration is applied in byte order of path (repository-relative, forward slashes): any other order is refused
const norm = migPaths.map((p) => p.split('\\').join('/'));
for (let k = 1; k < norm.length; k++) {
  if (Buffer.compare(Buffer.from(norm[k - 1], 'utf8'), Buffer.from(norm[k], 'utf8')) >= 0) {
    console.log('refused: migration files must be given once each, in byte order of path (' + norm[k - 1] + ' then ' + norm[k] + ')');
    process.exit(2);
  }
}
const HERE = dirname(fileURLToPath(import.meta.url));
const lfText = (p) => readFileSync(p, 'utf8').split(CR + LF).join(LF);
try {
  const step = buildStep(migPaths.map((p, k) => ({ name: 'migration ' + (k + 1) + ' (' + p + ')', bytes: readFileSync(p) })),
    lfText(join(HERE, '..', 'BASELINE_69df2f52_EVIDENCE_MANIFEST.json')), lfText(join(HERE, '..', 'BASELINE_69df2f52_EVIDENCE_ROWS.json')));
  try { writeFileSync(out, step.output, { flag: 'wx' }); } catch (e) { if (e.code === 'EEXIST') refuse(out + ' exists; this tool never overwrites a file'); throw e; }
  for (const l of step.report) console.log(l);
  console.log('output sha256 ' + sha(step.output) + ' (' + step.output.length + ' bytes), written to ' + out);
} catch (e) {
  if (!(e instanceof Refused)) throw e;
  console.log('refused: ' + e.message);
  process.exit(2);
}
