# CHANGE REQUEST — DIRECTOR DECISION REQUIRED

**CR-015 — S-6's per-address pairing limit on the hosted Edge runtime: which address it keys on if that runtime hands every request
one shared address, and how "per source IP" applies to IPv6 clients**

- **Filed:** 2026-09-29 by the IMPLEMENTER capability, on `factory/auto-enrollment-v1-implementation`.
- **Revised:** 2026-09-29, after the A5 verifier review: the text is rewritten, the tenant cap's question moves to CR-016, and the
  IPv6 question is added.
- **Built on:** Director r3 `c7a845b61a3b0b419e8c9dfeff397547fdc75b03`.
- **Kind:** an S-6 / AC-8 clause whose effect depends on a value only a deployed function can show. No Director text is edited.
- **Until the Director decides, the candidate keeps the ratified r3 behaviour:** the key is the peer the runtime hands the handler
  (`info.remoteAddr.hostname`, canonicalized by `_shared/peer.ts`), the exact address, never a request header. Nothing here is
  implemented, and the candidate does not rely on this request.

## Requirement (the r3 texts)

- **S-6** (`docs/architecture/features/factory-node-management-auto-enrollment.SECURITY_TENANCY.md`): "**≤ 20 attempts per source IP
  per hour** (the connecting peer address as the Edge platform sees it, never a client-supplied header) and **≤ 60 per tenant per
  hour**, unknown locators included ... every attempt is audited".
- **WO-3** (`qa/work-orders/auto-enrollment-v1/WO-3.md`): "≤ 20 attempts per source IP per hour: the connecting peer address as the
  Edge platform sees it, never a client-supplied header."
- **AC-8** (`qa/verification/auto-enrollment-v1/ACCEPTANCE_MATRIX.md`): "the 21st attempt from one IP in an hour ... The IP limit keys
  on the connecting peer address; a forged `X-Forwarded-For` does not reset it."
- **AC-1 / P-4:** a clean PC enrolls with the three human steps; zero-touch enrollment must be possible.
- **CLAUDE.md §6:** a gate that can refuse a whole request is observed on real requests and classified; an unobserved one is never
  assumed safe.

## Evidence

- **Local measurement** (`qa/factory/v1/edge_peer_acceptance.mjs`, EP1-EP5): Deno 2.5.6 serves the committed
  `factory-node-api/index.ts` over plain TCP, against a disposable plane reached with TLS verify-full. The handler receives
  `{ transport: "tcp", hostname, port }` with the local client's own address. Each of two local addresses is recorded as its own
  `peer_ip`; the cap applies to each address separately; request headers carrying other addresses are ignored.
- **Not measurable here:** a unix-socket listener (Deno on Windows cannot serve one; the handler rows PE1-PE3 in
  `enrollment_acceptance.mjs` cover every shape with no usable address), and the hosted Supabase Edge runtime with its gateway (no
  Docker or Supabase CLI here, and the open-source runtime would not include the hosted gateway). Nobody has yet observed what the
  hosted runtime reports.
- **The possible hosted values:** (1) no usable address, (2) each client's own address, (3) one address shared by all clients. As
  built, (1) refuses enroll/start and enroll/complete by name (503 `peer_unavailable`, recorded) and serves the other routes; (2) keys
  the per-address clause as S-6 intends. The implementer's analysis of what (1) and (3) mean for AC-1 / P-4 and S-6 went to the
  Director privately, through the founder (ledger rule 3).
- **IPv6:** S-6 says "per source IP" and does not say how it applies to IPv6 clients. The implementer's analysis went to the
  Director privately with the item above.

## Why a decision is needed

- **Shared address:** if the hosted runtime reports one address for all clients, how S-6's per-address clause is kept is a Director
  question; each option below changes what must be true, and the implementer may not decide that (CLAUDE.md §8). The analysis went
  to the Director privately.
- **IPv6:** how the per-address limit applies to IPv6 clients is a reading of S-6's meaning.

## Options for the Director

For the shared-address outcome:

- **(A)** Allow the key to come from a client-address value that the hosting platform itself sets on every request and that a
  caller cannot supply or override, once a measurement has identified that value and confirmed that property. A request without it
  stays `peer_unavailable`. AC-8's header row would be restated against that value.
- **(B)** Remove the per-address cap on such a runtime, leaving the 5-failure locator cap and the tenant cap (as CR-016 decides it)
  to bound guessing, or replace it with another control the Director names.
- **(C)** Keep S-6 unchanged and record its consequence before certification, as an accepted risk (detail in the private
  analysis).

For IPv6:

- **(D)** Keep the r3 behaviour today, or **(E)** adopt the rule set out in the private note.

If the measurement shows that the hosted runtime reports each client's own address, (A)-(C) are not needed; (D)/(E) and CR-016 still
need an answer.

## The measurement (a founder decision; the implementer schedules nothing)

Only the founder deploys anything to a Supabase project, a probe included (CLAUDE.md §8); an Edge Function reaches the
Factory project only through the single `ALLOW_FUNCTIONS_DEPLOY=1?` question, after certification of an exact SHA. What needs to be
learned is what `info.remoteAddr` holds for requests that reach the hosted runtime from two separate internet connections (and from
an IPv6 connection, if one is at hand), and which forwarding headers the platform adds on its own. The founder may learn it:

1. at the mandatory post-deploy live acceptance of the certified SHA (CLAUDE.md §6), by reading the `peer_ip` values the plane
   recorded, through the observer login, and comparing each with the public address of the connection that sent it; or
2. earlier, if the founder chooses, with a disposable function that has no database and no secret, in a project that is neither
   Brain OS production nor the Factory project, which returns what it received and is deleted afterwards.

Either way the result goes to the Director as an observation record.

## Impact on the candidate

- None while undecided: the r3 key stands, and every shape without a usable address is refused by name and recorded.
- The candidate may be reported READY FOR INDEPENDENT QA with AC-8's per-address clause **BLOCKED** on this measurement. Certification
  cannot close that clause, and it must never be described as measured on the hosted runtime.
- If (A) or (E) is ratified, `_shared/peer.ts` is the one place the key is derived (static row G5); (E) would also change the SQL
  count's key (part 150 `_pairing_limits`). Each would come with its own acceptance rows.
