# CHANGE REQUEST — DIRECTOR DECISION REQUIRED

**CR-021 — Under the r3 plane-conditioned-behaviour scan (S-10; VERIFICATION_SPEC §3.4), which class covers a check that can only
refuse? This request now covers exactly two groups: (1) part 990's two remaining in-migration checks, (c) and (d), over `pg_catalog`
rows; (2) the Edge handlers' validation of their own configuration values. That validation is `_shared/db.ts` `dbRefusal`, which
refuses a database URL that is unset, is not `postgresql://`, does not parse, or names an IP address, and a CA that is not a PEM
certificate. It is also `_shared/pairing.ts` `importPepper`, which refuses a pepper that is unset, is not base64, or is shorter than 32
bytes. The request also covers what the two entry points derive from `dbRefusal`: their `refused` flag, the pool they then do not open,
and the 503 `misconfigured` response; and what follows from `importPepper` finding no key: the entry points' pepper dependency answering
null, and the handlers' `pepper_unavailable` refusal.**

- **Filed:** 2026-09-29 by the IMPLEMENTER capability, on `factory/auto-enrollment-v1-implementation` (test-infrastructure area,
  while building the developer approximation of the r3 §3.4 scan: `qa/scenarios-runner/factory_v1_plane_scan.mjs`).
- **Amended:** 2026-09-29, twice, and 2026-09-30, by the same capability; the Director had decided none of the versions.
  - After the independent A1 review, part 990 names its revoke targets instead of choosing them from `pg_depend` and `pg_proc` rows.
    That choice was a write, not a check that can only refuse, and so outside this question.
  - The second amendment narrows the request to what remains. The candidate removed every other hit this request listed without
    changing what the product does on a plane provisioned and configured as the procedure says. See "What was eliminated" below.
  - The third amendment adds no new check. It lists branches that were already in the code and already under this question, but that
    the developer scan did not follow: the value `importPepper` returns, as each entry point hands it to its handlers, and the
    handlers' branches on it. The scan now follows a returned value to the entry points' branch; the handlers' branches are listed by
    hand in the inventory (UNTRACED entries, each checked against the source). It also restates plainly which pre-commit guarantees
    the second amendment gave up.
- **Built on:** Director r3 `c7a845b61a3b0b419e8c9dfeff397547fdc75b03`.
- **Kind:** a clarification of how a Director requirement is read. No Director text is edited, and no product behaviour is changed
  by this request.
- **Until the Director decides, the candidate keeps the r3 behaviour:** the remaining checks stay as they are. The developer static
  contract lists every hit that depends on this question in its own failing row (`factory_v1_static_contract.mjs` P3p). The candidate
  relies on no answer; the verifier classes every hit itself.

## Requirement (the r3 texts)

- §3.4 **Hits:** "a read of any row, and any privilege probe, in a schema the catalog tool reads only by name and ACL (its platform
  list)" - the Director tool `tools/live_catalog_snapshot.mjs` lists `pg_catalog` and `information_schema` there; "an environment
  value that an Edge handler or a founder step reads"; "a value derived from a hit, including one stored and read back. It is classed
  like the hit it comes from".
- §3.4 **Classes:** "**decides** (a REJECTED finding): a branch, predicate, guard or refusal depends on it ... and no class below
  fits"; "**same on every plane**: a read of a setting whose value is identical on every plane by construction, such as one the same
  function or transaction pins"; "**own-plane addressing**: the plane's own address and keys, used the same way on every plane: the
  endpoint, project ref and credentials an Edge handler or a founder step uses to connect ... the S-6 pepper as the HMAC key. Only the
  connection or the verification's outcome depends on it; no branch tests the value itself"; "A comparison with a value that marks a
  plane or the verifier's run (a host, a loopback or private address, a release channel) fits no class."
- S-10 (contract): "TLS is verify-full"; "the production project is refused".

## What the candidate does (the hits that remain; file:line at the commit that carries this amendment)

1. **Part 990's checks (c) and (d)** (`supabase/control-plane/v1/990_finalize.sql`, the `$finalize$` DO block, 8 hits). They run as
   `factory_owner` inside the migration's one transaction, after the revokes by name, and each can only raise:
   - (c) every function in schema `factory` has an explicit ACL with no EXECUTE for PUBLIC or `factory_runner`;
   - (d) no default-privilege entry in schema `factory` reaches `factory_runner`.

   What they read, and nothing else:
   - `pg_proc` rows of schema `factory` (namespace, ACL, and the signature named in the error text), at `:61`;
   - `pg_default_acl` rows of schema `factory` (namespace, ACL), at `:68`;
   - `aclexplode` of those two ACLs, at `:64` and `:70`;
   - the name lookups `'factory_runner'::regrole` (`:56`), `'factory'::regnamespace` (`:62`, `:69`) and the `regprocedure` text of
     an offending function (`:60`).

   Check (c) is the only pre-commit guard against a function left executable by PUBLIC, for example if the default-privilege
   revoke in part 000 did not take effect. Check (d) is the only pre-commit guard against the migration being applied by any login except
   the one that provisioned the plane as `69df2f52`. Only that login's revoke removes the default grant to `factory_runner`
   (`MIGRATION_PRIVILEGES.md`, Limits). After commit, the verifier's §3.5 read-back, AC-12 and AC-10 re-prove both facts, and so do
   schema acceptance C6 and C7.
2. **The Edge handlers' configuration** (18 hits):
   - `supabase/control-plane/edge/supabase/functions/_shared/db.ts` `dbRefusal`, `:14, :16, :20, :22, :23, :24` (the database URL)
     and `:25` (the CA);
   - `_shared/pairing.ts` `importPepper`, `:50, :53, :55`;
   - the values each entry point derives from `dbRefusal`: `factory-admin-api/index.ts:27, :28, :33, :45` and
     `factory-node-api/index.ts:22, :23, :28, :45`. These are `refused`, the pool that is not opened, and the 503 `misconfigured`
     answer;
   - what each entry point derives from `importPepper`: the pepper dependency, which answers null when no key was imported
     (`factory-admin-api/index.ts:37`, `factory-node-api/index.ts:32`); and the handlers' branches on that answer, listed by hand
     because the scan does not follow a value through a dependency object: `_shared/admin_api.ts:126` (a code-issuing admin action
     answers 503 `pepper_unavailable`) and `_shared/enroll.ts:35, :36, :39` (enroll/start and enroll/complete: no key, so no MAC and
     no version, and the request is recorded and refused as `pepper_unavailable`).

   An IP-literal host is refused because TLS verify-full needs the host name. `edge_db_tls_acceptance` T3a measured a certificate
   issued for another name accepted at an IP literal under the pinned stack. The production-ref refusal on the same URL is the §3.4
   exception and is not part of this question.

## What was eliminated by the second amendment, and why each removal holds under either answer

The static contract listed 13 groups and 67 hits under this request before the second amendment, and 8 groups and 26 hits after it.
The removals change no product behaviour on a plane the procedure provisions and configures. They do change two things, stated here
so that the Director sees the trade-off:

- **Pre-commit detection on the live apply is given up** for the facts part 990's checks (a), (b) and (e)-(h) and part 000's
  precondition blocks used to test. A defect of that kind no longer aborts the live migration before it commits. It is found after
  commit, by the verifier's §3.5 read-backs, AC-10 and AC-12, and by the developer rows listed below, before the candidate is noticed.
  Under alternative 1 below that trade was not needed; under alternative 2 the checks would have had to go anyway.
- **One misconfiguration answer changes** (the `BRAIN_OS_*` item below): the Admin API still fails closed, with a different response.

- **Part 000's two precondition DO blocks** (8 hits: `to_regclass` / `to_regrole` lookups, and the `pg_attribute` column comparison).
  - On a database without the `69df2f52` objects, the first statement that refers to one the database lacks still aborts the
    migration. Schema acceptance P0n shows 3F000 at the schema grant, and 42P01 at the table grant.
  - A second application still aborts, now at `create role factory_owner`, and changes nothing (P7: 42710).
  - The column comparison is replaced by source rows, not by a pre-commit check: schema C15 and static R10 hold the legacy
    guard's lists to `factory._baseline_columns()`, and static R12 holds that list to the `69df2f52` referent (the columns
    `69df2f52`'s own control-plane SQL gives each table, in order, and the column set of the Director's r3 pre-candidate snapshot of
    the live plane; mutant GBB). A live plane whose columns drifted from the referent after that snapshot is found only after
    commit (AC-10), or before the step by the fidelity check (§3.3) and the checks the Director's step makes for AC-11.
  - What is observably different: the abort's message names the missing object instead of the old named precondition.
- **Part 990's checks (a), (b) and (e) to (h)**, and their relation and operation lists (30 hits). Each fact they checked is
  a restatement of the named statement before it, or a property of the candidate's source. The verifier re-proves each one after
  commit (§3.5, AC-12), and so do these developer rows:
  - (a), (b): PUBLIC and `factory_runner` hold nothing on the new tables or their columns (schema C3, C4, C9; mutant PX), nor on the
    three identity sequences (C3s for `factory_runner` and the API roles, mutant SQR; AL2 for PUBLIC).
  - (e): each API role executes exactly its front doors, each SECURITY DEFINER. C18, C19, C20; S7N, S7A.
  - (f): every function pins `search_path = pg_catalog, pg_temp`. C10, static R8; SPS.
  - (g): no `69df2f52` column is dropped, renamed or retyped. Static R11, dynamic statements included; BCT, BCR, BCD, BCX, BCY.
    Where the data survives the change (a retype that keeps every value), manifest_rehearsal CD5 still sees it: the catalog
    difference may remove no relation or column. Check (g) itself tested only that the columns were present.
  - (h): the legacy guard's lists equal `factory._baseline_columns()`. C15, static R10; GB, GB2, GBS, GB2S; and R12 (above).
  - What changes: such a defect no longer aborts the live apply before commit. It is found by the read-back after it (AC-10, AC-12).
- **The environment read of `FACTORY_PAIRING_PEPPER_VERSION`** in both entry points (2 hits). Both APIs now use one compile-time
  constant, `PEPPER_VERSION` in `_shared/pairing.ts` (static X1v; mutant PVE). A code is therefore issued and verified under the same
  version on every plane. The value is 1, which the prepared steps set and the old default gave, so no behaviour changes. The secret
  is no longer part of the founder's step 4.
- **The Admin API entry point's refusal when `BRAIN_OS_URL` or `BRAIN_OS_ANON_KEY` is unset** (1 hit). The two values are now used
  only by the token check on every call. With either unset, that check admits no caller, and no front door is reached (edge_boundary
  EB8). What is observably different: the answer is 401 `not_authenticated` or 503 `unavailable`, not 503 `misconfigured`.

## Evidence

- `node qa/scenarios-runner/factory_v1_static_contract.mjs`: row P3p lists every remaining hit under CR-021 with its file and line.
  That is 12 groups and 32 hits: 8 in part 990, 7 in `_shared/db.ts`, 3 in `_shared/pairing.ts`, 10 in the two entry points, and the
  4 hand-listed branches of `_shared/admin_api.ts` and `_shared/enroll.ts` (marked `[untraced]`). Every other row passes.
- `edge_peer_acceptance` EP6-EP8 (Deno 2.5.6, the committed Admin API entry point) and `edge_boundary_acceptance` EB8 (Node) measure
  the `BRAIN_OS_*` change below: 401 `not_authenticated` or 503 `unavailable`, no front door reached, and the control with both set
  reaching it. The request-gate inventory classifies the condition (static G7).
- On a plane provisioned as `69df2f52`, where the migration's own statements ran, checks (c) and (d) have one outcome: pass. On the
  developer applying-role plane, mutants DP and FX show that (c) aborts the migration when functions keep PUBLIC EXECUTE. LD shows
  that (d) aborts it when the `69df2f52` default grant is kept. A run by any login except the provisioning one stops at (d)
  (`MIGRATION_PRIVILEGES.md`, Limits).
- The Edge checks refuse to serve on a misconfigured plane; on a correctly configured plane they have one outcome (serve). A
  disposable plane addressed by an IP literal (for example a local one at 127.0.0.1) is refused, which is the TLS reason above and
  also a comparison a verifier may read as "a loopback or private address".

## Why a decision is needed

Read literally, "same on every plane" is defined for "a read of a setting", not for catalog rows. Own-plane addressing excludes "a
branch [that] tests the value itself". So under the literal text these hits fit no class and would be classed **decides**, a
REJECTED finding. Yet each check can only refuse, and it refuses only on a plane that is not what the procedure provisions or
configures. Whether a fail-closed check of that kind is classable is a reading of a Director requirement. The implementer cannot
answer it by annotation (§3.4: "A candidate's own annotation never classifies a hit").

## Alternatives (for the Director)

1. **A fail-closed check is classable** (proposed). The Director would state that a check whose only effect is to refuse is classed
   **same on every plane** (the migration) or **own-plane addressing** (the Edge), with its construction named in the receipt. Such
   a check aborts the migration's transaction, or answers a whole-request 5xx naming the configuration problem. It covers only the
   objects the same transaction created and the grants it made, or the plane's own configuration values. No product change.
2. **They are findings; the candidate removes them.**
   - Part 990's checks (c) and (d) are dropped. Their facts then rest only on the read-backs after commit (§3.5, AC-12, AC-10;
     schema C6, C7). On the live plane, a function left executable by PUBLIC, or an apply by another login, would be found only after
     the migration committed.
   - In the Edge, only the production-ref refusal stays:
     - The IP-literal refusal would be replaced by a TLS identity check that does not branch on the value. An example is a server
       identity check bound to the URL's host on every connection. T3a can be re-pointed to it only after that check has its own
       measured rows in `edge_db_tls_acceptance` (Deno 2.5.6); it is not measured yet.
     - An unset URL or CA would fail at the connection itself. The driver's behaviour with an empty CA must be measured first, so
       that the driver's default trust store is never used.
     - An unset or short pepper would fail the HMAC itself. Whether the key import alone can hold the pepper to its minimum length,
       for a secret whose length the implementer never sees, is also unmeasured.
   - This is a change in the migration-privileges and Edge/TLS areas.
3. **Split:** alternative 1 for the Edge handlers, alternative 2 for the migration (or the reverse).

## Impact

- Alternative 1: the developer inventory's `pending: CR-021` marks are removed (P3p then depends on CR-022 and CR-026). The
  verifier's receipt names the construction of each hit. No rows or mutants change.
- Alternative 2 or 3: product changes in `990_finalize.sql`, `_shared/db.ts`, `_shared/pairing.ts` and both entry points.
  - Mutants LD, DP and FX, which expect part 990 to abort (X0), are re-pointed to the read-back rows (C6, C7).
  - `edge_db_tls_acceptance` T3a is re-proved against the identity check, and the pepper and CA rows are re-measured.
- Either way the Director's decision is recorded in `qa/work-orders/`, and the inventory is updated to it before the candidate is
  noticed.
