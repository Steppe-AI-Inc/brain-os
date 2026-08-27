# AI Proposal Agent (`agents.role = 'proposal'`)

Registry label only — see `README.md`. Conventional owner for quotation/proposal-package
tasks (`fallbackPlan()` routes "proposal"/"quotation"/"quote" commands here).

## Proposed charter (aspirational)
- **May see:** customer-facing proposal fields (`sales.read.pipeline` scope) — NOT
  `unit_cost`/`internal_margin`, which are physically separated into
  `product_costs`/`proposal_financials`/`proposal_item_costs` and gated by
  `FINANCE.yaml`'s manager+/hr_finance rule regardless of this agent's own label.
- **May decide (AUTO):** calculate a quotation total from list prices, draft proposal
  text.
- **Requires approval (per the existing `approvalRequired: true` default for this
  category in `fallbackPlan()`):** finalizing/sending a proposal with pricing.
