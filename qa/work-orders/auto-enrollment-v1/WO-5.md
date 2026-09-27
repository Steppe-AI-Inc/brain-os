# WO-5 — Scheduler eligibility and ranking; capability reporting, telemetry, priority, drain; milestone restrictions

- **Binding**, revision 2, issued by the DIRECTOR.
- Contract: §3 P-6 / P-7.
- Founder text: I A.1 §3, I A.4 §7, §11; II.1, II.10.
- Executed by: the IMPLEMENTER.
- Certified by: a distinct authorized verifier.
- Scope changes: only a Director revision changes this WO.

## What must be true
- **Hard gates, in exactly this order:**
  1. valid credential;
  2. tenant match;
  3. company-scope match;
  4. authorization;
  5. required role;
  6. **required capabilities** (from the envelope; detection may only restrict);
  7. implementer / verifier independence (the policy);
  8. surface / conflict locks;
  9. drain;
  10. health / heartbeat freshness;
  11. max concurrency;
  12. hard minimum resources.
- **Then ranking, among eligible nodes only:** resource fitness, preferred work class, CPU / RAM / disk headroom, load, reliability,
  locality, priority, queue age. **Resource fitness and hostname never create authority.**
- **Refusals name the gate.** A refusal names the **first** failing gate in this order.
- **Ranking never excludes.** No ranking factor, including a placement preference, excludes an eligible node. All ranking together may
  delay eligible work by **at most 30 s**, and never stalls it.
- **Milestone restrictions (S-16)** only remove eligibility. In the first, the product-layer allow-list (Director-document work
  orders only) is a Director restriction, stricter than the founder's line:
  - no authoring run of Auto-Enrollment product code on a Home-computer record (S-16, which defines every such record): the record the
    restriction is bound to, archived or not, or any computer record that has reported a machine fingerprint such a record has
    reported. A Factory admin binds it to the Home computer's record at its Add Computer enrollment (S-14's one permitted campaign
    write, add-only). During this milestone the binding is never released: unbinding and rebinding are refused, an archived record
    keeps it, and an unbound registration reporting a bound record's fingerprint is refused by name (S-14). A missing or mistaken
    binding is corrected only in S-14's order. It is keyed to the enrolled computer, never to a hostname, and a fingerprint only adds
    restriction. At the product layer it is a scheduling restriction: a Home-computer record takes an authoring run only of a work
    order whose declared owned surfaces are non-empty and lie entirely within the Director-document paths (S-16). The authorship
    evidence is the governance-layer check;
  - the campaign's physical-separation rule for certification.
- **Assignment is temporary.** It is chosen per work item, within the envelope, and never widens the envelope.
- **Numeric priority.** A regression proves 2 < 10 < 100.
- **Drain.** A draining node takes no new work, and resume restores it.
- **Dispatch.** Product dispatch (the Factory director, a dispatcher process with no DIRECTOR governance authority, through the API)
  uses these rules alone.

## Must satisfy
AC-3, AC-6, AC-15, S-1, S-16, P-6, P-7

## Depends on
WO-1, WO-2.

## Candidate report must include
- A test per gate, including removal of each gate singly.
- The "best resources, no authorization" case.
- The "self-reported capability outside the envelope" case.
- The "preferred node unavailable" case.
- The Home-authoring restriction case, including a second record of the same machine that has reported the bound record's
  fingerprint (AC-15).
- The numeric-priority regression.
