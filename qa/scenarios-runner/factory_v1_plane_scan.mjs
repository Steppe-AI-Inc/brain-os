// THE PLANE-CONDITIONED-BEHAVIOUR SCAN (S-10; VERIFICATION_SPEC §3.4 r3) - the implementer's developer approximation of the
// verifier's scan. A pure library: it reads the texts it is given and returns what it found; the static contract
// (factory_v1_static_contract.mjs rows P0-P7) decides pass or fail. The verifier's own scan and classification govern: a class this
// library or its inventory proposes is a proposal, never a classification (§3.4: "A candidate's own annotation never classifies a hit").
//
// SCOPE (§3.4 r3: "every SQL object and migration statement the candidate adds or changes, its Edge handlers and its prepared founder
// steps, which is S-10's scope"): the caller hands in the candidate migration's files, every Edge .ts file, and the founder steps' SQL.
// LIMITS OF THIS APPROXIMATION (stated, never hidden; the verifier's own scan governs):
//   - "a row count that no stated rule makes" (§3.4 r3) is NOT scanned: telling a stated rule's count from another needs the rule;
//   - the founder steps are scanned for their SQL only (fenced sql / psql blocks and statement code spans). Their shell commands (for
//     example `npx supabase ... --project-ref <ref>`, own-plane addressing when they name the live project) and the founder tools'
//     environment reads are outside this scan;
//   - a literal naming a record or object that exists on one plane only is recognised as a UUID, a 20-letter project ref, a host
//     name or an address; a role, schema or other object NAME in a literal is not recognised;
//   - taint is followed within one PL/pgSQL body and, in the Edge, through bindings, positional parameters of exported functions and
//     the value a call returns when an environment value or a tainted identifier is among its arguments (`const k = f(Deno.env
//     .get('X'))`). A value carried in an object property is not traced: the Edge handlers receive the pepper as a dependency
//     (`deps.pepper()`), so their branches on it are listed by hand in the inventory's UNTRACED entries, each held to the source by
//     anchors the static contract finds. A value one SQL function returns and another branches on is not traced either (its source
//     hit is still classified);
//   - a function is classed by the context it is defined in, never by the statement that runs it: a trigger that a founder step's
//     INSERT fires (founder step 3 fires the tenant-admins and authority guards, which read session_user and current_user) is not
//     reported as a read of that founder step. The Director decided that reading in CR-026 (APPROVED, on the same basis as CR-022 (b);
//     the Director's CR-disposition record): the inventory lists both reads as UNTRACED entries classed on that ruling, and the static
//     contract's P3p checks the ruling against the Director's record.
//
// CONTEXTS. A SQL file is split into statements (comments, literals, quoted identifiers and dollar-quoted bodies recognized). Each
// piece of code has one context:
//   migration   a top-level statement of the migration
//   do          the body of a DO block (a migration statement)
//   definer     the body of a SECURITY DEFINER function
//   reachable   the body of an INVOKER function a SECURITY DEFINER body calls (transitively), or a trigger function (a front door that
//               writes a factory table fires it)
//   invoker     the body of any other INVOKER function
//   step        a statement of a prepared founder step
//   edge        an Edge source file
// String literals are scanned for constants; a literal handed to EXECUTE or format() is scanned as SQL too (dynamic SQL).
//
// HITS. Each construct is either HARD - r3 says it fits no class (the applying login's or an object owner's name or attributes, read
// in a migration statement, a founder step or a SECURITY DEFINER body; session_user in a migration statement or a founder step;
// plane_identity; the current time compared with a fixed date, time of day or weekday; an exception handler that swallows a
// plane-configuration-dependent condition; a branch that depends - directly or through a derived value - on the database name, the
// server's address, port, version or start time, a transaction id or a statistic (no r3 class permits a branch on them; the one
// exception is current_database() as the target of GRANT / REVOKE ... ON DATABASE, own-plane addressing); in the Edge, the request's
// host or a forwarded header, a loopback or private address) -
// or NEEDS-CLASS: it must match an inventory entry that proposes one of the r3 classes, and it is reported with whether a branch
// depends on it (directly, or through a PL/pgSQL variable or an Edge identifier derived from it). A class that permits no branch
// (carried; own-plane addressing) never covers a hit a branch depends on.
//
// INVENTORIES (§3.4 r3): every statement that creates, alters, drops, grants on, comments on or writes to an object in a schema of the
// Director catalog tool's PLATFORM list (the platform-schema inventory), and every statement that sets or resets a setting whose name
// matches the tool's SECRETISH pattern (the secret-setting inventory). The caller reads both lists from the designated Director commit.

// ---------------------------------------------------------------------------------------------------------------------------------
// SQL lexing: segments with absolute offsets
/** segments of `text` (from `base`): { k: 'code' | 'comment' | 'literal' | 'dollar', s, e (absolute), inner: [s, e] for literal/dollar } */
export function lexSql(text, base = 0) {
  const segs = [];
  let i = 0, codeStart = 0;
  const flush = (j) => { if (j > codeStart) segs.push({ k: 'code', s: base + codeStart, e: base + j }); };
  while (i < text.length) {
    const c = text[i], n = text[i + 1];
    if (c === '-' && n === '-') { const e = text.indexOf('\n', i); const j = e < 0 ? text.length : e; flush(i); segs.push({ k: 'comment', s: base + i, e: base + j }); i = j; codeStart = i; continue; }
    if (c === '/' && n === '*') {
      let d = 1, j = i + 2;
      while (j < text.length && d) { if (text.startsWith('/*', j)) { d++; j += 2; } else if (text.startsWith('*/', j)) { d--; j += 2; } else j++; }
      flush(i); segs.push({ k: 'comment', s: base + i, e: base + j }); i = j; codeStart = i; continue;
    }
    if (c === "'") {
      let j = i + 1;
      for (;;) { const q = text.indexOf("'", j); if (q < 0) { j = text.length; break; } if (text[q + 1] === "'") { j = q + 2; continue; } j = q + 1; break; }
      flush(i); segs.push({ k: 'literal', s: base + i, e: base + j, inner: [base + i + 1, base + j - 1] }); i = j; codeStart = i; continue;
    }
    if (c === '"') { let j = i + 1; for (;;) { const q = text.indexOf('"', j); if (q < 0) { j = text.length; break; } if (text[q + 1] === '"') { j = q + 2; continue; } j = q + 1; break; } i = j; continue; }
    if (c === '$' && !/[A-Za-z0-9_$]/.test(text[i - 1] || ' ')) {
      const m = /^\$([A-Za-z_][A-Za-z0-9_]*)?\$/.exec(text.slice(i, i + 80));
      if (m) {
        const tag = m[0]; const e = text.indexOf(tag, i + tag.length); const j = e < 0 ? text.length : e + tag.length;
        flush(i); segs.push({ k: 'dollar', s: base + i, e: base + j, inner: [base + i + tag.length, base + (e < 0 ? text.length : e)], tag }); i = j; codeStart = i; continue;
      }
    }
    i++;
  }
  flush(text.length);
  return segs;
}

const blank = (s) => s.replace(/[^\n]/g, ' ');
/** the text from s to e with everything that is not a code segment blanked (newlines kept, offsets kept) */
function codeView(src, segs, s, e) {
  let out = '';
  let at = s;
  for (const g of segs) {
    if (g.e <= s || g.s >= e) continue;
    const gs = Math.max(g.s, s), ge = Math.min(g.e, e);
    if (gs > at) out += blank(src.slice(at, gs));
    out += g.k === 'code' ? src.slice(gs, ge) : blank(src.slice(gs, ge));
    at = ge;
  }
  if (e > at) out += blank(src.slice(at, e));
  return out;
}
const lineStarts = (src) => { const a = [0]; for (let i = 0; i < src.length; i++) if (src[i] === '\n') a.push(i + 1); return a; };
const lineOf = (starts, off) => { let lo = 0, hi = starts.length - 1; while (lo < hi) { const m = (lo + hi + 1) >> 1; if (starts[m] <= off) lo = m; else hi = m - 1; } return lo + 1; };

/**
 * The units of one SQL text: { ctx, s, e, view (code only, blanked elsewhere; length e - s), fn, secdef, lang, stmt (the statement's
 * top-level code), literals: [{ s, e, text, dynamic }] }. kind 'migration' (a migration file) or 'step' (a founder step's SQL).
 */
export function sqlUnits(src, kind = 'migration') {
  const segs = lexSql(src);
  // statements: split at ';' in code segments
  const stmts = []; let cur = { s: 0, segs: [] };
  for (const g of segs) {
    if (g.k === 'code') {
      let from = g.s;
      for (let i = g.s; i < g.e; i++) {
        if (src[i] === ';') { cur.segs.push({ ...g, s: from, e: i + 1 }); cur.e = i + 1; stmts.push(cur); cur = { s: i + 1, segs: [] }; from = i + 1; }
      }
      if (from < g.e) cur.segs.push({ ...g, s: from });
    } else cur.segs.push(g);
  }
  if (cur.segs.some((g) => g.k === 'code' && src.slice(g.s, g.e).trim())) { cur.e = src.length; stmts.push(cur); }
  const units = [];
  for (const st of stmts) {
    const stmtView = codeView(src, st.segs, st.s, st.e);
    const head = stmtView.replace(/\s+/g, ' ').trim();
    const isFn = /^create\s+(or\s+replace\s+)?(function|procedure)\b/i.test(head);
    const name = isFn ? ((/(?:function|procedure)\s+([a-z_0-9."]+)/i.exec(head) || [])[1] || '?').replace(/"/g, '') : null;
    const secdef = isFn && /\bsecurity\s+definer\b/i.test(head);
    const lang = isFn ? ((/\blanguage\s+([a-z]+)/i.exec(head) || [])[1] || 'sql').toLowerCase() : null;
    const top = { ctx: kind === 'step' ? 'step' : 'migration', s: st.s, e: st.e, view: stmtView, fn: null, secdef: false, lang: null, stmt: head, literals: [] };
    units.push(top);
    for (const g of st.segs) {
      if (g.k === 'literal') top.literals.push({ s: g.inner[0], e: g.inner[1], text: src.slice(g.inner[0], g.inner[1]), dynamic: /\b(execute|format)\s*\(?\s*$/i.test(src.slice(Math.max(st.s, g.s - 20), g.s)) });
      if (g.k !== 'dollar') continue;
      const before = codeView(src, st.segs, st.s, g.s).replace(/\s+$/, '');
      const isDo = /\bdo$/i.test(before);
      const isBody = !isDo && isFn && /\bas$/i.test(before);
      if (!isDo && !isBody) { top.literals.push({ s: g.inner[0], e: g.inner[1], text: src.slice(g.inner[0], g.inner[1]), dynamic: false }); continue; }
      const inner = src.slice(g.inner[0], g.inner[1]);
      const bsegs = lexSql(inner, g.inner[0]);
      const u = { ctx: isDo ? (kind === 'step' ? 'step' : 'do') : (secdef ? 'definer' : 'invoker'), s: g.inner[0], e: g.inner[1],
        view: codeView(src, bsegs, g.inner[0], g.inner[1]), fn: isDo ? null : name, secdef: isDo ? false : secdef, lang: isDo ? 'plpgsql' : lang, stmt: head, literals: [] };
      for (const b of bsegs) {
        if (b.k === 'literal' || b.k === 'dollar') {
          const pre = src.slice(Math.max(g.inner[0], b.s - 24), b.s);
          u.literals.push({ s: b.inner[0], e: b.inner[1], text: src.slice(b.inner[0], b.inner[1]), dynamic: /\b(execute|format)\s*\(?\s*$/i.test(pre) });
        }
      }
      units.push(u);
    }
  }
  return units;
}

// ---------------------------------------------------------------------------------------------------------------------------------
// the constructs
const APPLYING = new Set(['migration', 'do', 'step', 'definer']);           // where the applying login's / an owner's name or attributes fit no class
const TIME_FN = /\b(now\s*\(\s*\)|current_timestamp|current_date|current_time|localtime(stamp)?|clock_timestamp\s*\(|statement_timestamp\s*\(|transaction_timestamp\s*\()/i;
const DATE_LIT = /^\s*\d{4}-\d{2}-\d{2}|^\s*\d{1,2}:\d{2}(:\d{2})?\s*$/;
// a condition name or SQLSTATE whose occurrence depends on plane configuration (§3.4 r3)
const PLANE_CONDITIONS = /^(others|insufficient_privilege|undefined_\w+|invalid_schema_name|invalid_catalog_name|feature_not_supported|program_limit_exceeded|statement_too_complex|too_many_columns|too_many_arguments|configuration_limit_exceeded|insufficient_resources|out_of_memory|disk_full|too_many_connections|query_canceled|lock_not_available|config_file_error|lock_file_exists|object_not_in_prerequisite_state|object_in_use|cannot_connect_now|admin_shutdown|crash_shutdown|system_error|io_error|internal_error|data_corrupted|index_corrupted|invalid_authorization_specification|dependent_objects_still_exist|sqlstate\s+'(42501|42P01|42883|42704|42703|3F000|0A000|53\w{3}|54\w{3}|55\w{3}|57\w{3}|58\w{3}|F0\w{3}|XX\w{3}|28\w{3})')$/i;
const CATALOG_REL = /\b(pg_(aggregate|am|amop|amproc|attrdef|attribute|auth_members|authid|cast|class|collation|constraint|conversion|database|db_role_setting|default_acl|depend|description|enum|event_trigger|extension|foreign_data_wrapper|foreign_server|foreign_table|index|inherits|init_privs|language|largeobject|namespace|opclass|operator|opfamily|parameter_acl|partitioned_table|policy|policies|proc|publication|range|replication_origin|rewrite|roles|rules|seclabel|sequence|sequences|shdepend|shdescription|shseclabel|statistic|subscription|tablespace|transform|trigger|ts_\w+|type|user_mapping|views|tables|matviews|indexes|user|group|shadow|settings|file_settings|hba_file_rules|available_extensions|prepared_xacts|locks|cursors|timezone_names))\b(?!\s*\()/i;

/** SQL constructs. hard(ctx, u): true when that occurrence fits no class. */
export const SQL_CONSTRUCTS = [
  { id: 'plane_identity', re: /\bplane_identity\b/gi, hard: () => 'plane_identity names the plane (S-10)' },
  { id: 'current_user', re: /\b(current_user|current_role)\b/gi, hard: (ctx) => APPLYING.has(ctx) && 'current_user in a ' + ctx + ' context is the applying login or an object owner' },
  { id: 'user', re: /(?<!\b(create|alter|drop|for|mapping|to|from|role|grant)\s+)\buser\b(?!\s+(mapping|\w+\s+with))/gi, hard: (ctx) => APPLYING.has(ctx) && 'user in a ' + ctx + ' context is the applying login or an object owner' },
  { id: 'session_user', re: /\bsession_user\b/gi, hard: (ctx) => ['migration', 'do', 'step'].includes(ctx) && 'session_user in a migration statement or a founder step is the applying login' },
  { id: 'role_attribute', re: /\brol(super|inherit|createrole|createdb|canlogin|replication|bypassrls|connlimit|validuntil|password|config)\b/gi,
    hard: (ctx, u) => !(superuserRefusal(u) || apiRoleReadBack(ctx, u)) && 'a role attribute (the applying login\'s or an owner\'s attributes fit no class)' },
  { id: 'membership', re: /\b(pg_auth_members|pg_authid|pg_shadow|pg_group|pg_db_role_setting)\b|\bpg_has_role\s*\(/gi, hard: () => 'a role membership or role setting read' },
  { id: 'owner', re: /\bpg_get_userbyid\s*\(|\b(relowner|proowner|nspowner|typowner|evtowner|extowner|lanowner|oprowner|collowner|conowner|srvowner|datdba|defaclrole)\b|\bacldefault\s*\(/gi, hard: () => 'an object owner read' },
  { id: 'setting', re: /\bcurrent_setting\s*\(|\bpg_settings\b|\bpg_show_all_settings\s*\(|\bfrom\s+current\b|(^|;|\bexecute\s+')\s*show\s+[a-z_]/gi, hard: () => false },
  { id: 'database', re: /\bcurrent_database\s*\(|\bcurrent_catalog\b/gi, hard: () => false },
  { id: 'server', re: /\binet_(server|client)_(addr|port)\s*\(|\bversion\s*\(\s*\)|\bpg_postmaster_start_time\s*\(|\bpg_conf_load_time\s*\(|\bpg_backend_pid\s*\(/gi, hard: () => false },
  { id: 'xact', re: /\btxid_\w+\s*\(|\bpg_current_xact_id\w*\s*\(|\bpg_snapshot_\w+\s*\(|\b(xmin|xmax)\b/gi, hard: () => false },
  { id: 'sequence', re: /\b(nextval|currval|lastval|setval|pg_sequence_last_value)\s*\(|\bgenerated\s+(always|by\s+default)\s+as\s+identity\b|\b(small|big)?serial\b/gi, hard: () => false },
  { id: 'statistic', re: /\bpg_stat(io)?_\w+|\breltuples\b|\brelpages\b|\bpg_\w+_size\s*\(/gi, hard: () => false },
  // (a pg_catalog name after `::` is a type, not a relation read)
  { id: 'catalog_read', re: new RegExp('(?<!::\\s*)\\b(pg_catalog|information_schema)\\.[a-z_]+\\b(?!\\s*\\()|(?<!::\\s*(pg_catalog\\.)?)' + CATALOG_REL.source, 'gi'), hard: () => false },
  { id: 'catalog_lookup', re: /::\s*reg(class|procedure|proc|namespace|role|type|oper|operator|config|collation|dictionary)\b|\bto_reg\w+\s*\(/gi, hard: () => false },
  { id: 'privilege_probe', re: /\bhas_\w+_privilege\s*\(|\baclexplode\s*\(/gi, hard: () => false },
];
// the superuser-caller refusal (r3: "the refusal of a superuser caller" is the call's input): rolsuper read of session_user's row only
const superuserRefusal = (u) => (u.ctx === 'definer' || u.ctx === 'reachable' || u.ctx === 'invoker') && /\brolname\s*=\s*session_user\b/i.test(u.view) && !/\bcurrent_user\b/i.test(u.view);
// a founder step's read-back of the two API roles by their fixed names (neither the applying login nor an object owner)
const apiRoleReadBack = (ctx, u) => ctx === 'step' && /^select\b/i.test(u.stmt) && /\brolname\s+in\s*\(\s*'factory_node_api'\s*,\s*'factory_admin_api'\s*\)/i.test(u.stmt + ' ' + (u.rawStmt || ''));

/** PLATFORM schema relation reads, with the list read from the Director tool */
export function platformRelationRe(platform) {
  const schemas = platform.filter((s) => s !== 'pg_catalog' && s !== 'information_schema').map((s) => s.replace(/[^a-z_]/g, ''));
  return new RegExp('\\b(' + schemas.join('|') + ')\\.[a-z_]+\\b(?!\\s*\\()', 'gi');
}

// ---------------------------------------------------------------------------------------------------------------------------------
/**
 * Scan SQL. files: [{ path, text, kind: 'migration' | 'step' }]. opts: { platform: [...schemas], secretish: RegExp }.
 * Returns { hits, handlers, platformWrites, secretSettings, identityCols, units } - hits: [{ file, line, ctx, fn, construct, text,
 * hard (reason or false), branches, derived }].
 */
export function scanSql(files, { platform = [], secretish = /key|secret|password|token|jwt/i } = {}) {
  const all = files.map((f) => ({ ...f, text: f.text.replace(/\r\n/g, '\n') })).map((f) => ({ ...f, units: sqlUnits(f.text, f.kind || 'migration'), starts: lineStarts(f.text) }));
  // raw statement text of a step unit (its literals kept) for the API-role read-back shape
  for (const f of all) for (const u of f.units) u.rawStmt = f.text.slice(u.s, u.e);
  // reachability: definer bodies -> called factory functions; trigger functions whenever a definer body writes a factory table
  const bodies = new Map();
  for (const f of all) for (const u of f.units) if (u.fn) bodies.set(u.fn.toLowerCase(), u);
  const triggerFns = new Set();
  for (const f of all) for (const u of f.units) if (u.ctx === 'migration' || u.ctx === 'do') {
    for (const m of u.view.matchAll(/\bexecute\s+(?:function|procedure)\s+([a-z_0-9.]+)\s*\(/gi)) triggerFns.add(m[1].toLowerCase());
    for (const l of u.literals) for (const m of l.text.matchAll(/\bexecute\s+(?:function|procedure)\s+([a-z_0-9.]+)\s*\(/gi)) triggerFns.add(m[1].toLowerCase());
  }
  const reach = new Set();
  const defWrites = [...bodies.values()].some((u) => u.secdef && /\b(insert\s+into|update|delete\s+from)\s+factory\./i.test(u.view));
  const queue = [...bodies.values()].filter((u) => u.secdef);
  if (defWrites) for (const t of triggerFns) if (bodies.has(t)) queue.push(bodies.get(t));
  const seen = new Set();
  while (queue.length) {
    const u = queue.pop(); if (seen.has(u)) continue; seen.add(u);
    if (!u.secdef) reach.add(u.fn.toLowerCase());
    for (const m of u.view.matchAll(/\b(factory\.[a-z_0-9]+)\s*\(/gi)) { const b = bodies.get(m[1].toLowerCase()); if (b && !seen.has(b)) queue.push(b); }
  }
  for (const f of all) for (const u of f.units) if (u.ctx === 'invoker' && reach.has(u.fn.toLowerCase())) u.ctx = 'reachable';

  const hits = [], handlers = [], platformWrites = [], secretSettings = [], identityCols = [];
  const platRe = platform.length ? platformRelationRe(platform) : null;
  for (const f of all) {
    for (const u of f.units) {
      const line = (off) => lineOf(f.starts, off) + (f.lineOffset || 0);   // a founder step: its line in the document
      const unitHits = [];
      const push = (construct, idx, text, hard, extra = {}) => { const h = { file: f.path, line: line(u.s + idx), ctx: u.ctx, fn: u.fn, construct, text: text.trim().slice(0, 60), hard: hard || false, branches: false, derived: false, at: idx, ...extra }; unitHits.push(h); hits.push(h); return h; };
      for (const c of SQL_CONSTRUCTS) for (const m of u.view.matchAll(c.re)) push(c.id, m.index, m[0], c.hard(u.ctx, u));
      if (platRe) for (const m of u.view.matchAll(platRe)) push('platform_read', m.index, m[0], false);
      // dynamic SQL: a literal handed to EXECUTE / format() is scanned as code of the same context
      for (const l of u.literals.filter((x) => x.dynamic)) {
        const lv = l.text.replace(/'[^']*'/g, (s) => blank(s));
        for (const c of SQL_CONSTRUCTS) for (const m of lv.matchAll(c.re)) push(c.id, l.s - u.s + m.index, m[0], c.hard(u.ctx, u), { dynamic: true });
      }
      // constants in literals (identifying ids, hosts, project refs, addresses) and release-channel literals compared
      for (const l of u.literals) {
        const t = l.text;
        for (const m of t.matchAll(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi)) push('uuid_literal', l.s - u.s + m.index, m[0], false, { value: m[0].toLowerCase() });
        if (/^[a-z]{20}$/.test(t)) push('project_ref_literal', l.s - u.s, t, false, { value: t });
        if (/\b(\d{1,3}\.){3}\d{1,3}\b|\blocalhost\b|::1\b/.test(t)) push('address_literal', l.s - u.s, t, 'a loopback or private address or a host literal fits no class');
        if (/^[a-z0-9-]+(\.[a-z0-9-]+)+\.(com|co|net|io|org|app|dev|local|internal|cloud)$/i.test(t)) push('host_literal', l.s - u.s, t, false, { value: t });
        if (/^(production|dev|development|staging|live|test)$/i.test(t)) push('channel_literal', l.s - u.s, t, false, { value: t });
      }
      // the current time compared with a fixed date, time of day or weekday
      const stmts = splitTop(u.view);
      for (const st of stmts) {
        const stLits = u.literals.filter((l) => l.s - u.s >= st.s && l.e - u.s <= st.e);
        if (TIME_FN.test(st.text) && stLits.some((l) => DATE_LIT.test(l.text))) push('fixed_time', st.s, st.text.trim().slice(0, 50), 'the current time compared with a fixed date or time of day');
        const dow = /\b(extract|date_part)\s*\(\s*'?(dow|isodow|hour|minute)\b/i.exec(st.text) || (/\bto_char\s*\(/i.test(st.text) && stLits.some((l) => /^(D|ID|HH\d*|Dy|Day|MI)$/i.test(l.text)) ? { index: 0, 0: 'to_char' } : null);
        if (dow && TIME_FN.test(st.text)) push('fixed_time', st.s + dow.index, dow[0], 'the current weekday or time of day read');
        for (const m of st.text.matchAll(/\bextract\s*\(\s*(dow|isodow|hour|minute)\b|\bdate_part\s*\(/gi)) if (stLits.some((l) => /^(dow|isodow|hour|minute)$/i.test(l.text)) || /dow|hour|minute/i.test(m[0])) push('fixed_time', st.s + m.index, m[0], 'the current weekday or time of day read');
      }
      // exception handlers (PL/pgSQL): a plane-configuration-dependent condition caught without re-raising
      if (u.lang === 'plpgsql' || u.ctx === 'do') {
        for (const m of u.view.matchAll(/\bexception\s+(when\b[\s\S]*?)\bend\b/gi)) {
          const clause = m[1];
          const arms = [...clause.matchAll(/\bwhen\s+([\s\S]*?)\s+then\b([\s\S]*?)(?=\bwhen\b|$)/gi)];
          for (const a of arms) {
            const conds = a[1].split(/\s+or\s+/i).map((x) => x.trim().replace(/\s+/g, ' '));
            const lits = u.literals.filter((l) => l.s - u.s >= m.index && l.e - u.s <= m.index + m[0].length).map((l) => l.text);
            const condsWithLit = conds.map((c) => (/^sqlstate\s*$/i.test(c) && lits.length ? "sqlstate '" + lits[0] + "'" : c));
            const plane = condsWithLit.filter((c) => PLANE_CONDITIONS.test(c));
            const reraises = /\braise\b(?!\s+(notice|warning|info|log|debug)\b)/i.test(a[2]);
            const h = { file: f.path, line: line(u.s + m.index), ctx: u.ctx, fn: u.fn, conditions: condsWithLit, plane, reraises };
            handlers.push(h);
            if (plane.length && !reraises) push('exception_handler', m.index, 'when ' + plane.join(' or '), 'an exception handler catches ' + plane.join(', ') + ' without re-raising');
          }
        }
      }
      // identity columns: carried only if no statement compares the column with a fixed value (checked by the caller over all SQL)
      if (u.ctx === 'migration') for (const m of u.view.matchAll(/\b([a-z_][a-z_0-9]*)\s+(?:small|big)?int(?:eger)?\s+generated\s+(?:always|by\s+default)\s+as\s+identity\b/gi)) identityCols.push({ file: f.path, line: line(u.s + m.index), column: m[1] });
      // BRANCHES: a hit inside a condition (IF / ELSIF / WHEN / CASE / WHERE / WHILE / a comparison), or a PL/pgSQL variable assigned
      // from a hit and then used in one (derived, stored and read back); a founder step's read-back SELECT only displays what it reads
      markBranches(u, unitHits);
      // a branch on a plane VALUE (the database name, the server, a transaction id, a statistic) fits no class, whatever an inventory
      // entry proposes: HARD. The one exception: current_database() naming the database of a GRANT / REVOKE ... ON DATABASE.
      for (const h of unitHits) if (!h.hard && h.branches && PLANE_VALUE.has(h.construct) && !grantOnDatabase(u, h)) {
        h.hard = 'a branch depends on ' + h.text + (h.derived ? ' (through a value derived from it)' : '') + ': no class permits a branch on the database name, the server, a transaction id or a statistic';
      }
      // the platform-schema inventory: a statement that creates, alters, drops, grants on, comments on or writes to a platform object
      if (platform.length && (u.ctx === 'migration' || u.ctx === 'do' || u.ctx === 'step' || u.ctx === 'definer' || u.ctx === 'reachable' || u.ctx === 'invoker')) {
        const plat = platform.map((s) => s.replace(/[^a-z_]/g, '')).join('|');
        const writeRe = new RegExp('\\b(create|alter|drop|comment\\s+on|grant|revoke|insert\\s+into|update|delete\\s+from|truncate|merge\\s+into|security\\s+label\\s+on)\\b[^;]*?\\b(' + plat + ')\\.[a-z_]+|\\balter\\s+default\\s+privileges\\s+in\\s+schema\\s+(' + plat + ')\\b|\\b(grant|revoke)\\b[^;]*\\bon\\s+(all\\s+\\w+\\s+in\\s+)?schema\\s+(' + plat + ')\\b|\\bupdate\\s+(pg_[a-z_]+)\\b|\\b(insert\\s+into|delete\\s+from|truncate)\\s+(pg_[a-z_]+)\\b|\\balter\\s+table\\s+(pg_[a-z_]+)\\b', 'gi');
        for (const m of u.view.matchAll(writeRe)) platformWrites.push({ file: f.path, line: line(u.s + m.index), ctx: u.ctx, fn: u.fn, text: m[0].replace(/\s+/g, ' ').slice(0, 80) });
        for (const l of u.literals.filter((x) => x.dynamic)) for (const m of l.text.matchAll(writeRe)) platformWrites.push({ file: f.path, line: line(l.s), ctx: u.ctx, fn: u.fn, text: m[0].replace(/\s+/g, ' ').slice(0, 80), dynamic: true });
      }
      // the secret-setting inventory: SET / RESET / ALTER ROLE|DATABASE ... SET|RESET / set_config / ALTER SYSTEM of a secret-like name
      for (const st of splitTop(u.view)) {
        const t = st.text;
        const names = [];
        for (const m of t.matchAll(/^\s*(?:set|reset)\s+(?:local\s+|session\s+)?([a-z_][a-z_0-9.]*)/gi)) names.push(m[1]);
        for (const m of t.matchAll(/\balter\s+(?:role|user|database)\s+[^;]*?\b(?:set|reset)\s+([a-z_][a-z_0-9.]*)/gi)) names.push(m[1]);
        for (const m of t.matchAll(/\balter\s+system\s+(?:set|reset)\s+([a-z_][a-z_0-9.]*)/gi)) names.push(m[1]);
        for (const m of t.matchAll(/\bset\s+([a-z_][a-z_0-9.]*)\s*(=|to)\b/gi)) if (/\b(function|procedure)\b/i.test(u.stmt) && u.ctx === 'migration') names.push(m[1]);
        const stLits = u.literals.filter((l) => l.s - u.s >= st.s && l.e - u.s <= st.e);
        if (/\bset_config\s*\(/i.test(t) && stLits.length) names.push(stLits[0].text);
        for (const n of names) if (secretish.test(n) && !/^(role|local|session|constraints|transaction)$/i.test(n)) secretSettings.push({ file: f.path, line: line(u.s + st.s), ctx: u.ctx, fn: u.fn, name: n });
      }
    }
  }
  // an identity column compared with a fixed value anywhere is no longer carried
  for (const ic of identityCols) {
    for (const f of all) for (const u of f.units) {
      const re = new RegExp('\\b' + ic.column + '\\s*(=|<>|!=|<=|>=|<|>)\\s*\\d|\\d\\s*(=|<>|!=|<=|>=|<|>)\\s*[a-z_.]*\\b' + ic.column + '\\b', 'i');
      if (re.test(u.view)) ic.comparedWithConstant = (ic.comparedWithConstant || []).concat(f.path + ':' + lineOf(f.starts, u.s + u.view.search(re)));
    }
  }
  for (const h of hits) delete h.at;
  return { hits, handlers, platformWrites, secretSettings, identityCols, units: all.flatMap((f) => f.units.map((u) => ({ file: f.path, ctx: u.ctx, fn: u.fn, secdef: u.secdef }))) };
}

// the constructs whose value tells planes apart and that no r3 class lets a branch depend on
const PLANE_VALUE = new Set(['database', 'server', 'xact', 'statistic']);
/** current_database() as the database a GRANT / REVOKE ... ON DATABASE names (own-plane addressing), in code or in dynamic SQL */
function grantOnDatabase(u, h) {
  if (h.construct !== 'database' || !/current_database/i.test(h.text)) return false;
  const st = splitTop(u.view).find((x) => h.at >= x.s && h.at < x.e);
  if (!st) return false;
  const lits = u.literals.filter((l) => l.s - u.s >= st.s && l.e - u.s <= st.e).map((l) => l.text).join(' ');
  return /\b(grant|revoke)\b[\s\S]*\bon\s+database\b/i.test(st.text + ' ' + lits) && !/\b(if|elsif|when|case|while)\b/i.test(st.text);
}

// top-level (depth 0) statements of a unit's code view, split at ';'
function splitTop(view) {
  const out = []; let s = 0;
  for (let i = 0; i < view.length; i++) if (view[i] === ';') { out.push({ s, e: i + 1, text: view.slice(s, i + 1) }); s = i + 1; }
  if (view.slice(s).trim()) out.push({ s, e: view.length, text: view.slice(s) });
  return out;
}

const COND_RE = /\b(if|elsif|when|where|while|case|having|and|or|not)\b|<>|!=|[<>]|(?<![:<>!=])=(?![>=])|\bis\s+(not\s+)?(distinct|null|true|false)\b|\bin\s*\(|\b(like|ilike)\b|~/i;
function markBranches(u, unitHits) {
  if (!unitHits.length) return;
  const stmts = splitTop(u.view);
  const stepReadBack = u.ctx === 'step' && /^(select|with)\b/i.test(u.stmt);
  // direct: the statement holding the hit has a condition around it (a founder step's read-back only displays what it reads)
  const tainted = new Map(); // variable -> constructs
  for (const st of stmts) {
    const inSt = unitHits.filter((h) => h.at >= st.s && h.at < st.e);
    if (!inSt.length) continue;
    // PL/pgSQL: `var := <expr with a hit>` or `select ... into var ...` - the value is stored; its later use decides
    const core = st.text.replace(/^(\s*(begin|declare|loop|then|else|end\s+if|end\s+loop)\b)+/i, '');
    const assign = /^\s*([a-z_][a-z_0-9]*)\s*:=/i.exec(core)
      || /^\s*([a-z_][a-z_0-9]*)\s+(?:constant\s+)?[a-z_][a-z_0-9.]*(?:\[\])?\s*(?:not\s+null\s*)?:=/i.exec(core);   // a declaration's initializer
    const into = /\binto\s+(?:strict\s+)?([a-z_][a-z_0-9]*(?:\s*,\s*[a-z_][a-z_0-9]*)*)\b/i.exec(core);
    const targets = assign ? [assign[1]] : into && /^\s*select\b/i.test(core) ? into[1].split(/\s*,\s*/) : [];
    for (const v of targets) tainted.set(v.toLowerCase(), (tainted.get(v.toLowerCase()) || []).concat(inSt));
    if (stepReadBack) continue;
    const head = st.text.replace(/\s+/g, ' ').trim();
    const isDdlOnly = /^(create|alter|comment|grant|revoke)\b/i.test(head) && !/\bcheck\s*\(/i.test(head);
    if (isDdlOnly && !targets.length) continue;
    const condPart = assign ? core.slice(core.indexOf(':=') + 2) : core;
    // (an identity column's definition is judged by the column's uses: identityCols)
    if (COND_RE.test(condPart.replace(/\binto\s+[a-z_0-9, ]+/i, ' '))) for (const h of inSt) if (!(h.construct === 'sequence' && /generated|serial/i.test(h.text))) h.branches = true;
  }
  // derived: a tainted variable used in a later condition
  for (const [v, srcs] of tainted) {
    const use = new RegExp('\\b(if|elsif|when|while|where|case|and|or)\\b[^;]*\\b' + v + '\\b|\\b' + v + '\\b\\s*(<>|!=|=|<|>|\\bis\\b|\\bin\\b)', 'i');
    if (use.test(u.view.replace(new RegExp('\\binto\\s+(strict\\s+)?' + v + '\\b', 'gi'), ' '))) for (const h of srcs) { h.branches = true; h.derived = true; }
  }
}

// ---------------------------------------------------------------------------------------------------------------------------------
// the Edge
/** Scan Edge sources: files [{ path, text }]. Returns { hits, catches, sqlCalls } (hits as scanSql's; ctx 'edge'). */
export function scanEdge(files) {
  const hits = [], catches = [];
  const src = files.map((f) => ({ ...f, text: f.text.replace(/\r\n/g, '\n') }));
  const code = (t) => t.replace(/\/\*[\s\S]*?\*\//g, (s) => blank(s)).replace(/(^|[^:'"\\])\/\/[^\n]*/g, (s, p) => p + blank(s.slice(p.length)));
  // exported functions of the shared files: name -> { file, params, body: [s, e] }
  const fns = new Map();
  for (const f of src) {
    const c = code(f.text);
    for (const m of c.matchAll(/export\s+(?:async\s+)?function\s+([A-Za-z_]\w*)\s*\(([^)]*)\)[^{]*\{/g)) {
      const params = m[2].split(',').map((p) => (/^\s*([A-Za-z_]\w*)/.exec(p) || [])[1]).filter(Boolean);
      let d = 1, j = m.index + m[0].length; while (j < c.length && d) { if (c[j] === '{') d++; else if (c[j] === '}') d--; j++; }
      fns.set(m[1], { file: f.path, params, s: m.index + m[0].length, e: j });
    }
  }
  const taintByFile = new Map(); // file -> [{ name, env, region: [s, e] }]
  // a tainted identifier carries every environment name that reaches it
  const add = (file, name, env, region) => {
    const a = taintByFile.get(file) || []; taintByFile.set(file, a);
    const x = a.find((y) => y.name === name && y.region[0] === region[0]);
    const envs = [].concat(env);
    if (!x) { a.push({ name, env: [...new Set(envs)].sort(), region }); return true; }
    const before = x.env.length; x.env = [...new Set([...x.env, ...envs])].sort(); return x.env.length !== before;
  };
  for (const f of src) {
    const c = code(f.text);
    const starts = lineStarts(f.text);
    const push = (construct, idx, text, hard, extra = {}) => { const h = { file: f.path, line: lineOf(starts, idx), ctx: 'edge', fn: null, construct, text: String(text).trim().slice(0, 70), hard: hard || false, branches: false, derived: false, ...extra }; hits.push(h); return h; };
    for (const m of c.matchAll(/\bDeno\.env\.get\(\s*'([A-Z0-9_]+)'\s*\)|\bprocess\.env\.([A-Z0-9_]+)|\bprocess\.env\[\s*'([A-Z0-9_]+)'\s*\]/g)) {
      const env = m[1] || m[2] || m[3];
      // an environment read with a non-empty default (`|| '1'`, `?? 'x'`, `Number(...) || 1`) is a branch on the value
      const after = c.slice(m.index + m[0].length, m.index + m[0].length + 60);
      const defaulted = /^\s*(\|\||\?\?)\s*(?!''|""|``)['"`\d]/.test(after) || /^\s*(\|\|\s*'[^']*'\s*)?\)\s*(\|\||\?\?)\s*\d/.test(after);
      push('env:' + env, m.index, m[0], false, { env, branches: defaulted, derived: defaulted });
      const bind = /(?:const|let|var)\s+([A-Za-z_]\w*)\s*(?::\s*[^=;\n]+?)?=\s*$/.exec(c.slice(Math.max(0, m.index - 60), m.index));
      if (bind) add(f.path, bind[1], env, [0, c.length]);
      else {
        const pre = c.slice(Math.max(0, m.index - 120), m.index);
        const call = /([A-Za-z_]\w*)\s*\(\s*$/.exec(pre); if (call && fns.has(call[1])) { const fn = fns.get(call[1]); add(fn.file, fn.params[0], env, [fn.s, fn.e]); }
        // the value the call returns, when it is bound: `const k = [await] f(..., Deno.env.get('X'))` is derived from that value
        const ret = /(?:const|let|var)\s+([A-Za-z_]\w*)\s*(?::\s*[^=;\n]+?)?=\s*(?:await\s+)?[A-Za-z_][\w.]*\s*\([^()\n;]*$/.exec(pre);
        if (ret) add(f.path, ret[1], env, [0, c.length]);
      }
    }
    // the request's host / origin / forwarding headers; a loopback or private address; the current time against a fixed value
    // the peer the runtime reports is the call's input (S-6); the request's own host, origin or a forwarded header names the plane
    for (const m of c.matchAll(/\bremoteAddr\b/g)) push('peer_address', m.index, m[0], false);
    for (const m of c.matchAll(/new URL\(\s*req\w*\.url\s*\)\.(host|hostname|origin|port)\b|\breq\w*\.headers\.get\(\s*['"`](host|origin|referer|forwarded|x-forwarded-[a-z-]+|x-real-ip|cf-connecting-ip|true-client-ip|x-client-ip)['"`]\s*\)|\.headers\.get\(\s*['"`](forwarded|x-forwarded-[a-z-]+|x-real-ip|cf-connecting-ip|true-client-ip|x-client-ip)['"`]\s*\)/gi)) {
      push('request_host', m.index, m[0], 'the request\'s host, origin or a forwarded header names the plane, not the call');
    }
    for (const m of f.text.matchAll(/['"`](?:[^'"`\n]*?)\b(127\.\d+\.\d+\.\d+|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+|169\.254\.\d+\.\d+|localhost|::1)\b[^'"`\n]*['"`]/g)) {
      if (/^\s*(\/\/|\*)/.test(f.text.slice(f.text.lastIndexOf('\n', m.index) + 1, m.index))) continue;
      push('address_literal', m.index, m[0], 'a loopback or private address fits no class');
    }
    for (const m of c.matchAll(/\b(Date\.now\(\)|new Date\([^)]*\))\s*(?:\.\w+\(\))?\s*(<|>|<=|>=|===?|!==?)\s*(?:\d{9,}|new Date\(\s*['"`]\d{4}|Date\.parse\(\s*['"`]\d{4})|\.(getDay|getUTCDay|getHours|getUTCHours|getMinutes)\(\)/g)) push('fixed_time', m.index, m[0], 'the current time compared with a fixed date or time of day');
    for (const m of f.text.matchAll(/['"`]([a-z]{20})['"`]/g)) push('project_ref_literal', m.index, m[1], false, { value: m[1] });
    for (const m of c.matchAll(/(===?|!==?)\s*'(production|dev|development|staging|live)'|'(production|dev|development|staging|live)'\s*(===?|!==?)/g)) push('channel_literal', m.index, m[0], false, { value: m[2] || m[3] });
    c.split('\n').forEach((l, i) => { if (/\bcatch\b/.test(l)) catches.push({ file: f.path, line: i + 1, code: l.trim().slice(0, 120) }); });
  }
  // propagate: within a region, an identifier bound from a tainted one; across files, a tainted argument taints the callee's parameter
  for (let round = 0; round < 6; round++) {
    let changed = false;
    for (const f of src) {
      const c = code(f.text);
      for (const t of [...(taintByFile.get(f.path) || [])]) {
        const region = c.slice(t.region[0], t.region[1]);
        const tre = new RegExp('\\b' + t.name + '\\b');
        for (const m of region.matchAll(/(?:const|let|var)\s+([A-Za-z_]\w*)\s*(?::\s*[^=;\n]+?)?=(?!=)\s*([^;\n]+)/g)) if (tre.test(m[2]) && m[1] !== t.name) changed = add(f.path, m[1], t.env, t.region) || changed;
        for (const m of region.matchAll(/([A-Za-z_]\w*)\s*\(([^()]*)\)/g)) {
          if (!fns.has(m[1])) continue;
          const args = m[2].split(','); const fn = fns.get(m[1]);
          args.forEach((a, k) => { if (tre.test(a) && fn.params[k]) changed = add(fn.file, fn.params[k], t.env, [fn.s, fn.e]) || changed; });
        }
      }
    }
    if (!changed) break;
  }
  // a branch that tests a tainted value (the production-ref refusal is its own class)
  for (const f of src) {
    const c = code(f.text); const starts = lineStarts(f.text);
    const byLine = new Map(); // one hit per branch line, naming every environment value that reaches it
    for (const t of taintByFile.get(f.path) || []) {
      const region = c.slice(t.region[0], t.region[1]);
      const n = t.name;
      const uses = new RegExp('\\bif\\s*\\([^)]*\\b' + n + '\\b|\\b' + n + '\\b\\s*\\?(?!\\.)|\\b' + n + '\\b\\s*(\\|\\||&&|\\?\\?)|(\\|\\||&&|\\?\\?)\\s*!?\\s*\\b' + n + '\\b|!\\s*' + n + '\\b|\\.test\\(\\s*' + n + '\\b|\\b' + n + '\\b(?:\\.\\w+\\(\\))*\\.(includes|startsWith|endsWith|match)\\(|\\b' + n + '\\b\\s*(===?|!==?|<|>)|(===?|!==?)\\s*' + n + '\\b', 'g');
      for (const m of region.matchAll(uses)) {
        const ln = lineOf(starts, t.region[0] + m.index);
        const lineText = c.slice(starts[ln - 1], ln < starts.length ? starts[ln] - 1 : c.length);
        // the production-ref refusal: the ONLY use of the value on its line is `<value>.toLowerCase().includes(PRODUCTION_REF)`
        const prodRe = new RegExp('\\b' + n + '\\.toLowerCase\\(\\)\\.includes\\(PRODUCTION_REF\\)', 'g');
        const productionRef = new RegExp(prodRe.source).test(lineText) && !new RegExp('\\b' + n + '\\b').test(lineText.replace(prodRe, ' '));
        const x = byLine.get(ln) || { env: new Set(), productionRef: true, via: new Set(), text: lineText.trim().slice(0, 70) };
        for (const e of t.env) x.env.add(e); x.via.add(n); x.productionRef = x.productionRef && productionRef;
        byLine.set(ln, x);
      }
    }
    for (const [ln, x] of [...byLine.entries()].sort((a, b) => a[0] - b[0])) {
      const env = [...x.env].sort();
      hits.push({ file: f.path, line: ln, ctx: 'edge', fn: null, construct: x.productionRef ? 'production_ref_refusal' : 'env-branch', value: env.join('+'), text: x.text, hard: false,
        branches: true, derived: true, env, productionRef: x.productionRef, via: [...x.via].join(',') });
    }
  }
  return { hits, catches, taint: [...taintByFile.entries()].flatMap(([file, a]) => a.map((t) => ({ file, name: t.name, env: t.env }))) };
}

// ---------------------------------------------------------------------------------------------------------------------------------
/** The SQL of the prepared founder steps: every fenced sql / psql block and every inline code span that is a statement. */
export function founderStepSql(md) {
  const text = md.replace(/\r\n/g, '\n');
  const out = [];
  for (const m of text.matchAll(/^```(sql|psql)\n([\s\S]*?)^```$/gm)) out.push({ line: text.slice(0, m.index).split('\n').length + 1, text: m[2].split('\n').filter((l) => !/^\s*\\/.test(l)).join('\n') });
  const outside = text.replace(/```[\s\S]*?```/g, (s) => blank(s));
  for (const m of outside.matchAll(/`([^`\n]+)`/g)) if (/^\s*(select|with|insert|update|delete|alter|grant|revoke|create|drop|set|reset|show|do|call)\b/i.test(m[1])) out.push({ line: outside.slice(0, m.index).split('\n').length, text: m[1].trim().replace(/;?$/, ';') });
  return out;
}

// ---------------------------------------------------------------------------------------------------------------------------------
// classification against the developer inventory (a proposal; the verifier classes)
export const CLASSES = ['production-ref', 'same-on-every-plane', 'call-input', 'own-plane', 'carried'];
export const BRANCH_CLASSES = new Set(['production-ref', 'same-on-every-plane', 'call-input']);
// A BRANCH UNDER A DIRECTOR RULING: r3 own-plane addressing says "no branch tests the value itself". The Director's CR-021 ruling
// (APPROVED, Alternative 1) classes an Edge handler's fail-closed validation of its own configuration values - a check whose only
// effect is to refuse - as own-plane addressing, branch included. Only that ruling admits a branch in a class that otherwise permits
// none; an entry claims it by `ruling: { cr, quote }`, and the static contract's P3p holds every such claim to the Director's record.
export const RULED_BRANCH = { 'own-plane': new Set(['CR-021']) };
const ruledBranch = (e) => !!(e.ruling && RULED_BRANCH[e.cls] && RULED_BRANCH[e.cls].has(e.ruling.cr));
// NOT A HIT: the proposal that a construct this approximation reports is outside §3.4 r3's hit list altogether, so it needs no class
// and may be branched on. Only for a literal the scanner recognises by its form (a UUID) that names a record THIS migration creates,
// with that value, on every plane. The entry must quote the r3 hit item it is read against (`reading`), name the statement that
// creates the record (`construction`), and name the key column the record is inserted under (`seeded`: 'factory.<table>.<column>').
// The claim is checked, not taken on trust: `seeded` must be the single-column primary key of that table and a top-level
// INSERT ... VALUES of the migration must put exactly this literal in it (insertedKeys). Like every entry, a proposal: the verifier
// classes every hit itself.
export const NOT_A_HIT = 'not-a-hit';
export const R3_LITERAL_ITEM = 'a literal naming a record or object that exists on the live plane or on a disposable one, but not on both';
const notHitOk = (e, seeded) => e.cls === NOT_A_HIT && ['uuid_literal'].includes(e.construct) && typeof e.reading === 'string' && e.reading.includes(R3_LITERAL_ITEM)
  && typeof e.construction === 'string' && e.construction.length > 0 && !e.pending
  && typeof e.seeded === 'string' && seeded instanceof Set && seeded.has(e.seeded + '=' + e.value);

// split at commas outside parentheses and brackets (a column list, a VALUES tuple)
const splitCommas = (s) => { const out = []; let d = 0, from = 0; for (let i = 0; i < s.length; i++) { const ch = s[i]; if (ch === '(' || ch === '[') d++; else if (ch === ')' || ch === ']') d--; else if (ch === ',' && d === 0) { out.push(s.slice(from, i)); from = i + 1; } } out.push(s.slice(from)); return out; };
/**
 * The key values of the rows a migration inserts by literal, wherever it runs: a Set of 'factory.<table>.<column>=<value>' for every
 * top-level INSERT INTO factory.<table> (<columns>) VALUES (...) whose value for <column> is a plain literal, where <column> is the
 * single-column primary key that the migration's CREATE TABLE of <table> declares (inline or as a table constraint). A statement inside
 * a DO block or a function body, an INSERT ... SELECT, and a value that is an expression are not counted: only a statement every
 * application runs, with the value written out.
 */
export function insertedKeys(files) {
  const pk = new Map(), rows = [];
  for (const f of files) {
    const text = f.text.replace(/\r\n/g, '\n');
    const lits = [];
    // code as written; comments dropped; each literal a numbered token; each dollar-quoted body an opaque token (never read)
    const flat = lexSql(text).map((g) => (g.k === 'code' ? text.slice(g.s, g.e) : g.k === 'literal' ? ' \u0001' + (lits.push(text.slice(g.inner[0], g.inner[1]).replace(/''/g, "'")) - 1) + '\u0001 ' : g.k === 'dollar' ? ' \u0002 ' : ' ')).join('');
    for (const m of flat.matchAll(/\bcreate\s+table\s+(?:if\s+not\s+exists\s+)?factory\.([a-z_0-9]+)\s*\(/gi)) {
      let d = 1, j = m.index + m[0].length; while (j < flat.length && d) { if (flat[j] === '(') d++; else if (flat[j] === ')') d--; j++; }
      const items = splitCommas(flat.slice(m.index + m[0].length, j - 1)).map((x) => x.trim());
      const isConstraint = (it) => /^(constraint|primary|unique|check|foreign|exclude|like)\b/i.test(it);
      const inline = items.filter((it) => !isConstraint(it) && /\bprimary\s+key\b/i.test(it)).map((it) => (/^"?([a-z_0-9]+)/i.exec(it) || [])[1]);
      const table = items.map((it) => /^(?:constraint\s+\S+\s+)?primary\s+key\s*\(([^)]*)\)/i.exec(it)).filter(Boolean).map((x) => x[1].split(',').map((c) => c.trim().replace(/"/g, '')));
      const key = inline.length === 1 && table.length === 0 ? [inline[0]] : inline.length === 0 && table.length === 1 ? table[0] : null;
      if (key && key.length === 1 && key[0]) pk.set(m[1].toLowerCase(), key[0].toLowerCase());
    }
    for (const m of flat.matchAll(/(?:^|;)\s*insert\s+into\s+factory\.([a-z_0-9]+)\s*\(([^)]*)\)\s*values\b/gi)) {
      const cols = m[2].split(',').map((c) => c.trim().replace(/"/g, '').toLowerCase());
      const from = m.index + m[0].length, end = flat.indexOf(';', from);
      const tail = flat.slice(from, end < 0 ? flat.length : end).replace(/\bon\s+conflict\b[\s\S]*$|\breturning\b[\s\S]*$/i, '');
      let d = 0, st = -1;
      for (let k = 0; k < tail.length; k++) {
        if (tail[k] === '(') { if (d === 0) st = k + 1; d++; } else if (tail[k] === ')') { d--; if (d === 0) {
          const vals = splitCommas(tail.slice(st, k));
          if (vals.length === cols.length) cols.forEach((c, x) => { const lm = /^\s*\u0001(\d+)\u0001\s*(?:::\s*[a-z_]+\s*)?$/i.exec(vals[x]); if (lm) rows.push({ table: m[1].toLowerCase(), column: c, value: lits[Number(lm[1])] }); });
        } }
      }
    }
  }
  return new Set(rows.filter((r) => pk.get(r.table) === r.column).map((r) => 'factory.' + r.table + '.' + r.column + '=' + r.value));
}

/**
 * inventory: [{ file, construct, fn? (function name, or '-' for top-level / DO), ctx?, value?, count, cls, why, construction?, reading?, seeded?, pending?, ruling? }]
 * ruling: { cr, quote } - the Director decision the class rests on, with a verbatim quote of it (checked by the static contract's P3p).
 * opts.seeded: insertedKeys() of the migration (a not-a-hit entry is refused without it).
 * Returns { hard, unmatched, stale, miscount, badClass, branchInNoBranchClass, pending, matched }.
 */
export function classify(hits, inventory, { seeded } = {}) {
  const hard = hits.filter((h) => h.hard);
  const needs = hits.filter((h) => !h.hard);
  const key = (x) => [x.file, x.construct, x.fn || '-', x.value || ''].join('|');
  const groups = new Map();
  for (const h of needs) { const k = key({ ...h, fn: h.fn || '-' }); groups.set(k, (groups.get(k) || []).concat(h)); }
  const inv = new Map(inventory.map((e) => [key(e), e]));
  const unmatched = [], miscount = [], badClass = [], branchBad = [], pending = [], matched = [];
  for (const [k, hs] of groups) {
    const e = inv.get(k);
    if (!e) { unmatched.push(...hs); continue; }
    matched.push({ entry: e, hits: hs });
    if (e.count !== hs.length) miscount.push({ entry: e, found: hs.length, lines: hs.map((h) => h.line) });
    if (e.cls === NOT_A_HIT ? !notHitOk(e, seeded) : (!CLASSES.includes(e.cls) || (e.cls === 'same-on-every-plane' && !e.construction))) badClass.push(e);
    if (hs.some((h) => h.branches) && e.cls !== NOT_A_HIT && !BRANCH_CLASSES.has(e.cls) && !ruledBranch(e)) branchBad.push({ entry: e, lines: hs.filter((h) => h.branches).map((h) => h.line) });
    if (e.cls === 'production-ref' && hs.some((h) => h.productionRef === false)) branchBad.push({ entry: e, lines: hs.filter((h) => !h.productionRef).map((h) => h.line), why: 'not the production-ref refusal' });
    if (e.pending) pending.push({ entry: e, lines: hs.map((h) => h.line) });
  }
  const stale = inventory.filter((e) => !groups.has(key(e)));
  return { hard, unmatched, stale, miscount, badClass, branchBad, pending, matched };
}

// ---------------------------------------------------------------------------------------------------------------------------------
/** THE SELF-TEST: one synthetic case per construct, and the negative controls. Returns [{ name, ok, detail }]. */
export function selfTest() {
  const PLATFORM = ['pg_catalog', 'information_schema', 'auth', 'storage', 'vault', 'cron', 'net', 'extensions'];
  const sql = (text, kind = 'migration') => scanSql([{ path: 't.sql', text, kind }], { platform: PLATFORM });
  const has = (r, construct, pred = () => true) => r.hits.some((h) => h.construct === construct && pred(h));
  const none = (r) => r.hits.length === 0 && r.platformWrites.length === 0 && r.secretSettings.length === 0;
  const fn = (body, { definer = false, lang = 'plpgsql' } = {}) => `create function factory.f() returns boolean language ${lang} ${definer ? 'security definer ' : ''}set search_path = pg_catalog, pg_temp as $$ ${body} $$;`;
  const cases = [
    ['current_catalog in a branch (L7-16) is HARD, whatever an inventory proposes', () => { const r = sql(fn("begin if current_catalog = 'postgres' then return true; end if; return false; end;")); return has(r, 'database', (h) => h.branches && h.hard); }],
    ['a derived current_database() branch is HARD', () => { const r = sql(fn("declare d text := current_database(); begin if d like 'x%' then return true; end if; return false; end;")); return has(r, 'database', (h) => h.derived && h.hard); }],
    ['version() in a branch is HARD', () => has(sql(fn("begin return version() like 'PostgreSQL 17%'; end;")), 'server', (h) => h.branches && h.hard)],
    ['a transaction id in a branch is HARD', () => has(sql(fn("begin if txid_current() > 100 then return true; end if; return false; end;")), 'xact', (h) => h.branches && h.hard)],
    ['a statistic in a branch is HARD', () => has(sql(fn("begin return (select reltuples from pg_catalog.pg_class where oid = 'factory.t'::regclass) > 0; end;")), 'statistic', (h) => h.branches && h.hard)],
    ['NEG current_database() as the target of GRANT ... ON DATABASE (own-plane addressing) is not HARD', () => { const r = sql("do $d$ begin execute format('grant connect on database %I to factory_node_api', current_database()); end $d$;"); return has(r, 'database', (h) => !h.hard); }],
    ['NEG current_database() read without a branch is not HARD', () => has(sql("select current_database();"), 'database', (h) => !h.hard && !h.branches)],
    ['current_database() read', () => has(sql("select current_database();"), 'database')],
    ['a derived value: current_catalog stored, then compared', () => { const r = sql(fn("declare v text; begin v := current_catalog; if v = 'x' then return true; end if; return false; end;")); return has(r, 'database', (h) => h.branches && h.derived); }],
    ['a derived value: SELECT ... INTO, then IF', () => { const r = sql("do $d$ declare n int; begin select count(*) into n from pg_catalog.pg_class; if n > 0 then raise notice 'x'; end if; end $d$;"); return has(r, 'catalog_read', (h) => h.branches && h.derived); }],
    ['inet_client_addr()', () => has(sql(fn("begin return inet_client_addr() is null; end;")), 'server')],
    ['inet_server_port()', () => has(sql("select inet_server_port();"), 'server')],
    ['version()', () => has(sql("select version();"), 'server')],
    ['current_setting()', () => has(sql(fn("begin return current_setting('app.x') = 'y'; end;")), 'setting')],
    ['SHOW', () => has(sql("show server_version;"), 'setting')],
    ['SET ... FROM CURRENT', () => has(sql("create function factory.g() returns int language sql set work_mem from current as $$ select 1 $$;"), 'setting')],
    ['pg_settings', () => has(sql("select setting from pg_settings where name = 'x';"), 'setting')],
    ['txid_current()', () => has(sql("select txid_current();"), 'xact')],
    ['pg_current_xact_id()', () => has(sql("select pg_current_xact_id();"), 'xact')],
    ['a sequence value', () => has(sql("select nextval('factory.s');"), 'sequence')],
    ['an identity column', () => { const r = sql("create table factory.t (id bigint generated always as identity);"); return has(r, 'sequence') && r.identityCols.length === 1; }],
    ['an identity column compared with a constant', () => { const r = sql("create table factory.t (id bigint generated always as identity); " + fn("begin return exists (select 1 from factory.t where id = 1); end;")); return r.identityCols[0].comparedWithConstant; }],
    ['pg_stat_activity', () => has(sql("select count(*) from pg_stat_activity;"), 'statistic')],
    ['reltuples', () => has(sql("select reltuples from pg_catalog.pg_class;"), 'statistic')],
    ['a pg_catalog relation read', () => has(sql("select 1 from pg_catalog.pg_proc;"), 'catalog_read')],
    ['an unqualified catalog relation read', () => has(sql("select 1 from pg_class;"), 'catalog_read')],
    ['an information_schema read', () => has(sql("select 1 from information_schema.tables;"), 'catalog_read')],
    ['a platform schema read (auth)', () => has(sql(fn("begin return exists (select 1 from auth.users); end;", { definer: true })), 'platform_read')],
    ['a regclass lookup', () => has(sql("select 'factory.t'::regclass;"), 'catalog_lookup')],
    ['a privilege probe', () => has(sql("select has_table_privilege('r', 'factory.t', 'SELECT');"), 'privilege_probe')],
    ['the current time against a fixed date', () => has(sql(fn("begin if now() > '2026-10-01'::timestamptz then return true; end if; return false; end;")), 'fixed_time', (h) => h.hard)],
    ['the current weekday', () => has(sql(fn("begin return extract(dow from now()) = 0; end;")), 'fixed_time', (h) => h.hard)],
    ['the applying login in a DO block (current_user)', () => has(sql("do $p$ begin if (select r.rolsuper from pg_catalog.pg_roles r where r.rolname = current_user) then raise notice 'x'; end if; end $p$;"), 'current_user', (h) => h.hard)],
    ['a role attribute in a DO block', () => has(sql("do $p$ begin if (select r.rolsuper from pg_catalog.pg_roles r where r.rolname = 'x') then raise notice 'x'; end if; end $p$;"), 'role_attribute', (h) => h.hard)],
    ['session_user in a migration statement', () => has(sql("grant usage on schema factory to session_user;"), 'session_user', (h) => h.hard)],
    ['current_user in a SECURITY DEFINER body', () => has(sql(fn("begin return current_user = 'x'::name; end;", { definer: true })), 'current_user', (h) => h.hard)],
    ['current_user in a founder step', () => has(sql("select current_user;", 'step'), 'current_user', (h) => h.hard)],
    ['an owner read', () => has(sql("select pg_get_userbyid(relowner) from pg_catalog.pg_class;"), 'owner', (h) => h.hard)],
    ['a membership read', () => has(sql("select 1 from pg_catalog.pg_auth_members;"), 'membership', (h) => h.hard)],
    ['plane_identity', () => has(sql("select 1 from factory.plane_identity;"), 'plane_identity', (h) => h.hard)],
    ['a swallowed insufficient_privilege', () => has(sql(fn("begin perform 1; exception when insufficient_privilege then return null; end;")), 'exception_handler', (h) => h.hard)],
    ['a swallowed WHEN OTHERS', () => has(sql(fn("begin perform 1; exception when others then return false; end;")), 'exception_handler', (h) => h.hard)],
    ['a swallowed lock_not_available', () => has(sql(fn("begin perform 1; exception when lock_not_available then return false; end;")), 'exception_handler', (h) => h.hard)],
    ['a swallowed SQLSTATE 42501', () => has(sql(fn("begin perform 1; exception when sqlstate '42501' then return false; end;")), 'exception_handler', (h) => h.hard)],
    ['dynamic SQL is scanned', () => has(sql(fn("begin execute 'select current_setting(''x'')'; return true; end;")), 'setting', (h) => h.dynamic)],
    ['an identifying UUID literal', () => has(sql(fn("begin return 'c0ffee00-0000-4000-8000-000000000042'::uuid is null; end;")), 'uuid_literal')],
    ['a project-ref literal', () => has(sql("select 'abcdefghijklmnopqrst';"), 'project_ref_literal')],
    ['a loopback literal', () => has(sql("select '127.0.0.1';"), 'address_literal', (h) => h.hard)],
    ['a release-channel literal', () => has(sql(fn("begin return 'dev' = 'x'; end;")), 'channel_literal')],
    ['platform-schema inventory: a grant on schema auth', () => sql("grant usage on schema auth to factory_node_api;").platformWrites.length === 1],
    ['platform-schema inventory: an unqualified catalog write', () => sql("update pg_proc set proname = 'x';").platformWrites.length === 1],
    ['platform-schema inventory: default privileges in a platform schema', () => sql("alter default privileges in schema storage grant select on tables to x;").platformWrites.length === 1],
    ['secret-setting inventory: set local app.jwt_secret', () => sql("set local app.jwt_secret = 'x';").secretSettings.length === 1],
    ['secret-setting inventory: set_config of a key', () => sql("select set_config('app.api_key', 'x', true);").secretSettings.length === 1],
    ['secret-setting inventory: alter role ... set password_encryption', () => sql("alter role x set password_encryption = 'scram-sha-256';").secretSettings.length === 1],
    // negative controls
    ['NEG a function SET clause pinning search_path and a timeout', () => none(sql("create function factory.h() returns int language sql set search_path = pg_catalog, pg_temp set lock_timeout = '15s' as $$ select 1 $$;"))],
    ['NEG SET LOCAL of a timeout', () => none(sql("set local lock_timeout = '5s';"))],
    ['NEG comment text', () => none(sql("-- current_setting('x') and current_catalog and pg_catalog.pg_class\nselect 1;"))],
    ['NEG a literal that mentions a construct', () => none(sql("select 'current_setting(x) inet_client_addr()';"))],
    ['NEG session_user in a SECURITY DEFINER body is the call\'s input', () => { const r = sql(fn("begin return session_user in ('a'::name); end;", { definer: true })); return has(r, 'session_user', (h) => !h.hard); }],
    ['NEG the superuser refusal shape is not hard', () => { const r = sql(fn("begin if exists (select 1 from pg_catalog.pg_roles r where r.rolname = session_user and r.rolsuper) then raise exception 'x'; end if; return true; end;")); return has(r, 'role_attribute', (h) => !h.hard); }],
    ['NEG a data-condition handler', () => sql(fn("begin perform 1; exception when unique_violation then return false; end;")).hits.length === 0],
    ['NEG a handler that re-raises', () => sql(fn("begin perform 1; exception when others then raise; end;")).hits.length === 0],
    ['NEG an interval against now()', () => sql(fn("begin return now() - interval '30 seconds' > now(); end;")).hits.length === 0],
    ['NEG pg_catalog functions are not relation reads', () => sql(fn("begin perform pg_catalog.pg_advisory_xact_lock(1); return pg_catalog.clock_timestamp() > now(); end;")).hits.length === 0],
  ];
  const edge = (text) => scanEdge([{ path: 'e.ts', text }]);
  const edgeCases = [
    ['Edge: an environment read', () => edge("const x = Deno.env.get('QA_X') || '';").hits.some((h) => h.construct === 'env:QA_X')],
    ['Edge: a branch on an environment value', () => edge("const x = Deno.env.get('QA_X') || '';\nif (x === 'a') throw new Error('y');").hits.some((h) => h.construct === 'env-branch' && h.value === 'QA_X' && h.branches)],
    ['Edge: a branch on a value derived from an environment value', () => edge("const x = Deno.env.get('QA_X') || '';\nconst y = x.trim();\nconst z = y ? 1 : 2;").hits.some((h) => h.construct === 'env-branch' && h.value === 'QA_X')],
    ['Edge: a branch on the value a call returns from an environment value', () => edge("const k = importKey(Deno.env.get('QA_X'));\nconst deps = {\n  p: async () => { const v = await k; return v ? 1 : null; },\n};").hits.some((h) => h.construct === 'env-branch' && h.value === 'QA_X' && h.line === 3)],
    ['Edge: a parameter a tainted value is passed to', () => edge("export function f(u: string) { if (!u) return 1; return 2; }\nconst x = Deno.env.get('QA_X');\nf(x);").hits.some((h) => h.construct === 'env-branch' && h.value === 'QA_X')],
    ['Edge: the request host', () => edge("const h = new URL(req.url).hostname;").hits.some((h) => h.construct === 'request_host' && h.hard)],
    ['Edge: a forwarded header', () => edge("const h = req.headers.get('x-forwarded-for');").hits.some((h) => h.construct === 'request_host' && h.hard)],
    ['Edge: a loopback literal', () => edge("const u = 'http://127.0.0.1:54321';").hits.some((h) => h.construct === 'address_literal' && h.hard)],
    ['Edge: a private address literal', () => edge("if (a === '10.0.0.5') x();").hits.some((h) => h.construct === 'address_literal')],
    ['Edge: the current time against a fixed instant', () => edge("if (Date.now() > 1790000000000) x();").hits.some((h) => h.construct === 'fixed_time' && h.hard)],
    ['Edge: the current hour', () => edge("if (new Date().getHours() < 6) x();").hits.some((h) => h.construct === 'fixed_time')],
    ['Edge: a release-channel comparison', () => edge("if (c === 'production') x();").hits.some((h) => h.construct === 'channel_literal')],
    ['Edge: a project-ref literal', () => edge("const R = 'abcdefghijklmnopqrst';").hits.some((h) => h.construct === 'project_ref_literal')],
    ['Edge: the production-ref refusal is marked as such', () => edge("export const PRODUCTION_REF = 'abcdefghijklmnopqrst';\nexport function r(url: string) {\n  if (url.toLowerCase().includes(PRODUCTION_REF)) return 'x';\n  return null;\n}\nconst u = Deno.env.get('DB');\nr(u);").hits.some((h) => h.construct === 'production_ref_refusal' && h.value === 'DB' && h.productionRef)],
    ['Edge NEG: a comment naming a header', () => edge("// never req.headers.get('x-forwarded-for')\nconst a = 1;").hits.length === 0],
  ];
  // the not-a-hit proposal: accepted only for a UUID literal, with the r3 hit item quoted, the creating statement named and the key
  // column named, never pending - and only when the migration's own top-level INSERT puts that literal in that table's primary key
  const U = 'a1e0f000-0000-4000-8000-00000000abcd', U2 = 'a1e0f000-0000-4000-8000-00000000abce';
  const seededSql = "create table factory.t (id uuid primary key, other uuid, n text);\n-- a comment ('" + U2 + "')\ninsert into factory.t (id, other, n) values ('" + U + "', '" + U2 + "', 'x');\n"
    + "create table factory.u (a uuid, b int, primary key (a));\ndo $d$ begin insert into factory.u (a, b) values ('" + U2 + "', 1); end $d$;\n";
  const seeded = insertedKeys([{ path: 't.sql', text: seededSql }]);
  const lit = sql(seededSql).hits.filter((h) => h.construct === 'uuid_literal' && h.value === U);
  const nh = (over, keys = seeded) => classify(lit, [{ file: 't.sql', construct: 'uuid_literal', fn: '-', value: U, count: lit.length,
    cls: NOT_A_HIT, why: 'w', reading: '§3.4 r3 hit item: "' + R3_LITERAL_ITEM + ' (an id, name, host or project ref)"', construction: 'seeded by this statement', seeded: 'factory.t.id', ...over }], { seeded: keys });
  const classifyCases = [
    ['insertedKeys: the primary-key value of a top-level INSERT ... VALUES, and nothing else (not a non-key column, not an INSERT inside a DO block)',
      () => seeded.has('factory.t.id=' + U) && !seeded.has('factory.t.other=' + U2) && !seeded.has('factory.u.a=' + U2) && seeded.size === 1],
    ['not a hit: a UUID literal with the r3 hit item quoted, its creating statement and key column named, and inserted there by the migration, is accepted', () => lit.length === 1 && nh({}).badClass.length === 0 && nh({}).matched.length === 1],
    ['not a hit NEG: refused without the quoted r3 hit item, without the construction, while pending, without the key column, or for a key the migration does not insert',
      () => nh({ reading: 'exists on every plane' }).badClass.length === 1 && nh({ construction: '' }).badClass.length === 1 && nh({ pending: 'CR-0' }).badClass.length === 1
        && nh({ seeded: undefined }).badClass.length === 1 && nh({ seeded: 'factory.t.other' }).badClass.length === 1 && nh({}, new Set()).badClass.length === 1 && nh({}, null).badClass.length === 1],
    ['a branch under a Director ruling: an own-plane Edge branch is refused, accepted only under the CR-021 ruling, and a pending entry is still listed as pending',
      () => { const eb = edge("const x = Deno.env.get('QA_X') || '';\nif (!x) throw new Error('y');").hits.filter((h) => h.construct === 'env-branch' && h.branches);
        const own = (over) => classify(eb, [{ file: 'e.ts', construct: 'env-branch', fn: '-', value: 'QA_X', count: eb.length, cls: 'own-plane', why: 'w', ...over }]);
        return eb.length === 1 && own({}).branchBad.length === 1 && own({ ruling: { cr: 'CR-021', quote: 'q' } }).branchBad.length === 0
          && own({ ruling: { cr: 'CR-022', quote: 'q' } }).branchBad.length === 1 && own({ ruling: { quote: 'q' } }).branchBad.length === 1
          && own({ pending: 'CR-021' }).pending.length === 1; }],
    ['NEG a ruling admits a branch in no other class: a carried entry that branches is refused under the CR-021 ruling',
      () => { const eb = edge("const x = Deno.env.get('QA_X') || '';\nif (!x) throw new Error('y');").hits.filter((h) => h.construct === 'env-branch' && h.branches);
        return classify(eb, [{ file: 'e.ts', construct: 'env-branch', fn: '-', value: 'QA_X', count: eb.length, cls: 'carried', why: 'w', ruling: { cr: 'CR-021', quote: 'q' } }]).branchBad.length === 1; }],
  ];
  const steps = founderStepSql("## 1.\n```sql\nselect current_user;\n```\ntext `select 1 from pg_catalog.pg_roles` and `factory_runner` prose\n```psql\n\\password factory_runner\n```\n");
  const stepCases = [
    ['founder steps: fenced sql blocks and statement code spans, psql meta-commands left out', () => steps.length === 3 && steps.every((s) => !/\\password/.test(s.text))],
  ];
  return [...cases, ...edgeCases, ...stepCases, ...classifyCases].map(([name, f]) => { let ok = false, detail = ''; try { ok = !!f(); } catch (e) { detail = e.message; } return { name, ok, detail }; });
}
