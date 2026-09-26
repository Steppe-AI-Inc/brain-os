# Auto-Enrollment V1 — implementer's engineering decomposition (NOT canonical)

- **Implementer-owned** (ADR "IMPLEMENTER owns decomposition, subtasks, sequencing").
- **Built against:** `DIRECTOR_CANONICAL_SHA = 8f9833cea3bd8b70d995cfe5575b6dabadb8361d` (Director r1).
- **What this file is not:** the binding work orders are `qa/work-orders/auto-enrollment-v1/WO-1..WO-10.md` at that commit. This
  file only splits and orders them. Nothing here changes what must be true. A conflict found while implementing becomes a CHANGE
  REQUEST under `qa/implementation/auto-enrollment-v1/change-requests/`.

## Ground rules taken from the contract (how the work is shaped)

- **Canonical copies.** The Director's documents (the ledger's document set, WO texts, ledger files, `.gitattributes`, `CLAUDE.md`
  and others) stay byte-identical to the Director commit. The implementer never edits them.
- **Certified suites.** They run at their 69df2f52 bytes (VERIFICATION_SPEC §3.7). So:
  - the legacy runtime modules that those suites and `acceptance_mutation_proof.mjs` anchor on (`claim.mjs`, `db.mjs`, `node.mjs`,
    the supervisor, the installer script) keep their certified behaviour and anchored lines;
  - the **enrolled** runtime is a separate path: SEA runtime → Node API → SQL front doors;
  - a shared-module change is made only where no certified row or anchor changes.
- **One engine** (P-2) means the SQL front doors hold the lifecycle for enrolled nodes, in the 69df2f52 tables. Edge handlers only
  authenticate and call one front door. The frozen legacy inline SQL keeps serving legacy nodes, fenced by server guards (S-10)
  that SKIP enrolled / new-model rows rather than fail the frozen claim.
- **Authorship.** Every commit in `8f9833ce..<candidate>` is signed with the implementer SSH key (WO-10; public key published in
  `change-requests/CR-005-implementer-signing-key.md`). Signing was authorized by the user for the implementer identity only, and was
  verified end to end in a throwaway repository before first use. The private key stays on this machine; the signing settings are
  passed per invocation, and no global or shared git config was changed.

## Subtasks

| IMP | WO | Content | Evidence it must produce |
|---|---|---|---|
| IMP-1 | WO-1 | control-plane migrations `004+`: tenants; `tenant_admins` (tier); computers (+ S-16a binding field, add-only); agent_principals; envelopes (versioned, audited); credentials; pairing / enrollments; sessions; jtis; rate limits; audit; verification policies (exactly the Director rows); certification records (own table); release records / revocations; node / run / checkpoint / work-order columns; roles; grants; default-privilege revocations; legacy guards (skip-not-fail); reserved capability `factory-enrolled-v1`; no plane-conditioned SQL | catalog read-back; legacy-refusal tests as `factory_runner` (and after `SET ROLE` to every reachable role); envelope-immutability-by-node; manifest preservation on `BASELINE_69df2f52_EVIDENCE_ROWS.json` (the verifier's procedure, rehearsed) |
| IMP-2 | WO-2 | SQL front doors for the lifecycle (register, heartbeat, claim, renew, checkpoint, complete, release, verification claim, certify, rotate, report-state) with a per-call credential re-check serialized on the credential row (S-3); the Node API Edge handler (portable, one front door per route); the S-7 route list exactly | compatibility matrix with every VERDICT backed by a ported certified assertion (file:line at 69df2f52) running through the Node API; the §6 sequence from server rows; static handler inventory |
| IMP-3 | WO-3 | pairing / enrollment: CSPRNG locator + ≥55-bit secret, HMAC pepper at the edge, TTL ≤ 15 min, 5 per locator, 20 per peer IP per hour, 60 per tenant per hour (unknown locators included), atomic consume, audit, proof of possession, principal binding | transition table with a test per transition and failure state; abuse cases at boundary values (incl. a spoofed forwarding header); entropy calculation; no-pepper / no-plain-sha256 scan |
| IMP-4 | WO-5 | eligibility: 12 gates in order, first failing gate named; ranking; total delay ≤ 30 s; numeric priority; drain; the S-16(a) scheduling restriction (Director-document paths only) | test per gate + single-gate removal; best-resources-no-authorization; self-reported capability outside the envelope; preferred node unavailable; Home-authoring restriction; 2 < 10 < 100 |
| IMP-5 | WO-9 | verification model: authoring set; certification records; the S-13 floor in the front door whatever the policy says; the campaign policy; `VERIFICATION_FAILED`; same-tree resubmission refused; lapsed verification claim → WAITING | AC-14 (a)-(p); policy-write refusal; certification record format |
| IMP-6 | WO-7 | lifecycle: drain / resume, rotate (node + admin), revoke, re-pair (same principal), archive / restore, create agent principal | forced-interleaving revoke tests (R-4 rehearsal); evidence-intact check |
| IMP-7 | WO-6 | release: manifest (source SHA, version, PE Authenticode image-hash digest, key id, signature, receipt hash); trust set embedded per channel with trust mode at build time; verify before execution; revocations only from the API; upgrade / adopt-previous; stamping on node, run and checkpoint; the production-key INTERFACE only (C-3) | each refusal case with a sentinel payload; dev-key on a production-channel build; server-added key has no effect; rotation / revocation tests; no production key material |
| IMP-8 | WO-4 | `BrainFactorySetup.exe` (prep SEA pipeline extended): setup (standard user, per-user install, no elevation), key generation (DPAPI store), enrollment, runtime (API transport, supervisor, RECOVERING, report-state), per-user logon task + watchdog, `INSTALL_FAILED` / `REGISTRATION_FAILED` retry with the same credential, SEA `execArgvExtension: "none"` (S-5) | clean-machine rehearsal transcript (not the acceptance machine); installed-footprint listing |
| IMP-9 | WO-8 | Factory Admin API (S-8 two conditions, founder tier; stricter-only policies; S-16a bind add-only) + Brain OS → Factory → Computers page; the `/software-factory/workers` decision | persona × path matrix incl. the self-promoted employee; allowlist probe; row-for-row server comparison |
| IMP-10 | WO-10 | certified suites green; `CAPABILITY_IMPACT_REGISTRY.yaml` entries; secret scan; candidate report (every table, function, route, secret name, env var); release-provenance inputs; signature check over `8f9833ce..<candidate>`; freeze; candidate notice | as WO-10 lists |

## Order

IMP-1 → IMP-2 (+ compatibility matrix) → IMP-4 → IMP-5 → IMP-3 → IMP-6 → IMP-7 → IMP-8 → IMP-9 → IMP-10. Test work may run
alongside, one heavy job at a time on this machine.
