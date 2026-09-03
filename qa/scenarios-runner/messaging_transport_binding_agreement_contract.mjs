#!/usr/bin/env node
// MESSAGING TRANSPORT — CROSS-REFERENCE AGREEMENT AND QUEUE GOVERNANCE CONTRACT
//
// DB review round 2, migration C (202609020003). The two HIGH findings share one shape:
// the migration's header asserted a security property, both FK columns involved were NOT
// NULL, and NOTHING made them agree. NOT NULL guarantees a value is PRESENT, never that it
// is the RIGHT one.
//
//   R-C1: a manager of company X could bind X's transport to ANY channel (the founder's,
//         or company Y's); and any user, being the creator of their own channel, could
//         queue a message naming their own channel with ANOTHER company's binding, so the
//         message departed through that company's transport. PostgreSQL's referential
//         integrity checks ALWAYS bypass row security, so the FK validated a binding the
//         inserting user had no right to read.
//   R-C2: "a disabled binding blocks sends at the queue" was enforced nowhere — `enabled`
//         appeared once in the whole migration, in its own column definition.
//
// Assertions run against COMMENT-STRIPPED SQL. The header is where the false claims lived,
// so a contract that could be satisfied by the header would certify the exact thing that
// went wrong here.
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
const FILE = process.env.SEM_MIGRATION_C
  || join(findRepoDir('supabase/migrations'), '202609020003_messaging_transport_foundation.sql');

const raw = readFileSync(FILE, 'utf8');
const sql = raw.replace(/\/\*[\s\S]*?\*\//g, ' ')
  .split(/\r?\n/).map((l) => l.replace(/--.*$/, '')).join('\n');

function fnBody(name) {
  const i = sql.indexOf(`function public.${name}(`);
  if (i === -1) return null;
  const j = sql.indexOf('$$;', i);
  return j === -1 ? null : sql.slice(i, j);
}
const trigger = (name, timing, table) =>
  new RegExp(`create\\s+trigger\\s+${name}\\s[\\s\\S]*?before\\s+${timing}[\\s\\S]*?on\\s+public\\.${table}\\b`, 'i').test(sql);

const CASES = [];
const C = (id, kind, desc, thunk) => CASES.push([id, kind, desc, thunk]);

C('self.stripped', 'CONTRACT', 'comment-stripped SQL still contains all three tables',
  () => ['channel_transport_bindings', 'external_identity_bindings', 'outbound_messages']
    .every((t) => sql.includes(`create table if not exists public.${t}`)));
C('self.strippingWorks', 'CONTRACT', 'stripping removed the header — otherwise every claim below is header-satisfiable',
  () => raw.length - sql.length > 2000 && !sql.includes('disabled binding blocks sends at the queue'));

// --- R-C1 instance 1: binding.company_id must equal the bound channel's company ---------
const bindGuard = fnBody('channel_transport_bindings_enforce_channel_company');
C('C1.bindingGuardExists', 'DEFECT', 'R-C1: a guard ties the binding to the bound channel’s company, in code',
  () => bindGuard !== null);
C('C1.bindingGuardReadsChannel', 'DEFECT', 'R-C1: it actually reads chat_channels.company_id rather than trusting the supplied value',
  () => bindGuard !== null && /from public\.chat_channels/i.test(bindGuard) && /company_id/i.test(bindGuard));
C('C1.bindingGuardRaises', 'DEFECT', 'R-C1: a mismatch is refused, not logged',
  () => bindGuard !== null && /raise\s+exception/i.test(bindGuard));
C('C1.bindingGuardNullSafe', 'CONTRACT', 'a channel with a NULL company cannot silently satisfy the check (NULL is distinct from nothing)',
  () => bindGuard !== null && /is null or/i.test(bindGuard));
C('C1.bindingTriggerWired', 'DEFECT', 'R-C1: the binding guard is attached, on INSERT and UPDATE — a guard nothing calls is decorative',
  () => trigger('channel_transport_bindings_enforce_company', 'insert or update', 'channel_transport_bindings'));

// --- R-C1 instance 2: outbound.channel_id must equal its binding's channel --------------
const outGuard = fnBody('outbound_messages_enforce_binding_channel');
C('C1.outboundGuardExists', 'DEFECT', 'R-C1: a guard ties an outbound message to its binding’s own channel',
  () => outGuard !== null);
C('C1.outboundGuardReadsBinding', 'DEFECT', 'R-C1: it reads channel_transport_bindings.channel_id rather than trusting the row',
  () => outGuard !== null && /from public\.channel_transport_bindings/i.test(outGuard));
C('C1.outboundGuardRaises', 'DEFECT', 'R-C1: a message may not leave through another company’s transport',
  () => outGuard !== null && /raise\s+exception/i.test(outGuard));
C('C1.outboundTriggerWired', 'DEFECT', 'R-C1: the outbound guard is attached on INSERT and UPDATE',
  () => trigger('outbound_messages_enforce_binding', 'insert or update', 'outbound_messages'));

// --- R-C2: a disabled binding blocks sends ---------------------------------------------
C('C2.enabledIsRead', 'DEFECT', 'R-C2: the guard LOADS the binding’s `enabled` from the table — it previously appeared only in its own column definition',
  () => outGuard !== null && /select[\s\S]{0,120}?b\.enabled[\s\S]{0,120}?into/i.test(outGuard));
C('C2.disabledRefused', 'DEFECT', 'R-C2: queueing against a disabled binding is refused',
  () => outGuard !== null && /enabled is not true/i.test(outGuard) && /raise\s+exception/i.test(outGuard));
C('C2.insertOnly', 'CONTRACT', 'the enabled check is INSERT-only: disabling a binding mid-flight must never stop the sender RECORDING a message that already went out',
  () => outGuard !== null && /tg_op\s*=\s*'INSERT'\s+and\s+v_enabled is not true/i.test(outGuard));

// --- R-C4: authorship is server-set, not client-chosen ----------------------------------
const authorFn = fnBody('set_created_by_profile_id');
C('C4.authorFnExists', 'DEFECT', 'R-C4: created_by_profile_id is set by the server',
  () => authorFn !== null && /current_profile_id\(\)/i.test(authorFn));
for (const t of ['channel_transport_bindings', 'external_identity_bindings', 'outbound_messages']) {
  C(`C4.author.${t}`, 'DEFECT', `R-C4: ${t} sets its author server-side (a DEFAULT is not enough — a client can supply the column)`,
    () => trigger(`${t}_set_author`, 'insert', t));
}

// --- R-C5: one LIVE mapping, and revocation is complete ---------------------------------
C('C5.oneLiveMapping', 'DEFECT', 'R-C5: uniqueness applies to ACTIVE rows only, so a revoked tombstone does not permanently occupy the slot',
  () => /create\s+unique\s+index[^;]*?external_identity_bindings_one_live_idx[^;]*?where status = 'active'/i.test(sql));
C('C5.noTotalUnique', 'DEFECT', 'R-C5: the old total-uniqueness constraint is gone (it made revocation irreversible by accident)',
  () => !/unique \(transport, external_user_id\)/i.test(sql));
C('C5.revocationComplete', 'DEFECT', 'R-C5: status and revoked_at cannot disagree',
  () => /check \(\(status = 'revoked'\) = \(revoked_at is not null\)\)/i.test(sql));

// --- R-C3: duplicate delivery ------------------------------------------------------------
// The [^;] anchors below are load-bearing. With [\s\S]*? these matched ACROSS statement
// boundaries: "create unique index" from the identity-bindings index could pair with the
// idempotency index's name and WHERE clause several statements later, so downgrading the
// idempotency index to a non-unique one still passed. The mutation proof caught it.
C('C3.idempotency', 'DEFECT', 'R-C3: the queue has a dedupe key, unique per binding when present',
  () => /idempotency_key/i.test(sql)
     && /create\s+unique\s+index[^;]*?outbound_messages_idempotency_idx[^;]*?where idempotency_key is not null/i.test(sql));

// --- R-C7 --------------------------------------------------------------------------------
C('C7.queueIndexes', 'DEFECT', 'R-C7: the queue’s own drain path and its FK to chat_channels are indexed',
  () => /outbound_messages_binding_status_idx/i.test(sql) && /outbound_messages_channel_idx/i.test(sql));

let pass = 0, fail = 0, defectsOpen = 0;
for (let [id, kind, desc, thunk] of CASES) {
  let ok; try { ok = thunk() === true; } catch (e) { ok = false; desc += ' THREW ' + e.message; }
  if (ok) pass++; else { fail++; if (kind === 'DEFECT') defectsOpen++; }
  console.log((ok ? 'OK   ' : 'FAIL ') + id.padEnd(34) + ' [' + kind + '] ' + desc);
}
console.log(`\nmessaging_transport_binding_agreement_contract: ${pass} pass, ${fail} fail ` +
  `(${defectsOpen} round-2 C findings still reproduce; ${fail - defectsOpen} CONTRACT failures)`);
if (fail > 0) process.exit(1);
