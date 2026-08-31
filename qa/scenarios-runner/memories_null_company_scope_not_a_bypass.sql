-- PERMANENT REGRESSION — BUG-004
-- memories: company_id IS NULL must NOT be a blanket authorization bypass.
-- EXPECTED_FAIL until fixed. Asserts CORRECT behavior, not current behavior.
-- Self-cleaning: begin;...rollback;. Zero residue.

begin;
set local role authenticated;
-- Standing zero-membership employee profile = the exact shape public self-signup produces.
set local request.jwt.claim.sub = '9c92a8d5-853c-4ef3-846a-f4fe8c42d97a';

do $$
begin
  begin
    insert into public.memories (company_id, entity_type, fact, sensitivity, confidence)
    values (null, 'company', 'REGRESSION-BUG004 probe', 'internal', 0.5);
    perform set_config('t.write_allowed','true',true);
  exception when others then
    perform set_config('t.write_allowed','false',true);
  end;
end $$;

select json_build_object(
  'stranger_can_write_unscoped_memory', current_setting('t.write_allowed')::boolean,
  'unscoped_confidential_readable',     (select count(*) from public.memories
                                          where sensitivity='confidential'::visibility_level
                                            and company_id is null),
  'total_memories_visible_to_stranger', (select count(*) from public.memories),
  -- CORRECT behavior: a zero-membership account must not write company memory, and must not
  -- read unscoped confidential memories.
  'all_pass', (current_setting('t.write_allowed')::boolean = false)
              and ((select count(*) from public.memories
                     where sensitivity='confidential'::visibility_level
                       and company_id is null) = 0),
  'bug_id','BUG-004',
  'expected_state_until_fixed','EXPECTED_FAIL',
  'note','The confidential-read half can pass VACUOUSLY while zero unscoped confidential rows exist. The write half is the load-bearing assertion - it fails deterministically until the company_id IS NULL bypass is removed from memories_write_scope.'
) as verdict;
rollback;
