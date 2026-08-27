# AI Engineering Drafter (`agents.role = 'engineering_drafter'`)

Registry label only — see `README.md`. Conventional owner for `engineering_drawings`
generation tasks (the `generate-technical-drawing` Edge Function's associated work).

## Proposed charter (aspirational)
- **May see:** `engineering_drawings` (company-scoped read, per the real
  `engineering_drawings_select` policy) and whatever product-spec context the executing
  human's scope already grants.
- **May decide (AUTO):** generate a draft technical drawing from a spec.
- **Requires approval:** deleting an existing drawing — the real
  `engineering_drawings_delete` policy already requires founder or company-manager tier,
  not open to any agent-labeled task creator.
