// A DEFECT ROW THAT CANNOT GO GREEN IS NOT A MEASUREMENT, IT IS A COMPLAINT.
//
// Each of IM-D1..IM-D5 asserts the property the contract requires, so each must go GREEN on a tree where
// that property holds. Proving it needs a tree, not an argument: the suite resolves its own repository root
// by walking up for web/lib/data/people.ts, so a MIRROR tree with mutated files and the suite copied in
// exercises exactly the real code path with no risk to the real files.
import { readFileSync, writeFileSync, mkdirSync, rmSync, cpSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

const REAL = 'C:/Users/Dell/dev/brain-os-invite';
const TMP = 'C:/Users/Dell/dev/im_mirror';
const SUITE = 'qa/scenarios-runner/invitation_membership_contract.mjs';

const FIXES = {
  'IM-D1': (s) => s.replace(
    'const { data: inviteData, error: inviteError } = await admin.auth.admin.inviteUserByEmail(',
    'await supabase.rpc("create_company_invitation", { p_company_id: person.company_id, p_email: person.email });'
    + String.fromCharCode(10)
    + '    const { data: inviteData, error: inviteError } = await admin.auth.admin.inviteUserByEmail('),
  'IM-D2': (s) => s.replace(/const \{ error: memberError \} = await supabase\.from\("company_memberships"\)\.insert\(\{/,
    'const { error: memberError } = await supabase.rpc("accept_company_invitation_placeholder", ({'),
  'IM-D3': (s) => s.replace('.update({ active: true })', '.update({ updated_at: new Date().toISOString() })'),
  'IM-D4': (s) => s.replace('role_in_company: "employee",', 'role_in_company: grantedRole,'),
  'IM-D5': null, // a FILE, not an edit: web/lib/data/memberships.ts
};

const build = (row) => {
  rmSync(TMP, { recursive: true, force: true });
  mkdirSync(join(TMP, 'qa/scenarios-runner'), { recursive: true });
  mkdirSync(join(TMP, 'web/lib/data'), { recursive: true });
  mkdirSync(join(TMP, 'supabase/migrations'), { recursive: true });
  cpSync(join(REAL, SUITE), join(TMP, SUITE));
  cpSync(join(REAL, 'web/lib/data/invitations.ts'), join(TMP, 'web/lib/data/invitations.ts'));
  cpSync(join(REAL, 'supabase/migrations/202608310009_invite_only_signup.sql'),
    join(TMP, 'supabase/migrations/202608310009_invite_only_signup.sql'));
  let people = readFileSync(join(REAL, 'web/lib/data/people.ts'), 'utf8');
  if (row && FIXES[row]) {
    const before = people;
    people = FIXES[row](people);
    if (people === before) throw new Error('the mutation for ' + row + ' changed nothing — anchor is stale');
  }
  writeFileSync(join(TMP, 'web/lib/data/people.ts'), people);
  if (row === 'IM-D5') writeFileSync(join(TMP, 'web/lib/data/memberships.ts'), 'export async function removeMembership() {}' + String.fromCharCode(10));
};

const run = () => {
  try { return execFileSync('node', [join(TMP, SUITE)], { encoding: 'utf8', cwd: TMP }); }
  catch (e) { return (e.stdout || '') + (e.stderr || ''); }
};

// Baseline: the mirror must reproduce the real tree's verdict, or nothing below means anything.
build(null);
const base = run();
const baseRed = ['IM-D1', 'IM-D2', 'IM-D3', 'IM-D4', 'IM-D5']
  .filter((r) => base.split(String.fromCharCode(10)).some((l) => l.startsWith('FAIL') && l.includes(r)));
console.log('mirror baseline: ' + baseRed.length + ' of 5 defect rows red  ' + (baseRed.length === 5 ? 'OK' : 'MIRROR IS WRONG'));
if (baseRed.length !== 5) { console.log(base); process.exit(1); }

let ok = true;
for (const row of ['IM-D1', 'IM-D2', 'IM-D3', 'IM-D4', 'IM-D5']) {
  build(row);
  const out = run();
  const lines = out.split(String.fromCharCode(10));
  const green = lines.some((l) => l.startsWith('OK') && l.includes(row));
  // And nothing else may move: a fix for one row that silences another is a row measuring the wrong thing.
  const others = ['IM-D1', 'IM-D2', 'IM-D3', 'IM-D4', 'IM-D5'].filter((r) => r !== row);
  const movedToo = others.filter((r) => lines.some((l) => l.startsWith('OK') && l.includes(r)));
  const contractsHeld = ['IM-C1', 'IM-C2', 'IM-C3', 'IM-C4', 'IM-C5']
    .every((c) => lines.some((l) => l.startsWith('OK') && l.includes(c)));
  console.log((green ? 'GREEN on its own fix   ' : 'STILL RED - the row does not measure its property   ') + row
    + (movedToo.length ? '   [also moved: ' + movedToo.join(', ') + ']' : '')
    + (contractsHeld ? '' : '   [a CONTRACT row broke]'));
  if (!green || movedToo.length || !contractsHeld) ok = false;
}

rmSync(TMP, { recursive: true, force: true });
console.log('');
console.log(ok ? 'every defect row is non-vacuous and independent' : 'SOME ROW IS NOT MEASURING WHAT IT NAMES');
process.exit(ok ? 0 : 1);
