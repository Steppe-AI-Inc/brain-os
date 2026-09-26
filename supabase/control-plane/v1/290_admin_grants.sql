-- FACTORY CONTROL PLANE V1 - PART 290: the Admin API's front doors, exactly. factory_admin_api holds EXECUTE on these and on nothing
-- else; the node API role holds none of them; the migration's final self-check (part 990) holds both lists to exactly this.

set local role factory_owner;

grant execute on function
  factory.admin_list_computers(uuid, text, jsonb),
  factory.admin_get_computer(uuid, text, jsonb),
  factory.admin_add_computer(uuid, text, jsonb),
  factory.admin_issue_code(uuid, text, jsonb),
  factory.admin_revoke_code(uuid, text, jsonb),
  factory.admin_amend_envelope(uuid, text, jsonb),
  factory.admin_drain(uuid, text, jsonb),
  factory.admin_revoke_credential(uuid, text, jsonb),
  factory.admin_request_rotation(uuid, text, jsonb),
  factory.admin_repair(uuid, text, jsonb),
  factory.admin_archive(uuid, text, jsonb),
  factory.admin_restore(uuid, text, jsonb),
  factory.admin_create_principal(uuid, text, jsonb),
  factory.admin_adopt_release(uuid, text, jsonb),
  factory.admin_publish_release(uuid, text, jsonb),
  factory.admin_revoke_release(uuid, text, jsonb),
  factory.admin_revoke_key(uuid, text, jsonb),
  factory.admin_list_releases(uuid, text, jsonb),
  factory.admin_list_policies(uuid, text, jsonb),
  factory.admin_update_policy(uuid, text, jsonb),
  factory.admin_list_waiting_verifications(uuid, text, jsonb),
  factory.admin_submit_work_order(uuid, text, jsonb),
  factory.admin_list_work(uuid, text, jsonb)
  to factory_admin_api;

reset role;
