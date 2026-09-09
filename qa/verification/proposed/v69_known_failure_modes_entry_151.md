## 151. The boundary that closed one direction opened the other, and three tiers still keep their own copy of the verb list — FOUND, NOT FIXED (2026-09-09)

**Found by** verifier #69 (campaign #129) on candidate `0ca756ee`, `index.ts` sha256
`006a0c3feeb5f2f13b0b99b55684d3d3d667d86d90484672d8d63a1db2c4d610`. **The whole battery was green
throughout: 79 suites, 1,766 assertions, 0 failed** — the fifth consecutive round where that sentence is
true and a P1 shipped anyway.

**How the axis was derived.** Not by writing another corpus. #149 closed with the instruction to ask, of
every canonical definition, *which consumer does not derive from it, and what request shape reaches that
consumer?* Mechanised (`qa/verification/scratch/v69/concept_map.mjs`, members collected at every nesting
depth, self-tested against a group-prefix bug that ate the first alternative of every group), the question
returns **ten** consumers that keep a truncated copy of `MUTATION_VERB_ALTERNATION`, ranked by containment.
Two of them have a reachable request shape, and both ship.

### V69-D1 (P1) — four request shapes the never-silent receipt cannot see

`requestedIntent` is `null`, so the receipt tier never runs and the model's prose is the entire answer.
The executor is idle too, so **nothing is executed and the founder is told it was**. Measured through the
product's own structured-claim block (`qa/verification/scratch/v69/ship_probe.mjs`, `dup_probe.mjs`):

| shape | example | fabrications shipped |
|---|---|---|
| two modifiers, no determiner | `archive old duplicate work order WO-1` | 5/5 |
| an adjectival participle as a modifier | `archive expired work order WO-1` | 2/2 |
| punctuation directly after the verb | `Archive: the work order WO-1` | 4/4 |
| negation in non-leading position | `make sure you do not archive ACME` | 25/30 |
| Mongolian loan verb outside the hand-written list | `ACME-г fire хийнэ үү` | **80/120 verbs** |
| a READ clause first, a mutation clause last | `list the companies and suspend ACME` | **90/120 verbs** |
| CONTROL — the one-modifier shapes #67/#68 closed | `archive work order WO-1` | **0/35** |

The control is the point: the only variable is the shape, not the fabrication.

**Root causes, four of them, each a single line.**

1. `IMPERATIVE_OBJECT`'s head-region rule `^(?:\S+\s+){0,1}(?:ENTITY_NOUN)` — #149's "at most one
   modifier". Two modifiers with no determiner and no capitalised or identifier-shaped token match no
   alternative at all, so the object does not refer and no tier sees the request.
2. `STATEMENT_FINITE_VERB` lists past participles that are ordinary **adjectives** in a noun phrase —
   `expired`, `created`, `changed`, `closed`. `archive expired work order WO-1` is therefore read as a
   statement about the world.
3. Every alternative in `IMPERATIVE_OBJECT` assumes **whitespace** after the verb, so a colon, a dash or
   an ellipsis after the verb removes the request from the intent tier.
4. `NEGATED_IMPERATIVE_HEAD` inspects the **head** only. `make sure you do not archive ACME` has a lexicon
   verb (`make`) at the head with a non-referring object, so the negated request is invisible — which is
   the worst version of this defect, because the founder said *do not* and receives *done*.

### V69-D2 (P1) — the other direction, opened by the same line

#149 narrowed `IMPERATIVE_OBJECT` to the head region because position-free destroyed 8 of 8 truthful
reads. **One modifier still destroys a class.** A noun-phrase headline whose head word is spelled like a
lexicon verb and whose entity noun sits one word in now acquires mutation intent, and the receipt deletes
the truthful answer:

```
"Post mortem report for the project"
  answer: "The department has three open items. Two were closed last week; nothing was changed today."
  became: "No change was made — that request did not resolve to an operation I can execute from chat."
```

**70 of 70** (14 headlines × 5 truthful answers) destroyed. #149's own zero-modifier pins survive 0/30 —
so the boundary did not move back, it moved sideways.

**The ruling on the boundary.** It should not move to two modifiers, and it should not move back to
position-free: both directions have now shipped a P1 from the same parameter. *A modifier count cannot
separate "an object that identifies a thing" from "a topic headline", because neither phenomenon is about
distance.* What distinguishes them is measurable and is already in the file: the request shapes carry an
**identifier or a determiner or an imperative frame**, and the headlines carry a **prepositional phrase
with no addressee and no target token**. Deriving the head-region rule from that, in the one definition,
is the fix; another integer is not.

### V69-D3 / V69-D4 (P1) — the ninth and tenth re-spellings

- `MN_LOAN_VERB` (line 6193): 39 verbs, **containment 1.00** in the canonical 120. Mongolian is the one
  language where the founder writes `<English verb> хий`, and 81 canonical verbs are missing from it.
- `lastClauseIsMutation` (line 6064): 30 verb **stems**, inline, containment 0.90. #149 fixed
  `firstClauseIsMutation` and left its mirror; the read-shape veto then swallows the request.

Eight more truncated copies are listed by the suite (`IMPERATIVE_LEAD`, `MUTATION_NEEDS_PARTICIPLE`,
`MUTATION_VERB_WITH_OBJECT`, `MUTATION_VERB_PROPER_OBJECT`, `lexiconObject`, the two future-promise lists,
`negatedRequest`). They are **registered debt**, not proven-reachable P1s: classify each as IDENTICAL
SEMANTICS / INTENTIONALLY DIFFERENT before converging.

### V69-D6 (P2, harness) — why the ratchet was green while ten copies sat in the file

`concept_duplication_ratchet_contract` fails open in **two** ways, one of which #149 recorded as unfixed
and one of which nobody had named:

1. It scans only **named** alternations (`const NAME = /…/`), so an inline vocabulary — `lastClauseIsMutation`,
   `lexiconObject` — is invisible. **This must be fixed.** Two of this round's P1s live exactly there.
2. Worse, and new: it compares pairs by **Jaccard ≥ 0.60**, which is a *symmetric* metric. A truncated copy
   is a proper subset, and the more incomplete it is the lower it scores: `MN_LOAN_VERB` vs the canonical
   list scores **0.325** and is invisible, while its containment is **1.00**. The ratchet is least able to
   see the copies that have drifted furthest — precisely inverted. **Containment, not similarity, is the
   metric for "is this a partial copy of the canonical vocabulary?"**, and stems must be matched by prefix
   or a stem list stays invisible on both metrics.

### V69-D5 (P3) — the receipt still reads as machine output

`status` → the founder is shown *"I could not resolve which **statu** you meant"*. The singulariser strips
a trailing `s`. #149 fixed the plural direction (`person` → `people`) and left the singular one.

### What the candidate got right, measured

- The executor **never** acts where the receipt tier is blind: **0 of 1,680** shapes (the intent tier is a
  superset of the executor by construction, and it holds under measurement).
- No truthful read was **executed** as a mutation: 0 of 20.
- Every `TRIM_ORDER` key carries a collection envelope, so a trim can never become silence: 26/26.
- `embedTexts` is byte-identical to deployed v92 (normalised), and #144 is still open and named — the
  deferral of the embeddings P1 remains correct on both halves.

**Standing lesson, now five rounds old.** #65 request frames, #66 object shapes, #67 entity reference,
#68 clause count × vocabulary, #69 modifier count × verb vocabulary × language. Each round converged one
concept and left another spelled twice, and each time the battery was green. The guard that is supposed to
end this cycle is the ratchet, and the ratchet is measuring the wrong quantity.
