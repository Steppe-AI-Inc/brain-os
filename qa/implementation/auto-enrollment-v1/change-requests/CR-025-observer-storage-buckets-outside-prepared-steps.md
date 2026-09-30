# CHANGE REQUEST — DIRECTOR DECISION REQUIRED

**CR-025 — L6-9: the observer's SELECT on `storage.buckets` is left to the founder's observer provisioning and its first read, not
to a candidate prepared founder step, because such a step would grant on and probe a platform schema inside the §3.4 scan scope**

- **Filed:** 2026-09-29 by the IMPLEMENTER capability, on `factory/auto-enrollment-v1-implementation`.
- **Built on:** Director r3 `c7a845b61a3b0b419e8c9dfeff397547fdc75b03`.
- **Kind:** a clarification of how a Director requirement is read, and of which party carries one part of finding L6-9. No
  Director text is edited, and no product behaviour is changed by this request.
- **Until the Director decides, the candidate keeps prepared step 1b as it is** (the `factory` relations only). The candidate report
  states the deviation below. The candidate relies on no answer.

## Requirement

- **Contract**, the Director's live observer login (`docs/architecture/features/factory-node-management-auto-enrollment.md:249-254`):
  a founder-provisioned SELECT-only role that holds SELECT on every `factory` relation, including those the migration adds (a
  recorded founder change), "and on `storage.buckets`", with its reads not filtered by row security; "Its first read is the
  storage-bucket referent (AC-10)".
- **Contract**, founder actions (same file, `:83-84`): "provisioning the SELECT-only observer role for the Director's live reads
  (required before final acceptance), and confirming at its first read that every storage bucket it lists is founder-approved
  (AC-10)".
- **AC-10** (`qa/verification/auto-enrollment-v1/ACCEPTANCE_MATRIX.md:52`): `storage_buckets` is compared from the first observer
  read, which is its referent, "(part of provisioning the observer role)"; the instrument lists a relation that row security would
  filter as unreadable.
- **VERIFICATION_SPEC §3.4** (`qa/verification/auto-enrollment-v1/VERIFICATION_SPEC.md`): the plane-conditioned-behaviour scan
  covers the candidate's "prepared founder steps". Its hits include "a read of any row, and any privilege probe, in a schema the
  catalog tool reads only by name and ACL (its platform list)" and a literal naming an object that exists on the live plane or on a
  disposable one but not on both. The **platform-schema inventory** lists every candidate statement that grants on an object in
  such a schema (`storage` is named), each with the contract rule it serves.
- **§3.3** fidelity check: `storage_buckets` and "the observer role and its grants" are among the exceptions a disposable plane is
  not compared on. **§6**: final acceptance requires the observer role, "and its first read is recorded as the storage-bucket
  referent (AC-10)".
- **Finding L6-9** (verifier record) concerns the prepared observer step; whether its `storage.buckets` part belongs to a candidate
  step is this request.

## Evidence

- `qa/implementation/auto-enrollment-v1/FOUNDER_PREPARED_STEPS.md`, step 1b: as `postgres`, `set local role factory_owner`, one
  `grant select` on the 19 new tables and their three identity sequences to `<observer role>`, then a read-back over every relation
  of schema `factory`. The step text says that `storage.buckets` belongs to the observer provisioning and that the step reads and
  probes no platform schema. `MIGRATION_PRIVILEGES.md` says the same. Developer row: `qa/factory/v1/schema_acceptance.mjs` OB1
  (mutant OB), which runs step 1b from the document for a stand-in observer role.
- `storage` is on the Director instrument's platform list (`LIVE_PLANE_CATALOG_SNAPSHOT_PRE_CANDIDATE.json`,
  `platform_schemas_listed_by_acl_only`). That snapshot's `storage_buckets` section records the table as not readable by the interim
  login, with the note that the observer role covers it.
- The Director instrument already reads this back (`qa/verification/auto-enrollment-v1/tools/live_catalog_snapshot.mjs:108-113`):
  its `storage_buckets` section lists the buckets only when the login can read `storage.buckets` and row security does not filter
  it for that login; otherwise it records the table as not readable and says why.
- The candidate migration creates, alters and grants nothing in schema `storage`; the observer's access to `storage.buckets` does
  not depend on the candidate.
- No developer plane has the table: the embedded PostgreSQL planes the developer suites use have no `storage` schema, and the
  Supabase-image judging plane is not available on the implementer's machine. A step for `storage.buckets` could not be executed by
  any developer row.

## Why

A prepared founder step that granted SELECT on `storage.buckets` to the observer and read it back would add to the candidate, inside
S-10's scope:

- a privilege probe in a platform schema, which §3.4 lists as a hit. It is displayed to the founder, but which r3 class covers a
  platform-schema probe in a founder step is not stated;
- a GRANT on a platform-schema object, which the platform-schema inventory must list with the contract rule it serves. The rule
  exists (the contract's observer bullet), but the contract gives that grant to the observer provisioning, a founder change the
  Director records, not to the candidate;
- a dependence on the platform's own privileges on `storage.buckets`: whether the applying login may grant on it at all is platform
  configuration that the candidate may not read (§3.4: an object owner's name or attributes) and that no developer plane can show.
  A step that tested whether the table exists before granting would branch on an object that exists on some planes and not others.

None of this is needed for what the contract requires, since the observer's first read is already the check that the grant and the
row-security condition hold. But finding L6-9 concerns the prepared step, and the implementer cannot set a
finding aside by its own reading.

**What the founder does instead.** When the founder provisions the observer role (a founder change the Director records in the event
log), that provisioning gives the observer SELECT on `storage.buckets`, read without row-security filtering, together with the rest of
its access. The Director's first read through the observer, with `tools/live_catalog_snapshot.mjs`, is the read-back. Its
`storage_buckets` section lists the buckets only when the observer can read them unfiltered. That read is committed as the referent,
and the founder confirms that every bucket it lists is founder-approved (AC-10). Final acceptance waits for it (§6). Step 1b covers
the part the candidate's migration creates: the observer's SELECT on the new `factory` relations.

## Alternative

1. **(proposed) The `storage.buckets` part of L6-9 is met outside the candidate**, by the observer provisioning and the observer's
   first read (AC-10, §6). Step 1b stays limited to the `factory` relations. No change.
2. **A candidate prepared step for `storage.buckets`.** A step 1c, run on the live plane only and with no existence test: `grant
   select on storage.buckets to <observer role>` and the read-back `select pg_catalog.has_table_privilege('<observer role>',
   'storage.buckets', 'SELECT')`. The Director would state the §3.4 class of that probe and of the name `storage.buckets` in a
   founder step, and which contract rule the platform-schema inventory entry serves. The developer evidence would be the step text
   only, because no developer plane has the table.

## Impact

- **Alternative 1:** none on code or rows. The candidate report states that step 1b does not grant or probe `storage.buckets`, why,
  and where that part is met.
- **Alternative 2:** `FOUNDER_PREPARED_STEPS.md` gains step 1c and a row in its step table; `MIGRATION_PRIVILEGES.md` and the
  candidate report change their L6-9 text; the developer plane scan's founder-step inventory gains the new probe. The step would
  first run on the verifier's Supabase-image judging plane or on the live plane. If CR-023 is decided by taking step 1b out of the
  candidate, a step 1c would move out with it.
- Either way the Director's decision is recorded in `qa/work-orders/` before the candidate is noticed.
