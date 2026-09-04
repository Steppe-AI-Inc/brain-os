-- VERIFIER #18 / campaign #78 — READ-ONLY. Measures how many REAL Brain OS entity names
-- (a) begin with a negator word (the candidate's disclosed residual: the belt is disarmed)
-- (b) contain a completion word (the candidate's NEW false-positive class: a truthful
--     negative about such an entity is destroyed).
-- No writes. No temp objects.
with names as (
  select 'company' as kind, name as n from companies
  union all select 'person', full_name from people
  union all select 'task', title from tasks
  union all select 'goal', title from goals
)
select kind,
       count(*) as total,
       count(*) filter (where n ~* '^\s*(not|never|no|nothing|none|without|pending|awaiting)\M') as leads_with_negator,
       count(*) filter (where n ~* '\m(archived|deleted|updated|created|restored|activated|deactivated|assigned|reassigned|approved|rejected|declined|removed|completed|renamed|ended|closed|cleared|sent|moved|granted|added|assigning|reassigning|updating|creating|moving|archiving|restoring|deleting|removing|ending|renaming|closing|clearing|granting|declining|approving|rejecting|completing|activating|deactivating|adding|sending|executing|processing)\M') as contains_completion_word,
       count(*) filter (where n ~* '\mand\M|\mbut\M|\mwithout\M|[—–:()]') as contains_d128_boundary_token
from names
group by kind
order by kind;
