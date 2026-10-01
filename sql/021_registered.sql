-- ARTIFACT RELAY V0 - who is registered. READ-ONLY, one statement (the relay must be installed).

select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('node_id', n.node_id, 'relay_role', n.relay_role, 'public_key', n.public_key)
                                     order by n.relay_role), '[]'::jsonb) as nodes
from factory_relay.nodes n
where n.active;
