# WO-1 — Tenancy, identity, envelopes, credentials, admins, policies and legacy coexistence (schema)

- **Binding**, revision 1, issued by the DIRECTOR.
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
    add-only.
  - No node credential or implementer migration writes them beyond seeding those rows.
  - The S-13 floor is enforced by the front door whatever the rows say.
- **Server boundary.**
  - All authority lives in SECURITY DEFINER SQL front doors with a pinned `search_path`.
  - API roles are least-privilege.
  - The production ref and superusers are refused. There is no DDL from any API.
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
  - A lapsed enrolled surface lock never makes the frozen legacy claim fail or stall the legacy queue.
  - No plane-conditioned behaviour (S-10): no SQL object and no founder step decides what it does from a value that tells the live
    plane from a disposable one; the production-ref refusal is the one exception.
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
does not run them. The prepared live-migration step is byte-identical to the migration the verifier ran to completion on the
disposable copy, plus a Director-specified wrapper whose manifest recompute runs after the migration's last statement and before
commit, aborting on any difference. The receipt records its sha256, and the founder applies exactly that file.

## Candidate report must include
- Every table, function, role and grant, with the catalog read-back.
- The seeded policy rows.
- Proof that no secret is stored.
- The envelope-immutability-by-node test.
- The legacy-refusal tests, as `factory_runner`: a write to each authority record, EXECUTE on each front door, a reserved-capability
  write, a self-written `security_role` followed by a claim of new-model work, a write to an enrolled computer's run or checkpoint, and
  moving a verification-required work order to done.
- The manifest-preservation test on a copy of the baseline rows.
