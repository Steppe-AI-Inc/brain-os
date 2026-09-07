// MANAGER_SET_UI_USES_CANONICAL_ASSIGNMENT_WRITE drift guard (multi-org P2).
//
// The Work-PC handoff table recorded "Manager relationships — read-only, no set-UI".
// The set-UI now exists, and the property this guard protects is not the button — it is
// that the UI's write path converges on the SAME canonical set_person_assignment() RPC
// the AI-chat path uses, with the org-scoped-manager rule enforced. The failure modes
// this fails on: someone "simplifying" the action into a raw people.manager_person_id
// or person_assignments table write (bypassing the RPC's authority check, idempotency
// index and people.company_id sync), or dropping the same-organization check so a
// manager from another company can be attached.
//
// Scans real source. Runnable with plain node. No deploy, no DB, no network.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const WEB = resolve(here, '../../web');

let pass = 0;
const failures = [];
function check(name, cond, detail) {
  if (cond) { pass++; console.log('OK   ' + name); }
  else { failures.push(name + (detail ? '\n       ' + detail : '')); console.log('FAIL ' + name); }
}

const peopleSrc = readFileSync(resolve(WEB, 'lib/data/people.ts'), 'utf8').replace(/\r\n/g, '\n');
const tableSrc = readFileSync(resolve(WEB, 'app/(app)/people/people-table.tsx'), 'utf8').replace(/\r\n/g, '\n');

// Isolate the action body (up to the next export) so the raw-write checks can't be
// satisfied or violated by unrelated functions in the same module.
const m = peopleSrc.match(/export async function setPersonManager\([\s\S]*?(?=\nexport )/);
const body = m ? m[0] : '';

check('setPersonManager exists in lib/data/people.ts', body.length > 0);
check('it writes through the canonical set_person_assignment RPC',
  /\.rpc\("set_person_assignment",/.test(body),
  'The RPC is the single write path chat and UI must share (authority check, idempotency, company_id sync).');
check('it never writes person_assignments or manager_person_id directly',
  !/\.from\("person_assignments"\)/.test(body) && !/manager_person_id\s*:/.test(body.replace(/p_manager_person_id/g, '')),
  'A raw table write bypasses the RPC authority check and the one-current-primary uniqueness.');
check('it enforces the org-scoped-manager rule (same company required)',
  /manager\.company_id !== person\.company_id/.test(body),
  'Manager relationships are per-organization; a cross-company manager must be refused.');
check('it refuses a self-manager', /personId === managerPersonId/.test(body));
check('the People table actually wires the control to this action',
  /setPersonManager\(/.test(tableSrc) && /import \{[^}]*setPersonManager[^}]*\} from "@\/lib\/data\/people"/.test(tableSrc),
  'An action nothing calls is not a set-UI.');

console.log(`\nmanager_set_ui_canonical_write: ${pass}/${pass + failures.length} passed`);
if (failures.length) {
  console.log('\nFAILURES:');
  for (const f of failures) console.log('  - ' + f);
  process.exit(1);
}
