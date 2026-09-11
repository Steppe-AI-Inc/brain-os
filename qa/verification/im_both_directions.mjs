// A CONTRACT ROW THAT CANNOT GO RED IS DECORATION.
//
// IM-D1..D4 are GREEN now that the Invite button uses the governed lifecycle. Green is the easy half — a
// row that asserts nothing is also green. So each is re-measured by REINTRODUCING the exact violation it
// names and requiring it to go red, one violation at a time, with nothing else moving.
//
// IM-D5 runs the other way round: it is still open, so its direction is the fix. Keeping both directions in
// one file is what separates a row that tracks a defect from a row that has quietly become a comment.
//
// A MIRROR TREE, NEVER THE REAL FILES. The suite resolves its own repository root by walking up for
// web/lib/data/people.ts, so a mirror containing only what it reads exercises the real code path with no
// chance of leaving a mutation behind. Mutating the real file and restoring it is one crash away from
// committing a deliberately broken invite action.
import { readFileSync, writeFileSync, mkdirSync, rmSync, cpSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

const REAL = 'C:/Users/Dell/dev/brain-os-invite';
const TMP = 'C:/Users/Dell/dev/im_mirror';
const SUITE = 'qa/scenarios-runner/invitation_membership_contract.mjs';
const NL = String.fromCharCode(10);

// Every mutation lands at one anchor inside invitePerson, so a stale anchor is REPORTED rather than
// silently producing an unmutated build that "passes".
const ANCHOR = '    revalidatePath("/people");';

const REGRESSIONS = {
  // Stop calling the governed creation RPC at all.
  'IM-D1': (s) => s.replace('await supabase.rpc("create_company_invitation"',
    'await supabase.rpc("some_other_call_entirely"'),
  // Grant membership directly — the original violation.
  'IM-D2': (s) => s.replace(ANCHOR,
    '    await supabase.from("company_memberships").insert({ company_id: person.company_id });' + NL + ANCHOR),
  // Activate a profile the acceptance gate has not admitted.
  'IM-D3': (s) => s.replace(ANCHOR,
    '    await supabase.from("profiles").update({ active: true }).eq("id", person.profile_id);' + NL + ANCHOR),
  // Hardcode the role instead of letting it travel on the invitation.
  'IM-D4': (s) => s.replace(ANCHOR,
    '    const grant = { role_in_company: "employee" };' + NL + ANCHOR),
};

const build = (mutate, addMemberships) => {
  rmSync(TMP, { recursive: true, force: true });
  mkdirSync(join(TMP, 'qa/scenarios-runner'), { recursive: true });
  mkdirSync(join(TMP, 'web/lib/data'), { recursive: true });
  mkdirSync(join(TMP, 'supabase/migrations'), { recursive: true });
  cpSync(join(REAL, SUITE), join(TMP, SUITE));
  cpSync(join(REAL, 'web/lib/data/invitations.ts'), join(TMP, 'web/lib/data/invitations.ts'));
  cpSync(join(REAL, 'supabase/migrations/202608310009_invite_only_signup.sql'),
    join(TMP, 'supabase/migrations/202608310009_invite_only_signup.sql'));
  let people = readFileSync(join(REAL, 'web/lib/data/people.ts'), 'utf8');
  if (mutate) {
    const before = people;
    people = mutate(people);
    if (people === before) throw new Error('the mutation changed nothing - its anchor is stale');
  }
  writeFileSync(join(TMP, 'web/lib/data/people.ts'), people);
  if (addMemberships) {
    writeFileSync(join(TMP, 'web/lib/data/memberships.ts'),
      'export async function deactivateMembership() {}' + NL);
  }
};

const run = () => {
  try { return execFileSync('node', [join(TMP, SUITE)], { encoding: 'utf8', cwd: TMP }); }
  catch (e) { return (e.stdout || '') + (e.stderr || ''); }
};
const verdict = (out, row) => {
  const lines = out.split(NL);
  if (lines.some((l) => l.startsWith('OK') && l.includes(row))) return 'green';
  if (lines.some((l) => l.startsWith('FAIL') && l.includes(row))) return 'red';
  return 'missing';
};
const ROWS = ['IM-D1', 'IM-D2', 'IM-D3', 'IM-D4', 'IM-D5'];
const CONTRACTS = ['IM-C1', 'IM-C2', 'IM-C3', 'IM-C4', 'IM-C5'];

// THE MIRROR MUST REPRODUCE THE REAL TREE FIRST, or every number below is a claim about a directory I
// happened to assemble.
build(null, false);
const base = run();
const baseline = Object.fromEntries(ROWS.map((r) => [r, verdict(base, r)]));
const baselineOk = ROWS.slice(0, 4).every((r) => baseline[r] === 'green') && baseline['IM-D5'] === 'red';
console.log('mirror baseline: ' + ROWS.map((r) => r + '=' + baseline[r]).join(' ')
  + '   ' + (baselineOk ? 'matches the real tree' : 'MIRROR IS WRONG'));
if (!baselineOk) { console.log(base); process.exit(1); }

let ok = true;
for (const row of ROWS.slice(0, 4)) {
  build(REGRESSIONS[row], false);
  const out = run();
  const mine = verdict(out, row);
  const others = ROWS.slice(0, 4).filter((r) => r !== row && verdict(out, r) !== 'green');
  const contracts = CONTRACTS.filter((c) => verdict(out, c) !== 'green');
  console.log((mine === 'red' ? 'RED on its own regression   ' : 'STILL GREEN - the row asserts nothing   ') + row
    + (others.length ? '   [also moved: ' + others.join(', ') + ']' : '')
    + (contracts.length ? '   [contract rows broke: ' + contracts.join(', ') + ']' : ''));
  if (mine !== 'red' || others.length || contracts.length) ok = false;
}

// IM-D5 is still open, so its direction is the fix.
build(null, true);
const d5 = verdict(run(), 'IM-D5');
console.log((d5 === 'green' ? 'GREEN on its own fix   ' : 'STILL RED - the row does not measure its property   ')
  + 'IM-D5');
if (d5 !== 'green') ok = false;

rmSync(TMP, { recursive: true, force: true });
if (existsSync(TMP)) console.log('note: the mirror directory could not be removed');
console.log('');
console.log(ok ? 'every row moves on its own property and on nothing else'
  : 'SOME ROW IS NOT MEASURING WHAT IT NAMES');
process.exit(ok ? 0 : 1);
