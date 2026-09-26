# Reconciliation of implementer preparation against Director r1 (implementer record, NOT canonical)

| | |
|---|---|
| **DIRECTOR_CANONICAL_SHA** | `8f9833cea3bd8b70d995cfe5575b6dabadb8361d` ("Director r1: canonical contract, binding WO-1..WO-10 and verification criteria …"), parent = the frozen baseline `69df2f52f71fd2bc9415c34fb2be4dab4ee08dd6` |
| detected | 2026-09-26 ~14:56 UTC, when `origin/factory/auto-enrollment-v1-director` appeared (lightweight 120 s watch) |
| implementation branch | `factory/auto-enrollment-v1-implementation`, created from exactly that SHA |
| read, in full | contract `factory-node-management-auto-enrollment.md`; `.SECURITY_TENANCY.md` (S-1..S-16); `.FOUNDER_TEXT.md` (Part I and Part II); `ACCEPTANCE_MATRIX.md` (AC-1..AC-16, R-1..R-4); `VERIFICATION_SPEC.md`; `AUTO_ENROLLMENT_V1_LEDGER.md`; WO-1..WO-10; the ratified ADR (amendments 1-10); the baseline manifest structure and `tools/baseline_manifest.mjs` |

## Rule applied

The Director contract wins over preparation. A prep item is kept only if it is compatible with the contract as written. Nothing here
changes what must be true; a genuine conflict would be a CHANGE REQUEST (none was needed).

## Per-item verdict

| Prep commit (branch `impl-prep/auto-enrollment-v1`, local) | Verdict | Why |
|---|---|---|
| `dacda25` pin dev deps (esbuild 0.27.0, postject 1.0.0-alpha.6, postgres 3.4.9) | **KEPT** (replayed as `00d7021`) | implementation choice; `package_bootstrap_regression --static` K1-K7 green with them |
| `c0aa1c4` reproducible Node SEA packaging | **KEPT** (`25aa796`), **to be extended** | WO-4: a single Node SEA exe, a reproducible build from pinned inputs. WO-4/WO-6/S-5 still require the PE Authenticode image hash as the digest, per-channel trust sets and trust mode fixed at build time, and nothing received at runtime changing behaviour. The SEA's default `NODE_OPTIONS` honoring is therefore closed under S-5 (`execArgvExtension: "none"`) as implementation, not a CR |
| `8981d16` Ed25519, DPAPI, secure store | **KEPT** (`a42d526`) | S-2 / WO-4: per-node key pair; the private key never exported; only the public key stored server-side |
| `dbca24d`, `70ddf1e` side finding S1 (regression + draft guard) | **NOT REPLAYED** | Outside this feature. The contract records S1 as a founder matter (§0, "Side finding S1"). `70ddf1e` also edits `.gitattributes`, a hash-frozen Director document. It stays on the local preparation branch; its extended findings are reported to the founder separately |
| `9db1af8` certified-suite baseline measured on this machine | **KEPT** (`0280e30`) | implementation evidence. Distinct from the Director's `BASELINE_69df2f52_EVIDENCE_MANIFEST.json`, which it never touches |
| `da7d35a` crypto mutation proof, row S24, prep assumptions register | **KEPT minus the register** (`4e96abc`) | the register is superseded by this record |
| `48dd167` SEA mutation proof | **KEPT** (`5cec6bb`) | mutation infrastructure |
| `c763ef5` SEA row B19 | **KEPT** (`81d191f`) | closes predicted coverage gaps |
| `0160ff9` frozen-baseline lifecycle inventory | **KEPT** (`871f865`) | input to WO-2's compatibility matrix (OLD columns). Moved here with this record |
| `4cc3491` SEA mutation Batch A evidence | **KEPT** (`aa4cec2`) | evidence. Full SEA mutation verdict still PENDING (Batches B-D) |
| uncommitted `reboot_recovery_acceptance.mjs --skip-live-task` patch | **DISCARDED** | VERIFICATION_SPEC §3.7: certified suites run at their 69df2f52 bytes; the reboot suites run in a separate disposable VM |

## Consequences for the implementation (engineering, derived from the contract)

- **Certified bytes.** The certified reference suites and the legacy modules they and `acceptance_mutation_proof.mjs` anchor on stay at
  their 69df2f52 bytes. The enrolled runtime is a separate path: SEA runtime → Node API → SQL front doors (P-2, one engine in SQL, in the
  69df2f52 tables).
- **Canonical copies.** The Director's 32 canonical files on this branch are byte-identical to `8f9833ce` (checked at replay time); the
  implementer never edits them.
- **Signing.** Every commit in `8f9833ce..<candidate>` is signed with the implementer SSH key (WO-10; CR-005 publishes the public key).
- **Mixed fleet (AC-9).** The frozen legacy pick treats a lock whose `lease_expires_at` has passed as free. So an enrolled surface lock
  must never look lapsed to it: the frozen pick sees enrolled locks as live; the real enrolled lease is held in an added column that only
  the front doors read and expire; and a server guard makes the frozen reaper skip enrolled rows rather than fail the frozen claim.
- **Baseline evidence.** The WO-1 migration may add columns but never rewrites a manifest evidence field. In particular, it never adds
  `factory-enrolled-v1` to, or backfills, legacy work orders.
