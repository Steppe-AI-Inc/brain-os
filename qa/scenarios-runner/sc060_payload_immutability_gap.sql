-- SC-060 Approval payload immutability — KNOWN GAP (qa/KNOWN_FAILURE_MODES.md #15).
-- Reproduces live: an approver authorized to DECIDE an approval can also REWRITE its
-- approval_payload, because approvals_update_approver is a row-level policy and Postgres
-- RLS cannot pin individual columns as immutable. A manager rewrites offerPrice 2200 ->
-- 1200 on a pending production approval. A real fix is a BEFORE UPDATE trigger that
-- rejects changes to approval_payload/title/domain/company_id once set. Rolled back.
begin;
insert into public.approvals (id, company_id, title, domain, status, risk_level, approval_payload)
 values ('060a0000-0000-0000-0000-000000000001','ed8ae510-ddbc-4be6-9d9e-d1f725b1381d','SC060 offer','production','pending','high','{"offerPrice":2200}'::jsonb);
insert into public.company_memberships (company_id, profile_id, role_in_company, active)
 values ('ed8ae510-ddbc-4be6-9d9e-d1f725b1381d','66ef2052-d002-4592-b841-82cd2171b51a','manager', true);

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub','9c92a8d5-853c-4ef3-846a-f4fe8c42d97a','role','authenticated')::text, true);
update public.approvals set approval_payload='{"offerPrice":1200}'::jsonb where id='060a0000-0000-0000-0000-000000000001';
reset role;

select json_build_object(
  'scenario','SC-060',
  'classification','KNOWN GAP — no DB-level payload immutability',
  'payload_after', (select approval_payload from public.approvals where id='060a0000-0000-0000-0000-000000000001'),
  'gap_reproduced', (select approval_payload->>'offerPrice' from public.approvals where id='060a0000-0000-0000-0000-000000000001')='1200',
  'mitigations_in_place','server-built execute payloads (sem-ai-command), no payload-edit UI in /web, decision-time re-read in decide_approval() — real but not a hard guarantee',
  'note','Do NOT report SC-060 as a passing hard control. Fix = BEFORE UPDATE trigger on approvals.'
) as verdict;
rollback;
