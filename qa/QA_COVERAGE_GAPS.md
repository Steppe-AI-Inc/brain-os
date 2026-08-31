# QA Coverage Gaps — Work-PC QA Node

**Purpose:** track what is *not* covered as a first-class artifact, so gaps are visible
rather than quietly absent from a flattering coverage percentage. Every entry here is either
scheduled work or an explicitly disclosed limitation — never a silent omission.

Last updated: 2026-08-31 · Product commit under test: `256f183` (deployed, Vercel-verified)

---

## 1. Control-level inventory incomplete — the denominator is a floor, not the truth

`CAPABILITY_INVENTORY.json` currently holds **40 capabilities**. That number is derived from
static enumeration (35 routes, ~150 exported server actions across 34 domain modules) plus
known Brain-Chat schema fields — **not** from a live per-page inventory of every button,
menu, dropdown, dialog, toggle, filter, and sort control.

The real total will be substantially higher. **Coverage percentage must therefore be read as
"12.5% of a known floor," not "12.5% of everything."** This is exactly the kind of number
that would be misleading if reported without this caveat.

**Resolution:** the live browser control-discovery pass (which produces
`qa/HUMAN_QA_MASTER_MATRIX.md`) adds the missing rows. Scheduled as part of Campaign C001.

## 2. `LIVE QA DASHBOARD — NOT YET IMPLEMENTED`

3 capabilities BLOCKED: `CAP-QA-COMMAND-CENTER-DASHBOARD`, `-REALTIME`, `-COMMANDS`.

The real-time QA Command Center requires **product implementation** (Supabase schema, RLS, a
narrowly-scoped ingest/command interface, the Brain OS dashboard page, Realtime
subscriptions). That is Home-PC work by the Work-PC/Home-PC separation rule — the Work PC
authors the contract and its own publisher side but must not implement production UI/schema.

**Resolution:** `QA-PLATFORM-REALTIME-CONTROL-PLANE` handoff → Home PC implements → Work PC
independently tests it (acceptance tests A–L). Does **not** block Campaign C001.

## 3. `DISTINCT BROWSER PERSONAS UNAVAILABLE` — pending real investigation

1 capability BLOCKED: `CAP-BROWSER-PERSONA-MULTIUSER`.

No `SUPABASE_SERVICE_ROLE_KEY` is present in this environment, so synthetic logins cannot be
minted via the Admin API.

**This is explicitly NOT yet accepted as final.** The charter requires investigating
product-supported paths first, and that investigation has not run:

- the public signup flow, if one exists and is safe to use
- workspace-admin user creation
- `invitePerson()` (`web/lib/data/people.ts`) — founder/admin-gated, calls
  `auth.admin.inviteUserByEmail` against a pre-existing `people` record. **Open question:**
  can a *synthetic* person record plus a safe email catcher complete that invite loop
  end-to-end? Not verified either way.
- any existing test-auth helper

**Until that investigation runs, backend SQL impersonation covers the authorization half and
will never be reported as browser-persona coverage.** They are different claims.

**Scheduled:** Campaign C001, permissions phase.

## 4. Pre-platform evidence carries a SHA attribution caveat

The 5 `PASS` capabilities carried over from campaign C000 (company create/rename UI, company
rename via chat, department create/rename UI) were tested **before** deployment-provenance
discipline existed. They are attributed to local master `b04cedb`, which may not have equalled
the then-deployed SHA.

The evidence is real and is not being discarded (per the explicit "do not restart completed
evidence collection" instruction), but it should be re-verified against a confirmed deployed
SHA during C001 before being treated as durable.

## 5. Not yet scoped in detail

- **Mobile/responsive** — `mcp__playwright__browser_resize` is available; a concrete viewport
  strategy is still to be defined.
- **External side-effect boundary** — no confirmed safe sandbox/sink for email/SMS/Slack/
  webhooks. Any workflow reaching that boundary will be marked
  `BLOCKED — EXTERNAL SIDE EFFECT SANDBOX REQUIRED` rather than silently skipped.
- **Autonomy acceptance tests A–H** — the supervisor/launcher/heartbeat scaffolding exists as
  state + boot contract; the crash/reboot/singleton tests have not been executed. Until they
  pass, the platform is `AUTONOMOUS QA PLATFORM — PARTIALLY VERIFIED`, never
  `FULLY AUTONOMOUS WORK-PC QA NODE`.
