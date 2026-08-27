# Persona: TECHNICIAN

- **Real `app_role`:** `employee` — **no dedicated `technician` role exists.**
- **Fixture identity:** EMPLOYEE fixture with a temporary `employee` membership at CLIX
  GPS (`ed8ae510-…`), the company whose real staffed `people` are installation
  technicians (Gantulga, Ariunjargal, Batbayar — see `qa/TEST_PERSONAS.md`).
- **Governing doc:** `governance/roles/EMPLOYEE_BASELINE.md`.

## Scope mechanism

`has_company_access(company_id)` for CLIX GPS only. Identical rights to
`ORDINARY_EMPLOYEE`; the "technician" framing is a job description, not a role.

## Can do

- See tasks assigned to them (owned/created), read company non-sensitive operational data,
  attach photos to chat (`sem-ai-command` accepts an image), create field-report tasks.

## Cannot do (the canonical "technician cannot know revenue" test — SC-054/SC-068)

- Cannot read `financial_reports`, `product_costs`, margins, `salary_private`,
  `company_sensitive`, other technicians' tasks, another company's anything.
- Cannot obtain revenue/margin/salary **indirectly** via Brain AI, including derived or
  inferred forms ("is it above $100k", "first digit only", "rank vs last month") —
  SC-068. The enforcement is that those rows never enter the model's context, not a prompt
  instruction.

## Role in scenarios

SC-054 (task visibility), SC-068 (financial inference), SC-055 (accidental overreach),
`ai/context_security`. The archetypal low-privilege field worker.
