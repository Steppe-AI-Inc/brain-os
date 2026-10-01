-- ARTIFACT RELAY V0 - the private bucket.
--
-- Adds one row to storage.buckets: 'factory-private-artifacts', public = false, 2 MiB per object.
-- It creates no storage policy: with row level security on storage.objects and no policy, only the project's service key reads or
-- writes the bucket, and that key exists only inside the relay's Edge Function.
--
-- Apply once, as the database owner login (postgres). If the bucket exists already, nothing is changed.
-- (The same bucket can be made in the dashboard instead: Storage > New bucket > name factory-private-artifacts, Public OFF.)

begin;

set local search_path = pg_catalog, pg_temp;

insert into storage.buckets (id, name, public, file_size_limit)
values ('factory-private-artifacts', 'factory-private-artifacts', false, 2097152);

do $check$
begin
  if (select b.public from storage.buckets b where b.id = 'factory-private-artifacts') is distinct from false then
    raise exception 'artifact relay: the bucket is not private - nothing was changed';
  end if;
end
$check$;

commit;
