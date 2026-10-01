-- ARTIFACT RELAY V0 - what is installed. READ-ONLY, one statement: the installer reads it before it decides what is left to do.

select pg_catalog.jsonb_build_object(
  'login', current_user,
  'installed', pg_catalog.to_regnamespace('factory_relay') is not null,
  'wrapper', pg_catalog.to_regprocedure('public.factory_relay_rpc(jsonb)') is not null,
  'bucket', (select pg_catalog.jsonb_build_object('public', b.public,
                      'objects', (select pg_catalog.count(*) from storage.objects o where o.bucket_id = b.id))
               from storage.buckets b where b.id = 'factory-private-artifacts')
) as state;
