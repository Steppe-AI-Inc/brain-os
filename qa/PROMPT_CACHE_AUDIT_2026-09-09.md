# Prompt-cache audit — `sem-ai-command`, 2026-09-09

Answers the founder's P2 question ("why is the cache-hit rate low"). Source- and schema-level only; no
production call was made, no candidate byte was changed. Measured against the frozen Edge candidate
`0ca756e` / `index.ts` sha256 `006a0c3f…`.

## The answer, in one line

**The cache-hit rate is not low. There is no cache.** Prompt caching has never been enabled on any call
this function makes, so there is nothing to hit — and if it were enabled tomorrow, nothing in the schema
could record that it had worked.

## Evidence

| question | measurement |
|---|---|
| Is a cache breakpoint sent? | **No.** `cache_control` appears **nowhere** in `supabase/**` or `web/**`. (A repo-wide grep matches only the unrelated `goal_kind` enum value `'ephemeral'`.) The Anthropic body is `{model, max_tokens, system, messages, temperature, stream}` — no `cache_control`, and no `anthropic-beta` header. |
| Are cache tokens read back? | **No.** `type Usage = { input_tokens?, output_tokens? }`. All three `onUsage` call sites pass only those two. `cache_read_input_tokens` / `cache_creation_input_tokens` appear nowhere in the source. |
| Could they be stored? | **No.** `public.model_usage` has `input_tokens`, `output_tokens`, `estimated_cost_usd`, `actual_cost_usd` — **no cache columns**. Adding them is a migration, i.e. founder-only. |
| Is there a stable prefix worth caching? | **Yes, and it is the largest single thing in the request.** `SYSTEM_PROMPT` is **75,296 characters ≈ 18,824 tokens**, byte-identical on every turn. |
| Is it re-sent every turn? | **Yes**, in full, uncached, on every request to both providers. |

## The size finding, which matters beyond caching

The system prompt (~18.8k tokens) is **larger than the entire context pack** it accompanies: the pack
budget is 11,400 tokens under `SEM_AI_MAX_TOKENS=12000`.

`estimateTokens({ command, contextPack })` — the preflight the 413 refusal is built on — **does not count
the system prompt at all**. So the number the request gate reasons about is roughly a third of what is
actually sent. `request_gate_inventory_contract.mjs` already prints the system-prompt size next to the pack
budget, so this is *measured*, not new; what is new is stating the consequence plainly:

> A saturated workspace estimated at 17,038 tokens against a 12,000 cap is really sending ~17,038 + ~18,824.

That does not change the refusal's correctness — the cap governs the part the function controls — but any
future reasoning about real per-request cost or provider-side limits must add the system prompt back in.
**This is recorded, not acted on:** changing the estimator is a change to the request gate, which is inside
the frozen candidate.

## Against the founder's checklist

| item | finding |
|---|---|
| stable system prefix | Present and ideal (~18.8k tokens, byte-identical every turn) — and entirely unexploited. |
| tool ordering | Not applicable: this function sends no `tools` array. Structured output is requested in prose inside the system prompt. |
| dynamic context placement | The whole context pack is `JSON.stringify`-ed into the **single user message**, after the system prompt. That ordering is already cache-correct: stable prefix first, volatile content last. |
| history mutation | Conversation history rides **inside** the context pack, not as a growing `messages` array, so there is no incrementally-extensible message prefix to cache beyond the system prompt. |
| model changes | Any model switch invalidates a cache entry. Only one model (`claude-haiku-4-5`) is proven to serve, so in practice the prefix would be stable — but a provider switch via `updateActiveProvider()` is unaudited (work order §3 P2), so cache invalidation would be as unexplainable as the switch itself. |
| cache TTL | Moot while nothing is cached. Relevant later: the default window is short relative to real founder session gaps, so the realistic win is *within* a working session, not across days. |
| `cache_read_input_tokens` | Never requested, never parsed, nowhere to store. |
| `cache_creation_input_tokens` | Same. |
| diagnostics reason | There is no diagnostic to read, which is why the question presented as "low hit rate" rather than "no caching". Same shape as ledger #144: **the absence of a measurement reads exactly like a bad measurement.** |

## What would have to change (PREPARED AS A DESCRIPTION ONLY — nothing implemented)

Ordered, and deliberately not started because every item touches the frozen candidate or the production DB:

1. **Mark the stable prefix.** Send `system` as a content-block array with a `cache_control: {type: 'ephemeral'}`
   breakpoint on the last block. This is the whole win: ~18.8k tokens per turn stop being re-billed at full
   input rate.
2. **Read the cache counters.** Widen `Usage` to carry `cache_read_input_tokens` and
   `cache_creation_input_tokens`, and pass them through the existing `onUsage` path.
3. **Store them.** Two new `model_usage` columns — a **migration, founder-only** — plus the RPC parameters.
   Until this lands, item 2 is observable only in the SSE payload, not queryable afterwards.
4. **Cost.** `estimateCost()` must price cache reads and cache writes differently from ordinary input, or the
   cost figures will silently drift wrong in the *favourable* direction, which is the harder error to notice.
5. **Only then** talk about a hit rate, because only then is there one to measure.

**Do not implement 1 without 2–4.** A cache that works but is unmeasurable is precisely the shape this
campaign keeps finding: a real behaviour change nothing can confirm or refute afterwards
(ledger #144, #150). The founder's own rule applies unchanged — **do not optimise caching at the expense of
fresh canonical state**: the context pack must stay outside the cached prefix, exactly where it is today.

## What this audit does not claim

It does not claim a cost saving figure. Real savings depend on turn frequency inside a TTL window and on
per-model cache pricing, and no live measurement was taken. It does not claim caching is safe to enable on
the current candidate — that is a source change requiring its own verifier round.
