import { readFileSync, writeFileSync } from 'node:fs';
const p = 'qa/verification/scratch/verifier60_prompt_template.txt';
let t = readFileSync(p, 'utf8').replace(/\r\n/g, '\n');
function must(a, b, label) { const c = t.split(a).length - 1; if (c !== 1) throw new Error(label + ': found ' + c); t = t.replace(a, () => b); }

const OLD = `This candidate carries: budget-aware pack assembly (optional collections trimmed first,
core last and never below a floor, every trim written back into that collection envelope; context.contextBudget
reports estimate/budget/trims) pinned by qa/scenarios-runner/architecture_context_budget_contract.mjs (12/12
claimed); archivedCompanies 12->6; the prose scope strings removed from the envelope map; and verifier #59 own
hardening patch applied as written (V59-D1..D4; v59_regression_additions 72/12 -> 84/0, promoted to
qa/scenarios-runner/v59_intent_fallback_tier_contract.mjs).

JUDGE THE BUDGET FIX HARDEST:`;

const NEW = `This candidate carries: budget-aware pack assembly (optional collections trimmed first,
core last and never below a floor, every trim written back into that collection envelope; context.contextBudget
reports estimate/budget/trims/protected) pinned by qa/scenarios-runner/architecture_context_budget_contract.mjs
(26/26 claimed); archivedCompanies 12->6; the prose scope strings removed from the envelope map; a named
MINIMUM_SAFE_CONTEXT asserted byte-stable after every trim; the new
qa/scenarios-runner/request_gate_inventory_contract.mjs (25/25 claimed); and verifier #59's own hardening patch
applied as written (V59-D1..D4; v59_regression_additions 72/12 -> 84/0, promoted to
qa/scenarios-runner/v59_intent_fallback_tier_contract.mjs).

THE IMPLEMENTING SESSION SELF-REPORTS TWO DEFECTS IT FOUND AND FIXED AFTER #59. Verify both independently;
they are the likeliest place for a third of the same kind to be hiding.
  (a) The trim loop measured {command, pack} and only afterwards attached pack.contextBudget, a field that
      grows one line per trim - so it certified a pack SMALLER than it shipped. Measured: a 50-turn channel
      exited the loop "fitting" at the 11,400 budget and serialized 11,550. contextBudget is now attached
      BEFORE the loop and mutated in place. Check the fixpoint yourself: estimatedTokens is written into the
      very object it measures. Is the residual error bounded? Can it ever push the real request over 12,000?
  (b) The first headroom fixture left 20 of the 24 pack collections EMPTY, understating every estimate by
      thousands of tokens. Rebuilt at the real .limit() caps from index.ts, a saturated production pack is
      25,595 tokens before trimming - more than twice the hard cap. If that is right it means DEPLOYED v92
      would breach the preflight too on a fully populated workspace, i.e. incident #133 was never a v93-only
      regression but an unbounded-growth defect v93 merely reached first. CONFIRM OR REFUTE THIS. It changes
      what the rollback actually bought and whether production is safe today.

FOUNDER MANDATE FOR THIS ROUND (2026-09-08), seven parts - answer each explicitly in your report:

 1. ATTACK THE TOKEN-BUDGET FIX. Do not merely confirm the new contract suite; independently verify the
    ENTIRE request-budget path. Required invariant: A REQUEST FITS THE HARD LIMIT OR OPTIONAL CONTEXT
    DEGRADES DETERMINISTICALLY. Never: VALID FOUNDER TURN -> HARD STOP because optional context inflated the
    request. Verify: a fitting pack is unchanged; optional context trims before core; history trims oldest
    first and preserves the newest turns; envelopes retain the EXACT total; truncated=true whenever rows are
    omitted; truncation never becomes non-existence; archived entities remain canonically resolvable;
    currentTurn is never trimmed; permissions and tenant scope are never trimmed; the durable pending action
    and channel state are safe; execution evidence is never removed merely to fit a budget; canonical target
    ids remain available; and THE ESTIMATOR MATCHES THE ACTUAL SERIALIZED REQUEST.
 2. HUNT EVERY OTHER WHOLE-REQUEST GATE and classify each: SAFE DEGRADATION / DETERMINISTIC REFUSAL /
    UNSAFE HARD STOP / UNMEASURED. At minimum consider: input token estimate, output token cap, provider
    context window, serialized JSON size, history length, collection count, tool-schema size, system-prompt
    size, request timeout, stream initialisation, model-specific limits. An UNSAFE HARD STOP is a P1. An
    UNMEASURED gate must be NAMED, never assumed safe. Judge whether the four the candidate declares
    UNMEASURED are honestly scoped or a place to hide a fifth.
 3. JUDGE THE PROMOTED CONTRACT. governance/OPERATING_TRUTH_MODEL.md section 4.4 now carries
    TOKEN_BUDGET_EXHAUSTION_MUST_DEGRADE_CONTEXT_NOT_PRODUCT_AVAILABILITY with a minimum safe context:
    the current user command, authenticated identity, organization scope, permissions, the durable pending
    action, exact canonical entity/action state for this turn's targets, execution-result requirements, and
    the system safety/truth contract. Is the set in source (MINIMUM_SAFE_CONTEXT) actually that set? Is any
    member protected only by omission from TRIM_ORDER rather than by assertion? Is the assertion vacuous?
 4. ENFORCE: NOT INCLUDED IN THE PROMPT != DOES NOT EXIST. Every trimmed collection must still tell the
    model shown / total / truncated, and server-side canonical resolution must remain available for any
    entity named in a command, across every status. Try to construct a turn where a trim causes the product
    to answer that something does not exist, or to answer a count from a window.
 5. RE-MEASURE ESTIMATOR ACCURACY YOURSELF across at least: empty channel, short channel, long channel,
    many companies, many archived companies, many tasks, many archived tasks, long names, and 50/100/200-turn
    history. Build your own fixtures from the real .limit() caps in index.ts - do not reuse the candidate's.
    Report headroom. DO NOT TUNE TO 11,999: a deliberate safety margin below the hard threshold is required,
    and a margin that only holds because a fixture is unrealistically small is not a margin.
 6. INDEPENDENTLY VERIFY THE v59 HARDENING PATCH as part of THESE EXACT BYTES, not as a historical claim.
 7. JUDGE THE PINNED LIVE INCIDENT REGRESSION WITNESS on BOTH halves: the pre-fix pack must actually exceed
    the cap and the post-fix pack must actually answer. A capacity regression test that only asserts "it
    fits now" passes just as happily against a fixture too small to have ever failed. Also confirm the cases
    that DID succeed live on v93 are still satisfied by these bytes.

TWO PERMANENT RULES were added to CLAUDE.md this round; judge whether the candidate actually honours them:
STATIC / SOURCE VERIFICATION CANNOT SUBSTITUTE FOR LIVE REQUEST-SHAPE ACCEPTANCE, and BYTE-IDENTICAL
DEPLOYMENT IS NOT PRODUCT-SAFE DEPLOYMENT. You cannot make a live request yourself. Say plainly, in your
verdict, which of your conclusions are source-level only and would still need live acceptance to be trusted.

JUDGE THE BUDGET FIX HARDEST:`;

must(OLD, NEW, 'founder mandate');
writeFileSync(p, t.replace(/\n/g, '\r\n'));
console.log('template updated', t.length);
