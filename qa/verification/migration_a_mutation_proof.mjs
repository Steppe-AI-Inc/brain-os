#!/usr/bin/env node
// MUTATION PROOF for chat_channel_state_trusted_columns_contract.mjs
//
// Each mutation re-creates one of the round-2 A findings in a COPY of the migration and
// asserts the contract catches it by name. A contract that stays green while the defect is
// present is worse than no contract: it is a false certificate. This project has shipped
// that ten times, so every guard gets broken on purpose before it is trusted.
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..', '..');
const SRC = join(REPO, 'supabase', 'migrations', '202609020001_chat_channel_state_durable_conversation.sql');
const SUITE = join(REPO, 'qa', 'scenarios-runner', 'chat_channel_state_trusted_columns_contract.mjs');
const original = readFileSync(SRC, 'utf8');
const workdir = mkdtempSync(join(tmpdir(), 'migA-'));

const MUTATIONS = [
  {
    name: 'R-A1 restored: the pending-action RPC re-admits the company-manager tier',
    find: /where c\.id = p_channel_id\r?\n(\s*)and c\.created_by_profile_id = public\.current_profile_id\(\)\r?\n(\s*)\)\r?\n(\s*)\) then\r?\n(\s*)raise exception 'set_chat_channel_pending_action/,
    replace: `where c.id = p_channel_id\n$1and (c.created_by_profile_id = public.current_profile_id()\n$1     or (c.company_id is not null and public.is_company_manager(c.company_id)))\n$2)\n$3) then\n$4raise exception 'set_chat_channel_pending_action`,
    expectFail: ['A1.noManagerTier'],
  },
  {
    name: 'R-A2 restored: the UPDATE guard stops observing last_successful_mutation',
    find: /\s*or \(new\.last_successful_mutation is not null\r?\n\s*and new\.last_successful_mutation is distinct from old\.last_successful_mutation\)/,
    replace: '',
    expectFail: ['A2.upd.last_successful_mutation'],
  },
  {
    name: 'the INSERT guard is written but never attached (the decorative-guard class)',
    find: /create trigger chat_channel_state_guard_trusted_ins/,
    replace: 'create trigger chat_channel_state_guard_trusted_ins_DISABLED',
    expectFail: ['A2.triggersWired'],
  },
  {
    name: 'an RPC leaves the trusted-write flag raised on return',
    find: /\r?\n\r?\n  perform set_config\('app\.chat_channel_state_trusted_write', 'off', true\);\r?\nend;\r?\n\$\$;\r?\n\r?\n-- Recording what actually executed/,
    replace: "\nend;\n$$;\n\n-- Recording what actually executed",
    expectFail: ['flag.off.set_chat_channel_pending_action'],
  },
  {
    name: 'the guard becomes SECURITY DEFINER and decides on current_user (the R-D1 shape)',
    find: /security invoker           -- deliberately NOT definer/,
    replace: 'security definer -- deliberately NOT definer',
    expectFail: ['A2.guardNotDefiner'],
  },
  {
    name: 'R-A4 restored: a confirmation may again be armed with no target ids',
    find: /constraint chat_channel_state_confirmation_binds_targets check/,
    replace: 'constraint chat_channel_state_confirmation_binds_targets_REMOVED check',
    expectFail: ['A4.confirmationBindsTargets'],
  },
  {
    name: 'R-A7 restored: the compaction checkpoint may sit un-anchored',
    find: /create trigger chat_channel_state_a_invalidate_compaction/,
    replace: 'create trigger chat_channel_state_a_invalidate_compaction_DISABLED',
    expectFail: ['A7.compactionInvalidates'],
  },
  {
    name: 'R-A6 restored: updated_at goes back to developer convention',
    find: /create trigger chat_channel_state_touch_updated_at/,
    replace: 'create trigger chat_channel_state_touch_updated_at_DISABLED',
    expectFail: ['A6.updatedAtTrigger'],
  },
];

const runSuite = (p) => {
  try {
    return execFileSync(process.execPath, [SUITE], {
      env: { ...process.env, SEM_MIGRATION_A: p }, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (e) { return String(e.stdout || '') + String(e.stderr || ''); }
};
const failedIds = (out) => new Set(out.split(/\r?\n/).filter((l) => /^FAIL\s/.test(l)).map((l) => l.split(/\s+/)[1]));

const base = failedIds(runSuite(SRC));
if (base.size > 0) {
  console.log('BASELINE NOT CLEAN — nothing below is meaningful:', [...base].join(', '));
  process.exit(1);
}
console.log('baseline: 0 failures on the unmutated migration\n');

let unproven = 0;
for (const m of MUTATIONS) {
  const hits = (original.match(new RegExp(m.find.source, m.find.flags.includes('g') ? m.find.flags : m.find.flags + 'g')) || []).length;
  if (hits !== 1) {
    console.log(`STALE ANCHOR  ${m.name}\n              anchor matched ${hits}x, expected exactly 1 — mutation not applied`);
    unproven++; continue;
  }
  const p = join(workdir, `mig.${MUTATIONS.indexOf(m)}.sql`);
  // Replacement is applied through a FUNCTION, not a string. With a string replacement JS
  // treats `$$` as an escape for a literal `$`, so a replacement containing SQL's `$$;`
  // dollar-quote terminator silently became `$;` — corrupting the mutant into a file that
  // no longer parsed as the same function boundaries, which made two mutations look
  // "unproven" for a reason that had nothing to do with the guard under test.
  const mutated = original.replace(m.find, (...args) => {
    const groups = args.slice(1, -2);
    return m.replace.replace(/\$(\d)/g, (_, d) => groups[Number(d) - 1] ?? '');
  });
  if (mutated === original) {
    console.log(`STALE ANCHOR  ${m.name}\n              replacement produced an identical file`);
    unproven++; continue;
  }
  writeFileSync(p, mutated, 'utf8');
  const got = failedIds(runSuite(p));
  const missing = m.expectFail.filter((id) => !got.has(id));
  if (missing.length > 0) {
    console.log(`UNPROVEN      ${m.name}\n              expected FAIL for ${missing.join(', ')} — did not reproduce`);
    unproven++;
  } else {
    console.log(`PROVEN        ${m.name}\n              caught by: ${m.expectFail.join(', ')}`);
  }
}
console.log(`\nmigration_a_mutation_proof: ${MUTATIONS.length - unproven}/${MUTATIONS.length} proven, ${unproven} unproven`);
process.exit(unproven === 0 ? 0 : 1);
