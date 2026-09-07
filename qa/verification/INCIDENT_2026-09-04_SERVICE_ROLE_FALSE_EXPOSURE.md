# Incident record — false service-role exposure finding (2026-09-04)

**Classification:** reporting defect in the implementation session. Not a security incident.
**Status:** corrected; rotation recommendation **withdrawn**; permanent QA rule added.

## What was claimed, and what was true

| | |
|---|---|
| **PREVIOUS CLAIM** (retracted) | `SUPABASE_SERVICE_ROLE_KEY` was readable locally in `web/.env.production.local`, `web/.env.local`, `web/.env.qa.local`; described as "the worst route — readable on disk, bypasses RLS with a plain fetch"; founder advised to rotate immediately. |
| **CORRECTION** | The three files carry the variable **name**. The **value** is Vercel's redaction placeholder `"[REDACTED]"` — 13 bytes on disk including quotes, `looks_like_jwt=0`. Vercel writes that placeholder on `env pull` for any variable already marked **Sensitive**. No live service-role secret has been proven present on disk. |
| **Platform confirmation** (2026-09-07) | `vercel env ls production` lists `SUPABASE_SERVICE_ROLE_KEY` as type **Secret**, value **Hidden**. It cannot be read back through the CLI or dashboard by design. |

Do not preserve the old claim as fact anywhere. Where it was quoted (plan file, route table, the
earlier route-2 test comment), it has been replaced with the corrected finding.

## How the error happened — the chain, transparently

1. A subagent, asked to inventory credential locations, reported that the three files "each contain a `SUPABASE_SERVICE_ROLE_KEY`".
2. The implementation session read *presence of the name* as *presence of the value* and did not inspect the bytes.
3. On that inference it escalated the route as the worst live exposure and asked the founder to choose a remediation order.
4. The founder chose **"Rotate now, before anything else"** — a decision made on a wrong claim.
5. Byte inspection (length, JWT-shape test, structure) proved the value was the redaction placeholder.
6. The correction was surfaced immediately and the founder accepted it: rotation is **OPTIONAL SECURITY HYGIENE**, not P1 remediation.

## Standing instruction from the founder

Do **not** ask for service-role rotation unless new evidence shows one of:
- the real key was exposed;
- the key is available to ordinary dev/Claude sessions;
- rotation is independently justified for another reason.

## The permanent QA rule

**`SECRET_VARIABLE_NAME_PRESENT` ≠ `SECRET_VALUE_EXPOSED`.**

Every secret finding must be reported as exactly one of four states, and never by printing the value:

| State | Meaning | Is it an exposure? |
|---|---|---|
| `ABSENT` | variable not present | no |
| `REDACTED` | name present; value is a placeholder | **no** — this is what correct handling looks like |
| `PRESENT` | a value with the shape of real key material is readable | yes by default — but not proof it is valid/current/privileged |
| `VALIDATED_LIVE` | the value was proven to work against the live service | yes — and reaching this state is itself an action requiring authorization |

Executable form: `qa/lib/secret_evidence.mjs` (`classifySecret`, `describeFinding`) with
`qa/lib/secret_evidence.regression.test.mjs`, whose headline case is the exact on-disk state of this
machine and whose `NO_FINDING_EVER_CONTAINS_THE_VALUE` test asserts that no 12-character fragment of
a value can leak into a finding. The route-2 assertion in
`qa/scenarios-runner/production_write_authority.regression.test.mjs` now reports through this
classifier.

## Vercel session — classified by capability, not presence

The founder's instruction: a Vercel session token existing is not itself a defect if sensitive
secrets remain inaccessible and production actions are separately gated. Read-only probes,
2026-09-07, account `treyopenspot`, team `steppe-ai`, project `brain-os`:

| Capability | Finding | Evidence |
|---|---|---|
| Read production **Sensitive** secrets | **NO** | All seven secrets (`SUPABASE_SERVICE_ROLE_KEY`, `OPENAI_API_KEY`, `AI_COMMAND_SHARED_SECRET`, `SLACK_BOT_TOKEN`, `GOOGLE_CLIENT_SECRET`, `OPENAI_MODEL`, `SEM_BRAIN_APP_VERSION`) are type Secret/Hidden; `env pull` writes `[REDACTED]`. |
| Read production non-sensitive config | yes (by design) | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` are type Config — these are shipped to browsers anyway. |
| Change production env | **PRESUMED YES — not proven** | The CLI offers `env add`/`env rm`; whether the account's team role permits it was not probed because the only proof is a mutation. Founder check: Vercel dashboard → Team → Members → role of `treyopenspot`. |
| Deploy production | **PRESUMED YES — not proven** | `vercel deploy --prod` requires no approval on Vercel's side (no required-reviewer concept); deployment protection is SSO-on-view (`all_except_custom_domains`), which gates *viewing* previews, not *deploying*. Same founder role check applies. |
| Obtain production **DB** write authority via Vercel | **NO** | No secret readable ⇒ no path from this session to the DB through Vercel. |

**Classification:** the Vercel session is **not a P1 DB write route**. It is a **production
deploy/config route** for the web app, which belongs in the founder's GitHub-identity/secret
separation plan (item 6), not in the DB control-plane remediation. The `ROUTE_2b` assertion has been
re-labelled accordingly.

## Cross-references

- `qa/verification/DB_BATCH_STATE_FINDING.md` — the actual P1 (db push has no selectivity).
- `qa/KNOWN_FAILURE_MODES.md` — add entry: *inferring secret exposure from variable-name presence*.
- `governance/authorizations/AUTH-2026-09-ABD-001.yaml` — the authorization this incident sat beside.
