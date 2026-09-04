#!/usr/bin/env node
// CHAT_CHANNEL_STATE TRUSTED-COLUMN CONTRACT
//
// DB review round 2, findings R-A1 (a company manager could plant a pending destructive
// action in the FOUNDER's channel, which the founder's own bare "yes" would then execute —
// manager-tier input, founder-tier execution) and R-A2 (`last_successful_mutation` was
// commented "backend-written execution fact, never model prose" while the grants let any
// user write it straight through PostgREST, moving the false-execution-claim class INTO
// the database).
//
// No database is required to run this, and that is the point: these are properties of the
// migration TEXT, checkable before anyone is asked to authorize a push. It is not a
// substitute for the post-apply SQL — it is the check that can run first, every time.
//
// EVERY ASSERTION RUNS AGAINST COMMENT-STRIPPED SQL. This project has twice shipped a
// "passing" assertion that was satisfied by a comment mentioning the thing it looked for
// (the D63 class). A contract that a comment can satisfy verifies nothing.
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';

function findRepoDir(rel) {
  let d = dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 6; i++) {
    try { readdirSync(resolve(d, rel)); return resolve(d, rel); } catch { d = resolve(d, '..'); }
  }
  throw new Error('could not locate ' + rel);
}
const MIG = findRepoDir('supabase/migrations');
const FILE = process.env.SEM_MIGRATION_A
  || join(MIG, '202609020001_chat_channel_state_durable_conversation.sql');

const raw = readFileSync(FILE, 'utf8');
// Strip block comments, then line comments. Dollar-quoted bodies in this migration contain
// no `--` sequences inside string literals, so a line-wise strip is sound here; the
// self-check below fails loudly if stripping ever removes so much that the file stops
// looking like the migration it is meant to be.
const sql = raw
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .split(/\r?\n/).map((l) => l.replace(/--.*$/, '')).join('\n');

const TRUSTED = [
  'pending_action', 'pending_action_action_type', 'pending_action_target_ids',
  'pending_action_source_work_order_id', 'pending_action_expected_confirmation',
  'pending_action_created_at', 'pending_action_expires_at',
  'last_successful_mutation', 'compacted_summary', 'compacted_through_work_order_id',
  'compacted_turn_count', 'compacted_canonical_ids',
];

// Slice one function body out of the comment-stripped SQL.
function fnBody(name) {
  const i = sql.indexOf(`function public.${name}(`);
  if (i === -1) return null;
  const j = sql.indexOf('$$;', i);
  return j === -1 ? null : sql.slice(i, j);
}

const CASES = [];
const C = (id, kind, desc, thunk) => CASES.push([id, kind, desc, thunk]);

// --- self-check: if stripping broke the file, everything below is vacuous ---------------
C('self.stripped', 'CONTRACT', 'comment-stripped SQL still contains the table and all three RPCs',
  () => sql.includes('create table if not exists public.chat_channel_state')
     && sql.includes('function public.set_chat_channel_pending_action(')
     && sql.includes('function public.record_chat_channel_mutation(')
     && sql.includes('function public.set_chat_channel_compaction('));
C('self.strippingWorks', 'CONTRACT', 'stripping actually removed comments (otherwise every assertion below is comment-satisfiable)',
  () => raw.length - sql.length > 2000 && !sql.includes('R-A1 (DB review round 2)'));

// --- R-A2: no trusted column may be asserted without the trusted-write flag --------------
const updGuard = fnBody('chat_channel_state_guard_trusted_columns');
const insGuard = fnBody('chat_channel_state_guard_trusted_columns_ins');

C('A2.updateGuardExists', 'DEFECT', 'R-A2: a BEFORE UPDATE guard on trusted columns exists in code, not only in a comment',
  () => updGuard !== null);
C('A2.insertGuardExists', 'DEFECT', 'R-A2: a BEFORE INSERT guard exists too — a row must not be BORN holding fabricated state',
  () => insGuard !== null);

for (const col of TRUSTED) {
  C(`A2.upd.${col}`, 'DEFECT', `R-A2: UPDATE guard observes ${col}`,
    () => updGuard !== null && new RegExp(`new\\.${col}\\b`).test(updGuard));
  C(`A2.ins.${col}`, 'DEFECT', `R-A2: INSERT guard observes ${col}`,
    () => insGuard !== null && new RegExp(`new\\.${col}\\b`).test(insGuard));
}

C('A2.updRaises', 'DEFECT', 'R-A2: the UPDATE guard refuses with a permission error, not a warning',
  () => updGuard !== null && /raise\s+exception/i.test(updGuard) && /42501/.test(updGuard));
C('A2.insRaises', 'DEFECT', 'R-A2: the INSERT guard refuses with a permission error',
  () => insGuard !== null && /raise\s+exception/i.test(insGuard) && /42501/.test(insGuard));

C('A2.triggersWired', 'DEFECT', 'R-A2: both guards are actually attached as triggers — a guard function nothing calls is decorative',
  // The trailing \s is load-bearing: without it, renaming the trigger to
  // `..._ins_DISABLED` still matched as a PREFIX and this assertion passed while the guard
  // was detached. The mutation proof caught that; it is why the anchor is here.
  () => /create\s+trigger\s+chat_channel_state_guard_trusted_ins\s[\s\S]*?before\s+insert\s+on\s+public\.chat_channel_state/i.test(sql)
     && /create\s+trigger\s+chat_channel_state_guard_trusted_upd\s[\s\S]*?before\s+update\s+on\s+public\.chat_channel_state/i.test(sql));

// ROUND 3 / A-1 RE-PIN: the flag ALONE was forgeable (any role may set_config a custom GUC),
// so the guard now requires the flag AND the SECURITY DEFINER execution context
// (current_user = the RPC owner). It stays SECURITY INVOKER — that is exactly what makes the
// current_user test meaningful: inside the definer RPC it is the owner, for a client it is
// anon/authenticated whatever GUC the client set. The old contract ("never current_user")
// pinned the forgeable design and is retired on the record.
C('A2.guardNotDefiner', 'CONTRACT', 'the guard is SECURITY INVOKER and requires BOTH the flag AND the definer execution context (current_user = owner) — ROUND 3 / A-1',
  () => updGuard !== null && /security\s+invoker/i.test(updGuard)
     && /current_setting\('app\.chat_channel_state_trusted_write'/i.test(updGuard)
     && /and\s+current_user\s+in\s*\('postgres',\s*'supabase_admin'\)/i.test(updGuard));

// --- R-A1: the pending-action writer must NOT include the company-manager tier -----------
const paRpc = fnBody('set_chat_channel_pending_action');
C('A1.rpcExists', 'DEFECT', 'R-A1: arming a pending action goes through an RPC, not a direct table write',
  () => paRpc !== null);
C('A1.noManagerTier', 'DEFECT', 'R-A1: the pending-action RPC does NOT grant the company-manager tier (that is the confused-deputy escalation)',
  () => paRpc !== null && !/is_company_manager/i.test(paRpc));
C('A1.creatorTier', 'DEFECT', 'R-A1: the pending-action RPC authorizes the channel CREATOR or a founder/admin, and checks it',
  () => paRpc !== null && /created_by_profile_id\s*=\s*public\.current_profile_id\(\)/i.test(paRpc)
     && /is_founder_or_admin\(\)/i.test(paRpc) && /raise\s+exception/i.test(paRpc));

// --- the flag discipline both findings depend on -----------------------------------------
for (const rpc of ['set_chat_channel_pending_action', 'record_chat_channel_mutation', 'set_chat_channel_compaction']) {
  const b = fnBody(rpc);
  C(`flag.on.${rpc}`, 'DEFECT', `${rpc} raises the trusted-write flag transaction-locally`,
    () => b !== null && /set_config\(\s*'app\.chat_channel_state_trusted_write'\s*,\s*'on'\s*,\s*true\s*\)/.test(b));
  C(`flag.off.${rpc}`, 'DEFECT', `${rpc} lowers the flag again before returning — is_local lasts to end of TRANSACTION, not end of function`,
    () => b !== null && /set_config\(\s*'app\.chat_channel_state_trusted_write'\s*,\s*'off'\s*,\s*true\s*\)/.test(b));
  C(`flag.local.${rpc}`, 'CONTRACT', `${rpc} uses is_local => true, so an exception cannot leave the flag raised`,
    () => b !== null && !/set_config\([^)]*,\s*false\s*\)/.test(b));
}

// --- R-A4 / R-A3 / R-A7: the constraints that make a half-written action unrepresentable --
C('A4.confirmationBindsTargets', 'DEFECT', 'R-A4: a confirmation-type pending action must name its target ids',
  () => /constraint\s+chat_channel_state_confirmation_binds_targets\s+check/i.test(sql)
     && /pending_action_expected_confirmation\s+is\s+distinct\s+from\s+'confirmation'/i.test(sql));
C('A3.jsonbShapes', 'DEFECT', 'R-A3: the collection columns refuse a planted scalar at write time',
  () => /constraint\s+chat_channel_state_jsonb_shapes\s+check/i.test(sql)
     && /jsonb_typeof\(focus_stack\)\s*=\s*'array'/i.test(sql));
C('A7.compactionInvalidates', 'DEFECT', 'R-A7: losing the compaction anchor invalidates the whole checkpoint rather than leaving it un-anchored',
  () => /function public\.chat_channel_state_invalidate_unanchored_compaction/i.test(sql)
     && /create\s+trigger\s+chat_channel_state_a_invalidate_compaction\s/i.test(sql));
C('A7.triggerOrder', 'CONTRACT', 'the invalidation trigger sorts BEFORE the guard trigger, or the guard would reject the FK-driven reset',
  () => 'chat_channel_state_a_invalidate_compaction' < 'chat_channel_state_guard_trusted_upd');
C('A6.updatedAtTrigger', 'DEFECT', 'R-A6: updated_at is maintained by the database, not by developer convention',
  () => /create\s+trigger\s+chat_channel_state_touch_updated_at\s[\s\S]*?before\s+update/i.test(sql));
C('A6.versionHasNoTrigger', 'CONTRACT', 'version is deliberately NOT trigger-maintained — that would break the compare-and-set it exists for',
  () => !/new\.version\s*:=/i.test(sql));

// --- R-A10 --------------------------------------------------------------------------------
C('A10.shapeGuard', 'DEFECT', 'R-A10: `create table if not exists` cannot silently adopt a differently-shaped table',
  () => /information_schema\.columns/i.test(sql) && /Refusing to attach constraints and triggers/i.test(raw));

let pass = 0, fail = 0, defectsOpen = 0;
for (let [id, kind, desc, thunk] of CASES) {
  let ok; try { ok = thunk() === true; } catch (e) { ok = false; desc += ' THREW ' + e.message; }
  if (ok) pass++; else { fail++; if (kind === 'DEFECT') defectsOpen++; }
  console.log((ok ? 'OK   ' : 'FAIL ') + id.padEnd(46) + ' [' + kind + '] ' + desc);
}
console.log(`\nchat_channel_state_trusted_columns_contract: ${pass} pass, ${fail} fail ` +
  `(${defectsOpen} round-2 A findings still reproduce; ${fail - defectsOpen} CONTRACT failures)`);
// Exit guard — ANY failure fails the run. No kind-based carve-out.
if (fail > 0) process.exit(1);
