# BRAIN OS Master Build Prompt

**Given to the office-machine Claude Code session on 2026-08-28. Not yet seen by the home
PC session as of that date** — the founder confirmed this explicitly when asked, so
nothing here should be assumed as already-known context on that track. Saved here
verbatim so any future session (either machine) can read the actual document instead of
a paraphrase. See `MASTER_CONTEXT.md`'s "Office-machine session — 2026-08-28" entry for
what was actually built from it, what's still open, and why several pieces were
deliberately scoped down or skipped.

---

# MASTER BUILD PROMPT — BRAIN OS

## Build a Fully AI-Native Company Operating Brain

You are a principal AI systems architect, senior full-stack engineer, Supabase/Postgres engineer, agent-orchestration engineer, security architect, and product UX engineer.

You are working directly on the existing BRAIN OS / SEM Brain codebase.

Your job is NOT to merely fix bugs or improve prompts.

Your job is to turn the current prototype into a real:

# BRAIN OS

## An AI-native operating system for running companies

The founder should be able to communicate naturally with one central AI brain.

The brain must understand companies, people, projects, products, customers, finances, sales, documents, assets, devices, marketing, communications, decisions, risks, and operations.

It must then use AI agents, deterministic software tools, and human employees to execute real company work.

The operating principle is:

> Founder gives an outcome → BRAIN OS understands context → plans → executes → manages humans and AI → verifies results → updates company memory → founder receives only the useful result or decision requiring attention.

Do not preserve existing architecture simply because it already exists.

If necessary:

* refactor heavily
* redesign the database
* replace agent orchestration
* replace task architecture
* rebuild chat
* rebuild workflow execution
* create new services
* migrate existing data
* or build BRAIN OS v2 from a clean architecture

Do not rewrite working components unnecessarily.

But do not protect bad architecture.

---

# 1. CURRENT CRITICAL FAILURE

The existing system behaves too much like:

```text
Founder message
→ LLM creates tasks
→ more tiny tasks
→ approvals
→ explanations
→ founder manually manages AI
```

This is wrong.

BRAIN OS must behave like:

```text
Founder intent
↓
Context + company knowledge
↓
Intent classification
↓
Entity resolution
↓
Risk and permission evaluation
↓
Direct operation OR meaningful workflow
↓
Execution
↓
Verification
↓
Memory + audit update
↓
Concise founder result
```

Tasks are only ONE tool available to the brain.

Do NOT route every command through task creation.

---

# 2. FIX THE CHAT EXPERIENCE

Current responses are:

* too long
* repetitive
* technically noisy
* badly formatted
* overly cautious
* full of internal telemetry
* unable to execute straightforward commands efficiently

Example bad UI:

```text
0 task(s)
2 approval(s)
claude-haiku-4-5
15,888 tokens
```

This must disappear from normal founder chat.

Move technical telemetry into Developer / Diagnostics view.

Founder-facing responses should be:

* short
* operational
* Markdown formatted
* result-first
* easy to scan
* generally 1–5 short lines for simple actions
* detailed only when complexity genuinely requires it

Support proper rendered Markdown:

* headings
* bold
* bullets
* numbered lists
* tables
* code blocks
* status indicators

Do not render raw Markdown as plain text.

---

# 3. FOUNDER RESPONSE POLICY

Add a system-level response policy equivalent to:

```text
You are BRAIN OS, the operating intelligence of the company.

Founder-facing responses are concise and operational.

Rules:
- lead with result
- do not repeat the user's command unnecessarily
- use Markdown
- hide implementation details
- hide model names, tokens, tool calls and internal IDs
- do not explain obvious operations
- do not repeatedly ask for information already available
- use company context automatically
- execute when tools permit
- verify mutations before reporting success
- create tasks only for genuine trackable work
- use exception-based management
- surface only decisions, blockers, risks and important results
```

---

# 4. COMMANDS ARE NOT TASKS

Examples:

Founder:

> Rename SEM Global Robotics to SEM GRT.

Correct:

→ update database
→ verify
→ respond

Do NOT create:

* Find company
* Rename company
* Verify company

Founder:

> Delete all test data.

Correct:

→ approval if required
→ one atomic reset operation
→ verification
→ concise result

Founder:

> Prepare Urt Tsagaan charger contract.

Correct:

→ retrieve customer/product/pricing/context
→ generate contract
→ store artifact
→ link to opportunity/customer
→ return result

Tasks should only exist where human or longer-running work actually needs tracking.

---

# 5. SEMANTIC INTENT ROUTER

Create a proper intent classification layer.

Example:

```ts
type FounderIntent =
  | "query"
  | "analysis"
  | "create"
  | "update"
  | "delete"
  | "bulk_operation"
  | "project_work"
  | "approval_action"
  | "document_generation"
  | "communication"
  | "finance"
  | "sales"
  | "marketing"
  | "system_admin"
  | "unknown";
```

Also classify execution mode:

```ts
type ExecutionMode =
  | "direct"
  | "workflow"
  | "needs_approval"
  | "clarification_required";
```

Use structured outputs.

Do not rely on free-text guessing between execution stages.

---

# 6. CONTEXT AND FOLLOW-UP RESOLUTION

BRAIN OS must understand conversational state.

Example:

Founder:

> Delete all test data.

System:

> Confirm **DELETE EVERYTHING**

Founder:

> yes

The system must execute the exact stored operation.

It must NOT ask again:

> Are you sure?

Follow-ups like:

```text
yes
confirm
go ahead
do it
execute
proceed
yep
```

should resolve against the pending action.

Similarly:

> Move it to SEM GRT.

should resolve "it" using recent conversation/entity context when unambiguous.

---

# 7. PERSIST PENDING ACTION STATE

When approval is needed, persist the exact action.

Example:

```json
{
  "pending_action": {
    "id": "...",
    "type": "workspace.reset",
    "payload": {},
    "risk": "high",
    "status": "awaiting_confirmation",
    "created_at": "..."
  }
}
```

Confirmation executes the stored action.

Do not reinterpret the original command after approval.

Use idempotency so duplicate messages/retries cannot execute the same destructive action twice.

---

# 8. RISK ENGINE

Implement risk-aware execution.

### LOW RISK

Can execute directly:

* retrieve information
* create notes
* update ordinary metadata
* assign internal work
* change routine project status

### MEDIUM RISK

Execute according to policy:

* archive records
* bulk assignments
* project restructuring

### HIGH RISK

Require one explicit approval:

* record deletion
* sending contracts externally
* external financial actions
* employee termination
* publishing sensitive external communications

### CRITICAL

Require stronger authorization:

* production workspace reset
* bank transfer
* ownership/cap-table changes
* credentials/security changes
* destructive infrastructure changes

Avoid repetitive approval loops.

---

# 9. FIX THE REAL DELETE FAILURE

The previous system reported:

> Deleted 11 tasks.
> Deleted 5 channels.

But other entities remained.

This means the system reports partial execution as full success.

Inspect the actual Supabase/Postgres schema.

Identify all business-data tables, relationships and storage dependencies.

Likely categories include:

* companies
* company members
* people
* employees
* teams
* roles
* products
* projects
* goals
* work orders
* tasks
* assignments
* approvals
* documents
* document chunks
* artifacts
* memories
* embeddings
* channels
* conversations
* messages
* customers
* leads
* opportunities
* contracts
* devices
* locations
* relationships
* notifications

Do NOT assume table names.

Inspect actual migrations/schema.

---

# 10. BUILD AN ATOMIC RESET OPERATION

Create one privileged backend operation such as:

```text
workspace.reset
```

or a Postgres/Supabase RPC such as:

```sql
reset_workspace_test_data(...)
```

Delete dependency-safe records in a transaction wherever possible.

Also clear associated:

* Supabase Storage files
* document chunks
* embeddings
* vector data
* search index references
* cached entity data

Do not destroy application/system configuration such as:

* migrations
* permission definitions
* system roles
* app settings
* agent templates
* feature configuration

Separate:

```text
test data
demo data
workspace business data
system configuration
```

---

# 11. VERIFY ALL MUTATIONS

Every mutation follows:

```text
UNDERSTAND
→ EXECUTE
→ VERIFY
→ REPORT
```

Never:

```text
UNDERSTAND
→ ASSUME
→ REPORT SUCCESS
```

Example:

Before reset:

```text
companies: 7
people: 7
projects: 6
goals: 6
tasks: 11
documents: 4
channels: 5
```

Execute.

Then query again.

Only report:

> **System cleared ✓**

when targeted counts are actually zero.

If some remain:

> **Reset incomplete ⚠️**
>
> 2 documents remain because of a dependency.

Then investigate automatically where safe.

---

# 12. NO FAKE SUCCESS

Search the codebase for any path where the LLM can generate:

```text
created successfully
deleted successfully
updated successfully
sent successfully
```

without a verified backend/tool response.

Remove that architecture.

The LLM determines WHAT should happen.

Trusted deterministic code performs the operation.

Example:

```text
LLM interpretation
↓
structured action
↓
trusted executor
↓
database/API
↓
verification
↓
result object
↓
founder response
```

---

# 13. STRUCTURED ACTION MODEL

Use a structure equivalent to:

```ts
interface AgentAction {
  id: string;
  intent: string;
  operation: string;
  entities: EntityReference[];
  parameters: Record<string, unknown>;
  risk: "low" | "medium" | "high" | "critical";
  approvalRequired: boolean;
  verificationStrategy: string;
}
```

Exact implementation can differ.

Use schemas and deterministic validation.

---

# 14. AI-NATIVE COMPANY OPERATING MODEL

BRAIN OS is not a chatbot attached to project management software.

It is the intelligence layer over the whole business.

A founder should be able to say:

> Launch OpenSpot at these four sites next week. Organize the engineering team, make site surveys, prepare drawings, check electrical requirements, calculate installation costs, supervise execution and tell me only when something needs my decision.

BRAIN OS should:

1. understand the objective
2. identify relevant company
3. identify projects/assets/sites
4. identify responsible people
5. create appropriate work structures
6. assign humans
7. communicate with them
8. collect evidence
9. track completion
10. QA work
11. follow up automatically
12. escalate blockers
13. update knowledge
14. report concise outcome

The founder should manage outcomes, not database fields.

---

# 15. SUPPORT MULTIPLE COMPANIES

BRAIN OS must operate a portfolio.

Represent:

```text
Holding Company
↓
Subsidiaries / Operating Companies
↓
Products / Brands
↓
Projects / Operations
↓
People / Agents / Assets
```

Support:

* parent companies
* subsidiaries
* ownership
* shareholders
* JVs
* employees
* cross-company projects
* brands
* products
* contracts
* customers
* assets
* IP
* revenues
* expenses

AI reasoning must understand these relationships.

---

# 16. COMPANY KNOWLEDGE GRAPH / DIGITAL TWIN

Build a semantic company graph.

Core entities should support where appropriate:

```text
Company
Person
Role
Team
Department
Product
Project
Goal
WorkOrder
Task
Customer
Lead
Opportunity
Partner
Supplier
Investor
Contract
Document
Artifact
Asset
Device
Location
BankAccount
Transaction
Invoice
Payment
Revenue
Expense
Budget
KPI
Meeting
Message
Conversation
Decision
Risk
Issue
Approval
Memory
Campaign
SocialAccount
Content
Metric
```

Relationships are first-class.

Examples:

```text
Person → works_for → Company
Company → owns → Product
Customer → signed → Contract
Project → supports → Goal
Task → assigned_to → Person
Device → installed_at → Location
Invoice → belongs_to → Customer
Decision → affects → Project
Message → relates_to → Customer
Campaign → promotes → Product
```

Do not reduce BRAIN OS to tasks/projects.

---

# 17. ENTITY RESOLUTION

Founder should use natural names.

Example:

> OpenSpot

should resolve correctly even if the database contains:

```text
OpenSpot Mongolia
OpenSpot Curb Management
```

Use:

1. exact match
2. aliases
3. semantic similarity
4. relationship context
5. conversation context
6. confidence scoring

Never invent UUIDs.

Never require the founder to provide database IDs.

---

# 18. COMPANY MEMORY

Implement layered persistent memory.

## Working Memory

Recent conversational/execution context.

## Operational Memory

Current:

* tasks
* projects
* blockers
* deadlines
* finances
* customers
* devices
* employees

## Company Knowledge

Long-term facts:

* structure
* products
* contracts
* pricing
* suppliers
* policies
* technical knowledge
* commercial materials

## Episodic Memory

History:

* meetings
* incidents
* negotiations
* decisions
* failed attempts
* project outcomes

## Semantic Memory

Relationships and reusable extracted knowledge.

Retrieve only relevant memory.

Do NOT send the entire database/history to every LLM call.

---

# 19. DATABASE IS THE SOURCE OF OPERATIONAL TRUTH

Chat history is not enough.

Important founder statements must become structured state.

Example:

> Adiya receives 17% of our cut.

Store a structured decision:

```text
Decision:
Adiya Introducing Broker Commission

Rule:
17% of company share

Status:
ACTIVE

Approved by:
Founder
```

Support:

* effective date
* status
* source
* authority
* superseded-by
* confidence

Memory must not blindly override current authoritative data.

---

# 20. HUMAN OPERATING NETWORK

Humans do not need to use the BRAIN OS web app.

Human assets should connect through:

* Telegram
* WhatsApp
* Viber
* Facebook Messenger
* Instagram messaging
* email
* Slack
* web chat

Build one communication abstraction layer.

Conceptually:

```text
Telegram
WhatsApp
Viber
Messenger
Instagram
Email
Slack
Web
↓
Communication Gateway
↓
Normalized Message Event
↓
Identity Resolver
↓
Permissions
↓
Conversation Context
↓
BRAIN OS
```

Do NOT hard-code business logic independently into every channel.

---

# 21. NORMALIZED MESSAGE MODEL

Use an internal representation such as:

```json
{
  "channel": "telegram",
  "external_sender_id": "...",
  "person_id": "...",
  "company_id": "...",
  "conversation_id": "...",
  "text": "...",
  "attachments": [],
  "timestamp": "..."
}
```

Each platform uses adapters.

Core business logic works on normalized events.

---

# 22. HUMAN IDENTITY RESOLUTION

One person may have:

* internal account
* phone
* Telegram
* WhatsApp
* email
* Facebook
* Instagram

These identities map to one `Person`.

Permissions follow the Person, not the communication channel.

---

# 23. TELEGRAM AS EMPLOYEE INTERFACE

Telegram should support real operations.

Example:

BRAIN OS:

> Galsaa — tomorrow 10:00, Baruun 4 Zam survey.
>
> Required:
>
> * photo electrical panel
> * cable measurement
> * 10 device positions
> * site drawing
> * blockers

Employee replies with:

* text
* voice
* photos
* drawings
* video

BRAIN OS should:

1. identify employee
2. identify correct assignment
3. interpret response
4. process voice/images/files
5. extract facts
6. store evidence
7. update work state
8. compare against acceptance criteria
9. request missing information automatically
10. escalate only significant blockers

---

# 24. ROLE-BASED SECURITY

Security must be enforced below the LLM layer.

Example:

Installation engineer can see:

* assignments
* drawings
* technical documentation
* relevant locations/devices

Cannot see:

* ownership
* founder-only data
* salaries of other employees
* bank balances
* confidential investor information

Sales staff can see:

* leads
* opportunities
* approved prices
* proposals

Cannot automatically see:

* sensitive engineering IP
* founder financial data

Use:

* database policies
* RLS where appropriate
* permission engine
* role/company boundaries
* scope enforcement

Do not rely on system prompts as security.

---

# 25. AI MANAGEMENT HIERARCHY

Support specialized agents sharing one company brain.

Examples:

### CEO Agent

* strategy
* priorities
* portfolio
* cross-company coordination

### COO Agent

* execution
* deadlines
* operations
* blockers

### CFO Agent

* cash
* budgets
* invoices
* payments
* runway
* unit economics
* financial reporting

### Sales Agent

* CRM
* leads
* proposals
* quotations
* follow-up
* pipeline

### Engineering Manager Agent

* engineering
* R&D
* QA
* devices
* field operations

### HR Agent

* people
* KPI
* performance
* onboarding
* leave
* policies

### Legal Agent

* contracts
* obligations
* reviews
* expirations

### Marketing Agent

* campaigns
* social channels
* content
* analytics

They must not become isolated chatbots.

Use a hierarchy such as:

```text
Founder
↓
CEO / Orchestrator
↓
COO | CFO | Sales | Engineering | HR | Legal | Marketing
↓
Specialist agents
↓
Humans + software tools
```

---

# 26. AGENT ORCHESTRATION

Agents should:

* delegate
* use tools
* monitor
* verify
* retry
* challenge incomplete results
* update company memory
* escalate appropriately

Avoid uncontrolled autonomous loops.

Use:

* clear scope
* budgets
* permissions
* risk rules
* maximum iterations
* execution checkpoints
* cancellation

---

# 27. AUTONOMOUS HUMAN MANAGEMENT

Example:

Founder:

> Finish Minister Tower repairs this week.

BRAIN OS should:

* find previous device incidents
* identify assigned technician
* identify missing materials
* create one meaningful work order
* assign technician
* message them through Telegram
* request required evidence
* track updates
* QA completion
* reopen if failed
* close when verified

Founder sees something like:

## Minister Tower repaired ✓

* Removed device reinstalled
* Device #4 online
* Bollards replaced

**Remaining:** CCTV investigation.

No micromanagement.

---

# 28. WORK ORDERS AND TASKS

Use hierarchical work structures only when appropriate:

```text
Goal
↓
Work Order
↓
Task
↓
Acceptance Criteria
```

Work order:

> Survey four new OpenSpot locations.

Tasks might logically be:

* Baruun 4 Zam survey
* Marshall Town survey
* Indranil Hospital survey
* IT Park survey

Do NOT generate dozens of tiny database/action tasks.

---

# 29. QA AGENT

Completion is NOT equivalent to:

> Employee said "done."

Use:

```text
Execution
↓
Evidence
↓
QA
↓
Acceptance Criteria
↓
PASS / FAIL
```

Evidence may include:

* photos
* video
* documents
* telemetry
* software tests
* measurements
* GPS/location
* signatures
* payment record

If QA fails:

* reopen
* explain deficiency
* request correction
* retest

Do not require founder intervention for ordinary correction loops.

---

# 30. EVENT-DRIVEN BRAIN

BRAIN OS should not only react to founder chat.

Support events:

```text
Payment overdue
Device offline
Deadline missed
Customer replied
Contract expiring
Inventory low
New social lead
Bank transaction received
Project blocked
New message
New document
```

Events can trigger agent evaluation.

Example:

```text
Device offline > 3 hours
↓
Engineering Agent
↓
Check telemetry + history
↓
Determine likely issue
↓
Assign technician if necessary
↓
Escalate only if important
```

---

# 31. AUTONOMY LEVELS

Support configurable autonomy.

### Level 0

Observe

### Level 1

Recommend

### Level 2

Execute low-risk actions

### Level 3

Manage workflows and humans

### Level 4

High autonomy inside predefined limits

Configure by:

* company
* agent
* action type
* financial threshold
* employee
* environment

Sensitive actions still require appropriate approval.

---

# 32. FINANCIAL OPERATING BRAIN

Build CFO capabilities.

Understand:

```text
Bank Accounts
Transactions
Revenue
Expenses
Invoices
Payments
Payroll
Receivables
Payables
Budget
Cash
Runway
Unit Economics
Project Profitability
Company Profitability
```

Example:

> How much can we safely invest into OpenSpot installations this month?

BRAIN OS should evaluate:

* cash
* receivables
* payroll
* fixed expenses
* upcoming obligations
* installation commitments
* expected revenue

and provide decision-oriented analysis.

---

# 33. FINANCIAL SAFETY

AI may:

* analyze
* reconcile
* prepare reports
* calculate budgets
* prepare payment batches
* flag anomalies
* draft payment instructions

Actual money movement requires authorization according to policy.

Never give unrestricted autonomous financial transfer capability.

---

# 34. SALES / CRM OPERATING SYSTEM

Sales is native to BRAIN OS.

Support:

```text
Lead
Contact
Customer
Opportunity
Pipeline Stage
Proposal
Quotation
Contract
Follow-up
Forecast
Invoice
Payment
Customer History
```

Example:

> Who should we follow up with today?

AI considers:

* deal value
* inactivity
* promised follow-up
* stage
* last message
* probability
* urgency

and ranks actual actions.

---

# 35. COMMERCIAL DOCUMENT GENERATION

Generate real company artifacts:

* quotation
* commercial proposal
* contract
* presentation
* invoice
* tender response
* technical proposal
* scope of work
* report

Retrieve relevant:

* company identity
* customer
* pricing
* product specs
* old proposals
* contract templates
* brand assets
* technical documents

Store the result back into the artifact library.

Link artifacts to relevant:

* company
* customer
* opportunity
* project
* contract

---

# 36. DOCUMENT / ARTIFACT LIBRARY

Artifacts are first-class company assets.

Support:

* presentations
* quotations
* contracts
* financial reports
* engineering drawings
* datasheets
* tender materials
* photos
* videos
* marketing creatives

Use:

* object storage for files
* structured metadata in database
* extracted text
* embeddings
* permissions
* versioning
* relationships

Supabase Storage can be used where technically appropriate.

Do not store giant binary files directly in Postgres fields.

---

# 37. ARTIFACT VERSIONING

Example:

```text
FuelMetrix Proposal
v1
v2
v3
FINAL
SIGNED
```

Track:

* active version
* sent version
* signed version
* superseded versions

Never confuse draft with signed/approved artifact.

---

# 38. MEETING INTELLIGENCE

Before meetings:

* retrieve relationship history
* commitments
* financial status
* unresolved issues
* recommended agenda

After meetings:

* summarize
* extract decisions
* extract commitments
* update CRM
* create real tasks where appropriate
* follow up

Do not convert every meeting sentence into a task.

---

# 39. SOCIAL MARKETING IS A NATIVE MODULE

Integrate social marketing into BRAIN OS.

Target:

* Facebook
* Instagram
* LinkedIn
* Telegram channels
* other supported platforms through connectors

Data model may include:

```text
Brand
SocialAccount
Campaign
ContentIdea
Post
CreativeAsset
Audience
Schedule
Approval
PublishedPost
Metric
Lead
Conversion
```

---

# 40. AI MARKETING TEAM

Support specialized marketing agents.

### Marketing Strategist

* campaigns
* audience
* positioning
* goals

### Content Agent

* captions
* posts
* scripts
* campaign copy

### Creative Agent

* visual concepts
* creatives
* asset selection

### Publishing Agent

* scheduling
* approved publishing

### Community Agent

* comments
* DMs
* FAQs
* complaints
* sales inquiries

### Analytics Agent

* reach
* engagement
* conversions
* campaign performance
* optimization

All operate using the same company knowledge.

---

# 41. SOCIAL MEDIA SAFETY

Do not allow uncontrolled public publication.

Create configurable approval policies.

Low-risk content within approved campaign:

→ optionally auto-publish

Content involving:

* sensitive claims
* pricing changes
* legal statements
* financial claims
* political/controversial content
* confidential information

→ require approval.

---

# 42. SOCIAL DMs → SALES LEADS

Inbound messages from:

* Instagram
* Facebook Messenger
* WhatsApp
* Telegram
* website

should become CRM intelligence automatically.

Example:

Customer:

> How much is your 60 kW charger?

BRAIN OS:

1. classifies sales intent
2. responds using approved information if policy allows
3. creates or updates lead
4. asks qualification questions
5. connects lead to product
6. alerts salesperson when qualified
7. preserves conversation history

No manual CRM copy-paste.

---

# 43. COMMUNICATION MEMORY

All business messages should link to relevant entities.

Example:

```text
Message
→ Person
→ Customer
→ Opportunity
→ Product
→ Contract
```

Founder:

> What did NextPass agree with us?

BRAIN OS should retrieve evidence from:

* messages
* meetings
* decisions
* contracts
* documents

and answer accurately.

---

# 44. COMPANY POLICIES

Allow structured founder policies.

Examples:

```text
No payment above ₮10M without founder approval.

No salesperson may discount below approved margin.

Installation cannot close without commissioning evidence.

Salary information is founder-only.

Contracts above $50k require legal review.
```

Policies must affect execution deterministically.

Do not leave important rules only in prompts.

---

# 45. DECISION MEMORY

Important founder decisions should become structured records separate from normal chat.

Example:

```text
Decision:
Adiya IB commission

Rule:
17% of company share

Status:
Active

Approved by:
Founder
```

Agents should automatically use current active decisions.

---

# 46. CONNECTOR FRAMEWORK

Build modular connectors for:

```text
Telegram
WhatsApp
Viber
Facebook
Instagram
Gmail
Google Calendar
Google Drive
Slack
GitHub
Notion
Supabase
Bank APIs
Accounting systems
IoT APIs
Payment Gateways
CRM systems
```

Expose normalized capabilities such as:

```text
send_message
search_messages
read_document
create_document
get_transactions
query_device
create_event
publish_content
create_lead
```

Do not embed application-specific business logic directly into every connector.

---

# 47. TOOL-FIRST EXECUTION

Prefer actual tools/data over conversational assumptions.

Example:

> How many devices are offline?

Query the device system.

Do not infer from old chat.

> Did the financial report arrive?

Check connected documents/messages.

Do not guess.

---

# 48. DO NOT MAKE EVERYTHING AN LLM CALL

Use deterministic systems for:

* permissions
* authorization
* calculations
* state transitions
* financial math
* database transactions
* idempotency
* schedules
* accounting rules
* workflow state

Use LLMs for:

* interpretation
* semantic matching
* planning
* reasoning
* summarization
* extraction
* writing
* recommendations
* ambiguity resolution

AI-native ≠ LLM everywhere.

---

# 49. MODEL ROUTING

Route different workloads appropriately.

Small/fast model:

* extraction
* classification
* routing
* lightweight summaries

Strong reasoning model:

* strategy
* complex workflows
* financial reasoning
* contract analysis
* difficult ambiguity

Vision model:

* photos
* drawings
* scanned documents
* installation evidence

Track cost and performance internally.

Do not show model/tokens in normal founder UI.

---

# 50. BRAIN OS HOME SCREEN

Do NOT build another task-dashboard ERP.

Recommended hierarchy:

## Ask BRAIN

Primary command interface.

## Needs Your Attention

* approvals
* decisions
* risks
* exceptions

## Company Pulse

* finances
* sales
* operations
* people
* product

## Active Work

Major workstreams only.

## Companies

Portfolio structure.

## Activity

Important actions completed by humans and agents.

---

# 51. FOUNDER QUESTIONS THE SYSTEM MUST ANSWER

Examples:

```text
What needs my attention?

What changed today?

Where are we losing money?

What payments are due?

What sales opportunities are hottest?

Who is overloaded?

Which projects are blocked?

What decisions require me?

What did the AI complete today?

Which installation is failing?

Which customers need follow-up?
```

Responses should be executive-level, concise and evidence-based.

---

# 52. EXCEPTION-BASED MANAGEMENT

This is a core design principle.

Routine successful operations happen quietly.

Founder primarily sees:

* exceptions
* decisions
* risks
* significant opportunities
* missed commitments
* major completions

The system should reduce management noise.

---

# 53. PROACTIVE INTELLIGENCE

BRAIN OS should proactively identify meaningful issues.

Examples:

> Station revenue is down 31% versus 4-week average.

> Three sites require the same engineer tomorrow.

> This quotation uses an outdated charger price.

> Installation marked complete but Device #29 never came online.

> Customer promised payment five days ago.

> This contract conflicts with current broker commission policy.

This is the difference between an AI brain and a database UI.

---

# 54. DAILY CEO BRIEF

Support automatic executive summaries.

Example:

# Today

**3 items need you**

1. Approve ₮18.4M payment
2. Sign Urt Tsagaan contract
3. Choose IT Park power option

**Operations**

* 18/20 devices online
* 2 locations awaiting power access

**Sales**

* 3 active opportunities
* ₮159M opportunity awaiting signature

**Cash**

* Current balance: ...
* Receivable this week: ...

Keep concise.

---

# 55. COMPANY GRAPH VISUALIZATION

Maintain an actual interactive company map.

Allow drilldown:

```text
Portfolio
→ Company
→ Product
→ Project
→ Work Order
→ Person / Agent / Asset
```

Visualize real relationships, not decorative nodes.

---

# 56. VOICE-FIRST OPERATIONS

Architecture should support founder/employee voice messages.

Example founder voice:

> Tomorrow go with Aldajan to the four locations, check electricity, make drawings and assign the engineering team.

System should:

* transcribe
* resolve people/locations
* understand intent
* organize work
* assign humans
* collect results
* update state
* report outcome

Do not require formally written prompts.

---

# 57. MULTILINGUAL COMPANY OPERATIONS

At minimum support natural mixing of:

* Mongolian
* English
* Russian

Entity resolution should remain consistent across languages.

---

# 58. BUSINESS PROCESS COMPILER

Long-term behavior:

Founder:

> Launch Urt Tsagaan charger installation.

BRAIN OS translates this into:

```text
Commercial agreement
↓
Site survey
↓
Electrical design
↓
BOQ
↓
Procurement
↓
Installation
↓
Configuration
↓
Commissioning
↓
Payment
↓
Handover
↓
Maintenance
```

The founder states the outcome.

The brain understands the company's operating process.

---

# 59. SOP LEARNING

After repeated successful workflows, identify patterns.

Example:

> This site survey process has been completed 12 times. Recommend creating a Site Survey SOP?

SOP may contain:

* measurements
* electrical checklist
* required photos
* drawing standard
* evidence checklist
* commissioning process

Once approved, future workflows use it.

Do not silently rewrite important operating procedures.

Use controlled versions.

---

# 60. OPERATING LEARNING

Use historical results to improve operations.

Example after many installations:

Analyze:

* average completion time
* recurring defects
* best-performing technicians
* common missing materials
* electrical issues
* rework rates

Then recommend process improvements.

Do NOT let agents autonomously change critical policies without authorization.

---

# 61. OBSERVABILITY

Developer/Admin diagnostics should expose:

* agent runs
* tools
* models
* tokens
* latency
* errors
* retries
* actions
* workflow state
* approvals
* DB mutations
* verification

Founder view hides this by default.

---

# 62. AUDIT TRAIL

Every significant action should record:

```text
Actor
Original command
Interpreted intent
Entities
Approval
Action
Affected records
Timestamp
Verification
Result
```

Audit trail should be immutable where appropriate.

---

# 63. RECOVERY AND RESUMABILITY

Long workflows must persist state.

If interrupted:

* identify last successful step
* resume safely
* retry only failed step
* preserve evidence
* avoid duplicate external actions

Do not restart entire workflows unnecessarily.

---

# 64. IDEMPOTENCY

Important mutations and external actions need operation IDs / idempotency keys.

Network retries must not:

* send payments twice
* send messages twice unnecessarily
* publish twice
* create duplicate contracts
* create duplicate entities

---

# 65. ARCHITECTURE

Evaluate a modular architecture including concepts equivalent to:

```text
Identity Service
Company Graph
Memory Service
Conversation Service
Intent Router
Entity Resolver
Policy Engine
Permission Engine
Approval Engine
Agent Orchestrator
Workflow Engine
Task / Work Order Service
Artifact Service
Communication Gateway
Integration Gateway
Event Bus
Notification Service
Audit Service
Search / Retrieval Service
Financial Service
CRM / Sales Service
Marketing Service
Device / Asset Service
Analytics Service
```

These do NOT have to be independent microservices.

A modular monolith is acceptable and may be preferred.

Choose based on:

* maintainability
* reliability
* speed of development
* security
* scale

not architecture fashion.

---

# 66. REBUILD DECISION

Inspect the existing codebase and choose:

## OPTION A — Repair

Use if architecture is fundamentally sound.

## OPTION B — Major Refactor

Use if database/components are useful but agent orchestration is wrong.

## OPTION C — BRAIN OS v2

Use if the system fundamentally treats AI as a chatbot attached to a task manager.

If v2 is required:

* do not destroy working production functionality first
* preserve useful authentication/UI/integrations where appropriate
* create migration path
* migrate data deliberately
* avoid inheriting broken architectural assumptions

---

# 67. FIRST REAL VERTICAL SLICE — OPENSPOT FIELD OPERATIONS

Build one COMPLETE end-to-end workflow first.

Founder:

> Tomorrow inspect Baruun 4 Zam, Marshall Town, Indranil Hospital and IT Park. Determine device positions and electrical connection, make drawings and prepare installation plan.

Expected BRAIN OS behavior:

1. identify correct companies
2. identify locations
3. identify responsible employees
4. create one field-survey work order
5. create meaningful site assignments
6. send employees instructions through connected channel
7. collect responses
8. accept photos/voice/video/drawings
9. extract site measurements
10. store evidence
11. update location records
12. identify missing information
13. automatically ask humans for missing evidence
14. create engineering outputs
15. QA results
16. report concise final outcome

This workflow proves the platform actually operates a company.

---

# 68. SECOND VERTICAL SLICE — EV CHARGER SALES

Founder:

> We have a customer interested in four chargers at Urt Tsagaan. Prepare the commercial package and manage the opportunity.

Expected:

1. create/find customer
2. create opportunity
3. connect product
4. retrieve approved pricing
5. create quotation
6. generate contract
7. store artifacts
8. track negotiation
9. record communication
10. follow up
11. update sales forecast
12. create invoice/payment milestones if won
13. hand off automatically to installation operation

This proves:

```text
Sales
→ Contract
→ Payment
→ Operations
```

continuity.

---

# 69. THIRD VERTICAL SLICE — SOCIAL MARKETING

Founder:

> Promote the successful installation after commissioning.

Expected:

1. retrieve project outcome
2. retrieve approved photos
3. generate campaign/post
4. follow brand policy
5. request approval if required
6. publish using connector
7. monitor results
8. capture inbound messages/leads
9. add leads to CRM
10. report performance

This proves:

```text
Operations
→ Evidence
→ Marketing
→ Lead
→ Sales
```

inside one brain.

---

# 70. TEST THE ORIGINAL DELETE FAILURE

Populate sandbox with realistic test data:

* companies
* people
* projects
* goals
* tasks
* approvals
* documents
* channels
* relationships
* storage objects

Then run:

Founder:

> clear empty all the data. they were all test data

Expected:

BRAIN OS shows one concise destructive-action confirmation.

Founder:

> yes

Expected:

* execute real reset
* no second confirmation
* clear targeted DB data
* clear targeted storage
* clear vectors/search references
* verify counts
* audit action
* return concise result

Example:

## System cleared ✓

* Companies: 0
* People: 0
* Projects: 0
* Tasks: 0
* Documents: 0

No remaining sandbox business data.

---

# 71. TEST NATURAL DELETE LANGUAGE

These should resolve correctly:

```text
wipe everything
clear workspace
delete all test data
start fresh
empty the whole system
remove current sandbox records
reset this environment
```

Test approval follow-up:

```text
yes
confirm
go ahead
proceed
do it
execute
```

One confirmation only.

---

# 72. TEST CHAT QUALITY

Run at least 20 representative founder commands.

Simple responses should typically remain under approximately 60 words.

Normal operational answers generally under 120 words.

Do not enforce strict limits when real explanation is necessary.

Make sure:

* no raw telemetry
* no unnecessary task counts
* no model names
* no token counts
* proper Markdown
* result-first wording

---

# 73. TEST AI-NATIVE BEHAVIOR

Founder:

> Create SEM LLC and assign Mongolian commercial operations to it.

Expected:

* entity created if absent
* description stored
* relationships updated
* verified
* no meaningless tasks created

Founder:

> Move engineering and R&D to SEM GRT.

Expected:

* relevant records identified
* changes performed or proposed depending on risk
* verified

Founder:

> What needs my attention today?

Expected:

* actual system query
* concise prioritized executive answer
* only decisions/blockers/risks

---

# 74. REGRESSION TESTS

Add permanent automated tests for at least:

1. Bulk delete removes all targeted entities.
2. Partial delete cannot report full success.
3. Confirmation requested once.
4. Confirmation executes pending action.
5. Duplicate confirmation cannot duplicate execution.
6. Direct data operations do not create pointless tasks.
7. Multi-entity commands can execute logically.
8. Entity aliases resolve correctly.
9. Founder never needs UUIDs.
10. Markdown renders.
11. Technical telemetry hidden.
12. Simple responses concise.
13. Conversation context works.
14. Audit events recorded.
15. High-risk operations require approval.
16. Low-risk operations execute directly.
17. Backend mutation verified.
18. DB and storage stay synchronized.
19. Deleted entities disappear from semantic search.
20. QA reopens failed human work.
21. Permissions prevent unauthorized data leakage.
22. Cross-company isolation works.
23. Human channel identity mapping works.
24. Workflow state resumes after interruption.
25. External actions use idempotency.
26. Social publishing respects approvals.
27. Financial operations respect authorization.
28. Important decisions become structured state.
29. Current policies override obsolete memory.
30. Founder receives useful outcome, not execution noise.

---

# 75. PRODUCT SUCCESS METRICS

Do NOT optimize for:

* messages sent
* tasks created
* number of agents
* LLM calls

Optimize for:

* founder interventions per completed workflow
* autonomous completion rate
* execution accuracy
* false-success rate
* QA pass rate
* missed deadlines
* unresolved blockers
* human response latency
* project throughput
* sales follow-up compliance
* time from intent to verified outcome

---

# 76. FIRST PRINCIPLES UX

Do NOT build another ERP requiring the founder to:

* browse tables
* fill endless forms
* update statuses
* maintain the CRM manually
* manually connect people/projects/docs
* manually chase employees

Forms and dashboards may exist for verification and direct editing.

But natural language is the primary interface.

BRAIN OS updates structured systems underneath.

---

# 77. UNIVERSAL BRAIN COMMAND EXAMPLES

These should ultimately perform real operations:

```text
Show overdue customer payments.

Assign tomorrow's installations logically.

Prepare Urt Tsagaan contract.

Ask Galsaa for commissioning photos.

Move FuelMetrix under SEM LLC.

Who is overloaded this week?

Create installation KPI plan.

Prepare investor update.

Post our completed OpenSpot installation after approval.

Find our latest agreement with NextPass.

What needs my attention today?

Which devices are offline?

Which project is losing money?

Review the financial report and prepare payments for approval.

Create a proposal from our latest approved pricing.

Follow up with all high-value inactive sales leads.
```

---

# 78. NORTH STAR

The product succeeds when the founder can say:

> I tell BRAIN OS what the company needs to achieve.

And the system:

* understands the business
* understands the companies
* understands people
* understands assets
* understands historical decisions
* organizes AI agents
* organizes human employees
* communicates through Telegram/WhatsApp/Viber/Messenger/Instagram/email
* uses software systems and APIs
* manages execution
* verifies outcomes
* handles QA
* updates company memory
* manages sales
* manages finance
* manages operations
* manages documents
* manages social marketing
* learns from operating history
* proactively detects problems
* and brings the founder only the decisions that actually require founder authority.

The founder manages outcomes.

BRAIN OS manages operations.

---

# 79. FINAL IMPLEMENTATION INSTRUCTION

Do not stop after analysis.

Work directly on the repository.

First:

1. inspect current frontend
2. inspect backend
3. inspect Supabase
4. inspect migrations/schema
5. inspect agent orchestration
6. inspect task logic
7. inspect approvals
8. inspect chat
9. inspect storage
10. inspect integrations
11. inspect tests

Then determine whether to:

* repair
* refactor
* or build BRAIN OS v2 architecture

Then implement.

Prioritize in this order:

1. reliable real execution
2. execution verification
3. concise founder chat
4. semantic intent routing
5. entity resolution
6. pending action state
7. permissions and approval engine
8. company graph
9. structured memory
10. workflow orchestration
11. human communication gateway
12. Telegram employee workflow
13. QA
14. sales/CRM
15. finance
16. artifacts/documents
17. social marketing
18. event-driven proactive intelligence
19. dashboard/company graph
20. additional messaging connectors

Do not implement 50 fake half-working modules.

Build real vertical slices.

Every capability claimed as working must have:

```text
real input
→ real action
→ real backend execution
→ real verification
→ real state update
→ real test
```

No fake demos.

No narrated success.

No meaningless microtasks.

No task-manager architecture disguised as AI.

No cosmetic-only fixes.

No prompt-only patch if backend architecture is the problem.

If rebuilding major parts is necessary, do it.

## Build BRAIN OS as the real operating intelligence of the company.
