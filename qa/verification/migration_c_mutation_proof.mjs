#!/usr/bin/env node
// MUTATION PROOF for messaging_transport_binding_agreement_contract.mjs
// Same discipline as migration A's: re-create each round-2 C finding in a copy and assert
// the contract names it. Replacement goes through a function, never a string — `$$` is a
// JS replacement escape and silently corrupts SQL dollar-quoting (that bug cost two
// "unproven" results on migration A before it was found).
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..', '..');
const SRC = join(REPO, 'supabase', 'migrations', '202609020003_messaging_transport_foundation.sql');
const SUITE = join(REPO, 'qa', 'scenarios-runner', 'messaging_transport_binding_agreement_contract.mjs');
const original = readFileSync(SRC, 'utf8');
const workdir = mkdtempSync(join(tmpdir(), 'migC-'));

const MUTATIONS = [
  { name: 'R-C1(1) restored: the binding no longer has to match its channel’s company',
    find: /create trigger channel_transport_bindings_enforce_company\b/,
    replace: 'create trigger channel_transport_bindings_enforce_company_DISABLED',
    expectFail: ['C1.bindingTriggerWired'] },
  { name: 'R-C1(1) weakened: the guard trusts the supplied company instead of reading the channel',
    find: /select c\.company_id into v_channel_company\r?\n\s*from public\.chat_channels c where c\.id = new\.channel_id;/,
    replace: 'v_channel_company := new.company_id;',
    expectFail: ['C1.bindingGuardReadsChannel'] },
  { name: 'R-C1(2) restored: an outbound message may again name another company’s binding',
    find: /create trigger outbound_messages_enforce_binding\b/,
    replace: 'create trigger outbound_messages_enforce_binding_DISABLED',
    expectFail: ['C1.outboundTriggerWired'] },
  { name: 'R-C2 restored: nothing reads `enabled` again',
    find: /if tg_op = 'INSERT' and v_enabled is not true then/,
    replace: 'if false then',
    // NOT C2.enabledIsRead: that case asserts the guard LOADS `enabled` from the binding,
    // which this mutation leaves intact — it disables the DECISION, not the read. Listing
    // it here was my error, and correcting the expectation rather than weakening the case
    // is the right repair: the two assertions check genuinely different things.
    expectFail: ['C2.disabledRefused', 'C2.insertOnly'] },
  { name: 'R-C2 over-corrected: the enabled check also fires on UPDATE, stranding sent messages at queued',
    find: /if tg_op = 'INSERT' and v_enabled is not true then/,
    replace: 'if v_enabled is not true then',
    expectFail: ['C2.insertOnly'] },
  { name: 'R-C4 restored: outbound authorship becomes client-chosen again',
    find: /create trigger outbound_messages_set_author\b/,
    replace: 'create trigger outbound_messages_set_author_DISABLED',
    expectFail: ['C4.author.outbound_messages'] },
  { name: 'R-C5 restored: total uniqueness makes revocation irreversible again',
    find: /create unique index if not exists external_identity_bindings_one_live_idx\r?\n(\s*)on public\.external_identity_bindings \(transport, external_user_id\)\r?\n\s*where status = 'active';/,
    replace: 'alter table public.external_identity_bindings add constraint eib_u unique (transport, external_user_id);',
    expectFail: ['C5.oneLiveMapping', 'C5.noTotalUnique'] },
  { name: 'R-C5 restored: status and revoked_at may disagree again',
    find: /check \(\(status = 'revoked'\) = \(revoked_at is not null\)\)/,
    replace: 'check (status is not null)',
    expectFail: ['C5.revocationComplete'] },
  { name: 'R-C3 restored: duplicate delivery is possible again',
    find: /create unique index if not exists outbound_messages_idempotency_idx/,
    replace: 'create index if not exists outbound_messages_idempotency_idx',
    expectFail: ['C3.idempotency'] },
  { name: 'the guard stops loading `enabled` at all (the read, not the decision)',
    find: /select b\.channel_id, b\.enabled into v_binding_channel, v_enabled/,
    replace: 'select b.channel_id, true into v_binding_channel, v_enabled',
    expectFail: ['C2.enabledIsRead'] },
];

const runSuite = (p) => {
  try {
    return execFileSync(process.execPath, [SUITE], {
      env: { ...process.env, SEM_MIGRATION_C: p }, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (e) { return String(e.stdout || '') + String(e.stderr || ''); }
};
const failedIds = (out) => new Set(out.split(/\r?\n/).filter((l) => /^FAIL\s/.test(l)).map((l) => l.split(/\s+/)[1]));

const base = failedIds(runSuite(SRC));
if (base.size > 0) { console.log('BASELINE NOT CLEAN:', [...base].join(', ')); process.exit(1); }
console.log('baseline: 0 failures on the unmutated migration\n');

let unproven = 0;
for (const m of MUTATIONS) {
  const hits = (original.match(new RegExp(m.find.source, m.find.flags.includes('g') ? m.find.flags : m.find.flags + 'g')) || []).length;
  if (hits !== 1) {
    console.log(`STALE ANCHOR  ${m.name}\n              matched ${hits}x, expected 1`); unproven++; continue;
  }
  const mutated = original.replace(m.find, (...a) => {
    const g = a.slice(1, -2);
    return m.replace.replace(/\$(\d)/g, (_, d) => g[Number(d) - 1] ?? '');
  });
  if (mutated === original) { console.log(`STALE ANCHOR  ${m.name}\n              produced an identical file`); unproven++; continue; }
  const p = join(workdir, `mig.${MUTATIONS.indexOf(m)}.sql`);
  writeFileSync(p, mutated, 'utf8');
  const got = failedIds(runSuite(p));
  const missing = m.expectFail.filter((id) => !got.has(id));
  if (missing.length > 0) {
    console.log(`UNPROVEN      ${m.name}\n              expected FAIL for ${missing.join(', ')} — did not reproduce`); unproven++;
  } else {
    console.log(`PROVEN        ${m.name}\n              caught by: ${m.expectFail.join(', ')}`);
  }
}
console.log(`\nmigration_c_mutation_proof: ${MUTATIONS.length - unproven}/${MUTATIONS.length} proven, ${unproven} unproven`);
process.exit(unproven === 0 ? 0 : 1);
