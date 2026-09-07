# Brain OS

Brain OS is the AI-native operating system for Steppe AI, Inc. and the companies it runs:
a Next.js app (`web/`), a Supabase project (schema, RLS, RPCs, Edge Functions under
`supabase/`), and a software factory (`scripts/factory-runner/`) that builds and verifies
the product under independent QA.

Start here:

| Read | For |
|---|---|
| `CLAUDE.md` | how work is done and verified in this repository (Development Constitution) |
| `governance/OPERATING_TRUTH_MODEL.md` | what counts as true about live state; the AI execution contract |
| `governance/CANONICAL_WORK_CONTRACT.md` | the chain every business action walks; parent/child policy |
| `docs/architecture/FEATURE_COMPLETENESS_CONTRACT.md` | what "complete" means; definition of done; ownership |
| `governance/BRAIN_OS_CONSTITUTION.md` | roles, capabilities, data classification, risk levels |
| `web/CLAUDE.md` | stack and conventions for the web app |
| `qa/` | acceptance tests, security matrix, regression catalog, failure-mode ledger |
| `docs/FOUNDER_ACTION_RUNBOOK.md` | the founder-only production actions |

The original vanilla-JS application that once lived at this root was retired on
2026-08-24; its history remains in git.
