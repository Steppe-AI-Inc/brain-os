-- FACTORY CONTROL PLANE V1 - PART 190: the Node API's front doors, exactly (S-7).
--
-- factory_node_api holds EXECUTE on these functions and on nothing else in the schema: GET /v1/time, POST /v1/session, the node
-- operations register, heartbeat, claim, renew, checkpoint, complete, release, verification claim, certify, credential rotate and
-- report-state, and (part 150) the two session-less enrollment steps. The migration's final self-check (part 990) and the
-- candidate's route inventory hold the list to exactly this.

set local role factory_owner;

grant execute on function
  factory.node_time(),
  factory.node_session_open(text, text, timestamptz, timestamptz, text, bytea),
  factory.node_register(bytea, jsonb),
  factory.node_heartbeat(bytea, jsonb),
  factory.node_claim(bytea, jsonb),
  factory.node_renew(bytea, jsonb),
  factory.node_checkpoint(bytea, jsonb),
  factory.node_complete(bytea, jsonb),
  factory.node_release(bytea, jsonb),
  factory.node_verification_claim(bytea, jsonb),
  factory.node_certify(bytea, jsonb),
  factory.node_credential_rotate(bytea, text, bytea),
  factory.node_report_state(bytea, jsonb),
  factory.node_enroll_start(text, bytea, integer, bytea, inet, jsonb),
  factory.node_enroll_complete(uuid, text, bytea, inet)
  to factory_node_api;

reset role;
