# Production deployment package — Edge candidate `cbb4c1c` — DRAFT, NOT AUTHORIZED

**Status: DRAFT pending verifier #65.** Nothing here is deployed and nothing may be deployed on the strength
of this document. It exists so that a PASS needs only the verdict attached rather than an hour of assembly.
If verifier #65 returns FAIL, this draft is void and is replaced, exactly as the previous package was.

**The previous authorization is void and its bytes are known bad.** `ALLOW_FUNCTIONS_DEPLOY=1` of 2026-09-08
was scoped to commit `821f5308…` / index.ts `715246f3…`. Those bytes were deployed as v93, breached the token
preflight in production, and were rolled back. They must never be redeployed. Any deployment of the candidate
below needs a **fresh** founder authorization scoped to its own exact bytes.

## 1. Exact artifact

| Item | Value |
|---|---|
| Candidate commit | `cbb4c1c` (branch `p1/execution-truth-governance`) — the commit verifier #65 was dispatched on; `736d150` carries the identical deploy surface |
| Deploy surface | exactly `supabase/functions/sem-ai-command/index.ts` |
| Edge source sha256 | `77d6f0523bcbad0c01a99865c5171025d862665cbc77b9116303b609dfd9e7a0` (CRLF-pure, 0 bare LF) |
| Migrations in this package | none |
| Web changes in this package | none deployed; unchanged this round |
| Independent verifier | **#65, campaign #125, RUNNING** on `cbb4c1c`. No verdict yet. Verifiers #60 through #64 all FAILED their candidates; #65 is the sixth attempt at this gate. Each round found real defects, and three of them found defects introduced by the previous round own fixes. |

## 2. Production today

| Item | Value |
|---|---|
| `sem-ai-command` | version **94**, ACTIVE, carrying **v92 source** (`795c20c8…`), byte-verified against git `c9dfab5bd433` |
| How it got there | v93 (`821f530`) deployed 2026-09-08T01:50Z, P1 found by live acceptance, rolled back 02:10Z |
| Release state | FAILED; not Team-Ready; no Work-PC bug CLOSED; `ready_for_retest` false |

## 3. What this candidate changes since the rolled-back v93

Two verifier rounds and one production incident are folded in. Every item is closed structurally and pinned.

**The token-budget class (incident, ledger #133/#134/#135).** The context pack now measures itself with the
preflight's own estimator, on the exact object shape the preflight measures, and degrades deterministically:
optional collections first, core last and never below a floor, then two harder passes when free text keeps
the request over budget. Every trim is written back into that collection's envelope, so a trimmed or even
emptied collection still reports its real total with `truncated: true`, and any entity named in a command is
resolved server-side across every status. A named `MINIMUM_SAFE_CONTEXT` is excluded from the trim order by
assertion and verified byte-stable after every trim. When the irreducible part still does not fit, the turn is
refused with a stated cause and an action rather than an opaque number.

**The request-intent class (verifier #60, P1).** Model-emitted `requestIntent` can no longer veto anything: it
may add intent, never remove it. Request intent is derived from the founder's command by verb position, with
120 business imperatives covered, and read-shaped commands, composition requests and phrasal reads still veto.

**The execution-evidence class (verifier #60, P2).** `postconditionPassed` is carried through every branch of
the plan executor and passed to the evidence ledger, instead of the literal `true` derived from a status word.

**The vacuous-guard class (verifier #60, P2).** The collection-envelope contract enumerates every key in the
pack literal instead of pattern-matching value shapes, so a key nobody classified fails loudly.

## 3b. What two more verifier rounds changed

Verifier #60 and verifier #61 both FAILED, and between them they found eight defects the previous rounds had
not: the trim floor counted rows rather than bytes, the budget discarded the entity the founder had just
named, the model could veto the truth gate that policed it, 33 of 37 ordinary business imperatives were
outside the request lexicon, one long answer could permanently hard-stop a channel, and 22 Mongolian and 29
English statements were read as commands. Two of those were caused by the previous round own fixes. All are
closed and pinned by 19 mutants.

The most consequential correction was not a defect at all. Verifier #61 asked for the preflight to measure
the request as actually serialized; measuring it showed that doing so would refuse every turn in the product,
because SYSTEM_PROMPT is 18,824 tokens — 57% larger than the 12,000 cap that three campaigns had reasoned
about as though it were the model limit. It is a pack-size policy cap. The candidate now names two gates:
the pack budget (12,000, compact measure) and the model context window (180,000, the real request including
the system prompt and any attached image, which until now bypassed every limit in the function).

## 4. Known deliberate gaps (registered, not part of this deployment claim)

Lifecycle-dependent controls on child surfaces beyond People; archive-instead-of-delete for projects,
departments, documents, leads and approvals; verifier #59 residuals V59-D5/R2/R3; the `_shared` ↔ `web/lib`
mirror drift guard; the four whole-request gates recorded as UNMEASURED (provider context window, per-request
timeouts, SSE stream initialisation, system-prompt size drift).

## 5. Risk

The largest risk is the one this round exists to answer: **static verification cannot substitute for live
request-shape acceptance** (`CLAUDE.md` §6). Every figure in this package is measured from source and
fixtures. The live pack size on the founder's own workspace — the one number whose absence caused the
incident — has still not been measured on production, and verifier #60 said so explicitly. Any authorization
should require that number to be taken from production during post-deploy acceptance.

Second: the imperative-position tier is a broad allow-list, and a false positive turns a truthful reply into
a receipt. Two such defects were found and fixed during this round; the corpora that caught them measure
306, 129, 48 and 85 rows and are green, but a third is plausible.

## 6. Rollback target

Production v92 source, function v94, ezbr `22486cd751cac403`. Unchanged from the previous package: the
rollback path was exercised for real on 2026-09-08 and took about twenty minutes end to end.

## 7. Post-deploy acceptance plan

1. Re-download the deployed function and byte-compare against the certified source; stop and roll back on any
   difference.
2. Record the new function version and exact hash.
3. **Measure the live request size on the founder's own workspace** on a brand-new empty channel and record
   `contextBudget.estimatedTokens`, `budget`, `trimmedCount` and `overBudget` from a real turn. This is the
   gap the incident exposed and it closes only here.
4. Run the live acceptance set that found the P1 last time: an ordinary question in a brand-new channel; a
   restore of a company outside the context window; a non-existent company; a mutation request the product
   cannot execute from chat, which must produce a truthful "no change was made" receipt rather than prose.
5. Any new P0/P1: stop the rollout, preserve evidence, roll back.
6. Update the six Home-PC fix reports with the deployed SHA and version. `ready_for_retest` becomes true only
   after live verification passes. No Work-PC bug is ever marked CLOSED here.
