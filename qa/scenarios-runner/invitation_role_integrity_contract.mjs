#!/usr/bin/env node
// ROLE INTEGRITY — the role travels on the invitation, and nobody downstream can widen it.
//
// A role is authority. So the question is not "is a role set" but: between the moment an inviter chooses a
// role and the moment a membership exists, can the value change, and can anyone but the inviter influence
// it? The answer has to be no at every step, and each step gets a row.
//
// BUG-035 IS A SEPARATE DEFECT AND THIS SUITE KEEPS IT SEPARATE. The founder was explicit: BUG-035 is
// "membership role management UI absent", and it may share implementation surfaces with the invitation work
// without sharing defect identity. So the rows below establish that the role PIPELINE is sound, and RI-D1
// states the thing that is still missing — no governed surface lets anyone CHOOSE a role, so every
// invitation takes the default. That row is BUG-035's invitation-side face; it is named as BUG-035 and it is
// red, and nothing in this suite reports BUG-035 closed.
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
function repoRoot() {
  let d = HERE;
  for (let i = 0; i < 12; i++) {
    if (existsSync(join(d, 'web/lib/data/people.ts'))) return d;
    const up = dirname(d); if (up === d) break; d = up;
  }
  throw new Error('repo root not found');
}
const ROOT = repoRoot();
const NL = String.fromCharCode(10);

let pass = 0;
const failures = [];
const check = (kind, name, ok, detail) => {
  if (ok) { pass++; console.log('OK   [' + kind + '] ' + name); }
  else { failures.push(name); console.log('FAIL [' + kind + '] ' + name + (detail ? NL + '       ' + detail : '')); }
};

function commentsBlanked(t) {
  const S = ' ', LF = String.fromCharCode(10), BS = String.fromCharCode(92);
  let out = '', i = 0;
  while (i < t.length) {
    const c = t[i], d = t[i] + t[i + 1];
    if (d === '//') { while (i < t.length && t[i] !== LF) { out += S; i++; } continue; }
    if (d === '/*') {
      while (i < t.length && t[i] + t[i + 1] !== '*/') { out += (t[i] === LF ? LF : S); i++; }
      out += S + S; i += 2; continue;
    }
    if (c === '"' || c === "'" || c === '`') {
      out += c; i++;
      while (i < t.length) {
        if (t[i] === BS) { out += t[i] + (t[i + 1] || ''); i += 2; continue; }
        if (t[i] === c) { out += c; i++; break; }
        out += t[i]; i++;
      }
      continue;
    }
    out += c; i++;
  }
  return out;
}
function walk(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name.startsWith('.')) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(name)) out.push(p);
  }
  return out;
}

const MIG = join(ROOT, 'supabase/migrations/202608310009_invite_only_signup.sql');
const sql = existsSync(MIG) ? readFileSync(MIG, 'utf8') : '';
const peopleRaw = readFileSync(join(ROOT, 'web/lib/data/people.ts'), 'utf8');
const invite = commentsBlanked((peopleRaw.match(/export async function invitePerson[\s\S]*?\n}/) || [''])[0]);
const tight = invite.replace(/[ \t\r\n]+/g, '');
const appFiles = [...walk(join(ROOT, 'web/lib')), ...walk(join(ROOT, 'web/app'))];

check('CONTRACT', 'RI-C0 the migration and the invite action are present',
  sql.length > 2000 && invite.length > 800, 'migration ' + sql.length + ', invite ' + invite.length);

// ── The stored value is constrained to real roles ───────────────────────────────────────────────────
const ROLES = (sql.match(/invited_role text not null default 'employee' check \(invited_role in \(([\s\S]*?)\)\)/) || [, ''])[1];
const NAMED = (ROLES.match(/'([a-z_]+)'/g) || []).map((r) => r.replace(/'/g, ''));
check('CONTRACT', 'RI-C1 invited_role is constrained to the real application roles (' + NAMED.length + ')',
  NAMED.length >= 6 && NAMED.includes('employee') && NAMED.includes('holding_admin'),
  'an unconstrained text column would let a typo become an authority nobody can reason about: '
  + JSON.stringify(NAMED));

// ── It is applied, unchanged, by the gate ───────────────────────────────────────────────────────────
check('CONTRACT', 'RI-C2 acceptance applies the stored role to BOTH the profile and the membership',
  /update public\.profiles set role = v_invitation\.invited_role::public\.app_role/.test(sql)
  // The insert's column list is `(company_id, profile_id, role_in_company, active)`, so anchoring on
  // `role_in_company)` matched nothing and this row failed on SQL that is correct. Anchor on the column
  // NAME and require the invitation's role within the same statement.
  && /role_in_company[\s\S]{0,200}v_invitation\.invited_role/.test(sql),
  'two places carry a role, and they must agree: a profile role that outran the membership role would be an'
  + ' authority with no company scope');

check('CONTRACT', 'RI-C3 the stored role is cast to the real app_role type, so an invalid value cannot land',
  /::public\.app_role/.test(sql),
  'the cast is the second line of defence behind the check constraint, and it fails loudly');

// ── Nothing downstream can widen it ─────────────────────────────────────────────────────────────────
check('CONTRACT', 'RI-C4 the invite action does not hardcode a role',
  !/role_in_company:"employee"/.test(tight) && !/invited_role:"/.test(tight),
  'writing a literal role at invite time is the defect the governed model exists to prevent: the role must'
  + ' be the inviter’s choice, recorded, not the code’s assumption');

const roleWriters = appFiles.filter((f) => {
  const t = commentsBlanked(readFileSync(f, 'utf8')).replace(/[ \t\r\n]+/g, '');
  return /role_in_company:"/.test(t) || /from\("profiles"\)\.update\(\{role:/.test(t);
});
check('CONTRACT', 'RI-C5 NO application file writes a role_in_company literal or sets a profile role ('
  + appFiles.length + ' files scanned)',
  roleWriters.length === 0,
  'writers found: ' + JSON.stringify(roleWriters.map((f) => f.replace(ROOT, ''))) + ' — each would be a second'
  + ' authority over a role the acceptance gate believes it owns');

check('CONTRACT', 'RI-C6 the acceptance call cannot carry a role at all',
  !/p_role|invited_role/.test(commentsBlanked(
    existsSync(join(ROOT, 'web/lib/data/accept-invitation.ts'))
      ? readFileSync(join(ROOT, 'web/lib/data/accept-invitation.ts'), 'utf8') : '')),
  'the recipient is the one party with a motive to choose their own role, and they are the one holding the'
  + ' token');

// ── What is missing, named as BUG-035 and not merged into this work ─────────────────────────────────
const rolePickers = appFiles.filter((f) => {
  const t = commentsBlanked(readFileSync(f, 'utf8'));
  return /p_invited_role|invitedRole/.test(t);
});
check('DEFECT', 'RI-D1 some governed surface lets an inviter CHOOSE the invited role (BUG-035)',
  rolePickers.length > 0,
  'no file passes p_invited_role, so every invitation takes the `employee` default and the constrained,'
  + ' auditable, per-invitation role the schema models is unreachable from the product. That is BUG-035 —'
  + ' membership role management absent — seen from the invitation side. It is a SEPARATE defect identity'
  + ' from BUG-036 and BUG-037 and is not closed by anything in this branch.');

console.log('');
console.log('invitation_role_integrity_contract: ' + pass + ' passed, ' + failures.length + ' failed');
console.log('RED BY DESIGN: RI-D1 is BUG-035 from the invitation side — the role pipeline is sound end to end,');
console.log('and nothing lets a human choose the role, so every invitation takes the default. Separate defect');
console.log('identity, deliberately not merged into the invitation work and deliberately not reported closed.');
if (failures.length) { console.log('FAILURES:'); for (const f of failures) console.log(' - ' + f); process.exit(1); }
