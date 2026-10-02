# CHANGE REQUEST — DIRECTOR DECISION REQUIRED

**CR-027 — The founder decided C-3 (2026-10-02 UTC): a system-managed release signer, used only when the founder's own account
re-enters its password. WO-6 r2, S-5, S-8, S-16, the contract's Release table and the final-acceptance conditions still describe a
founder-held key. (WO-6; S-5; S-8; S-12; S-16; AC-5; VERIFICATION_SPEC §3 and final acceptance)**

- **Filed:** 2026-10-03 by the IMPLEMENTER capability, in the implementer namespace.
- **Built on:** the Director documents at the CR-disposition record `a0bb79856a7a82ea8277c7bbf3a23ad6cc0631a0` (WO-6 revision 2,
  text sha256 `53411b250db11c6b3098be8161c935b0b541cd95a12225c446d267eac4ffc4ef`). The Director's later record, CERTIFIED for
  candidate #3 (2026-10-01), changes the ledger only; WO-6 is the same text there.
- **Kind:** a founder product decision that changes what must be true inside the only founder gate. The implementer proposes; no
  Director text is edited here.
- **State of the implementation:** the founder directed it in the same message ("Then proceed unless another genuine founder product
  decision is required"). It exists as a LOCAL preparation only: branch `local/c4-wo6-successor`, on top of the published
  implementation head `047ba31`, every commit titled "Successor preparation (not frozen)". It is not a candidate, nothing of it is
  applied to a live plane, nothing is deployed, and candidate #3 (`95fdb85a`, CERTIFIED) is untouched. It becomes a candidate only
  against a Director revision that decides this request.

## The founder's decision (as received by the implementer session; the founder holds the originals)

Message of 2026-10-02T16:59:56Z, "FOUNDER DECISION — SYSTEM-MANAGED RELEASE SIGNER", the parts that change the contract, verbatim:

> The BLOCKED — FOUNDER decision is resolved. Do NOT use a founder-managed C-3 key. The founder will not: generate a
> release-signing key; store a release-signing key; copy public/private keys; manage fingerprints; manually sign manifests.
>
> The existing Brain OS founder/highest-authority account controls whether an update is allowed. Founder UX: Brain OS → Factory →
> Update → re-enter existing account password → Confirm → Factory performs the update automatically.
>
> Factory owns the release-signing infrastructure. For the current beta: generate an Ed25519 release signer automatically at trusted
> bootstrap; store its PRIVATE material only in the trusted server-side Factory secret boundary; never place private material in
> Git, browser/client code, business DB rows, worker state, Work PC, Home PC or logs; expose only the PUBLIC material required by
> the installer trust set; use the signer only through the trusted release/update backend. The founder never handles this key. The
> existing installer signature verification remains useful and should be preserved internally.
>
> Do NOT create a new super_admin role. Reuse: current signed-in Brain OS founder/highest-authority identity; existing Brain OS
> password authentication; existing Factory founder-only backend authority. [...] A mutable profile.role alone is NOT sufficient
> authority.
>
> Implement the SMALLEST one-time bootstrap [...] This bootstrap must require no key handling by the founder. Do not redesign the
> installer protocol. Do not create a general KMS/key-management project.

Two earlier messages of the same day set the flow (the password is re-entered for the account that is signed in; the existing
`factory._founder_only` authority is reused; no new role, PIN, auth system or key ceremony).

## Director sentences the decision changes

Every sentence the implementer found that rests on a founder-held key. The right-hand column is a proposal, not text.

| where | says now | after the decision |
|---|---|---|
| WO-6 "Founder gate inside this WO" | "The implementer **must not choose, create or use the real production signing authority.** It states only the **interface** [...] without naming a custody option, provider or key." "Final acceptance waits for C-3." | C-3 is decided: the signing authority is the plane's own signer. The implementer builds it and its one-time bootstrap; the founder runs the bootstrap; the implementer never runs it and never holds the key. |
| WO-6 "Certified bytes" | "The production-channel artifact's digest is the one the founder signs" | ...is the one the founder authorizes and the plane's signer signs. |
| WO-6 "Certified bytes"; S-5; contract Release table "(after C-3) trust-set revision" | "The live trust set (the founder's public keys) is a source input. After C-3 the Director's WO-6 revision records the founder's public keys and key ids [...] Before C-3 the live trust set is empty" | The live trust set is the signer's public key. The Director's revision records its key id and public key; the next candidate adds exactly those bytes. Empty until the signer exists. |
| WO-6 "Channel separation"; S-5 | "it trusts only the founder's keys" | it trusts only the keys of the live trust set (the plane signer's). |
| WO-6 "Candidate report must include"; AC-5 (n) | "Proof that no production key material or authority is referenced."; "No production key material appears anywhere." | Proof that no PRIVATE production key material is in the repository, the artifact, the web bundle, a business table, worker state, a log or a command line; the authority is referenced only as the plane's signer. |
| S-5 | "The digest the founder signs and AC-1 installs [...] The founder signs only a manifest whose source SHA is CERTIFIED and whose digest equals that receipt's reproduced digest." | The founder authorizes only a prepared release whose source SHA is CERTIFIED and whose digest equals that receipt's reproduced digest (see "Not decided by the implementer", 4). |
| S-8; contract "who may do what" | "Supplying the founder's public keys is not an API action: they enter the trust-set source through a Director WO-6 revision"; "supplying the founder's public keys for the trust-set source: the founder, out of band" | Still not an API action and still through a Director revision; the source of the bytes changes (below, 3). |
| S-16 | "after C-3, the founder's public keys and key ids that the Director's WO-6 revision records" | ...the signer's public key and key id that the Director's WO-6 revision records. |
| contract, founder gate | "Final acceptance (AC-1..AC-4) needs C-3 decided, because a live-plane node trusts only a founder-provisioned key (S-5)." | ...trusts only the key the founder's bootstrap created on the plane. |
| contract Release table | "certified → published: the founder signs a manifest whose digest equals the reproduced digest (C-3)" | the founder authorizes it (founder-only per S-8 and a fresh password entry); the plane signs and publishes it in one transaction. |
| contract "who may do what" | "production release signing; publishing, superseding or revoking a release: founder-only per S-8 [...] C-3 for key custody" | signing is the plane's, on the founder's authorization; the rest unchanged. |
| ACCEPTANCE_MATRIX AC-1; AC-5 (g) | "at final acceptance its release manifest is signed under C-3"; "the C-3 key at final acceptance" | the plane signer's key. |
| VERIFICATION_SPEC final acceptance | "C-3 is decided; the release under acceptance is [...] signed with the founder-provisioned key" | ...signed by the plane's signer on the founder's authorization. |
| WO-4 | "release-manifest signing (WO-6, C-3), which is never absent" | wording only. |
| Ledger `founder_items.open_gate` | C-3 open | resolved, by the message above. |
| FOUNDER_TEXT II.11 | C-3 text | the founder's later text, recorded as the Director records founder text. |

## Director sentences that stay, and how the preparation meets them

- **"No key the implementer generated or holds is ever a trust root on the live plane."** The key's two random parts are drawn by
  the database server inside the transaction the founder's command sends; neither part and no seed is returned by any function,
  printed, or sent to the machine that runs the command. The implementer holds no credential of the plane.
- **"No Admin API or server path adds a trust key."** Unchanged: a node trusts only the keys fixed in its artifact. The signer's
  public key reaches a node only inside a certified artifact.
- **Founder-only per S-8.** `factory.admin_authorize_update` goes through `factory._admin` with its founder-only argument true:
  tier `founder` in `tenant_admins` AND the live Brain OS role founder. A `profiles.role` alone does not pass.
- **Pinned trust set, the refusal cases, channel separation, upgrade and rollback.** No file under `scripts/factory-runner/` or
  `scripts/factory-build/` is changed by the preparation. The installer verifies exactly as candidate #3 does. The trust-set source
  will change by exactly the bytes the Director records, as WO-6 already provides.
- **S-12.** The password is sent to Brain OS Auth's password sign-in only; it is not in a log, an audit row, a release row or a
  request to the Factory. The seed is stored nowhere.

## What the preparation does (for the Director's reading; developer evidence only)

- **Signer** — `scripts/factory-control-plane/release_signer.sql`, applied once by the applying login BEFORE the migration. Schema
  `factory_signer`. `seed = SHA-256(part in Supabase Vault || part in the signer's own table)`: `service_role` can read the Vault
  part only (the platform grants it the Vault), a role that may read every table can read the table part only; the owner-level
  login and a superuser can read both. Ed25519 (RFC 8032) in PL/pgSQL, self-tested against the RFC vectors before the parts are
  drawn. `sign_release(version, source_sha, digest, receipt_sha256)` builds the production manifest itself and signs nothing else.
  `public_key()` is executable by every login; nothing else is executable by anyone but the owner, and the file ends with a catalog
  check of exactly that. The migration's part 000 then grants `sign_release`, and nothing else, to `factory_owner`.
- **Authorization** — `factory.admin_authorize_update` (v1/220): founder-only; a password entry of that same account at most 120
  seconds old (60 seconds of clock tolerance), read by the Admin API from the caller's own access token (`amr` method `password`,
  `session_id`) after Brain OS verified the token, and added after the body whitelist; one entry authorizes one release; signing,
  publishing, superseding and the audit row are one transaction. A production release through the older `publish-release` needs
  the same entry. `v1/060` records the session and the entry time on the release.
- **Web** — Brain OS → Factory → Update (`web/app/(app)/software-factory/update/`, `web/lib/factory/reauth.ts`,
  `web/lib/factory/update.ts`): shows the prepared release's version, certified source, installer digest and certifying receipt;
  checks the staged installer against that digest; checks the password with Brain OS Auth for the signed-in account's own email;
  calls the Factory with that fresh session and ends it.
- **Judging planes** — `qa/factory/v1/vault_standin.sql` (applied by the plane's superuser; the platform's names and grants, no
  encryption) and then the signer file as `postgres`, before the migration (`qa/factory/v1/applying_role_plane.mjs`, row P4).
- **Suites** — `release_signer_acceptance.mjs` (RS1–RS11), `update_authorization_acceptance.mjs` (UE, UA, UW; 21 rows).

## Not decided by the implementer — the Director's to rule

1. **The authorization rule as product semantics.** The 120-second limit, one entry per release, and the same entry for a
   production `publish-release` are the implementer's reading of "re-enter password → fresh authentication succeeds". Proposed as
   binding text; the values are the Director's.
2. **The signer file's place in verification.** By VERIFICATION_SPEC's definition the candidate migration is every `.sql` under
   `supabase/control-plane/`. The signer file is outside it on purpose: it must be on the live plane BEFORE the successor is frozen
   (the artifact pins the key), and the migration's part 000 requires it (a grant on `sign_release`). As written today it is in no
   scan scope and no live-migration step. Proposed: the revision names it a pre-migration step of the candidate, pinned by sha256,
   inside the §3.4 scan, and applied on every judging plane after the Vault stand-in. The implementer asks for it to be judged,
   not left out.
3. **Where the trust-set bytes come from.** Proposed: the Director reads `select factory_signer.public_key()` on the live plane
   with the observer login and records that; the candidate adds exactly those bytes (S-16's second case, unchanged in form). The
   implementer's copy of the bootstrap's output is not the source.
4. **Who holds "only a CERTIFIED source and the reproduced digest".** The plane signs the four values it is given; it does not
   know a Director receipt. As before, the founder's act is what holds it: the page shows the four values, and final acceptance
   compares the published record with the receipt. If the Director wants the plane to hold it, that is new scope.
5. **Where the bootstrap runs.** It is a founder action: one command sends the pinned SQL through Supabase's Management API with
   an access token the founder types. It is prepared on the implementing machine; the same files run on any machine, and the same
   SQL runs in the dashboard's SQL editor. Which of these final acceptance admits is the Director's.

## Known limits (stated, not changed)

- The plane's owner-level login can derive the key and could replace the signer. Owner-level access to the Factory project is
  therefore signing-equivalent; that is the "trusted server-side Factory secret boundary" as built.
- The key has no export and no backup. A role that may write the Vault can delete or replace its part; the signer then refuses
  (`signer_unavailable`) and a new signer is a new trust-set revision and a new candidate.
- `revoke-release` and `revoke-key` need the founder session only, no password entry: a stolen session can stop a release, never
  publish one.
- The password gate is as strong as Brain OS Auth's password-change rule (whether a session may set a new password without the
  current one). That setting is production auth configuration: the founder's.
- One line is deliberately absent: the Admin API login's EXECUTE on `factory.admin_authorize_update` (v1/290). Schema row C19 fails
  on it by design, and the UA rows pass only with the engine role as the handler's database client (scratch). It is held for the
  founder's explicit word.
- Not run: the mutation campaign for the new guards, the web suite for the page's server action, the package and release suites.
- First measured only by the real bootstrap: that the Management API runs the SQL as `postgres` in one transaction, and the live
  Vault's grants (the command reads them before it creates anything, and stops if another role could hold both parts).

## Impact

- On candidate #3: none.
- On the successor: it cannot be frozen before (a) the Director's revision, (b) the founder's bootstrap, (c) the Director's record
  of the public key, in that order; then one candidate, one certification, independent QA.
