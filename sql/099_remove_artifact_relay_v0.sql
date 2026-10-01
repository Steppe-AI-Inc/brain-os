-- ARTIFACT RELAY V0 - removal. Drops every database object sql/001 added, and nothing else.
--
-- THE RECEIPTS GO WITH IT. Export them first if they are evidence:
--   select * from factory_relay.receipts order by artifact_id, seq;
--   select * from factory_relay.artifacts;
--
-- Not removed here (the storage API refuses a direct delete): the bucket 'factory-private-artifacts' and its objects, and the Edge
-- Function 'factory-artifact-relay'. FOUNDER_STEP.md lists both.
--
-- Apply as the database owner login (postgres).

begin;

set local search_path = pg_catalog, pg_temp;

drop function if exists public.factory_relay_rpc(jsonb);
drop schema if exists factory_relay cascade;

do $check$
begin
  if pg_catalog.to_regnamespace('factory_relay') is not null or pg_catalog.to_regprocedure('public.factory_relay_rpc(jsonb)') is not null then
    raise exception 'artifact relay: removal is incomplete - nothing was changed';
  end if;
end
$check$;

commit;
