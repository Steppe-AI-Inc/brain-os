// VERIFIER #56 — does a founder's pick of a SERVER-SIDE disambiguation option (armed by
// resolveCompanyLifecycleTargets with actionType '<action>_company') execute deterministically?
import { buildDecide, buildClarificationField } from '../../lib/belt_extract.mjs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = process.env.SEM_INDEX_SRC || resolve(HERE, '../../../../supabase/functions/sem-ai-command/index.ts');
const decide = buildDecide(SRC);
const rcf = buildClarificationField(SRC);
const A = 'aaaaaaaa-1111-1111-1111-111111111111', B = 'bbbbbbbb-2222-2222-2222-222222222222';
// exactly the option shape index.ts:3468 builds
const serverOptions = [
  { id: A, label: 'Acme Holdings (active)', entityType: 'company', actionType: 'archive_company' },
  { id: B, label: 'Acme Holdings Ltd (archived)', entityType: 'company', actionType: 'archive_company' },
];
// the model-emitted option shape the schema documents
const modelOptions = [
  { id: A, label: 'Acme Holdings', entityType: 'company', actionType: 'archive' },
  { id: B, label: 'Acme Holdings Ltd', entityType: 'company', actionType: 'archive' },
];
for (const reply of ['1', 'option 1', 'the first one', 'Acme Holdings (active)', 'Acme Holdings']) {
  const s = decide(reply, serverOptions), m = decide(reply, modelOptions);
  console.log(JSON.stringify(reply).padEnd(28), 'SERVER-armed ->', JSON.stringify({ matched: s.matched === A ? 'A' : s.matched, field: s.field, armed: s.armed }), '  MODEL-armed ->', JSON.stringify({ matched: m.matched === A ? 'A' : m.matched, field: m.field, armed: m.armed }));
}
console.log('resolveClarificationField(company, archive_company) =', JSON.stringify(rcf('company', 'archive_company')), '; (company, restore_company) =', JSON.stringify(rcf('company', 'restore_company')), '; (company, archive) =', JSON.stringify(rcf('company', 'archive')));
