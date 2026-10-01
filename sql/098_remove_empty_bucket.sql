-- ARTIFACT RELAY V0 - removal of the bucket, once it is EMPTY. It refuses while the bucket holds an object: an object is deleted
-- by the relay itself when its artifact expires (through the storage API, which also deletes the bytes), never by this file.
--
-- Apply as the database owner login (postgres), before sql/099.

begin;

set local search_path = pg_catalog, pg_temp;

do $check$
begin
  if exists (select 1 from storage.objects o where o.bucket_id = 'factory-private-artifacts') then
    raise exception 'artifact relay: the bucket still holds objects - nothing was changed';
  end if;
end
$check$;

-- the storage schema refuses a direct delete unless it is told the delete is meant; an empty bucket has no bytes to orphan
set local storage.allow_delete_query = 'true';
delete from storage.buckets where id = 'factory-private-artifacts';

commit;
