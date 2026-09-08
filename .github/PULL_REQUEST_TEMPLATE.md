<!-- Definition of done: docs/architecture/FEATURE_COMPLETENESS_CONTRACT.md §7. Tick for real. -->

## What this changes
<!-- one paragraph; canonical entity types and shared primitives touched -->

## Feature contract
- [ ] `docs/architecture/features/<slug>.md` exists and matches (or: not required — copy/style/pure refactor)
- [ ] Inverse actions in scope and tested
- [ ] Failure modes covered: missing · stale · duplicate · unauthorized · foreign org · already-target-state · partial failure · conflicting update · archived/inactive

## Truth and receipts
- [ ] Every mutation path records an `ExecutionResultEnvelope` with a fresh postcondition (no `postconditionPassed: true` literal)
- [ ] Every collection shown to the model or a page is a `CollectionEnvelope` (shown/total/truncated)
- [ ] No current-turn success claim without a verified envelope; mutation-intent turns never silent

## Surfaces and impact
- [ ] `docs/architecture/CAPABILITY_IMPACT_REGISTRY.yaml` consulted; surfaces listed there verified
- [ ] Archived-parent policy consumed (no bare `companies(name, status)` join)

## Verification
- [ ] `tsc` / `eslint` / `next build` clean; Edge `deno check` gated by class; `index.ts` CRLF pure
- [ ] `qa/scenarios-runner/architecture_*` contracts pass
- [ ] Regression tests added for the defect class: <paths>
- [ ] Positive and negative persona cases (incl. foreign org)

## Provenance and state
- Commit SHA:
- Release state (`CLAUDE.md` §"Release states"):
- Founder-only actions required (DB migration / Edge deploy / secrets): none | listed below
