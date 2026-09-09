#!/usr/bin/env node
// PREPARED, NOT APPLIED — the eleven factory-runner scripts that hold ambient production write authority.
//
// `factory_production_write_inventory` names them and refuses a documentation change, an allowlist or an
// environment flag as a remedy. Each reaches the database through `supabase db query --linked`, which
// borrows whatever credential the machine happens to hold — on this laptop, full production write. A
// scheduler poll and a production migration travel the same wire with the same authority.
//
// WHY THIS IS A ONE-FUNCTION CHANGE PER SCRIPT, not a rewrite of 69 call sites. Every one of the eleven has
// exactly ONE `runSql`, and every caller consumes `.rows` — which is precisely what `pg`'s `client.query()`
// returns. The shapes already agree, so the call sites do not move. Checked against the source, not assumed.
//
// WHY THE SHIM CLASSIFIES INSTEAD OF ALWAYS CALLING write(). db.mjs separates read() from write() so that
// "a script that only reads cannot silently start writing". Routing everything through write() would keep
// the letter of the boundary and throw the property away. The shim asks db.mjs which it is, using db.mjs's
// OWN definition — this patch exports `isMutating` and makes read() use it, so there is one spelling of
// "this statement mutates" rather than two that can drift.
//
// WHAT THIS DELIBERATELY DOES NOT DO. It does not create the least-privilege role — creating a role is DDL,
// which is founder authority, and a module cannot bootstrap its own boundary. Until that role exists and
// FACTORY_RUNNER_PG_URL points at it, every one of these scripts REFUSES rather than falling back. That is
// the intended posture and it is also the cost: applying this stops the factory runner until the founder
// sets the variable. It does not touch dispatch-isolated-verifier.sh or verifier-watchdog.sh — verified,
// neither reaches the database — so a verifier round is unaffected.
//
// Usage:  node qa/verification/proposed/APPLY_factory_runner_least_privilege.mjs <repo-root>
// The target is REQUIRED and never defaulted, because a prepared script that defaults its target to the
// live tree is how a candidate under verification got overwritten this session.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

// Built, never typed. Every backslash in this file would otherwise arrive through a shell that halves them
// (escape instance 15), and a halved one inside a regex becomes a backspace character — instance 13.
const BSL = String.fromCharCode(92);
const CR = String.fromCharCode(13);
const LF = String.fromCharCode(10);
const Q = String.fromCharCode(39);

const root = process.argv[2];
if (!root) { console.log('refusing to guess a target: pass the repo root explicitly'); process.exit(2); }

const SCRIPTS = ['complete-run', 'dispatch-task', 'plugin-attach', 'plugin-sync', 'poll-and-dispatch',
  'poll-plugin-operations', 'provider', 'register-worker', 'scheduler', 'supervisor', 'sync-agents'];

const applied = [];
function edit(file, from, to, label) {
  const p = join(root, file);
  if (!existsSync(p)) throw new Error('missing: ' + file);
  const s = readFileSync(p, 'utf8');
  const n = s.split(from).length - 1;
  if (n !== 1) throw new Error(label + ' (' + file + '): anchor ' + (n === 0 ? 'missing' : 'x' + n));
  writeFileSync(p, s.replace(from, () => to));
  applied.push(label + ' — ' + file);
}

const MUTATING_DECL = 'const MUTATING = /' + BSL + 'b(insert|update|delete|merge|upsert)' + BSL + 'b/i;';

// ---- 1. ONE definition of "this statement mutates", exported ---------------------------------------------
edit('scripts/factory-runner/db.mjs',
  MUTATING_DECL,
  '// Exported so the eleven shims classify with THIS definition rather than each carrying a copy.' + LF
  + MUTATING_DECL + LF
  + 'export function isMutating(sql) { return MUTATING.test(String(sql || ' + Q + Q + ')); }',
  'db.mjs exports isMutating');

edit('scripts/factory-runner/db.mjs',
  '  if (MUTATING.test(sql)) {',
  '  if (isMutating(sql)) {',
  'read() uses the exported definition');

// ---- 2. each script routes through it --------------------------------------------------------------------
for (const name of SCRIPTS) {
  const file = 'scripts/factory-runner/' + name + '.mjs';
  const p = join(root, file);
  if (!existsSync(p)) throw new Error('missing: ' + file);
  const text = readFileSync(p, 'utf8');

  // Located by LINE, not by a newline-brace-newline marker: these files are CRLF and such a marker matches
  // nothing in any of the eleven. The failure reads as "could not find the end of runSql" in a file that
  // plainly has one, which is the least useful shape an error can take.
  const EOL = text.includes(CR + LF) ? CR + LF : LF;
  const lines = text.split(EOL);
  // provider.mjs names its accessor runSqlSelect, not runSql - one of the eleven spells it differently,
  // which a loop over a fixed name discovers only by failing. Both spellings are accepted and the name is
  // preserved, so the call sites in that file keep working.
  const FN = ['async function runSql(', 'async function runSqlSelect('].find((f) => lines.some((l) => l.startsWith(f)));
  if (!FN) throw new Error(name + ": no runSql declaration");
  const fnName = FN.slice('async function '.length).replace('(', '');
  const startLine = lines.findIndex((l) => l.startsWith(FN));
  if (startLine < 0) throw new Error(name + ': no runSql declaration');
  let endLine = -1;
  for (let i = startLine + 1; i < lines.length; i++) if (lines[i] === '}') { endLine = i; break; }
  if (endLine < 0) throw new Error(name + ': could not find the end of runSql');

  const replacement = [
    '// AMBIENT AUTHORITY REMOVED. This used to shell out to `supabase db query --linked`, inheriting',
    '// whatever the machine CLI could do. It now goes through the one accessor, which refuses without an',
    '// explicit least-privilege FACTORY_RUNNER_PG_URL and never falls back. Callers are unchanged: db.mjs',
    '// returns a pg result, and every call site here already reads `.rows`.',
    'async function ' + fnName + '(sql) {',
    '  return isMutating(sql) ? dbWrite(sql) : dbRead(sql);',
    '}',
  ];

  const outLines = lines.slice(0, startLine).concat(replacement, lines.slice(endLine + 1));
  let lastImport = -1;
  outLines.forEach((l, i) => { if (l.startsWith('import ')) lastImport = i; });
  if (lastImport < 0) throw new Error(name + ': no import line to anchor the db.mjs import to');
  outLines.splice(lastImport + 1, 0,
    "import { read as dbRead, write as dbWrite, isMutating } from './db.mjs';");
  writeFileSync(p, outLines.join(EOL));
  applied.push('routed through db.mjs — ' + file);
}

console.log('applied ' + applied.length + ' edits:');
for (const a of applied) console.log('  - ' + a);
console.log('');
console.log('NEXT: FACTORY_RUNNER_PG_URL must exist before this is useful. Until it does, every one of');
console.log('these scripts refuses — which is the point, and also means the factory runner stops.');
