SCENARIO ID: SC-087-media-security

PURPOSE: Media (image/PDF/audio/video) from a customer must link to the correct
organization, an unauthorized employee must not fetch the raw attachment URL, signed /
temporary access must work correctly, and the AI must only receive an attachment if the
actor is authorized.

ACTOR: EXTERNAL_CUSTOMER (sender) + employees of various companies (readers).

ORGANIZATION: one company; readers from other companies must be excluded.

ROLE: various.

CAPABILITIES: for the messaging-media path — none exist. For the EXISTING document/Storage
path — `documents_bucket_select` gates Storage bytes by joining
`storage.objects.name = documents.storage_path` and applying the same sensitivity tiers as
the `documents` table.

PRECONDITIONS: (messaging) n/a — no inbound-media subsystem. (documents) a confidential
document with a Storage object.

ACTION: an unauthorized employee tries to fetch the raw Storage object / create a signed
URL for a confidential document they cannot see in the table.

EXPECTED RESULT:
- Messaging-media path: NOT APPLICABLE — no inbound customer media exists.
- Documents/Storage path (REAL, and the relevant cross-reference): the Storage RLS blocks
  the bytes for a user who cannot read the owning document row — this exact gap
  (folder-only access letting a blocked user fetch the file) was found and fixed, see
  `qa/KNOWN_FAILURE_MODES.md` #2 (migration 202608260021/202608260022). A confidential
  file is as restricted as its row.

EXPECTED DENIALS: `documents_bucket_select` denies the object to a non-member / non-manager
for confidential-tier documents.

EXPECTED DATABASE STATE: n/a.

EXPECTED AUDIT EVENTS: n/a for reads.

EXPECTED AI VISIBILITY: sem-ai-command accepts an inline image only from the caller's own
composer (`imageBase64` in the request body); it does not fetch arbitrary Storage objects
into context. When a real media subsystem is built, the AI must receive an attachment only
if the caller is authorized for it — the same RLS-before-LLM rule.

CLEANUP: n/a.

AUTOMATION STATUS: PARTIAL. Messaging-media half: NOT APPLICABLE — feature not yet
implemented. Documents/Storage half: the RLS is real but exercising signed-URL denial needs
a Storage binary + a signed-URL call, out of scope for a pure-SQL runner tonight — MANUAL
VERIFICATION ONLY (the policy text is confirmed present in the schema and its fix history
is in KNOWN_FAILURE_MODES.md #2). Cross-ref governance/SECURITY_INVARIANTS.md,
qa/KNOWN_FAILURE_MODES.md #2, SC-109 (new integration checklist requires this for media).

LAST VERIFIED DATE: not run this pass (Storage signed-URL test is manual); policy present,
prior fix live-verified 2026-08-26
