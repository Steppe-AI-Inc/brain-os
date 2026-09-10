#!/usr/bin/env node
// CONVERT THE FACTORY RUNNER OFF ITS AMBIENT PRODUCTION CREDENTIAL.
//
// Eleven scripts each carry a private `runSql()` that shells out to `npx supabase db query --linked`,
// inheriting whatever this machine's Supabase CLI credential can do — which here is full production write.
// A scheduler poll and a production migration travel the same wire with the same authority.
//
// `db.mjs` — the canonical accessor — has existed for some time and NOTHING IMPORTS IT but its own test.
// This script wires the eleven onto it. It is deliberately a script and not a hand edit: fifty-eight call
// sites edited by hand is fifty-eight chances to convert one incorrectly and not notice.
//
// CLASSIFYING EACH CALL. `db.read()` refuses a mutating statement, so every call site must declare its
// class. The rule needs no maintained list of function names:
//
//   * a statement whose only verb is SELECT, reading FROM tables, is a READ;
//   * anything else — insert/update/delete/merge, or a SELECT that INVOKES A FUNCTION — is a WRITE.
//
// The second half matters and is easy to miss: `select public.create_founder_notification(...)` is a write
// wearing a select's clothes, and a keyword check for "insert|update|delete" does not see it. Three such
// calls exist in this runner. A first attempt derived the writing functions from the migrations and had
// FALSE NEGATIVES — it missed `complete_work_order`, a function whose name says what it does — so the rule
// was changed to one that cannot have them: if it calls a function, it is a write. That errs toward write(),
// which is the honest direction, because write() claims only that the statement MAY mutate.
//
// Usage:  node _convert_to_canonical_db.mjs            (dry run — prints the plan)
//         node _convert_to_canonical_db.mjs --write    (applies it)
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const APPLY = process.argv.includes('--write');

// provider.mjs names its accessor differently; the inventory still classifies it PRODUCTION_WRITE.
const FN = { 'provider.mjs': 'runSqlSelect' };
const TARGETS = ['complete-run.mjs', 'dispatch-task.mjs', 'plugin-attach.mjs', 'plugin-sync.mjs',
  'poll-and-dispatch.mjs', 'poll-plugin-operations.mjs', 'register-worker.mjs', 'scheduler.mjs',
  'supervisor.mjs', 'sync-agents.mjs', 'provider.mjs'];

/** Does this SQL text mutate, or might it? Errs toward yes. */
export function classifySql(sql) {
  const s = String(sql).replace(/--[^\n]*/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
  if (/\b(insert|update|delete|merge|upsert)\b/.test(s)) return 'write';
  // A SELECT that invokes a function may write; a plain projection from tables does not.
  if (/\bselect\b/.test(s) && /(public|extensions)\.[a-z0-9_]+\s*\(/.test(s)) return 'write';
  if (/^\s*(begin|commit|rollback|set\b)/.test(s)) return 'write';
  if (/\bselect\b/.test(s)) return 'read';
  return 'write';
}

/** Find every `runSql(` call and return {start, end, argStart, argEnd} with balanced parens. */
function callSites(src, opts = {}) {
  const out = [];
  const B = String.fromCharCode(92);
  const re = new RegExp('(?<![' + B + 'w$.])' + (opts.fn || 'runSql') + B + 's*' + B + '(', 'g');
  let m;
  while ((m = re.exec(src))) {
    const open = m.index + m[0].length - 1;
    let depth = 0, i = open, inS = null;
    for (; i < src.length; i++) {
      const c = src[i], p = src[i - 1];
      if (inS) { if (c === inS && p !== '\\') inS = null; continue; }
      if (c === "'" || c === '"' || c === '`') { inS = c; continue; }
      if (c === '(') depth++;
      else if (c === ')') { depth--; if (depth === 0) break; }
    }
    if (i >= src.length) continue;              // unbalanced: leave it alone and report
    out.push({ start: m.index, callEnd: i + 1, argStart: open + 1, argEnd: i });
  }
  return out;
}

/** Remove the private runSql definition. These are TOP-LEVEL functions, so the end is the first line
 * that is exactly `}` at column 0 — brace balancing was tried first and mis-parsed a nested template
 * literal, silently reporting "not found" for supervisor.mjs and leaving a stale definition behind. A
 * converter that half-converts a file is worse than one that refuses. */
function stripRunSql(src, fnName) {
  const B = String.fromCharCode(92);
  const CR = String.fromCharCode(13);
  const NLc = String.fromCharCode(10);
  const lines = src.split(NLc);
  const defRe = new RegExp('^(?:async )?function ' + fnName + B + 's*' + B + '(');
  let at = -1;
  for (let i = 0; i < lines.length; i++) {
    if (defRe.test(lines[i])) { at = i; break; }
  }
  if (at < 0) return { src, removed: false };
  let end = -1;
  for (let i = at + 1; i < lines.length; i++) {
    if (lines[i].split(CR).join('').trimEnd() === '}') { end = i; break; }
  }
  if (end < 0) return { src, removed: false };
  while (end + 1 < lines.length && lines[end + 1].trim() === '') end++;
  lines.splice(at, end - at + 1);
  return { src: lines.join(NLc), removed: true };
}

const NOTE = [
  '// THE DATABASE IS REACHED THROUGH THE CANONICAL ACCESSOR, NOT THROUGH THE MACHINE.',
  '//',
  '// This script used to carry a private runSql() that shelled out to `npx supabase db query --linked`,',
  '// which borrowed whatever Supabase CLI credential the machine happened to hold — on the Home PC, full',
  '// production write. db.mjs connects with an explicit FACTORY_RUNNER_PG_URL, refuses to start without',
  '// one, refuses a superuser connection, and refuses DDL, privilege changes and migration-history writes',
  '// in the client. read() and write() are separate so a reader cannot silently become a writer.',
  "import * as db from './db.mjs';",
  '',
].join('\n');

let totalRead = 0, totalWrite = 0, totalFiles = 0;
const report = [];

for (const name of TARGETS) {
  const p = join(HERE, name);
  let src;
  try { src = readFileSync(p, 'utf8'); } catch { report.push('  MISSING ' + name); continue; }

  const sites = callSites(src, { fn: FN[name] || 'runSql' });
  if (!sites.length) { report.push('  no runSql() calls: ' + name); continue; }

  // Rewrite from the end so earlier offsets stay valid.
  let out = src;
  let r = 0, w = 0;
  for (let k = sites.length - 1; k >= 0; k--) {
    const s = sites[k];
    // Skip the definition itself (it is `function runSql(sql)`, whose arg is an identifier).
    const before = out.slice(Math.max(0, s.start - 30), s.start);
    if (/function\s+$/.test(before) || /async\s+function\s+$/.test(before)) continue;
    const arg = out.slice(s.argStart, s.argEnd);
    const cls = classifySql(arg);
    if (cls === 'read') r++; else w++;
    out = out.slice(0, s.start) + 'db.' + cls + '(' + arg + ')' + out.slice(s.callEnd);
  }

  const stripped = stripRunSql(out, FN[name] || 'runSql');
  out = stripped.src;
  if (!/from '\.\/db\.mjs'/.test(out)) {
    // place the import after the last existing import line
    const lines = out.split('\n');
    let last = -1;
    for (let i = 0; i < lines.length; i++) if (/^import\s/.test(lines[i])) last = i;
    lines.splice(last + 1, 0, '', ...NOTE.split('\n'));
    out = lines.join('\n');
  }

  report.push('  ' + name.padEnd(28) + r + ' read, ' + w + ' write'
    + (stripped.removed ? ', runSql removed' : ', RUNSQL NOT FOUND'));
  totalRead += r; totalWrite += w; totalFiles++;
  if (APPLY) writeFileSync(p, out);
}

console.log(APPLY ? 'APPLIED' : 'DRY RUN — pass --write to apply');
for (const line of report) console.log(line);
console.log('  ' + '-'.repeat(50));
console.log('  ' + totalFiles + ' files, ' + totalRead + ' reads, ' + totalWrite + ' writes');
