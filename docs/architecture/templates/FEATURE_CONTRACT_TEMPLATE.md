# Feature contract — <feature name>

Filed under `docs/architecture/features/<slug>.md` before implementation.
Contract reference: `docs/architecture/FEATURE_COMPLETENESS_CONTRACT.md`.

## 1. Canonical state
Tables / columns that are the truth. Derived fields and where they are derived.

## 2. State machine
| From | To | Trigger | Who | Preserves |
|---|---|---|---|---|

## 3. Product invariants
Sentences that must hold on every surface.

## 4. Authorization
Per transition: roles / capabilities; where it is re-derived (RPC / server action).

## 5. Organization / tenant scope
How the scope is resolved (`resolveOrgScope`); result for a foreign-org target.

## 6. Relationships
Parents, children, links; effect of each transition on each (per the parent/child policy).

## 7. UX surfaces
Every page, selector, badge, notification, chat interaction, search, dashboard touched.

## 8. Inverse actions
The reverse of every transition (in scope for this delivery).

## 9. Failure modes (all required)
| Mode | User-visible result | Receipt |
|---|---|---|
| missing entity | | |
| stale state | | |
| duplicate request | | |
| unauthorized | | |
| foreign org | | |
| already in target state | | |
| partial backend failure | | |
| conflicting update | | |
| archived / inactive target or parent | | |

## 10. Acceptance criteria (Work PC will run these)
Numbered, each with precondition → action → expected postcondition → surfaces to check
→ fresh-session check.

## 11. Change impact
Shared primitives touched / introduced; entity types reusing them; surfaces that may
drift; regression families to run. Update `CAPABILITY_IMPACT_REGISTRY.yaml`.
