# WO-1 — Tenancy, identity, envelopes, credentials, admins, policies and legacy coexistence (schema)

- **Binding**, revision 2, issued by the DIRECTOR.
- Contract: §1, §5.
- Executed by: the IMPLEMENTER.
- Certified by: a distinct authorized verifier.
- Scope changes: only a Director revision changes this WO. The implementer files a change request.

## What must be true
- **Tenancy.** `factory.tenants` exists, and every factory row carries `tenant_id`. Everything lives under `supabase/control-plane/`,
  never `supabase/migrations/`.
- **The four facts, stored separately.**
  - **Node identity:** durable, Factory-issued. Hostname and fingerprint are metadata.
  - **Authorized capability envelope:** set at Add Computer, amended only by a Factory admin (founder-only for `release_broker`),
    audited. **Never changed by a node credential.**
  - **Resource profile:** may rank or exclude, never authorize.
  - **Current assignment:** temporary.
- **Credentials.**
  - Per-node key-pair credentials; only the public key is stored.
  - States `active | superseded | revoked`.
  - A revoked credential never becomes active again.
  - Re-pair issues a new key for the same durable computer.
- **Agent principals** (S-13). Each node credential is bound to exactly one Factory-issued agent principal.
  - Add Computer creates exactly one principal for the computer, and the enrollment credential is bound to it.
  - A credential issued by rotate (node- or admin-initiated), re-pair or restore is bound to the principal of the credential it
    replaces.
  - A further principal exists only through the explicit, audited Factory-admin action "create an agent principal", never as a side
    effect. A node can never mint one.
  - A principal created by "create an agent principal" receives its first credential only through a pairing code a Factory admin
    issues for it. Enrollment binds a credential to the principal its pairing code was issued for (at Add Computer, the computer's
    first principal), and re-pair targets the principal of the revoked credential.
  - A run records the principal of the credential it authenticated with.
- **Factory admins.** `factory.tenant_admins` exists, with a **tier** (`founder | admin`). Only the founder's provisioning step writes
  it (CR-001, CR-003). No API path writes it.
- **Policies.**
  - The independence and campaign policy tables hold exactly the Director-stated rows of contract §1.
  - Through the Factory admin path they can only be made **stricter**, audited. The campaign rows cannot be changed there during this
    milestone, except S-14's one write: binding S-16(a) to a computer record at its Add Computer, stored on the computer record,
    add-only, and kept when the record is archived.
  - No node credential or implementer migration writes them beyond seeding those rows.
  - The S-13 floor is enforced by the front door whatever the rows say.
- **What the migration writes** (contract §1).
  - It seeds exactly the contract §1 policy rows and the one operator tenant row. The tenant row holds no user id and refers to no
    computer, principal, credential or envelope.
  - It writes no other row: no computer, agent principal, credential, envelope, pairing code, enrollment attempt, `tenant_admins`,
    release, release revocation or certification row, and no S-16(a) binding. No column default writes an S-16(a) binding.
  - In a pre-existing table outside the system catalogs, it adds and deletes no row and changes no value. In a column it adds, a
    pre-existing row holds a value, such as its `tenant_id`, that refers to no computer, principal, credential or envelope.
  - No object it defines (a view, function, default, trigger or policy) holds a constant that identifies a Brain OS user, a
    computer record, an agent principal, a credential, a signing key or an envelope.
- **Server boundary.**
  - All authority lives in SECURITY DEFINER SQL front doors with a pinned `search_path`.
  - API roles are least-privilege.
  - The production ref and superusers are refused. There is no DDL from any API.
  - The migration creates no event trigger and no cast to `json` or `jsonb`, never sets `allow_system_table_mods`, and writes no
    `pg_catalog` relation (S-10).
- **Legacy coexistence.**
  - The existing nodes are `legacy_manual`: no envelope, no certification of release candidates.
  - No legacy path acts as, or on behalf of, an enrolled identity.
  - **The legacy shared role `factory_runner` holds no INSERT, UPDATE or DELETE on any authority record:** tenants, `tenant_admins`,
    computers, credentials, agent principals, pairing, envelopes, policies, release records and release revocations, and the new-model
    **certification records**, which live in their own table. The legacy verification columns of `agent_runs` keep their `69df2f52`
    meaning and never count as a new-model certification.
  - The migration revokes the `69df2f52` default-privilege grant for every new table. EXECUTE is revoked from PUBLIC on every front
    door, each API role holds EXECUTE on its own front doors only, and `factory_runner` holds none. A server guard refuses any legacy
    write to an authority record. A legacy run is never recorded as a certification.
  - A server guard refuses any legacy INSERT, UPDATE or DELETE on a row of a new-model work order, on a run or checkpoint of an
    enrolled computer, on an enrolled run's surface lock, or on a dependency row that names a new-model work order, including
    moving a verification-required work order to done. For the legacy role it leaves such rows unchanged without failing the frozen
    claim transaction: the `69df2f52` reaper's requeue and expired-lock delete skip them, and the front doors own their expiry.
  - A lapsed enrolled surface lock never makes the frozen legacy claim fail or stall the legacy queue, and never lets a legacy run
    hold that surface while the enrolled run can still complete.
  - `factory.director_lease` is the `69df2f52` dispatcher's process lease: it grants no DIRECTOR (governance) authority, no
    certification and no eligibility. One legacy director dispatches legacy work at a time, as at `69df2f52`; new-model dispatch never
    waits on the legacy director's lease; and any legacy write leaves new-model dispatcher state unchanged, without failing the legacy
    director's transaction (contract §1).
  - No plane-conditioned behaviour (S-10): no SQL object and no founder step decides what it does from a value that tells the live
    plane from a disposable one, or live operation from the verifier's run; the production-ref refusal is the one exception. What is
    not such a decision (for example pinning the front doors' `search_path` or a timeout) and the scan's classes are in S-10 and
    `VERIFICATION_SPEC.md` §3.4.
  - `factory_runner` is granted no role and is granted to no role beyond its `69df2f52` memberships (`pg_auth_members`), and no API
    role is a member of it.
  - The claim front door refuses a work order without `factory-enrolled-v1`. Both fleets hold surface locks in `factory.surface_locks`.
  - **Every new-model work order requires the reserved capability `factory-enrolled-v1`**, which the frozen legacy claim path cannot
    hold. A server guard refuses any legacy write of a reserved capability. So legacy nodes never claim new-model work.
- **Baseline preservation.** The live migration leaves every evidence field listed in `BASELINE_69df2f52_EVIDENCE_MANIFEST.json`
  byte-identical. Node records are never deleted.

## Must satisfy
AC-1, AC-4, AC-6, AC-12, S-2, S-4, S-8, S-9, S-10, S-13, S-14, P-1

## Founder boundary
Applying the schema to the live plane, and seeding `tenant_admins`, are founder actions. The candidate prepares the exact steps and
does not run them. **The candidate migration** is every `.sql` file the candidate adds under `supabase/control-plane/`, recursively,
excluding `supabase/control-plane/edge/`, since `69df2f52`, or since the last founder-applied step once one exists (the ledger event
log lists each applied step's embedded files by path and sha256), applied in byte order of repository-relative path (contract §1). The `69df2f52` files `001`..`003`, and
every file a founder-applied step embedded, are never changed. The candidate invokes the Director instrument as an external tool and
never imports or copies it. The live-migration step is not candidate-written: the verifier builds it from the candidate migration's
committed bytes with the Director instrument `qa/verification/auto-enrollment-v1/tools/build_live_migration_step.mjs`, as `begin`, the
migration verbatim, the Director's manifest check after the migration's last statement (it aborts on any difference), and `commit`. The
migration therefore holds no transaction control (BEGIN, START, COMMIT, END, ROLLBACK, ABORT, SAVEPOINT, RELEASE, PREPARE TRANSACTION,
or a BEGIN ATOMIC body), no backslash, no psql variable reference and no COPY. It leaves no quote or comment open, and ends its last
statement with `;`. Every statement runs inside the step's one transaction block: no `CONCURRENTLY`, and no procedure or DO block that
commits. It leaves no deferrable constraint trigger, no deferrable exclusion constraint and no holdable cursor. The tool's header lists
every refusal, and a refusal or an abort fails AC-11. The receipt records the step's sha256, and the founder applies exactly that file,
in one session.

## Candidate report must include
- Every table, function, role and grant, with the catalog read-back.
- The seeded policy rows and the operator tenant row.
- Proof that no secret is stored.
- The envelope-immutability-by-node test.
- The legacy-refusal tests, as `factory_runner`: a write to each authority record, EXECUTE on each front door, a reserved-capability
  write, a self-written `security_role` followed by a claim of new-model work, a write to an enrolled computer's run or checkpoint, and
  moving a verification-required work order to done.
- The manifest-preservation test: the step `tools/build_live_migration_step.mjs` builds from the migration, run on a copy of the
  baseline rows (it commits) and with one evidence field altered first (it aborts).
