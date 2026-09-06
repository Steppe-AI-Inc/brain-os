-- v43: how large is the class the entity signal exists for?
-- The rescue only ever applies to a reply of the shape "Confirmed - <Participle> <Name…>"
-- where the CAPTURED PHRASE (participle included) equals a known entity name. So the class
-- is exactly: entities whose NAME BEGINS with a completion participle.
with p(w) as (values
  ('archived'),('deleted'),('updated'),('created'),('restored'),('activated'),('deactivated'),
  ('assigned'),('reassigned'),('approved'),('rejected'),('declined'),('removed'),('completed'),
  ('renamed'),('ended'),('closed'),('cleared'),('sent'),('moved'),('granted'),('added'))
select 'companies' as src, count(*) as total,
       count(*) filter (where exists (select 1 from p where lower(c.name) like p.w || ' %')) as starts_with_participle
from companies c
union all
select 'people', count(*),
       count(*) filter (where exists (select 1 from p where lower(pe.full_name) like p.w || ' %'))
from people pe
union all
select 'tasks', count(*),
       count(*) filter (where exists (select 1 from p where lower(t.title) like p.w || ' %'))
from tasks t
union all
select 'projects', count(*),
       count(*) filter (where exists (select 1 from p where lower(pr.title) like p.w || ' %'))
from projects pr
union all
select 'goals', count(*),
       count(*) filter (where exists (select 1 from p where lower(g.title) like p.w || ' %'))
from goals g
union all
select 'departments', count(*),
       count(*) filter (where exists (select 1 from p where lower(d.name) like p.w || ' %'))
from departments d;
