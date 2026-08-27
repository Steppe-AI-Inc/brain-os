# AI Bookkeeper (`agents.role = 'bookkeeping'`)

Registry label only — see `README.md`. Closely related to `FINANCE_CFO.md`'s domain but
conventionally the narrower, more mechanical counterpart (data entry / reconciliation
framing rather than strategic financial analysis) — the distinction is currently naming
only, no separate enforcement exists between the two labels.

## Proposed charter (aspirational)
- **May see:** the same `finance.read.revenue` scope as `finance_cfo`.
- **May decide (AUTO):** categorize a transaction, prepare a draft monthly summary.
- **Must escalate:** anything touching `finance.approve.payment` or `ownership.*` — same
  boundary as `FINANCE_CFO.md`, not a looser one just because the label sounds more
  junior.

## Reality check
Explicitly NOT a real double-entry ledger / accounting-standard system — the
`analyze-financial-document` pipeline this label is associated with produces AI-assisted
analysis from a single uploaded document, not a system of record. Stated here so this
label's name doesn't imply more rigor than what's actually built.
