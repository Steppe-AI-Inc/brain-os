#!/usr/bin/env node
// ROUND 4 / R4-1: the retry-column guard's list and the claim RPC's RETURN list are pinned to
// each other. Round 3 found execution_mode missing (D-3); round 4 found canonical_work_order_id,
// task_id and agent_id missing (R4-1) — each time the comment above the list claimed
// completeness. A comment cannot enforce completeness; this suite does: every agent_runs
// column the claim RETURNS or its predicate READS must appear in the guard's
// `is distinct from` list, and the liveness columns (R4-2) must too.
//
// Runnable with plain `node`; reads the SQL only (no engine). Exits non-zero on any gap.
import { readFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const SQL = readFileSync(join(resolve(HERE, '..', '..'), 'supabase', 'migrations', '202609030001_agent_run_capacity_retry.sql'), 'utf8');
// D63 class: assert against comment-stripped SQL only.
const live = SQL.split(/\r?\n/).filter((l) => !/^\s*--/.test(l)).join('\n');

const fails = [];
const check = (name, ok, detail) => { console.log(`${ok ? 'OK  ' : 'FAIL'} ${name}${detail ? ' — ' + detail : ''}`); if (!ok) fails.push(name); };

// The claim's RETURN list: `select ar.<col>, ...` inside `return query`.
const rq = live.match(/return query\s+select([\s\S]*?)\bfrom public\.agent_runs ar\b/i);
check('the claim RPC has a parsable RETURN list', !!rq);
const returned = rq ? [...rq[1].matchAll(/\bar\.([a-z_]+)/g)].map((m) => m[1]) : [];
// Columns the claim's predicate reads.
const predicate = live.match(/select ar\.id into v_id[\s\S]*?for update skip locked/i);
check('the claim RPC has a parsable predicate', !!predicate);
const read = predicate ? [...predicate[0].matchAll(/\bar\.([a-z_]+)/g)].map((m) => m[1]) : [];
// The guard's list.
const guardBody = live.match(/create or replace function public\.guard_agent_run_retry_columns\(\)[\s\S]*?\$\$;/i);
check('the guard function is present', !!guardBody);
const guarded = guardBody ? [...guardBody[0].matchAll(/new\.([a-z_]+) is distinct from old\.\1/g)].map((m) => m[1]) : [];

const required = new Set([...returned, ...read, 'last_event', 'last_heartbeat_at', 'execution_mode', 'status', 'claimed_by', 'claimed_at']);
const missing = [...required].filter((c) => !guarded.includes(c));
check(`every column the claim RETURNS (${returned.length}) or READS (${read.length}) plus the liveness/attestation columns is guarded (${guarded.length} guarded)`, missing.length === 0, missing.length ? 'MISSING: ' + missing.join(', ') : '');
check('the guard raises an AUTHORITY refusal (42501), not a business-rule error (R4-9)', /may modify Agent Run retry\/checkpoint state'\s*\n\s*using errcode = '42501'/.test(guardBody ? guardBody[0] : ''));
check('the guard tests session_user, never current_user (R-D1)', guardBody ? /session_user in \('postgres', 'supabase_admin'\)/.test(guardBody[0]) && !/current_user in/.test(guardBody[0]) : false);
check('the guard function is not PUBLIC-executable (A-6 class)', /revoke execute on function public\.guard_agent_run_retry_columns\(\) from public, anon, authenticated;/.test(live));

console.log(`\nagent_run_guard_covers_claim_returns: ${fails.length === 0 ? 'guard list covers the claim (returned: ' + returned.join(', ') + ')' : fails.length + ' FAILED'}`);
process.exit(fails.length ? 1 : 0);
