-- SEM Brain RLS smoke-test guide
-- Run manually as different users through Supabase SQL editor / API clients.
-- Do not run with service-role for the employee tests, because service-role bypasses RLS.

-- Founder should see all companies:
select * from companies;
select * from company_sensitive;
select * from salary_private;

-- Employee should see only scoped companies and should be blocked from sensitive tables:
select * from companies;
select * from company_sensitive; -- expected: zero rows or permission denied
select * from salary_private; -- expected: own row only, or zero if not linked
select * from tasks; -- expected: assigned/company-scope tasks only
select * from memories where sensitivity in ('restricted','founder_only'); -- expected: zero rows

-- Manager should see company-scope tasks/projects/people, but not founder-only ownership unless admin:
select * from projects;
select * from people;
select * from company_sensitive; -- expected: blocked unless founder/admin
