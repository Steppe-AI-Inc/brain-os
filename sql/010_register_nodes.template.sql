-- ARTIFACT RELAY V0 - registration. THIS IS THE AUTHORIZATION: it says which node may send and which node receives and verifies.
-- Run it as the database owner login (postgres), after sql/001.
--
-- Each node prints its own node id and public key with `node relay/relay.mjs pubkey`. A public key is the 43-character text it
-- prints; the private key never leaves the node. Compare each node id with the Factory's own table (sql/000 lists it).
--
-- It is ONE statement: both nodes are registered, or neither. It refuses a node id the Factory does not know, and each line of
-- its answer says what the Factory records about that node.

select factory_relay.register_node(n.node_id, n.relay_role, n.public_key, n.label) as registered
from (values
  ('<WORK NODE ID>', 'sender',   '<WORK RELAY PUBLIC KEY>', 'Work: implementer node'),
  ('<HOME NODE ID>', 'verifier', '<HOME RELAY PUBLIC KEY>', 'Home: verifier node')
) as n(node_id, relay_role, public_key, label);
