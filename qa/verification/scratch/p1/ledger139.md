
## 139. The same repair landed in one twin for the third round running — the twin is now removed, not synced — FIXED (2026-09-08)

**Found by** independent verifier #64 (campaign #124) on candidate `15480e3` / index.ts `885fd290`, which
returned FAIL. Artifacts on `verify-15480e3-campaign124` at `4fe49d6`.

**V64-D1b (P1) — the defect that keeps coming back.** The v59 hardening added `(?:i think )?(?:we|you) should`
to `IMPERATIVE_HEAD_RE`, the executor's command fallback, and never to `REQUEST_FRAME_PREFIX`, the tier the
never-silent receipt depends on. It also points the wrong way: the executor tier has a fallback that rescues
company archive/restore anyway, while the intent tier has none — so `we should delete QA-1` and
`we should rename ACME to Beta` derived nothing and the model's prose was the whole answer. **The repair
landed in the tier that did not need it and was withheld from the one that did.**

Adding the missing entries would have fixed this instance and left the mechanism intact: two hand-maintained
lists of the same concept, drifting apart once per round. **So the twin was removed.** One module-level
`REQUEST_FRAME_ALTERNATION` now defines what a request frame is, and both tiers are built from it. A frame
added once is added everywhere by construction rather than by whoever remembers.

**A third copy turned up while closing it.** `POLITE_REQUEST` was a third hand-maintained frame list, and the
two lists each held what the other needed — `shall i` was in the polite list and not the frames, which is why
`shall i archive ACME?` derived nothing even with both present. Measured against the corpora, neutralising
`POLITE_REQUEST` changed no case once a frame-led command counted as a request whatever punctuation ended it,
and the vacuity sweep reported it as a guard nothing tests. It is deleted; `shall i` moved into the shared
definition.

**V64-D1 (P1) — 17 of 121 ordinary mutation requests derived no intent** and shipped the fabrication verbatim
with `receiptRendered: false` (0 false positives on 87 reads). Beyond the frame holes: `right away archive
ACME` hit a DEAD alternative — `LEADING_ADVERB` contains `right away`, but the frame list's bare `right` ran
first inside `stripFrames` and stranded `away`, so that branch could never match; `ACME needs archiving`
needed a participle rule; and `ACME-г archive хийнэ үү` is how Mongolian actually carries a borrowed verb, with
the light verb хийх. Adverbs are now stripped before frames, the participle rule exists, and the loan-verb
construction is recognised for the same verb set the English tier uses.

**V64-D3 (P2) — the third member of the V63-D2 pair.** Two gates reading company status were hardened against
the trim in the last two rounds; `companyStatusById`, which answers "is that company archived?" for
everything downstream, still read the raw trimmable array. Hardening the gates a finding names, one round at
a time, is how the asymmetry keeps returning: all three now read the same provenance.

**V64-D2 (P2)** — `contextBudget.trimmedCount` was written only when the trim list overflowed its cap, so it
read 0 on every ordinary trimmed turn while `contextBudget.trimmed` listed real trims. A count that is
present and wrong is worse than one that is absent.

**V64-D5 (P2)** — `namedTargets` was the one capped collection in the pack with no envelope, and it is the one
holding the entity the founder just named. **The first fix was wrong and deno caught it in a minute:** putting
the envelopes inside `context.collections` type-errored, because that map is `Record<string,
CollectionEnvelope>` and a map OF envelopes is not one (TS2352), and the map was declared after the literal
that read it (TS2448/TS2454 — the runtime-fatal TDZ class this repo gates on). The design mistake is the same
sentence: `collections.namedTargets` would not have BEEN an envelope, so it would have satisfied §4.3 by name
and told the model nothing. The envelope now sits beside the rows.

**Search performed for the same class.** Merging the frame tiers meant every window executing either tier
needed the shared declaration. Rather than teach ten harnesses about one constant, the extractor resolves it
from the source under test, so a suite that slices either tier gets the real definition automatically — and a
harness that declared its own copy would be the drift it exists to detect.

**Regression.** `qa/scenarios-runner/v64_shared_frames_and_gate_pairs_contract.mjs` (74/74, promoted, with
two checks rewritten from modelling an implementation shape to asserting the property, and six cases added on
closure that the verifier's report named but its corpus did not carry). Battery green apart from the two
production-write-authority suites that are red by design. Vacuity sweep 44/44, second-generation sweep 19/19,
mutation proof 19/19. deno by class unchanged; CRLF-pure.

**Status.** Fixed on the candidate; NOT deployed. Production remains v92 source (function v94).
