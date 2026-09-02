// ARCHIVED_PARENT_NOT_SURFACED drift guard (BUG-001 / BUG-006).
//
// A row whose parent company is archived was rendering as an ordinary active row with no
// indication, contradicting the same screen's own company picker. The cause was never one
// bad query: 24 separate `companies(name)` joins each omitted `status`, so the UI could not
// render an archived marker even in principle.
//
// Work-PC CLOSED BUG-001 on the two originally-reported surfaces and split the remaining
// 23 joins out as BUG-006. Fixing them one at a time would leave the drift free to
// reappear on the 25th join, so this guard fails the moment a bare `companies(name)` join
// is reintroduced anywhere under web/.
//
// Scans real source. Runnable with plain node. No deploy, no DB, no network.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join, relative } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const WEB = resolve(here, '../../web');

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === '.next' || entry === '.git') continue;
    const p = join(dir, entry);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(entry)) out.push(p);
  }
  return out;
}

let pass = 0;
const failures = [];
function check(name, cond, detail) {
  if (cond) { pass++; console.log('OK   ' + name); }
  else { failures.push(name + (detail ? '\n       ' + detail : '')); console.log('FAIL ' + name); }
}

const files = walk(WEB);

// A bare `companies(name)` join — no status. The canonical form is `companies(name, status)`
// (web/lib/data/company-ref.ts). archived-company-badge.tsx documents the old shape in a
// comment, so it is the one allowed mention.
const OFFENDERS = [];
for (const f of files) {
  const rel = relative(WEB, f).replace(/\\/g, '/');
  if (rel.includes('archived-company-badge')) continue;
  if (rel.includes('lib/data/company-ref')) continue;
  const src = readFileSync(f, 'utf8');
  // `companies(name)` NOT followed by `, status` — i.e. the bare form.
  const m = src.match(/companies(?:!\w+)?\(name\)/g);
  if (m) OFFENDERS.push(rel + ' x' + m.length);
}

check(
  'no bare companies(name) join remains anywhere under web/',
  OFFENDERS.length === 0,
  'These joins omit companies.status, so their UI cannot mark an archived parent even in principle:\n       ' + OFFENDERS.join('\n       ')
);

// The canonical module must exist and carry status — this is what the joins standardise on.
const refPath = resolve(WEB, 'lib/data/company-ref.ts');
let refSrc = '';
try { refSrc = readFileSync(refPath, 'utf8'); } catch { /* reported below */ }
check('canonical company-ref module exists', refSrc.length > 0,
  'web/lib/data/company-ref.ts is the single definition of what a company reference must carry.');
check('COMPANY_REF selects status, not just name',
  /COMPANY_REF\s*=\s*'companies\(name, status\)'/.test(refSrc));
check('isArchivedParent treats ONLY status==="archived" as archived',
  /ref\.status === 'archived'/.test(refSrc),
  'planning / paused / draft are NOT archived — conflating them would hide or mislabel live work.');

// The badge is the shared renderer; every fixed surface reads the same shape from it.
let badge = '';
try { badge = readFileSync(resolve(WEB, 'components/archived-company-badge.tsx'), 'utf8'); } catch { /* reported below */ }
check('shared ArchivedCompanyBadge still exists', badge.length > 0);

// Count the canonical joins so a silent mass-revert is visible rather than quiet.
let canonical = 0;
for (const f of files) canonical += (readFileSync(f, 'utf8').match(/companies(?:!\w+)?\(name, status\)/g) || []).length;
check('canonical companies(name, status) joins are present in bulk (>= 20)', canonical >= 20,
  'Found ' + canonical + '. A sharp drop means the class was reverted rather than maintained.');

// --- Fetching status is NOT the fix; rendering it is. -----------------------------------
//
// Selecting `companies(name, status)` everywhere while no surface reads `.status` would make
// every check above pass with the defect fully intact — the exact vacuous-fix shape this
// project has hit repeatedly (qa/KNOWN_FAILURE_MODES.md). These two checks are what make the
// guard non-vacuous: named surfaces must actually render the badge, and every render site
// must be fed a real status expression rather than a constant.

const RENDER_SURFACES = {
  'people': 'app/(app)/people/people-table.tsx',
  'departments': 'app/(app)/departments/departments-table.tsx',
  'projects': 'app/(app)/projects/projects-table.tsx',
  'goals': 'app/(app)/goals/goal-list.tsx',
  'tasks': 'app/(app)/tasks/task-card.tsx',
};

const missingRender = [];
for (const [surface, rel] of Object.entries(RENDER_SURFACES)) {
  let src = '';
  try { src = readFileSync(resolve(WEB, rel), 'utf8'); } catch { /* counts as missing */ }
  if (!/<ArchivedCompanyBadge\s+status=\{/.test(src)) missingRender.push(surface + ' (' + rel + ')');
}
check(
  'every high-value surface RENDERS the archived marker, not just fetches status',
  missingRender.length === 0,
  'These surfaces join companies(name, status) but never show the user an archived parent:\n       ' +
    missingRender.join('\n       ')
);

// A render site fed a literal (status="archived", status={"active"}) would light up
// unconditionally or never — either way it is not reading real data.
const literalFed = [];
for (const f of files) {
  const rel = relative(WEB, f).replace(/\\/g, '/');
  if (rel.includes('archived-company-badge')) continue;
  for (const m of readFileSync(f, 'utf8').matchAll(/<ArchivedCompanyBadge\s+status=(\{[^}]*\}|"[^"]*")/g)) {
    const arg = m[1];
    if (!/\.status\b/.test(arg)) literalFed.push(rel + ' -> status=' + arg);
  }
}
check(
  'every ArchivedCompanyBadge is fed a real .status expression, never a literal',
  literalFed.length === 0,
  'A hardcoded status makes the badge decorative rather than evidence:\n       ' + literalFed.join('\n       ')
);

console.log(`\ncompany_ref_no_bare_name_join: ${pass}/${pass + failures.length} passed  (canonical joins: ${canonical})`);
if (failures.length) {
  console.log('\nFAILURES:');
  for (const f of failures) console.log('  - ' + f);
  process.exit(1);
}
